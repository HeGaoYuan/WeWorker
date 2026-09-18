import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SENSITIVE_KEY_RE = /api[_-]?key|authorization|cookie|credential|password|passwd|secret|session|ticket|token|csrf/i;

function assertSafeId(value, label) {
  const text = String(value || '');
  if (!SAFE_ID_RE.test(text)) {
    throw new Error(`${label} contains unsafe characters`);
  }
  return text;
}

function redactValue(value, key = '') {
  if (SENSITIVE_KEY_RE.test(String(key))) {
    if (value == null || value === '') return value;
    return '[redacted]';
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]),
    );
  }
  return value;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES'].includes(error?.code)) throw error;
      if (attempt < 3) {
        const waitBuffer = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(waitBuffer), 0, 0, 50 * (attempt + 1));
      }
    }
  }
  if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(lastError?.code)) {
    fs.copyFileSync(tempPath, filePath);
    fs.rmSync(tempPath, { force: true });
    return;
  }
  throw lastError;
}

export class GenerationRunStore {
  constructor({
    rootDir = process.env.WEBCLI_GENERATION_RUNS_DIR
      || path.join(os.homedir(), '.webcli', 'generation-runs'),
  } = {}) {
    this.rootDir = path.resolve(rootDir);
  }

  getRunDir(runId) {
    return path.join(this.rootDir, assertSafeId(runId, 'runId'));
  }

  getDraftRoot(runId) {
    return path.join(this.getRunDir(runId), 'drafts');
  }

  save(snapshot) {
    const safeSnapshot = redactValue(snapshot);
    writeJsonAtomic(path.join(this.getRunDir(snapshot.id), 'run.json'), safeSnapshot);
    return safeSnapshot;
  }

  load(runId) {
    const filePath = path.join(this.getRunDir(runId), 'run.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  appendTrace(runId, event) {
    const tracePath = path.join(this.getRunDir(runId), 'trace.jsonl');
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, `${JSON.stringify(redactValue(event))}\n`, 'utf8');
  }

  readTrace(runId) {
    const tracePath = path.join(this.getRunDir(runId), 'trace.jsonl');
    if (!fs.existsSync(tracePath)) return [];
    return fs.readFileSync(tracePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

export function sanitizeGenerationValue(value) {
  return redactValue(value);
}
