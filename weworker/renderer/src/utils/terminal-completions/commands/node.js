import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('--version', 'Show Node.js version'),
  option('--eval', 'Evaluate JavaScript'),
  option('--print', 'Evaluate and print JavaScript'),
  option('--inspect', 'Activate inspector'),
  option('--watch', 'Restart on file changes'),
  option('--test', 'Run the Node.js test runner'),
  option('--require', 'Preload a CommonJS module'),
  option('--loader', 'Use an ES module loader'),
]

export default {
  name: 'node',
  description: 'Node.js runtime',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
