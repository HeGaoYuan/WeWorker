import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('get', 'Display resources'),
  subcommand('describe', 'Show resource details'),
  subcommand('logs', 'Print pod logs'),
  subcommand('exec', 'Run a command in a container'),
  subcommand('apply', 'Apply a configuration'),
  subcommand('delete', 'Delete resources'),
  subcommand('config', 'Manage kubeconfig'),
  subcommand('rollout', 'Manage rollouts'),
]

const subcommandOptions = {
  get: [
    option('pods', 'List pods'),
    option('svc', 'List services'),
    option('deploy', 'List deployments'),
    option('-n', 'Select namespace'),
    option('-o', 'Select output format'),
  ],
  logs: [
    option('-f', 'Follow logs'),
    option('-n', 'Select namespace'),
    option('--tail', 'Number of lines to show'),
  ],
  exec: [
    option('-it', 'Run interactively with a TTY'),
    option('-n', 'Select namespace'),
    option('--', 'Separate command arguments'),
  ],
  apply: [
    option('-f', 'Read configuration from file'),
    option('-n', 'Select namespace'),
  ],
}

export default {
  name: 'kubectl',
  description: 'Kubernetes CLI',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
