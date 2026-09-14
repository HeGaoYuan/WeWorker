import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('install', 'Install dependencies'),
  subcommand('run', 'Run a package script'),
  subcommand('test', 'Run tests'),
  subcommand('build', 'Run build script'),
  subcommand('start', 'Run start script'),
  subcommand('add', 'Add dependencies'),
  subcommand('remove', 'Remove dependencies'),
  subcommand('upgrade', 'Upgrade dependencies'),
  option('--version', 'Show Yarn version'),
]

const subcommandOptions = {
  add: [
    option('-D', 'Save as dev dependency'),
    option('-P', 'Save as peer dependency'),
  ],
  install: [
    option('--frozen-lockfile', 'Do not generate a new lockfile'),
    option('--production', 'Install production dependencies only'),
  ],
}

export default {
  name: 'yarn',
  description: 'Yarn package manager',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
