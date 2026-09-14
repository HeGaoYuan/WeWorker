import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-NoProfile', 'Do not load the profile'),
  option('-ExecutionPolicy', 'Set execution policy'),
  option('-Command', 'Run a command'),
  option('-File', 'Run a script file'),
  option('-NoExit', 'Do not exit after running startup commands'),
]

const powershell = {
  name: 'powershell',
  description: 'Start Windows PowerShell',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}

export default powershell
export const pwsh = {
  ...powershell,
  name: 'pwsh',
  description: 'Start PowerShell Core',
}
