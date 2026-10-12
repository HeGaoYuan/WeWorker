import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'

const db = new DatabaseSync(path.join(os.homedir(), '.weworker', 'works.db'), { readOnly: true })
const workIds = [
  '34a824ed-9a28-462b-9689-fa6f069df134', // DeepSeek T9
  '1f915f7a-e4d4-4df3-898b-412c2558cf3a', // DeepSeek C2+T11
]

for (const workId of workIds) {
  console.log('\n==== work', workId, '====')
  const msgs = db.prepare(
    `SELECT role, content, created_at FROM messages WHERE work_id = ? ORDER BY created_at ASC`,
  ).all(workId)
  for (const m of msgs) {
    const content = String(m.content)
    const hasMem = content.includes('weworker_memory')
    const hasShould = content.includes('should_remember')
    console.log(`- ${m.role} @ ${m.created_at} len=${content.length} has_weworker_memory=${hasMem} has_should_remember=${hasShould}`)
    if (m.role === 'assistant') {
      // print text blocks only
      try {
        const blocks = JSON.parse(content)
        for (const b of blocks) {
          if (b.type === 'text') {
            const t = String(b.text || '')
            console.log('  TEXT_TAIL:', JSON.stringify(t.slice(-500)))
            if (hasMem) {
              const i = t.indexOf('<weworker_memory>')
              console.log('  MEMORY_BLOCK:', t.slice(i, i + 400))
            }
          }
          if (b.type === 'tool_use') {
            console.log(`  TOOL: ${b.name} status=${b.status}`)
          }
        }
      } catch (e) {
        console.log('  parse fail', e.message, content.slice(0, 200))
      }
    }
  }
}
