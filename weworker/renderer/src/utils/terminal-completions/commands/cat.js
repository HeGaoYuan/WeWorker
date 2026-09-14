import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-n', 'Number all output lines'),
  option('-b', 'Number non-empty output lines'),
  option('-A', 'Show non-printing characters'),
]

const powershellCandidates = [
  option('-Raw', 'Read file content as one string'),
  option('-Tail', 'Read the last lines'),
  option('-Wait', 'Keep reading as content is appended'),
  option('-Encoding', 'Specify file encoding'),
]

export default {
  name: 'cat',
  description: 'Print file contents',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
