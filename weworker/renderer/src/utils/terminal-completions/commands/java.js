import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-version', 'Show Java runtime version'),
  option('-jar', 'Run a JAR file'),
  option('-cp', 'Set classpath'),
  option('-classpath', 'Set classpath'),
  option('--help', 'Show Java help'),
  option('-D', 'Set a system property', '-D'),
]

export default {
  name: 'java',
  description: 'Java runtime',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
