import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('/c', 'Run command and then terminate'),
  option('/k', 'Run command and keep the shell open'),
  option('/q', 'Turn echo off'),
  option('/d', 'Disable AutoRun commands'),
]

export default {
  name: 'cmd',
  description: 'Start Windows cmd',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
