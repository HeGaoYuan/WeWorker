import { scopedGenerationPreviewScripts } from '../../background/generation-preview-bundle.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHostAdapterClient } from '../../background/host-adapter-client.js';
import { createHostAdapterRuntime, assertAdapterNavigationUrl, navigateAdapterTab } from '../../background/host-adapter-runtime.js';
import { createManagedBackgroundRuntime, MANAGED_RUNNER_PATH } from '../../background/managed-background-runtime.js';
import { buildV2Bootstrap, v2CommandDefs, v2InjectionFiles } from '../../background/v2-loader.js';
import { injectAdapterSources } from '../../background/adapter-script-loader.js';
import { createPackagedAdapterMatcher, injectPackagedAdapter } from '../../background/packaged-adapter-loader.js';
import { selectCompatibleCaptureBoundEntry, validateGenerationPreviewOutputV2 } from '../../background/generation-output-validator.js';
import * as browserInstance from '../../background/browser-instance.js';
import * as siteAuth from '../../background/site-auth.js';

/** site-auth.js is pure; the service worker imports these names (some under aliases). */
export function siteAuthBindings() {
  return {
    authErrorFields: siteAuth.authErrorFields,
    cookieFingerprint: siteAuth.cookieFingerprint,
    authRequiredError: siteAuth.authRequiredError,
    authDeclaredHosts: siteAuth.declaredHosts,
    authDisplayUrl: siteAuth.displayUrl,
    evaluateCookieCheck: siteAuth.evaluateCookieCheck,
    isLoginPageUrl: siteAuth.isLoginPageUrl,
    loginStartUrl: siteAuth.loginStartUrl,
    siteAuth: siteAuth.siteAuth,
  };
}

/** Packaged built-in injection, bound to the sandbox's fake `chrome`. */
export function packagedAdapterBindings(context) {
  return {
    v2CommandDefs,
    createPackagedAdapterMatcher,
    injectPackagedAdapter: (options) => injectPackagedAdapter({ api: context.chrome, ...options }),
  };
}

/** browser-instance.js defaults to the global `chrome`; bind it to the sandbox's fake instead. */
export function browserInstanceBindings(context) {
  const noEvents = { onChanged: { addListener() {} } };
  return {
    browserInstanceHelloFields: browserInstance.browserInstanceHelloFields,
    loadBrowserInstance: () => browserInstance.loadBrowserInstance(context.chrome?.storage?.local),
    watchBrowserInstance: (onChange) => browserInstance.watchBrowserInstance(onChange, context.chrome?.storage?.onChanged ? context.chrome.storage : noEvents),
    createBrowserTab: (props) => browserInstance.createBrowserTab(props, context.chrome),
    focusBrowserWindow: (windowId) => browserInstance.focusBrowserWindow(windowId, context.chrome),
    revealWindowOnUserFocus: () => browserInstance.revealWindowOnUserFocus(context.chrome),
  };
}

export function runServiceWorkerInContext(context, { repoRoot = process.cwd() } = {}) {
  const source = readFileSync(join(repoRoot, 'extension/background/service-worker.js'), 'utf8')
    .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*/gm, '');
  Object.assign(context, { scopedGenerationPreviewScripts, createHostAdapterClient, createHostAdapterRuntime, assertAdapterNavigationUrl, navigateAdapterTab, buildV2Bootstrap,
    createManagedBackgroundRuntime, MANAGED_RUNNER_PATH,
    v2InjectionFiles, injectAdapterSources, selectCompatibleCaptureBoundEntry, validateGenerationPreviewOutputV2,
    ...browserInstanceBindings(context), ...siteAuthBindings(), ...packagedAdapterBindings(context) });
  vm.runInContext(source, context, { filename: 'service-worker.js', timeout: 5000 });
}
