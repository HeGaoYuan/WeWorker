import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-r', 'Remove directories recursively'),
  option('-f', 'Ignore missing files'),
  option('-i', 'Prompt before removal'),
  option('-v', 'Explain what is being removed'),
]

const powershellCandidates = [
  option('-Recurse', 'Remove child items recursively'),
  option('-Force', 'Remove hidden or read-only items'),
  option('-Confirm', 'Prompt before removing'),
  option('-WhatIf', 'Show what would be removed'),
]

export default {
  name: 'rm',
  description: 'Remove files or directories',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
