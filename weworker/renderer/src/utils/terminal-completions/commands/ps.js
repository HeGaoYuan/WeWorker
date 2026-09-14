import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('aux', 'Show all processes'),
  option('-ef', 'Show full process listing'),
  option('-f', 'Show full format'),
  option('-u', 'Select by user'),
]

const powershellCandidates = [
  option('-Name', 'Filter by process name'),
  option('-Id', 'Filter by process id'),
  option('-Module', 'Show process modules'),
  option('-FileVersionInfo', 'Show file version information'),
]

export default {
  name: 'ps',
  description: 'Show processes',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
