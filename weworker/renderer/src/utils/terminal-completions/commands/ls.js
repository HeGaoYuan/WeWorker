import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-la', 'List all files with details'),
  option('-lh', 'Use human-readable sizes'),
  option('-a', 'Show hidden files'),
  option('-R', 'List directories recursively'),
  option('-t', 'Sort by modification time'),
  option('-S', 'Sort by file size'),
]

const powershellCandidates = [
  option('-Force', 'Show hidden and system items'),
  option('-Recurse', 'List child items recursively'),
  option('-Name', 'Show names only'),
  option('-File', 'Show files only'),
  option('-Directory', 'Show directories only'),
  option('-Filter', 'Filter by pattern'),
]

export default {
  name: 'ls',
  description: 'List directory contents',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
