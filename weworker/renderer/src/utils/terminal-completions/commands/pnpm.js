import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('install', 'Install dependencies'),
  subcommand('run', 'Run a package script'),
  subcommand('test', 'Run tests'),
  subcommand('build', 'Run build script'),
  subcommand('start', 'Run start script'),
  subcommand('add', 'Add dependencies'),
  subcommand('update', 'Update packages'),
  subcommand('exec', 'Run a command from dependencies'),
  option('--version', 'Show pnpm version'),
]

const subcommandOptions = {
  install: [
    option('--frozen-lockfile', 'Fail if lockfile needs updates'),
    option('--prod', 'Install production dependencies only'),
  ],
  add: [
    option('-D', 'Save as dev dependency'),
    option('-g', 'Install globally'),
  ],
  run: [
    option('--if-present', 'Do not error if script is missing'),
  ],
}

export default {
  name: 'pnpm',
  description: 'Fast Node package manager',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
