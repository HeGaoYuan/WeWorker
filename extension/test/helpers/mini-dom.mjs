/**
 * Minimal DOM for page-reader tests: elements built with h(), and querySelector support for
 * the selector forms page readers use — tag, #id, .class, [attr], [attr="v"], [attr*="v"],
 * descendant chains and comma lists. Not a general DOM.
 */
class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this.disabled = false;
    this.checked = false;
    this.value = '';
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'onclick') this.listeners.click = value;
      else if (name === 'disabled') this.disabled = !!value;
      else if (name === 'checked') this.checked = !!value;
      else if (name === 'value') this.value = String(value);
      else this.attributes[name] = String(value);
    }
    this.setChildren(children);
  }
  setChildren(children) {
    this.children = [];
    this.ownText = '';
    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      if (child instanceof Element) { child.parentElement = this; this.children.push(child); }
      else this.ownText += String(child);
    }
  }
  get className() { return this.attributes.class || ''; }
  get type() { return this.attributes.type || ''; }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  click() { this.listeners.click?.(this); }
  matches(selector) { return parseList(selector).some((chain) => matchChain(this, chain)); }
  closest(selector) {
    for (let cur = this; cur; cur = cur.parentElement) if (cur.matches(selector)) return cur;
    return null;
  }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    const chains = parseList(selector);
    return this.descendants().filter((el) => chains.some((chain) => matchChain(el, chain, this)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function parseSimple(text) {
  const tag = (text.match(/^[a-z0-9]+/i) || [''])[0].toUpperCase();
  const outside = text.replace(/\[[^\]]*\]/g, '');
  const attrs = [...text.matchAll(/\[([\w-]+)(?:(\*?=)"([^"]*)")?\]/g)].map(([, name, op, value]) => ({ name, op, value }));
  for (const [, id] of outside.matchAll(/#([\w-]+)/g)) attrs.push({ name: 'id', op: '=', value: id });
  for (const [, cls] of outside.matchAll(/\.([\w-]+)/g)) attrs.push({ name: 'class', op: '~=', value: cls });
  return { tag, attrs };
}
function parseList(selector) {
  return selector.split(',').map((part) => part.trim().split(/\s+(?![^[]*\])/).map(parseSimple));
}
function matchSimple(el, { tag, attrs }) {
  if (tag && el.tagName !== tag) return false;
  return attrs.every(({ name, op, value }) => {
    const actual = name === 'type' ? el.type : el.getAttribute(name);
    if (actual == null) return false;
    if (!op) return true;
    if (op === '~=') return actual.split(/\s+/).includes(value);
    return op === '=' ? actual === value : actual.includes(value);
  });
}
function matchChain(el, chain, scope = null) {
  if (!matchSimple(el, chain[chain.length - 1])) return false;
  let index = chain.length - 2;
  for (let cur = el.parentElement; cur && index >= 0 && cur !== scope; cur = cur.parentElement) {
    if (matchSimple(cur, chain[index])) index--;
  }
  return index < 0;
}

export const h = (tag, attrs, ...children) => new Element(tag, attrs || {}, children.flat());

export function createDocument(body) {
  const root = h('body', {}, body);
  return {
    body: root,
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
}
