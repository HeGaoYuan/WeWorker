import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { getChatBangCompletionCandidates } from '../utils/terminal-completion.js'

const source = fs.readFileSync(new URL('../components/chat/InputBar.jsx', import.meta.url), 'utf8')
const callback = source.slice(source.indexOf('  const buildBangSlashItems ='), source.indexOf('  const slashItems ='))

function candidates(mode, query = '') {
  const root = 'C:/weworker-fixtures/user-files'
  return vm.runInNewContext(`${callback}\nbuildBangSlashItems`, {
    useCallback: fn => fn, getChatBangCompletionCandidates,
    bangCompletionSource: mode, routerAliases: ['!example', '!exampletop'],
    sites: [], terminalSessions: [], userFilesRoot: root,
    userFiles: [{ name: 'notes.md', path: `${root}/notes.md`, is_directory: false }],
    getPlatformShell: () => 'powershell', commandCompletionKindLabel: () => '文件',
  })(query)
}

test('command and automatic completion include matching routing aliases', () => {
  for (const mode of [null, 'commands']) {
    assert.equal(candidates(mode).filter(item => item.kind === 'alias').length, 2)
    const matches = candidates(mode, 'examplet')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].command, 'exampletop ')
  }
})

test('file completion never includes routing shortcuts', () => {
  const files = candidates('files')
  assert.equal(files.length, 1)
  assert.equal(files[0].title, 'notes.md')
  assert.equal(files.some(item => item.kind === 'alias'), false)
  assert.equal(candidates('files', 'examplet').length, 0)
})

test('routing aliases are not suggested in an argument position', () => {
  for (const mode of [null, 'commands', 'files']) {
    assert.equal(candidates(mode, 'example ').some(item => item.kind === 'alias'), false)
  }
})
