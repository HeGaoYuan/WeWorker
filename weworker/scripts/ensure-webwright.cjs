const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../..')
const COMPONENT_PATH = 'components/webwright'
const COMPONENT_ROOT = path.join(REPO_ROOT, COMPONENT_PATH)

function ensureWebwright({ log = console.log } = {}) {
  const projectFile = path.join(COMPONENT_ROOT, 'pyproject.toml')
  if (!fs.existsSync(projectFile)) {
    throw new Error(`Missing ${COMPONENT_PATH}/pyproject.toml from WeWorker checkout`)
  }

  log(`[webwright] component ready: ${COMPONENT_PATH}`)
  return { componentRoot: COMPONENT_ROOT }
}

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error(`Unknown argument: ${process.argv[2]}`)
    ensureWebwright()
  } catch (error) {
    console.error(`[webwright] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  REPO_ROOT,
  COMPONENT_PATH,
  COMPONENT_ROOT,
  ensureWebwright,
}
