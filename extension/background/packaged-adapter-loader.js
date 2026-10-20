/**
 * Built-in Adapter page scripts packaged with the Extension (managed-adapters/<name>/...).
 *
 * The desktop host still decides which package and version runs: a packaged copy is
 * used only when every page script is byte-identical to the bundle the host delivered
 * for this call. Such scripts are injected with chrome.scripting files, so no
 * chrome.debugger session is attached to the page (no "being debugged" bar, no
 * Runtime.enable for sites such as jd.com to detect). Anything else, for example
 * user-installed or updated Adapters, keeps using the debugger-based loader.
 */
import { installV2Commands } from './v2-loader.js';

export const PACKAGED_ADAPTERS_DIR = 'managed-adapters';

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_SCRIPT = /^extension\/(?:internal|commands)\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.js$/;

/**
 * @param {{ read: (path: string) => Promise<string|null> }} options
 *   `read` returns a packaged file's text, or null when the Extension does not contain it.
 * @returns {(bundle: object, paths: string[]) => Promise<string[]|null>}
 *   Extension file paths in injection order, or null when the packaged copy cannot be used.
 */
export function createPackagedAdapterMatcher({ read }) {
  // One comparison per package name; a new digest replaces the previous result.
  const checked = new Map();
  return async function packagedFiles(bundle, paths) {
    const name = bundle?.manifest?.name;
    if (typeof name !== 'string' || !SAFE_NAME.test(name) || name.includes('..')) return null;
    if (!Array.isArray(paths) || !paths.length || paths.some((path) => typeof path !== 'string'
      || !SAFE_SCRIPT.test(path) || path.includes('..') || typeof bundle.files?.[path] !== 'string')) return null;
    const key = `${bundle.digest}\0${paths.join('\0')}`;
    let entry = checked.get(name);
    if (entry?.key !== key) {
      entry = {
        key,
        same: (async () => {
          for (const path of paths) {
            const text = await read(`${PACKAGED_ADAPTERS_DIR}/${name}/${path}`).catch(() => null);
            if (text !== bundle.files[path]) return false;
          }
          return true;
        })(),
      };
      checked.set(name, entry);
    }
    return await entry.same ? paths.map((path) => `${PACKAGED_ADAPTERS_DIR}/${name}/${path}`) : null;
  };
}

const targetChanged = () => new Error('Adapter target changed during loading.');

/**
 * Inject one v2 Adapter from packaged files into the page's isolated world.
 * Same contract as injectAdapterSources: bootstrap first, then internal/ and command
 * files in order, all in one document; a document change is reported as a target change.
 */
export async function injectPackagedAdapter({ tabId, expectedUrl, defs, files, modules = {}, api = globalThis.chrome }) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Invalid Adapter target tab.');
  const initialTab = await api.tabs.get(tabId);
  const targetUrl = expectedUrl || initialTab.url;
  if (!/^https?:\/\//.test(targetUrl || '') || initialTab.url !== targetUrl) {
    throw new Error('Adapter target changed or is unsupported.');
  }
  const [boot] = await api.scripting.executeScript({
    target: { tabId }, world: 'ISOLATED', func: installV2Commands, args: [defs],
  });
  const documentId = boot?.documentId;
  if (!documentId) throw targetChanged();
  // Pinning the document means a navigation makes Chrome refuse instead of running
  // the remaining files in the next page.
  const target = { tabId, documentIds: [documentId] };
  let registered;
  try {
    await api.scripting.executeScript({ target, world: 'ISOLATED', files });
    const [state] = await api.scripting.executeScript({
      target, world: 'ISOLATED',
      func: () => (Array.isArray(window.__webcliRegisteredCommands) ? window.__webcliRegisteredCommands.slice() : []),
    });
    registered = Array.isArray(state?.result) ? state.result : [];
  } catch (error) {
    const tab = await api.tabs.get(tabId).catch(() => null);
    if (!tab || tab.url !== targetUrl || /document|frame|tab/i.test(error?.message || '')) throw targetChanged();
    throw new Error('Adapter script failed: packaged files');
  }
  const tab = await api.tabs.get(tabId).catch(() => null);
  if (!tab || tab.url !== targetUrl) throw targetChanged();
  // A script that throws does not stop chrome.scripting; a command that never
  // registered shows which file failed (without exposing its source or error text).
  const missing = Object.keys(defs || {}).find((id) => !registered.includes(id));
  if (missing) throw new Error('Adapter script failed: ' + (modules[missing] || missing));
  return { tabId, documentId, scriptCount: files.length + 1, packaged: true };
}
