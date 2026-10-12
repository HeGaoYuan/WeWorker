import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'

const home = os.homedir()
const worksDb = new DatabaseSync(path.join(home, '.weworker', 'works.db'), { readOnly: true })
const memoryDb = new DatabaseSync(path.join(home, '.weworker', 'memory.db'), { readOnly: true })

console.log('=== works schema ===')
for (const row of worksDb.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table'`).all()) {
  console.log(row.name, ':', String(row.sql || '').slice(0, 200))
}

console.log('\n=== recent works ===')
try {
  const works = worksDb.prepare(`SELECT id, title, updated_at FROM works ORDER BY updated_at DESC LIMIT 8`).all()
  console.log(JSON.stringify(works, null, 2))
} catch (e) {
  console.log('works query fail', e.message)
  // try alternate
  console.log(worksDb.prepare(`SELECT * FROM sqlite_master`).all())
}

console.log('\n=== memory counts ===')
try {
  console.log('memories', memoryDb.prepare(`SELECT COUNT(*) AS c FROM memories`).get())
  console.log('events', memoryDb.prepare(`SELECT COUNT(*) AS c FROM memory_events`).get())
  console.log('active', memoryDb.prepare(`SELECT id, type, key, status, updated_at FROM memories ORDER BY updated_at DESC LIMIT 10`).all())
} catch (e) {
  console.log('memory query fail', e.message)
}
