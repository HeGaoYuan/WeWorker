---
name: webcli
version: 1.0.1
description: "Browser automation via WebCLI. Use when the user wants to operate websites (search, click, fill forms, read content, take screenshots) or have Chrome complete web tasks automatically. Covers: open browser, call adapter tools, capture screenshots, and discover a site's tools. Ships adapters for e-commerce and marketplaces (JD, 1688, Goofish), social and content sites (Bilibili, Zhihu, Weibo, Douyin, Xiaohongshu, Tieba, Douban), news and reference (36Kr, Hacker News, Wikipedia, arXiv), email (163, QQ, Gmail), travel and ticketing (12306, Ctrip), job boards (51job, Zhipin), developer sites (GitHub, Gitee, V2EX, Juejin), reviews and finance (Dianping, SMZDM, Xueqiu), and more."
allowed-tools: Bash(webcli call *), Bash(npm view *)
---

# WebCLI — Browser Automation

Operate websites through WebCLI adapters. Extension Adapters use the Chrome extension Bridge; Toolkit Adapters use the embedded Toolkit Runtime. Both use the same `webcli call` command.

## Setup

This skill drives the `webcli` command. Make sure it is installed and current before calling tools:

```bash
REG=https://registry.npmjs.org
webcli --version 2>/dev/null || npm install -g weworker-webcli --registry="$REG"
LATEST=$(npm view weworker-webcli version --registry="$REG" 2>/dev/null)
CURRENT=$(webcli --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "current=$CURRENT latest=$LATEST"
```

- **Install or upgrade when missing or older than `latest`**: `npm install -g weworker-webcli`.
- If the global install fails on permissions (`EACCES` / `EPERM`), ask the user to run the same command themselves rather than escalating.
- Users who run the WeWorker desktop app already have WebCLI bundled — no global install needed there.
- After a fresh install, the adapter list may need one call to warm up; run `webcli list` to confirm the CLI sees the shipped sites.
- **Extension Bridge service**: starts automatically when an Extension Adapter is called; Toolkit Adapter calls do not start it.

## The only manual step for the user: load the Chrome extension

The Chrome extension ships inside the npm package — no separate download. Loading it is a one-time manual Chrome action the agent cannot perform.

**Detect**: any tool call returning `Extension not connected` / `Chrome扩展未连接` means the extension is not loaded (or the target site's page is not open).

**Get the exact directory to load this machine:**

```bash
webcli extension-path          # prints the bundled extension directory
```

**Guide the user through it:**

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the directory printed by `webcli extension-path`.
4. Confirm the **WeWorker Browser Adapter** extension appears and is enabled.
5. Open or refresh the target website and wait at least 5 seconds.

The extension reconnects to the Bridge automatically; no service restart needed. After loading, re-run the failed `webcli call` to verify.

> Desktop-app installs resolve the same way: `webcli extension-path` points at the copy bundled with WeWorker, so this section applies to both install paths.

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

Use the **Homepage** URL from the target adapter's skill doc — it has the correct protocol (http/https) and path. Do NOT guess or default to https; some sites are http-only.

After opening a supported site, **wait at least 5 seconds** before calling page/DOM tools — the adapter needs time to inject and register.

### Capture screenshot

```bash
webcli call capture_screenshot
webcli call capture_screenshot --fullPage=true
```

## Discovering tools

Do not guess tool names or arguments — the installed adapters are the source of truth. Explore from coarse to fine:

```bash
webcli help                        # Installed sites — first level of progressive help
webcli list                        # Installed sites (shorthand for `adapter list`)
webcli list --json                 # Installed sites with full tool definitions
webcli <site> help                 # One site's command list — second level
webcli <site> <command> help       # One command's arguments — third level
webcli <site> -help -f json        # Structured tool list for programmatic parsing
webcli adapter skill <id>          # The site's SKILL.md (includes the Homepage URL)
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
