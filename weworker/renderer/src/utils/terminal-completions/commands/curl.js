import { filterCandidates, option } from '../completion-utils.js'

const bashCandidates = [
  option('-X', 'Set request method'),
  option('-H', 'Add request header'),
  option('-d', 'Send request body data'),
  option('-I', 'Fetch response headers only'),
  option('-L', 'Follow redirects'),
  option('-o', 'Write output to file'),
  option('-k', 'Allow insecure TLS connections'),
  option('--compressed', 'Request compressed response'),
]

const powershellCandidates = [
  option('-Uri', 'Specify request URI'),
  option('-Method', 'Specify HTTP method'),
  option('-Headers', 'Add request headers'),
  option('-Body', 'Send request body'),
  option('-OutFile', 'Write response to file'),
  option('-UseBasicParsing', 'Use basic parsing mode'),
]

export default {
  name: 'curl',
  description: 'Transfer data with URLs',
  complete({ current, context }) {
    const candidates = context?.shell === 'powershell' ? powershellCandidates : bashCandidates
    return filterCandidates(candidates, current)
  },
}
