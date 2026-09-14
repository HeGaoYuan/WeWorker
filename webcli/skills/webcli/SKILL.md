---
name: webcli
version: 1.0.8
description: "Browser automation via WebCLI. Use when the user wants to operate websites (search, click, fill forms, read content, take screenshots) or have Chrome complete web tasks automatically. Covers: open browser, call adapter tools, capture screenshots. Supports JD shopping, ITSM tickets, email, invoices, ProjectDemo, SCM, Pace+, ExpenseDemo and more."
allowed-tools: Bash(webcli call *), Bash(npm view *)
---

# WebCLI — Browser Automation

Operate websites through WebCLI adapters. Extension Adapters use the Chrome extension Bridge; Toolkit Adapters use the embedded Toolkit Runtime. Both use the same `webcli call` command.

## Setup

The desktop app bundles and installs WebCLI automatically. Agents may query package metadata, but must not install or upgrade packages themselves.

```bash
REG=https://registry.npmjs.org
LATEST=$(npm view weworker-webcli version --registry=$REG 2>/dev/null)
CURRENT=$(webcli --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "current=$CURRENT latest=$LATEST"
```

- If WebCLI is missing or outdated, tell the user to restart or update WeWorker.
- Adapter skills are installed by the desktop app at startup.
- **Extension Bridge service**: starts automatically when an Extension Adapter is called; Toolkit Adapter calls do not start it.

## The only manual step for the user: load the Chrome extension

Loading the extension is a one-time manual Chrome action the agent cannot do. When a tool call returns `Extension not connected` / `Chrome扩展未连接`, the extension is not loaded yet — guide the user through it:

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the extension directory shown by WeWorker.
4. Confirm the **WeWorker Browser Adapter** extension appears and is enabled.
5. Open or refresh the target website and wait at least 5 seconds.

The extension reconnects to the Bridge automatically; no service restart needed. After loading, re-run the failed `webcli call` to verify.

## Core commands

### Call an adapter tool

```bash
webcli call <tool_name> --key=value
```

Examples:
```bash
webcli call jd.com.search_products --keyword=手机
webcli call mail.163.com.get_unread_emails --limit=5
webcli call mail.google.com.search_emails --keyword=invoice
```

### Open browser

```bash
webcli call open_browser --url=<url>
```

Use the **Homepage** URL from the target adapter's skill doc — it has the correct protocol (http/https) and path. Do NOT guess or default to https; many internal sites require http.

After opening a supported site, **wait at least 5 seconds** before calling page/DOM tools — the adapter needs time to inject and register.

### Capture screenshot

```bash
webcli call capture_screenshot
webcli call capture_screenshot --fullPage=true
```

## Adapter management

```bash
webcli adapter list              # List installed adapters
webcli adapter list --json       # JSON output with tool definitions
webcli adapter info <id>         # Show an adapter's tools
webcli adapter skill <id>        # Print an adapter's SKILL.md
webcli adapter skill <id> --generated
webcli adapter knowledge <id>
webcli adapter knowledge <id> --json
```

For generated adapters, `WEBCLI_KNOWLEDGE.md`, `WEBCLI_KNOWLEDGE.json`, and `SKILL.generated.md` are optimization context files. 优化生成式适配器前，必须先读取 `webcli adapter knowledge <id>` 或同目录的 `WEBCLI_KNOWLEDGE.md`；需要结构化接口信息时读取 `webcli adapter knowledge <id> --json`。

## Rules

1. Before calling page/DOM adapter tools, ensure the target site is open in Chrome. Use `open_browser` if needed.
2. Tools marked `Execution: type=api, runtime=background` and `Execution: mode=direct` are API tools. Call them directly without opening the target site or checking login first. `type=api` is planning metadata; `mode=direct` selects the direct runtime.
3. If a direct tool returns a login or page-context error, use `open_browser` with the adapter Homepage URL and ask the user to finish login before retrying.
4. With `open_browser`, always use the **Homepage** URL from the adapter's skill doc — it has the correct protocol (http vs https) and path. Do NOT default to https.
5. After `open_browser`, wait at least 5 seconds before calling that site's page/DOM tools.
6. Tool names follow `<domain>.<action>`, e.g. `jd.com.search_products`.
7. Pass ordinary arguments as `--key=value`. Use JSON literals for arrays and objects; repeated flags form arrays. Numeric text remains a string until the Adapter applies its own schema rules.
8. If a tool returns an error, retry at most 2 times. If it keeps failing, tell the user.
9. If a call returns `Extension not connected` / `Chrome扩展未连接`, do NOT blindly retry — the Chrome extension is not loaded. Walk the user through **load the Chrome extension** above, then retry.
10. For page/DOM tools on sites requiring login, call `<domain>.check_login_status` first when available.
