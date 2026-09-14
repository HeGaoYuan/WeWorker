import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('/fi', 'Filter tasks'),
  option('/svc', 'Show services for each process'),
  option('/v', 'Show verbose task information'),
  option('/fo', 'Specify output format'),
  option('/nh', 'Hide column header'),
]

export default {
  name: 'tasklist',
  description: 'List Windows processes',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
