import { commandCandidate } from './completion-utils.js'
import bash from './commands/bash.js'
import cat from './commands/cat.js'
import cmd from './commands/cmd.js'
import cp from './commands/cp.js'
import curl from './commands/curl.js'
import docker from './commands/docker.js'
import find from './commands/find.js'
import git from './commands/git.js'
import grep from './commands/grep.js'
import java from './commands/java.js'
import kubectl from './commands/kubectl.js'
import ls from './commands/ls.js'
import mkdir from './commands/mkdir.js'
import mv from './commands/mv.js'
import mvn from './commands/mvn.js'
import node from './commands/node.js'
import npm from './commands/npm.js'
import pip from './commands/pip.js'
import powershell, { pwsh } from './commands/powershell.js'
import pnpm from './commands/pnpm.js'
import ps from './commands/ps.js'
import py from './commands/py.js'
import python from './commands/python.js'
import rm from './commands/rm.js'
import ssh from './commands/ssh.js'
import tasklist from './commands/tasklist.js'
import webcli from './commands/webcli.js'
import where from './commands/where.js'
import which from './commands/which.js'
import yarn from './commands/yarn.js'

const COMMANDS = [
  webcli,
  git,
  npm,
  pnpm,
  yarn,
  java,
  mvn,
  node,
  python,
  py,
  pip,
  docker,
  kubectl,
  curl,
  ssh,
  ls,
  cat,
  grep,
  find,
  rm,
  cp,
  mv,
  mkdir,
  tasklist,
  ps,
  where,
  which,
  bash,
  powershell,
  pwsh,
  cmd,
]
const COMMAND_MAP = new Map(COMMANDS.map((command) => [command.name, command]))

export function splitCommandLine(value, cursor) {
  const command = String(value || '')
  const position = Math.max(0, Math.min(Number(cursor) || 0, command.length))
  const before = command.slice(0, position)
  if (!before.trim()) return null

  const parts = []
  let currentPart = ''
  let tokenStarted = false
  let quote = ''
  let endsWithSpace = false
  for (const character of before) {
    if (quote) {
      tokenStarted = true
      endsWithSpace = false
      if (character === quote) quote = ''
      else currentPart += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      tokenStarted = true
      endsWithSpace = false
      continue
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        parts.push(currentPart)
        currentPart = ''
        tokenStarted = false
      }
      endsWithSpace = true
      continue
    }
    currentPart += character
    tokenStarted = true
    endsWithSpace = false
  }
  if (tokenStarted) parts.push(currentPart)
  if (!parts.length) return null

  return {
    root: parts[0] || '',
    args: endsWithSpace ? parts.slice(1) : parts.slice(1, -1),
    current: endsWithSpace ? '' : (parts[parts.length - 1] || ''),
  }
}

export function getRegisteredCommandNames() {
  return COMMANDS.map((command) => command.name)
}

export function getRegisteredCommandDefinition(commandName) {
  return COMMAND_MAP.get(String(commandName || '').toLowerCase()) || null
}

export function getRegisteredCommandCompletions({ command, cursor, context }) {
  const parsed = splitCommandLine(command, cursor)
  if (!parsed) return []
  const definition = getRegisteredCommandDefinition(parsed.root)
  if (!definition?.complete) return []

  const previousArg = parsed.args[parsed.args.length - 1]
  if (definition.pathOptions?.has(previousArg)) return []
  if (definition.valueOptions?.has(previousArg)) {
    return definition.completeValue?.({
      option: previousArg,
      args: parsed.args,
      current: parsed.current,
      context,
    }).slice(0, 12) || []
  }
  if (definition.valueOptions?.has(parsed.current)) {
    return definition.completeValue?.({
      option: parsed.current,
      args: parsed.args,
      current: '',
      context,
      includeOption: true,
    }).slice(0, 12) || []
  }
  if (/^[./~]|^[a-zA-Z]:[\\/]/.test(parsed.current)) return []

  return definition.complete({
    args: parsed.args,
    current: parsed.current,
    context,
  }).slice(0, 12)
}

export function shouldUsePathCompletionForRegisteredCommand({ command, cursor }) {
  const parsed = splitCommandLine(command, cursor)
  if (!parsed) return true
  const definition = getRegisteredCommandDefinition(parsed.root)
  if (!definition) return true

  const previousArg = parsed.args[parsed.args.length - 1]
  if (definition.pathOptions?.has(previousArg)) return true
  if (definition.pathCompletion === false) return false
  return true
}

export function getRegisteredRootCommandCompletions(query) {
  const normalizedQuery = String(query || '').toLowerCase()
  return COMMANDS
    .filter((command) => command.name.toLowerCase().startsWith(normalizedQuery))
    .map((command) => commandCandidate(command.name, command.description))
}
