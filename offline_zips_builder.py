# -*- coding: utf-8 -*-
"""
为 Python 3.6.4 离线 Linux 构建「当库 import」的 vendor.zip。
- 纯 Python 包及其依赖：解包后打成一个 vendor.zip，sys.path 加它即可 import。
- 编译型依赖（lxml/PyMuPDF）：无法进 zip，单独下载 .whl，README 注明需 pip install。
依赖解析使用 packaging：正确处理 requires_python / 版本范围 / 环境标记 / extras。
"""
import json, ssl, os, re, io, tarfile, zipfile, sys
import urllib.request

# 强制无缓冲输出，便于实时观察
def log(*a):
    print(*a, flush=True)
import builtins
builtins.print = lambda *a, **k: log(*a)
from collections import deque
from packaging.version import Version, InvalidVersion
from packaging.specifiers import SpecifierSet
from packaging.markers import Marker

OUT = r"D:\project\WeWorker\offline_zips"
WHEELS = os.path.join(OUT, "_wheels")
BINARY = os.path.join(OUT, "binary")
os.makedirs(WHEELS, exist_ok=True)
os.makedirs(BINARY, exist_ok=True)

# 目标环境：Python 3.6.4 / Linux x86_64
TARGET_VER = Version("3.6.4")
ENV = {
    "python_version": "3.6",
    "python_full_version": "3.6.4",
    "sys_platform": "linux",
    "platform_system": "Linux",
    "platform_machine": "x86_64",
    "implementation_name": "cpython",
    "platform_python_implementation": "CPython",
    "extra": "",
}

ROOTS = [
    ("pydantic", "==1.9.2"),
    ("python-docx", "==0.8.11"),
    ("python-dotenv", "==0.20.0"),
    ("httpx", "==0.22.0"),
    ("PyMuPDF", "==1.19.4"),   # 编译型，仅作 binary 收集
]

_cache = {}
def pypi(pkg):
    if pkg not in _cache:
        ctx = ssl.create_default_context()
        req = urllib.request.Request("https://pypi.org/pypi/%s/json" % pkg,
                                    headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            _cache[pkg] = json.loads(r.read().decode("utf-8"))
    return _cache[pkg]

def norm(name):
    return re.sub(r"[-_.]+", "-", name).lower()

def ver(v):
    try: return Version(v)
    except InvalidVersion: return None

def compatible(rp):
    return (not rp) or (TARGET_VER in SpecifierSet(rp))

def pick_version(pkg, spec):
    """选同时满足 requires_python(>=3.6.4) 与 spec 的最新版本。"""
    data = pypi(pkg)
    cands = []
    for v, files in data.get("releases", {}).items():
        if not files: continue
        vv = ver(v)
        if vv is None: continue
        rp = files[0].get("requires_python")
        if not compatible(rp): continue
        if spec and vv not in SpecifierSet(spec): continue
        cands.append((vv, v, files))
    if not cands: return None
    cands.sort(key=lambda x: x[0])
    return cands[-1]  # (Version, name, files)

def pure_wheel(files):
    for f in files:
        n = f["filename"].lower()
        if n.endswith(".whl") and ("py3-none-any" in n or "py2.py3-none-any" in n):
            return f
    return None

def cp36_wheel(files):
    for f in files:
        n = f["filename"].lower()
        if n.endswith(".whl") and "cp36" in n and "x86_64" in n and \
           ("manylinux" in n or "musllinux" in n):
            return f
    return None

def sdist_file(files):
    for f in files:
        if f["filename"].lower().endswith(".tar.gz"):
            return f
    return None

def parse_req(req_str):
    """'rfc3986[idna2008] (<2,>=1.3)' -> ('rfc3986', '<2,>=1.3', {'idna2008'})"""
    s = req_str.strip()
    m = re.match(r"^([A-Za-z0-9_.-]+)\s*(\[[^\]]*\])?\s*(.*)$", s)
    name = m.group(1)
    extras = set()
    if m.group(2):
        extras = {e.strip() for e in m.group(2)[1:-1].split(",") if e.strip()}
    spec = m.group(3).strip()
    # 去掉括号
    spec = spec.strip("()")
    return norm(name), spec, extras

def deps_of(pkg, version, requested_extras):
    """返回该版本在目标环境 + 请求 extras 下的依赖列表 [(norm_name, spec, extras)]。"""
    data = pypi(pkg)
    files = data["releases"].get(version, [])
    requires = []
    if files:
        requires = files[0].get("requires_python")  # placeholder
    # 取 requires_dist：用 specific version json
    ctx = ssl.create_default_context()
    req = urllib.request.Request("https://pypi.org/pypi/%s/%s/json" % (pkg, version),
                                headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
        info = json.loads(r.read().decode("utf-8"))["info"]
    out = []
    for d in info.get("requires_dist") or []:
        name_part, sep, marker = d.partition(";")
        included = True
        if marker.strip():
            m = marker.strip()
            if "extra" in m:
                included = any(
                    Marker(m).evaluate({**ENV, "extra": ex})
                    for ex in (requested_extras or [""])
                )
            else:
                included = Marker(m).evaluate({**ENV, "extra": ""})
        if included:
            out.append(parse_req(name_part))
    return out

def download(url, dest):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120, context=ctx) as r, open(dest, "wb") as f:
        f.write(r.read())

# ---------------- 解析依赖树 ----------------
resolved = {}      # norm_name -> dict(version, files, kind[PURE|SDIST|BINARY], url, fn, is_root)
order = []         # 保持发现顺序
queue = deque()
for name, spec in ROOTS:
    queue.append((norm(name), spec, set(), True))

binary_pkgs = []   # 需要单独 pip install 的编译型包

while queue:
    name, spec, extras, is_root = queue.popleft()
    if name in resolved:
        # 已解析；若带了新 extras，可忽略（少数情况）
        continue
    pick = pick_version(name, spec)
    if pick is None:
        print("  !! 找不到兼容版本:", name, spec)
        resolved[name] = {"version": None, "kind": "MISSING"}
        continue
    _, version, files = pick
    pw = pure_wheel(files)
    cw = cp36_wheel(files)
    sd = sdist_file(files)
    if pw:
        kind = "PURE"
        f = pw
    elif sd and not cw:
        kind = "SDIST"
        f = sd
    elif cw:
        kind = "BINARY"
        f = cw
        binary_pkgs.append((name, version, f))
    else:
        kind = "MISSING"
        f = None
    resolved[name] = {"version": version, "kind": kind,
                      "url": f["url"] if f else None,
                      "fn": f["filename"] if f else None, "is_root": is_root}
    order.append(name)
    tag = "" if is_root else "  (dep)"
    print("  resolve %-22s == %-10s [%s]%s" % (name, version, kind, tag))
    # 只递归解析纯 Python 依赖（编译型的子依赖通常无关，且避免拉入编译链）
    if kind in ("PURE", "SDIST"):
        for dn, ds, de in deps_of(name, version, extras):
            if dn not in resolved:
                queue.append((dn, ds, de, False))

# ---------------- 构建 vendor.zip ----------------
vendor_entries = {}   # arcname -> bytes
sdist_pkgs = []

for name in order:
    r = resolved[name]
    if r["kind"] not in ("PURE", "SDIST"):
        continue
    fn = r["fn"]
    dest = os.path.join(WHEELS, fn)
    if not os.path.exists(dest):
        print("  download:", fn)
        download(r["url"], dest)
    if r["kind"] == "PURE":
        with zipfile.ZipFile(dest) as zf:
            for item in zf.namelist():
                if item.endswith("/"): continue
                # 跳过 *.dist-info 与 *.data
                top = item.split("/")[0]
                if top.endswith(".dist-info") or top.endswith(".data"):
                    continue
                if item in vendor_entries: continue
                vendor_entries[item] = zf.read(item)
    else:  # SDIST
        sdist_pkgs.append(name)
        with tarfile.open(dest, "r:gz") as tf:
            # 找包顶层目录（tar 根通常是 name-version/，其下的真实包目录）
            members = tf.getmembers()
            roots = set()
            for m in members:
                parts = m.name.split("/")
                if len(parts) >= 2:
                    roots.add(parts[0] + "/")
            # 取第二个路径段作为包目录候选
            pkg_dirs = set()
            for m in members:
                parts = m.name.split("/")
                if len(parts) >= 2:
                    pkg_dirs.add(parts[1])
            for m in members:
                parts = m.name.split("/")
                if len(parts) < 2: continue
                if parts[1] in pkg_dirs and m.isfile() and parts[-1].endswith(".py"):
                    arc = "/".join(parts[1:])
                    if arc not in vendor_entries:
                        vendor_entries[arc] = tf.extractfile(m).read()

vendor_zip = os.path.join(OUT, "vendor.zip")
with zipfile.ZipFile(vendor_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    for arc, data in sorted(vendor_entries.items()):
        zf.writestr(arc, data)

# ---------------- 下载编译型 .whl ----------------
for name, version, f in binary_pkgs:
    dest = os.path.join(BINARY, f["filename"])
    if not os.path.exists(dest):
        print("  download binary:", f["filename"])
        download(f["url"], dest)

# ---------------- README ----------------
readme = []
readme.append("离线 Python 3.6.4 / Linux x86_64 依赖包（当库 import 方案）\n" + "=" * 60 + "\n")
readme.append("【用法】纯 Python 库已打成一个 vendor.zip，离线机只需：\n")
readme.append("    import sys; sys.path.insert(0, '/opt/vendor.zip')\n")
readme.append("然后即可 import 下列包。\n\n")
readme.append("【vendor.zip 内含的纯 Python 包】\n")
for name in order:
    r = resolved[name]
    if r["kind"] in ("PURE", "SDIST"):
        note = "  (来自 sdist，若 import 异常请改用编译 wheel)" if r["kind"] == "SDIST" else ""
        read = "*" if r.get("is_root") else " "
        readme.append("  %s %-22s == %s%s\n" % (read, name, r["version"], note))
readme.append("\n【需要单独 pip install 的编译型依赖（无法进 zip）】\n")
for name, version, f in binary_pkgs:
    readme.append("  %-22s == %s   -> binary/%s\n" % (name, version, f["filename"]))
readme.append("    离线安装：pip install --no-index --find-links=binary <pkg>==<ver>\n")
readme.append("\n【未找到兼容版本】\n")
miss = [n for n, r in resolved.items() if r["kind"] == "MISSING"]
readme.append("  " + (", ".join(miss) if miss else "无") + "\n")

with open(os.path.join(OUT, "README.txt"), "w", encoding="utf-8") as f:
    f.writelines(readme)

print("\n=== 完成 ===")
print("vendor.zip:", vendor_zip, "(%d 文件)" % len(vendor_entries))
print("binary 目录:", BINARY)
for name, version, ff in binary_pkgs:
    print("   binary:", ff["filename"])
if sdist_pkgs:
    print("来自 sdist 的包:", sdist_pkgs)
print("missing:", miss)
