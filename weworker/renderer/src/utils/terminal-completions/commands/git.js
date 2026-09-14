import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('status', 'Show working tree status'),
  subcommand('add', 'Add file contents to the index'),
  subcommand('commit', 'Record changes'),
  subcommand('checkout', 'Switch branches or restore files'),
  subcommand('switch', 'Switch branches'),
  subcommand('branch', 'List or manage branches'),
  subcommand('pull', 'Fetch and integrate remote changes'),
  subcommand('push', 'Update remote refs'),
  subcommand('log', 'Show commit logs'),
  subcommand('diff', 'Show changes'),
]

const subcommandOptions = {
  status: [
    option('--short', 'Show status concisely'),
    option('--branch', 'Show branch information'),
  ],
  commit: [
    option('-m', 'Use the given commit message'),
    option('--amend', 'Amend the previous commit'),
    option('--no-verify', 'Bypass hooks'),
  ],
  checkout: [
    option('-b', 'Create and switch to a new branch'),
    option('--', 'Treat remaining arguments as paths'),
  ],
  log: [
    option('--oneline', 'Show one commit per line'),
    option('--graph', 'Draw commit graph'),
    option('--decorate', 'Show ref names'),
  ],
}

export default {
  name: 'git',
  description: 'Git version control',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
