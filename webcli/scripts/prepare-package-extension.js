import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultWebcliDir = path.resolve(scriptDir, '..')
const defaultSourceExtensionDir = path.resolve(defaultWebcliDir, '..', 'extension')

const EXCLUDED_DIRS = new Set(['.git', 'node_modules'])
const EXCLUDED_FILE_SUFFIXES = [
  '.index-snippet.generated.txt',
  '.integration.generated.md',
]

export function syncPackageExtension({
  webcliDir = defaultWebcliDir,
  sourceExtensionDir = defaultSourceExtensionDir,
} = {}) {
  if (!fs.existsSync(sourceExtensionDir)) {
    throw new Error(`extension source directory not found: ${sourceExtensionDir}`)
  }
  const targetExtensionDir = path.join(webcliDir, 'extension')
  fs.rmSync(targetExtensionDir, { recursive: true, force: true })
  const fileCount = copyDirectory(sourceExtensionDir, targetExtensionDir, sourceExtensionDir)
  return { sourceExtensionDir, targetExtensionDir, fileCount }
}

function copyDirectory(sourceDir, targetDir, sourceRoot) {
  let fileCount = 0
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (shouldSkipEntry(entry, sourcePath, sourceRoot)) continue
    if (entry.isDirectory()) {
      fileCount += copyDirectory(sourcePath, targetPath, sourceRoot)
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath)
      fileCount += 1
    }
  }
  return fileCount
}

function shouldSkipEntry(entry, sourcePath, sourceRoot) {
  if (entry.isDirectory()) {
    return EXCLUDED_DIRS.has(entry.name) || path.relative(sourceRoot, sourcePath) === 'test'
  }
  if (!entry.isFile()) {
    return true
  }
  return EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectExecution) {
  const result = syncPackageExtension()
  console.log(`[prepare-package-extension] copied ${result.fileCount} file(s) from ${result.sourceExtensionDir} to ${result.targetExtensionDir}`)
}
