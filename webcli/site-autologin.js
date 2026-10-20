/**
 * Fill a website login form over CDP for auto-login.
 *
 * Fields are located by a script that marks them with data attributes; the
 * username and password are typed with `Input.insertText` (trusted input), so
 * they never appear in page scripts, in the extension or in Adapter code.
 * Supported: one-page forms, a "password login" tab to switch to first
 * (`auth.autologin.switch`), and two-step forms (account, then password).
 * Not supported, by design: QR codes, SMS codes, CAPTCHAs, and forms in
 * cross-origin frames; those fall back to the user.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MARK = 'data-ww-autologin';

const USERNAME_SELECTOR = [
  'input[autocomplete="username"]', 'input[type="email"]', 'input[type="tel"]',
  'input[name*="user" i]', 'input[name*="account" i]', 'input[name*="login" i]', 'input[name*="email" i]',
  'input[name*="phone" i]', 'input[name*="mobile" i]', 'input[id*="user" i]', 'input[id*="account" i]',
  'input[id*="login" i]', 'input[id*="email" i]', 'input[id*="phone" i]', 'input[type="text"]', 'input:not([type])',
].join(',');

const SUBMIT_TEXT = /登\s*录|登\s*入|log\s?in|sign\s?in|继续|下一步|next|continue/i;

/** Page script: mark the visible username, password and submit elements. */
export function locateScript(spec = {}) {
  return `(() => {
    const spec = ${JSON.stringify({ username: spec.username || '', password: spec.password || '', submit: spec.submit || '' })};
    const mark = ${JSON.stringify(MARK)};
    const visible = (el) => {
      if (!el || el.disabled || el.readOnly) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const first = (selector, root = document) => {
      try { return [...root.querySelectorAll(selector)].find(visible) || null; } catch { return null; }
    };
    for (const el of document.querySelectorAll('[' + mark + ']')) el.removeAttribute(mark);
    const password = spec.password ? first(spec.password) : first('input[type="password"]');
    let username = spec.username ? first(spec.username) : null;
    if (!username) {
      const scope = (password && password.form) || document;
      username = [...scope.querySelectorAll(${JSON.stringify(USERNAME_SELECTOR)})].find((el) => visible(el)
        && el.type !== 'password' && el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio'
        && (!password || (el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING))) || null;
    }
    const form = (password && password.form) || (username && username.form) || null;
    let submit = spec.submit ? first(spec.submit) : null;
    if (!submit) {
      const root = form || document;
      submit = [...root.querySelectorAll('button, input[type="submit"], [role="button"]')].find((el) => visible(el)
        && (el.type === 'submit' || ${SUBMIT_TEXT}.test(el.textContent || el.value || ''))) || null;
    }
    if (password) password.setAttribute(mark, 'password');
    if (username) username.setAttribute(mark, 'username');
    if (submit) submit.setAttribute(mark, 'submit');
    return { password: !!password, username: !!username, submit: !!submit };
  })()`;
}

async function evaluate(page, expression) {
  const response = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) throw new Error('Login page script failed.');
  return response?.result?.value;
}

async function locate(page, spec) {
  return (await evaluate(page, locateScript(spec))) || { password: false, username: false, submit: false };
}

/** Focus a marked field and type into it (existing text is cleared first). */
async function typeInto(page, role, text) {
  const focused = await evaluate(page, `(() => {
    const el = document.querySelector('[${MARK}="${role}"]');
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    if (el.value) { el.select(); document.execCommand('delete'); }
    return document.activeElement === el;
  })()`);
  if (!focused) return false;
  await page.send('Input.insertText', { text });
  return true;
}

async function clickElement(page, selectorExpression) {
  const point = await evaluate(page, `(() => {
    const el = ${selectorExpression};
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) return false;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  return true;
}

async function pressEnter(page) {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

async function submit(page, found) {
  if (found.submit && await clickElement(page, `document.querySelector('[${MARK}="submit"]')`)) return;
  await pressEnter(page);
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'no_password_field' | 'fill_failed' }>}
 */
export async function autofillLogin(page, credential, spec = {}, { stepDelayMs = 2500, switchDelayMs = 1200 } = {}) {
  // An off-screen window is not focused; let the page behave as if it were.
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  let found = await locate(page, spec);
  if (!found.password && typeof spec.switch === 'string' && spec.switch) {
    if (await clickElement(page, `(() => { try { return document.querySelector(${JSON.stringify(spec.switch)}); } catch { return null; } })()`)) {
      await sleep(switchDelayMs);
      found = await locate(page, spec);
    }
  }
  let usernameTyped = false;
  if (!found.password && found.username) {
    // Two-step form: account first, then the password page.
    if (!await typeInto(page, 'username', credential.username)) return { ok: false, reason: 'fill_failed' };
    usernameTyped = true;
    await submit(page, found);
    await sleep(stepDelayMs);
    found = await locate(page, spec);
  }
  if (!found.password) return { ok: false, reason: 'no_password_field' };
  if (!usernameTyped && found.username && !await typeInto(page, 'username', credential.username)) return { ok: false, reason: 'fill_failed' };
  if (!await typeInto(page, 'password', credential.password)) return { ok: false, reason: 'fill_failed' };
  await submit(page, found);
  await evaluate(page, `(() => { for (const el of document.querySelectorAll('[${MARK}]')) el.removeAttribute('${MARK}'); return true; })()`).catch(() => {});
  return { ok: true };
}
