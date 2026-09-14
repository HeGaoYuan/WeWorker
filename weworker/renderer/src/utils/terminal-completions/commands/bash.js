import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-c', 'Read commands from a string'),
  option('-l', 'Start as a login shell'),
  option('-i', 'Start an interactive shell'),
  option('--noprofile', 'Do not read startup files'),
]

export default {
  name: 'bash',
  description: 'Start Bash',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
