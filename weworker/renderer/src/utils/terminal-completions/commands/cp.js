import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-r', 'Copy directories recursively'),
  option('-f', 'Overwrite existing destination files'),
  option('-i', 'Prompt before overwrite'),
  option('-v', 'Explain what is being copied'),
  option('-p', 'Preserve mode, ownership, and timestamps'),
]

const powershellCandidates = [
  option('-Recurse', 'Copy child items recursively'),
  option('-Force', 'Overwrite read-only items'),
  option('-Confirm', 'Prompt before copying'),
  option('-WhatIf', 'Show what would be copied'),
]

export default {
  name: 'cp',
  description: 'Copy files or directories',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
