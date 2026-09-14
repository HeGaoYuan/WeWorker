import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-n', 'Show line numbers'),
  option('-i', 'Ignore case'),
  option('-r', 'Search recursively'),
  option('-E', 'Use extended regular expressions'),
  option('-v', 'Invert match'),
  option('--color', 'Highlight matching text'),
]

export default {
  name: 'grep',
  description: 'Search text',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
