import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('install', 'Install dependencies'),
  subcommand('run', 'Run a package script'),
  subcommand('test', 'Run tests'),
  subcommand('build', 'Run build script'),
  subcommand('start', 'Run start script'),
  subcommand('ci', 'Clean install from lockfile'),
  subcommand('update', 'Update packages'),
  option('--version', 'Show npm version'),
]

const subcommandOptions = {
  install: [
    option('--save-dev', 'Save as dev dependency'),
    option('--global', 'Install globally'),
    option('--legacy-peer-deps', 'Ignore peer dependency conflicts'),
  ],
  run: [
    option('--if-present', 'Do not error if script is missing'),
  ],
}

export default {
  name: 'npm',
  description: 'Node package manager',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
