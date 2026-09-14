import { filterCandidates, option, subcommand } from '../completion-utils.js'

const candidates = [
  option('-v', 'Show Maven version'),
  option('--version', 'Show Maven version'),
  subcommand('clean', 'Clean build outputs'),
  subcommand('test', 'Run tests'),
  subcommand('package', 'Build package'),
  subcommand('install', 'Install package into local repository'),
  subcommand('dependency:tree', 'Print dependency tree'),
  option('-DskipTests', 'Skip tests'),
  option('-q', 'Quiet output'),
]

export default {
  name: 'mvn',
  description: 'Maven build tool',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
