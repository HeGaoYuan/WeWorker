import { once } from 'node:events'
import { spawnManagedClaudeCodeProcess } from '../../claude-process.js'

const script = [
  'const { spawn } = require("node:child_process")',
  'const child = spawn("/bin/sh", ["-c", "sleep 30"], { detached: true, stdio: "ignore" })',
  'console.log(child.pid)',
  'setInterval(() => {}, 1000)',
].join(';')

const child = spawnManagedClaudeCodeProcess({
  command: process.execPath,
  args: ['-e', script],
  env: process.env,
})
const [chunk] = await once(child.stdout!, 'data')
process.stdout.write(`READY:${String(chunk).trim()}\n`)
setInterval(() => {}, 1000)
