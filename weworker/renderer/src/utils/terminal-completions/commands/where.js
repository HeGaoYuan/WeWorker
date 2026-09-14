import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('/r', 'Search recursively from a directory'),
  option('/q', 'Return only exit code'),
  option('/f', 'Show matched file names in quotes'),
  option('/t', 'Show file size and timestamp'),
]

export default {
  name: 'where',
  description: 'Locate Windows commands',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
