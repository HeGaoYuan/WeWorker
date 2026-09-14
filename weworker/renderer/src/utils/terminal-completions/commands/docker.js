import { filterCandidates, option, subcommand } from '../completion-utils.js'

const rootCandidates = [
  subcommand('ps', 'List containers'),
  subcommand('images', 'List images'),
  subcommand('run', 'Run a container'),
  subcommand('exec', 'Run a command in a container'),
  subcommand('logs', 'Show container logs'),
  subcommand('build', 'Build an image'),
  subcommand('pull', 'Pull an image'),
  subcommand('compose', 'Run Docker Compose'),
]

const subcommandOptions = {
  ps: [
    option('-a', 'Show all containers'),
    option('--format', 'Format output'),
  ],
  run: [
    option('-d', 'Run in detached mode'),
    option('-p', 'Publish a port'),
    option('-v', 'Bind mount a volume'),
    option('--name', 'Assign a container name'),
  ],
  exec: [
    option('-it', 'Run interactively with a TTY'),
    option('-e', 'Set environment variables'),
  ],
  logs: [
    option('-f', 'Follow log output'),
    option('--tail', 'Number of lines to show'),
  ],
  compose: [
    subcommand('up', 'Create and start containers'),
    subcommand('down', 'Stop and remove containers'),
    subcommand('logs', 'View service logs'),
    subcommand('ps', 'List services'),
  ],
}

export default {
  name: 'docker',
  description: 'Docker container management',
  complete({ args, current }) {
    const sub = args[0]
    if (!sub) return filterCandidates(rootCandidates, current)
    return filterCandidates(subcommandOptions[sub] || [], current)
  },
}
