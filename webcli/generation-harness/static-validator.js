import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function result(code, message, extra = {}) {
  return { code, message, severity: 'error', ...extra };
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

export function validateAdapterDraft({ adapterDir, expectedSiteKey = '', expectedToolNames = [] }) {
  const errors = [];
  const warnings = [];
  const absoluteAdapterDir = path.resolve(adapterDir);
  const manifestPath = path.join(absoluteAdapterDir, 'manifest.json');
  const indexPath = path.join(absoluteAdapterDir, 'index.js');

  if (!fs.existsSync(indexPath)) {
    errors.push(result('MISSING_ADAPTER_INDEX', 'adapter draft is missing index.js', { file: indexPath }));
  }
  if (!fs.existsSync(manifestPath)) {
    errors.push(result('MISSING_MANIFEST', 'adapter draft is missing manifest.json', { file: manifestPath }));
  }

  for (const jsPath of walkFiles(absoluteAdapterDir).filter((filePath) => filePath.endsWith('.js'))) {
    try {
      new vm.Script(fs.readFileSync(jsPath, 'utf8'), { filename: jsPath });
    } catch (error) {
      errors.push(result('INVALID_JAVASCRIPT', error.message, {
        file: jsPath,
        line: Number(error.lineNumber || 0) || undefined,
      }));
    }
  }

  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(result('INVALID_MANIFEST_JSON', error.message, { file: manifestPath }));
    }
  }

  if (manifest) {
    if (expectedSiteKey && manifest.id !== expectedSiteKey) {
      errors.push(result('MANIFEST_ID_MISMATCH', `manifest.id must be ${expectedSiteKey}`, { file: manifestPath }));
    }
    if (!Array.isArray(manifest.match) || manifest.match.length === 0) {
      errors.push(result('INVALID_MANIFEST_MATCH', 'manifest.match must contain at least one host', { file: manifestPath }));
    }
    const supportFiles = Array.isArray(manifest.support_files) ? manifest.support_files : [];
    for (const supportFile of supportFiles) {
      const supportPath = path.resolve(absoluteAdapterDir, String(supportFile || ''));
      if (!isPathInside(absoluteAdapterDir, supportPath)) {
        errors.push(result('UNSAFE_SUPPORT_FILE_PATH', `support file escapes adapter directory: ${supportFile}`, { file: manifestPath }));
      } else if (!fs.existsSync(supportPath)) {
        errors.push(result('MISSING_SUPPORT_FILE', `support file does not exist: ${supportFile}`, { file: manifestPath }));
      }
    }
  }

  if (fs.existsSync(indexPath)) {
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    if (!indexSource.includes('__webmcpRegister')) {
      errors.push(result('MISSING_REGISTER_CALL', 'index.js does not call __webmcpRegister', { file: indexPath }));
    }
  }

  const toolNames = expectedToolNames.filter(Boolean);
  const uniqueToolNames = new Set(toolNames);
  if (uniqueToolNames.size !== toolNames.length) {
    errors.push(result('DUPLICATE_TOOL_NAME', 'generated tool names must be unique'));
  }
  for (const toolName of uniqueToolNames) {
    if (expectedSiteKey && !toolName.startsWith(`${expectedSiteKey}.`)) {
      errors.push(result('INVALID_TOOL_NAMESPACE', `tool must use ${expectedSiteKey} namespace: ${toolName}`));
    }
  }
  if (toolNames.length === 0) warnings.push({
    code: 'NO_GENERATED_TOOLS',
    message: 'adapter draft did not report generated tools',
    severity: 'warning',
  });

  return {
    passed: errors.length === 0,
    validator: 'adapter_static_validator_v1',
    errors,
    warnings,
    checkedFiles: walkFiles(absoluteAdapterDir).length,
  };
}
