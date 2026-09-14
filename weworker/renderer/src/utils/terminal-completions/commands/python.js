import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('--version', 'Show Python version'),
  option('-m', 'Run a library module as a script'),
  option('-c', 'Run Python code from the command line'),
  option('-i', 'Enter interactive mode after running'),
  option('-u', 'Force unbuffered output'),
  option('-O', 'Remove assert statements'),
  option('-B', 'Do not write .pyc files'),
  option('-X', 'Set implementation-specific option'),
]

export default {
  name: 'python',
  description: 'Python runtime',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
