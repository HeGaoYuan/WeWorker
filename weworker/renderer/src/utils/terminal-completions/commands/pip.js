import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('install', 'Install packages'),
  subcommand('uninstall', 'Uninstall packages'),
  subcommand('list', 'List installed packages'),
  subcommand('show', 'Show package information'),
  subcommand('freeze', 'Output installed packages'),
  subcommand('check', 'Verify installed packages'),
  subcommand('cache', 'Inspect or manage cache'),
  option('--version', 'Show pip version'),
]

const subcommandOptions = {
  install: [
    option('-r', 'Install from requirements file'),
    option('-U', 'Upgrade packages'),
    option('--user', 'Install to the user site-packages'),
    option('--index-url', 'Use a custom package index'),
  ],
  list: [
    option('--outdated', 'List outdated packages'),
    option('--format', 'Select output format'),
  ],
}

export default {
  name: 'pip',
  description: 'Python package installer',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
