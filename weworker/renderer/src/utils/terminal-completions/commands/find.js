import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-name', 'Match file name'),
  option('-type', 'Match file type'),
  option('-maxdepth', 'Limit directory depth'),
  option('-exec', 'Execute a command for matches'),
  option('-mtime', 'Match modification time'),
  option('-size', 'Match file size'),
]

const powershellCandidates = [
  option('-Path', 'Specify search path'),
  option('-Filter', 'Filter by pattern'),
  option('-Recurse', 'Search recursively'),
  option('-File', 'Return files only'),
  option('-Directory', 'Return directories only'),
  option('-Include', 'Include matching names'),
]

export default {
  name: 'find',
  description: 'Find files',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
