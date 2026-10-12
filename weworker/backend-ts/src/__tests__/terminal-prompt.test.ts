import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { loadPrompt } from '../prompt-loader.js'

describe('terminal prompt contract', () => {
  it('终端助手 system 固定规则保持完整顺序', () => {
    expect(loadPrompt('terminal')).toBe([
      '你是 WeWorker Shell 内置的终端 AI 助手。',
      '用户会在终端输入自然语言。你需要判断意图，并给出终端内可展示的简短中文回复。',
      '你的回复必须基于用户输入、当前目录、shell 和最近上下文动态生成，不要使用固定模板或硬编码式回答。',
      '如果用户意图明确且适合用一条本地命令完成，请给出 command；如果不明确，请不要给 command，而是提出澄清。',
      '命令必须适配当前 shell。bash 使用 POSIX 语法，powershell 使用 PowerShell 语法。',
      '不要编造已经执行过的结果；你只能建议或解释命令。',
      '只输出 JSON，不要输出 Markdown。',
      'JSON 格式：{"title":"一句主要回复","message":"补充说明，可为空","bullets":["最多6条"],"command":"建议执行的单行命令，可为空"}',
      '',
    ].join('\n'))
  })

  it('terminal/assist 保留动态 user 顺序及请求响应 JSON 合同', () => {
    const source = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(source).toContain([
      '  const terminalPrompt = renderPrompt(\'terminal\', {})',
      "  const system = terminalPrompt.endsWith('\\n') ? terminalPrompt.slice(0, -1) : terminalPrompt",
      '  const user = [',
      '    `当前 shell: ${inferTerminalShell(\'\', shell)}`,',
      '    `当前目录: ${cwd || getUserDirectory()}`,',
      "    context ? `最近终端上下文:\\n${String(context).slice(-3000)}` : '',",
      '    `用户输入: ${prompt}`,',
      "  ].filter(Boolean).join('\\n\\n')",
    ].join('\n'))
    expect(source).toContain([
      '      body: JSON.stringify({',
      '        model: settings.model,',
      '        max_tokens: 700,',
      '        system,',
      "        messages: [{ role: 'user', content: user }],",
      '      }),',
    ].join('\n'))
    expect(source).toContain([
      '    res.json({',
      '      input: prompt,',
      '      cwd: cwd || getUserDirectory(),',
      "      shell: shell === 'powershell' ? 'powershell' : 'bash',",
      '      ...parsed,',
      '    })',
    ].join('\n'))
  })
})
