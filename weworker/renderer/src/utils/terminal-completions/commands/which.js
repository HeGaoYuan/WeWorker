import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-a', 'Show all matching executables'),
  option('-s', 'Silent mode'),
]

export default {
  name: 'which',
  description: 'Locate commands',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
