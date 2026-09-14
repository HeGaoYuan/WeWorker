import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { readFileSync } from 'fs'
import WebSocket from 'ws'

const settings = JSON.parse(readFileSync(process.env.HOME + '/.wework/settings.json', 'utf8'))
process.env.ANTHROPIC_API_KEY = settings.api_key

// Get screenshot from bridge
const screenshotData = await new Promise((resolve, reject) => {
  const w = new WebSocket('ws://localhost:3711')
  const id = 'test-' + Date.now()
  w.on('open', () => w.send(JSON.stringify({type:'capture_screenshot', fullPage:false, id})))
  w.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.id === id) { w.close(); resolve(msg.result?.data || msg.data) }
  })
  w.on('error', reject)
  setTimeout(() => reject(new Error('timeout')), 5000)
})

console.log('Screenshot data length:', screenshotData?.length)

const mcpServer = createSdkMcpServer({
  name: 'test', version: '1.0.0',
  tools: [
    tool('get_screenshot', 'Returns a screenshot', {}, async () => ({
      content: [{ type: 'image', data: screenshotData, mimeType: 'image/jpeg' }]
    }))
  ]
})

for await (const msg of query({
  prompt: 'Call get_screenshot and describe what you see in detail.',
  options: { model: settings.model, mcpServers: { test: mcpServer }, permissionMode: 'bypassPermissions' }
})) {
  if (msg.type === 'assistant') {
    const text = msg.message?.content?.filter(b => b.type === 'text').map(b => b.text).join('')
    if (text) console.log('Claude says:', text.slice(0, 400))
  }
  if (msg.type === 'user') {
    const c = msg.message?.content
    if (Array.isArray(c)) {
      for (const block of c) {
        if (block.type === 'tool_result') {
          console.log('tool_result:', JSON.stringify(block.content?.map(p => ({type: p.type, keys: Object.keys(p), dataLen: p.data?.length, sourceType: p.source?.type}))))
        }
      }
    }
  }
}
