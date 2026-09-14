import { filterCandidates, option } from '../completion-utils.js'

const candidates = [
  option('-p', 'Specify port'),
  option('-i', 'Use identity file'),
  option('-L', 'Forward local port'),
  option('-N', 'Do not execute a remote command'),
  option('-T', 'Disable pseudo-terminal allocation'),
  option('-v', 'Verbose mode'),
  option('-o', 'Set an SSH option'),
  option('-J', 'Connect through a jump host'),
]

export default {
  name: 'ssh',
  description: 'OpenSSH remote login',
  complete({ current }) {
    return filterCandidates(candidates, current)
  },
}
