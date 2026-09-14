import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-p', 'Create parent directories as needed'),
  option('-v', 'Print each created directory'),
  option('-m', 'Set file mode'),
]

const powershellCandidates = [
  option('-Force', 'Create item even when needed parents exist'),
  option('-ItemType', 'Specify item type'),
  option('-Path', 'Specify item path'),
  option('-Name', 'Specify item name'),
]

export default {
  name: 'mkdir',
  description: 'Create directories',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
