"""
sd_decrypt.py - 文件解密自动化工具

通过 Windows Shell IContextMenu COM 接口调用"文档加密系统"的"解密文件"功能，
实现文件解密自动化。替代手动右键 -> "文档加密系统" -> "解密文件" 的操作。

用法:
    python sd_decrypt.py file.pdf              # 解密单个文件
    python sd_decrypt.py /path/to/folder       # 批量解密文件夹
    python sd_decrypt.py --check file.pdf      # 检查文件的加密菜单项
    python sd_decrypt.py --ext .pdf --ext .docx dir  # 指定扩展名过滤
    python sd_decrypt.py --check --json a.pdf b.docx  # 批量检测，JSON 输出
"""

import ctypes
import json
import os
import sys
import argparse
import time

import pythoncom
import pywintypes
import win32con
import win32gui
from win32com.shell import shell as sh
from win32com.shell import shellcon

user32 = ctypes.windll.user32

# IContextMenu IID
IID_IContextMenu = pywintypes.IID("{000214E4-0000-0000-C000-000000000046}")

# Known menu item labels (the DLP system's context menu)
ENCRYPT_SUBMENU_LABEL = "文档加密系统"
DECRYPT_ITEM_LABEL = "解密文件"


def _get_menu_text(hmenu, pos):
    """Get menu item text at a given position using ctypes."""
    buf = ctypes.create_unicode_buffer(256)
    user32.GetMenuStringW(hmenu, pos, buf, 256, win32con.MF_BYPOSITION)
    return buf.value



def _get_menu_item_state(hmenu, pos):
    """Get menu item state flags at a given position using ctypes."""
    import ctypes.wintypes
    class MENUITEMINFOW(ctypes.Structure):
        _fields_ = [
            ("cbSize", ctypes.wintypes.UINT),
            ("fMask", ctypes.wintypes.UINT),
            ("fType", ctypes.wintypes.UINT),
            ("fState", ctypes.wintypes.UINT),
            ("wID", ctypes.wintypes.UINT),
            ("hSubMenu", ctypes.wintypes.HMENU),
            ("hbmpChecked", ctypes.wintypes.HBITMAP),
            ("hbmpUnchecked", ctypes.wintypes.HBITMAP),
            ("dwItemData", ctypes.POINTER(ctypes.wintypes.ULONG)),
            ("dwTypeData", ctypes.wintypes.LPWSTR),
            ("cch", ctypes.wintypes.UINT),
            ("hbmpItem", ctypes.wintypes.HBITMAP),
        ]
    mii = MENUITEMINFOW()
    mii.cbSize = ctypes.sizeof(MENUITEMINFOW)
    mii.fMask = 0x00000001  # MIIM_STATE
    user32.GetMenuItemInfoW(hmenu, pos, True, ctypes.byref(mii))
    return mii.fState

def _get_context_menu(filepath):
    """
    Get the IContextMenu COM object for a file.
    Returns (ctx_menu, folder_obj) tuple.
    """
    filepath = os.path.abspath(filepath)
    dirpath = os.path.dirname(filepath)
    filename = os.path.basename(filepath)

    desktop = sh.SHGetDesktopFolder()
    _, dir_pidl, _ = desktop.ParseDisplayName(0, None, dirpath, shellcon.SFGAO_FOLDER)
    folder = desktop.BindToObject(dir_pidl, None, sh.IID_IShellFolder)
    _, file_pidl, _ = folder.ParseDisplayName(0, None, filename, 0)

    result = folder.GetUIObjectOf(0, [file_pidl], IID_IContextMenu)
    ctx_menu = result[1]  # PyIContextMenu is second element
    return ctx_menu


def _find_decrypt_command(ctx_menu):
    """
    Query the context menu and find the "解密文件" command ID.

    Returns:
        (command_offset, menu_info) where command_offset is the offset
        to pass to InvokeCommand, or (None, menu_info) if not found.
        menu_info is a dict with details about the encryption submenu.
    """
    FIRST_CMD_ID = 1
    hmenu = win32gui.CreatePopupMenu()
    try:
        ctx_menu.QueryContextMenu(
            hmenu, 0, FIRST_CMD_ID, 0x7FFF,
            shellcon.CMF_NORMAL | shellcon.CMF_EXPLORE
        )

        item_count = user32.GetMenuItemCount(hmenu)
        menu_info = {"submenu_found": False, "items": []}

        for i in range(item_count):
            text = _get_menu_text(hmenu, i)
            submenu = user32.GetSubMenu(hmenu, i)

            if not submenu:
                continue

            # Check if this is the encryption system submenu
            if ENCRYPT_SUBMENU_LABEL in text or "加密" in text:
                menu_info["submenu_found"] = True
                menu_info["submenu_label"] = text
                sub_count = user32.GetMenuItemCount(submenu)

                for j in range(sub_count):
                    sub_text = _get_menu_text(submenu, j)
                    sub_id = user32.GetMenuItemID(submenu, j)
                    menu_info["items"].append({"text": sub_text, "id": sub_id})

                    if DECRYPT_ITEM_LABEL in sub_text or "解密" in sub_text:
                        # Check if the menu item is grayed/disabled
                        sub_state = _get_menu_item_state(submenu, j)
                        is_grayed = bool(sub_state & (win32con.MF_GRAYED | win32con.MF_DISABLED))
                        menu_info["decrypt_grayed"] = is_grayed
                        if is_grayed:
                            # Item exists but is grayed = file is NOT encrypted (already decrypted)
                            return None, menu_info
                        cmd_offset = sub_id - FIRST_CMD_ID
                        return cmd_offset, menu_info

        return None, menu_info
    finally:
        win32gui.DestroyMenu(hmenu)


def check_file(filepath):
    """
    Check the encryption-related context menu items for a file.
    Returns a dict with menu information.
    """
    filepath = os.path.abspath(filepath)
    if not os.path.isfile(filepath):
        return {"error": f"File not found: {filepath}"}

    try:
        ctx_menu = _get_context_menu(filepath)
        cmd_offset, menu_info = _find_decrypt_command(ctx_menu)
        menu_info["decrypt_available"] = cmd_offset is not None
        menu_info["command_offset"] = cmd_offset
        return menu_info
    except Exception as e:
        return {"error": str(e)}


def output_json(data):
    """Print data as formatted JSON to stdout."""
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _encryption_status(info):
    """
    Map check_file() result dict to a three-state encryption status.

    Returns (encryption_status, encrypted) tuple where:
      - encryption_status: "encrypted" | "not_encrypted" | "unknown" | "error"
      - encrypted: bool (True only when decrypt is available)
    """
    if "error" in info:
        return "error", False
    if info.get("decrypt_grayed"):
        return "not_encrypted", False
    if info.get("decrypt_available"):
        return "encrypted", True
    if info.get("submenu_found"):
        return "unknown", False
    return "not_encrypted", False


def decrypt_file(filepath):
    """
    Decrypt a single file by invoking the "解密文件" context menu command.

    Returns True if the command was invoked successfully.
    """
    filepath = os.path.abspath(filepath)
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ctx_menu = _get_context_menu(filepath)
    cmd_offset, menu_info = _find_decrypt_command(ctx_menu)

    if cmd_offset is None:
        if not menu_info["submenu_found"]:
            raise RuntimeError(
                f"'{ENCRYPT_SUBMENU_LABEL}' submenu not found in context menu. "
                "The DLP shell extension may not be active."
            )
        available = [item["text"] for item in menu_info["items"]]
        raise RuntimeError(
            f"'{DECRYPT_ITEM_LABEL}' not found in submenu. "
            f"Available items: {available}"
        )

    # Invoke the decrypt command
    # CMINVOKECOMMANDINFO: (fMask, hwnd, verb, params, dir, nShow, hotkey, hIcon)
    ctx_menu.InvokeCommand((0, 0, cmd_offset, "", "", win32con.SW_SHOWNORMAL, 0, 0))
    return True


def decrypt_folder(dirpath, extensions=None, recursive=True, quiet=False):
    """
    Batch decrypt all files in a folder.

    Args:
        dirpath: Path to the folder.
        extensions: Optional set/list of extensions to filter (e.g., ['.pdf', '.docx']).
        recursive: Whether to recurse into subdirectories.
        quiet: If True, suppress print output (for JSON mode).

    Returns:
        dict with keys: 'total', 'decrypted', 'failed', 'skipped', 'details'
    """
    dirpath = os.path.abspath(dirpath)
    results = {
        "total": 0,
        "decrypted": 0,
        "failed": 0,
        "skipped": 0,
        "details": [],
    }

    if extensions:
        extensions = {
            ext.lower() if ext.startswith(".") else f".{ext.lower()}"
            for ext in extensions
        }

    walker = os.walk(dirpath) if recursive else [(dirpath, [], os.listdir(dirpath))]

    for root, dirs, files in walker:
        for fname in files:
            fpath = os.path.join(root, fname)
            if not os.path.isfile(fpath):
                continue

            results["total"] += 1

            if extensions:
                _, ext = os.path.splitext(fname)
                if ext.lower() not in extensions:
                    results["skipped"] += 1
                    continue

            try:
                ctx_menu = _get_context_menu(fpath)
                cmd_offset, menu_info = _find_decrypt_command(ctx_menu)

                if cmd_offset is None:
                    results["skipped"] += 1
                    reason = "no_decrypt_option"
                    if not menu_info["submenu_found"]:
                        reason = "no_encryption_submenu"
                    results["details"].append((fpath, reason))
                    continue

                ctx_menu.InvokeCommand(
                    (0, 0, cmd_offset, "", "", win32con.SW_SHOWNORMAL, 0, 0)
                )
                results["decrypted"] += 1
                results["details"].append((fpath, "decrypted"))
                if not quiet:
                    print(f"  [OK] {fpath}")

                # Small delay between files to avoid overwhelming the service
                time.sleep(0.5)

            except Exception as e:
                results["failed"] += 1
                results["details"].append((fpath, f"error: {e}"))
                if not quiet:
                    print(f"  [ERROR] {fpath}: {e}")

    return results


def _collect_files(paths, extensions=None, recursive=True):
    """
    Expand a list of paths (files and/or folders) into a flat list of file paths.

    Args:
        paths: List of file/folder paths.
        extensions: Optional set of extensions to filter (e.g., {'.pdf', '.docx'}).
        recursive: Whether to recurse into subdirectories for folders.

    Returns:
        List of absolute file paths.
    """
    if extensions:
        extensions = {
            ext.lower() if ext.startswith(".") else f".{ext.lower()}"
            for ext in extensions
        }

    collected = []
    for p in paths:
        p = os.path.abspath(p)
        if os.path.isfile(p):
            if extensions:
                _, ext = os.path.splitext(p)
                if ext.lower() not in extensions:
                    continue
            collected.append(p)
        elif os.path.isdir(p):
            walker = os.walk(p) if recursive else [(p, [], os.listdir(p))]
            for root, dirs, files in walker:
                for fname in files:
                    fpath = os.path.join(root, fname)
                    if not os.path.isfile(fpath):
                        continue
                    if extensions:
                        _, ext = os.path.splitext(fname)
                        if ext.lower() not in extensions:
                            continue
                    collected.append(fpath)
    return collected


def _handle_batch(paths, args):
    """Handle batch mode for multiple paths (files and/or folders)."""
    file_list = _collect_files(
        paths,
        extensions=args.ext,
        recursive=not args.no_recurse,
    )

    if not file_list:
        if getattr(args, "json", False):
            mode = "check" if args.check else "decrypt"
            output_json({"success": True, "mode": mode, "summary": {
                "total": 0, "encrypted": 0, "not_encrypted": 0,
                "unknown": 0, "errors": 0,
            }, "files": []})
        else:
            print("[INFO] No files found matching the criteria.")
        return

    if args.check:
        _handle_batch_check(file_list, args)
    else:
        _handle_batch_decrypt(file_list, args)


def _handle_batch_check(file_list, args):
    """Batch check encryption status for a list of files."""
    results = []
    summary = {"total": 0, "encrypted": 0, "not_encrypted": 0, "unknown": 0, "errors": 0}

    for fpath in file_list:
        summary["total"] += 1
        info = check_file(fpath)
        status, encrypted = _encryption_status(info)
        if status == "error":
            summary["errors"] += 1
        else:
            summary[status] += 1

        entry = {"file": fpath, "encrypted": encrypted, "encryption_status": status}
        if "error" in info:
            entry["error"] = info["error"]

        results.append(entry)

        if not getattr(args, "json", False):
            tag = {
                "encrypted": "ENCRYPTED",
                "not_encrypted": "NOT_ENCRYPTED",
                "unknown": "UNKNOWN",
                "error": "ERROR",
            }[status]
            extra = f" ({info['error']})" if "error" in info else ""
            print(f"  [{tag}] {fpath}{extra}")

    if getattr(args, "json", False):
        output_json({
            "success": True,
            "mode": "check",
            "summary": summary,
            "files": results,
        })
    else:
        print()
        print(f"Total: {summary['total']}, Encrypted: {summary['encrypted']}, "
              f"Not encrypted: {summary['not_encrypted']}, Unknown: {summary['unknown']}, "
              f"Errors: {summary['errors']}")


def _handle_batch_decrypt(file_list, args):
    """Batch decrypt a list of files."""
    results = []
    summary = {"total": 0, "decrypted": 0, "skipped": 0, "failed": 0}
    use_json = getattr(args, "json", False)

    for fpath in file_list:
        summary["total"] += 1
        try:
            ctx_menu = _get_context_menu(fpath)
            cmd_offset, menu_info = _find_decrypt_command(ctx_menu)

            if cmd_offset is None:
                summary["skipped"] += 1
                entry = {"file": fpath, "status": "skipped"}
                if not menu_info["submenu_found"]:
                    entry["reason"] = "no_encryption_submenu"
                else:
                    entry["reason"] = "no_decrypt_option"
                results.append(entry)
                if not use_json:
                    print(f"  [SKIP] {fpath} ({entry['reason']})")
                continue

            ctx_menu.InvokeCommand(
                (0, 0, cmd_offset, "", "", win32con.SW_SHOWNORMAL, 0, 0)
            )
            summary["decrypted"] += 1
            results.append({"file": fpath, "status": "decrypted"})
            if not use_json:
                print(f"  [OK] {fpath}")
            time.sleep(0.5)

        except Exception as e:
            summary["failed"] += 1
            results.append({"file": fpath, "status": "failed", "error": str(e)})
            if not use_json:
                print(f"  [ERROR] {fpath}: {e}")

    if use_json:
        output_json({
            "success": summary["failed"] == 0,
            "mode": "decrypt",
            "summary": summary,
            "files": results,
        })
    else:
        print()
        print(f"Total: {summary['total']}, Decrypted: {summary['decrypted']}, "
              f"Failed: {summary['failed']}, Skipped: {summary['skipped']}")

    if summary["failed"] > 0:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description=(
            'Decrypt files encrypted by the DLP system via the '
            '"文档加密系统" shell extension context menu.'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
  python sd_decrypt.py file.pdf              # Decrypt a single file
  python sd_decrypt.py C:\\path\\to\\folder     # Batch decrypt a folder
  python sd_decrypt.py --check file.pdf      # Check context menu items
  python sd_decrypt.py --ext .pdf .docx dir  # Filter by extension
  python sd_decrypt.py --check --json a.pdf b.docx  # Batch check, JSON output
""",
    )
    parser.add_argument("path", nargs="+", help="File or folder path(s) to process")
    parser.add_argument(
        "--check", action="store_true",
        help="Only check encryption context menu, do not decrypt"
    )
    parser.add_argument(
        "--ext", action="append",
        help="File extension to filter (e.g., --ext .pdf --ext .docx, or --ext .pdf,.docx)"
    )
    parser.add_argument(
        "--no-recurse", action="store_true",
        help="Do not recurse into subdirectories"
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output results as JSON (for programmatic/Agent consumption)"
    )

    args = parser.parse_args()

    if args.ext:
        flat = []
        for val in args.ext:
            flat.extend(e.strip() for e in val.split(",") if e.strip())
        args.ext = flat

    paths = args.path

    # Validate all paths exist
    for p in paths:
        if not os.path.exists(p):
            if args.json:
                output_json({"success": False, "error": f"Path does not exist: {p}"})
            else:
                print(f"[ERROR] Path does not exist: {p}", file=sys.stderr)
            sys.exit(1)

    # Initialize COM
    pythoncom.CoInitialize()
    try:
        if len(paths) == 1 and os.path.isdir(paths[0]):
            _handle_folder(paths[0], args)
        elif len(paths) == 1 and os.path.isfile(paths[0]):
            _handle_file(paths[0], args)
        else:
            _handle_batch(paths, args)
    finally:
        pythoncom.CoUninitialize()


def _handle_file(target, args):
    """Handle single file mode."""
    target = os.path.abspath(target)
    use_json = getattr(args, "json", False)

    if args.check:
        info = check_file(target)

        if use_json:
            if "error" in info:
                output_json({
                    "success": False,
                    "mode": "check",
                    "file": target,
                    "encrypted": False,
                    "encryption_status": "error",
                    "error": info["error"],
                })
                sys.exit(1)

            status, encrypted = _encryption_status(info)
            details = {
                "submenu_found": info.get("submenu_found", False),
                "submenu_label": info.get("submenu_label", ""),
                "decrypt_available": info.get("decrypt_available", False),
                "menu_items": info.get("items", []),
            }
            output_json({
                "success": True,
                "mode": "check",
                "file": target,
                "encrypted": encrypted,
                "encryption_status": status,
                "details": details,
            })
            return

        # Original text output
        if "error" in info:
            print(f"[ERROR] {info['error']}")
            sys.exit(1)

        print(f"File: {target}")
        if info["submenu_found"]:
            print(f"Submenu: {info.get('submenu_label', ENCRYPT_SUBMENU_LABEL)}")
            print("Items:")
            for item in info["items"]:
                marker = " <-- DECRYPT" if DECRYPT_ITEM_LABEL in item["text"] else ""
                print(f"  [{item['id']}] {item['text']}{marker}")
            if info["decrypt_available"]:
                print(f"\nDecrypt command available (offset={info['command_offset']})")
            else:
                print("\nDecrypt command NOT found in submenu")
        else:
            print(f"'{ENCRYPT_SUBMENU_LABEL}' submenu not found")
        return

    # Decrypt mode
    if use_json:
        try:
            decrypt_file(target)
            output_json({
                "success": True,
                "mode": "decrypt",
                "file": target,
                "status": "decrypted",
                "message": f"Decrypt command invoked successfully: {target}",
            })
        except Exception as e:
            output_json({
                "success": False,
                "mode": "decrypt",
                "file": target,
                "status": "failed",
                "error": str(e),
            })
            sys.exit(1)
        return

    # Original text output
    print(f"[INFO] Decrypting: {target}")
    try:
        decrypt_file(target)
        print(f"[OK] Decrypt command invoked successfully: {target}")
    except RuntimeError as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)


def _handle_folder(target, args):
    """Handle folder mode."""
    target = os.path.abspath(target)
    use_json = getattr(args, "json", False)

    if args.check:
        file_list = _collect_files(
            [target],
            extensions=args.ext,
            recursive=not args.no_recurse,
        )

        if use_json:
            results = []
            summary = {"total": 0, "encrypted": 0, "not_encrypted": 0, "unknown": 0, "errors": 0}

            for fpath in file_list:
                summary["total"] += 1
                info = check_file(fpath)
                status, encrypted = _encryption_status(info)
                if status == "error":
                    summary["errors"] += 1
                else:
                    summary[status] += 1

                entry = {"file": fpath, "encrypted": encrypted, "encryption_status": status}
                if "error" in info:
                    entry["error"] = info["error"]
                results.append(entry)

            output_json({
                "success": True,
                "mode": "check",
                "summary": summary,
                "files": results,
            })
            return

        # Original text output
        print(f"Checking encryption menu in: {target}")
        print()
        dec_count = 0
        total = 0
        for fpath in file_list:
            total += 1
            info = check_file(fpath)
            if info.get("decrypt_available"):
                dec_count += 1
                print(f"  [DECRYPT_AVAIL] {fpath}")
            elif info.get("submenu_found"):
                print(f"  [no_decrypt] {fpath}")
            else:
                print(f"  [no_menu] {fpath}")
        print()
        print(f"Total: {total}, Decrypt available: {dec_count}")
    else:
        if use_json:
            results = decrypt_folder(
                target,
                extensions=args.ext,
                recursive=not args.no_recurse,
                quiet=True,
            )
            file_results = []
            for fpath, detail in results["details"]:
                entry = {"file": fpath}
                if detail == "decrypted":
                    entry["status"] = "decrypted"
                elif detail.startswith("error:"):
                    entry["status"] = "failed"
                    entry["error"] = detail[len("error: "):]
                else:
                    entry["status"] = "skipped"
                    entry["reason"] = detail
                file_results.append(entry)

            output_json({
                "success": results["failed"] == 0,
                "mode": "decrypt",
                "summary": {
                    "total": results["total"],
                    "decrypted": results["decrypted"],
                    "failed": results["failed"],
                    "skipped": results["skipped"],
                },
                "files": file_results,
            })
            if results["failed"] > 0:
                sys.exit(1)
            return

        # Original text output
        print(f"Decrypting files in: {target}")
        print()
        results = decrypt_folder(
            target,
            extensions=args.ext,
            recursive=not args.no_recurse,
        )
        print()
        print(f"Total: {results['total']}")
        print(f"Decrypted: {results['decrypted']}")
        print(f"Failed: {results['failed']}")
        print(f"Skipped: {results['skipped']}")
        if results["failed"] > 0:
            sys.exit(1)


if __name__ == "__main__":
    main()
