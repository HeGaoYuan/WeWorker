import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-f', 'Overwrite existing destination files'),
  option('-i', 'Prompt before overwrite'),
  option('-v', 'Explain what is being moved'),
  option('-n', 'Do not overwrite existing files'),
]

const powershellCandidates = [
  option('-Force', 'Move read-only items'),
  option('-Confirm', 'Prompt before moving'),
  option('-WhatIf', 'Show what would be moved'),
  option('-Destination', 'Specify destination path'),
]

export default {
  name: 'mv',
  description: 'Move or rename files',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
