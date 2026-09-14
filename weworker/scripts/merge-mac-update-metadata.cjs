const fs = require('fs')

function unquote(value) {
  const text = String(value || '').trim()
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1)
  }
  return text
}

function parseMetadata(content, expectedArch) {
  const version = unquote(content.match(/^version:\s*(.+)$/m)?.[1])
  const releaseDate = unquote(content.match(/^releaseDate:\s*(.+)$/m)?.[1])
  if (!version) throw new Error(`Missing version in ${expectedArch} metadata`)
  if (!releaseDate || Number.isNaN(Date.parse(releaseDate))) {
    throw new Error(`Missing or invalid releaseDate in ${expectedArch} metadata`)
  }

  const files = []
  const pattern = /^  - url:\s*(.+)\r?\n    sha512:\s*(.+)\r?\n    size:\s*(\d+)$/gm
  for (const match of content.matchAll(pattern)) {
    files.push({
      url: unquote(match[1]),
      sha512: unquote(match[2]),
      size: Number(match[3]),
    })
  }
  if (files.length !== 2) throw new Error(`Expected exactly two ${expectedArch} files; got ${files.length}`)
  for (const extension of ['zip', 'dmg']) {
    const matches = files.filter((file) => file.url.endsWith(`-mac-${expectedArch}.${extension}`))
    if (matches.length !== 1) throw new Error(`Expected one ${expectedArch} ${extension} file`)
  }
  return { version, releaseDate, files }
}

function mergeMacMetadata(arm64Content, x64Content) {
  const arm64 = parseMetadata(arm64Content, 'arm64')
  const x64 = parseMetadata(x64Content, 'x64')
  if (arm64.version !== x64.version) {
    throw new Error(`macOS metadata version mismatch: arm64=${arm64.version}, x64=${x64.version}`)
  }
  const releaseDate = new Date(Math.max(Date.parse(arm64.releaseDate), Date.parse(x64.releaseDate))).toISOString()
  const lines = [`version: ${arm64.version}`, 'files:']
  for (const file of [...arm64.files, ...x64.files]) {
    lines.push(`  - url: ${file.url}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`)
  }
  lines.push(`releaseDate: '${releaseDate}'`, '')
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 3) {
    throw new Error('Usage: node merge-mac-update-metadata.cjs <arm64.yml> <x64.yml> <output.yml>')
  }
  const [arm64Path, x64Path, outputPath] = argv
  const output = mergeMacMetadata(
    fs.readFileSync(arm64Path, 'utf8'),
    fs.readFileSync(x64Path, 'utf8'),
  )
  fs.writeFileSync(outputPath, output, 'utf8')
  console.log(`[release] merged macOS update metadata: ${outputPath}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`[release] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { mergeMacMetadata, parseMetadata }
