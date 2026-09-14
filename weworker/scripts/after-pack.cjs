const { execFileSync } = require('child_process')
const path = require('path')

function buildAdHocSignCommands(appPath) {
  return [
    ['--force', '--deep', '--sign', '-', appPath],
    ['--verify', '--deep', '--strict', '--verbose=4', appPath],
  ]
}

function afterPack(context, run = execFileSync) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  for (const args of buildAdHocSignCommands(appPath)) {
    run('/usr/bin/codesign', args, { stdio: 'inherit' })
  }
}

module.exports = afterPack
module.exports.buildAdHocSignCommands = buildAdHocSignCommands
