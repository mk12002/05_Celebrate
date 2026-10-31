/**
 * Tiny hyperscript helper. Children are appended as text nodes, never parsed
 * as HTML, so AI-generated content cannot inject markup (XSS-safe by design).
 *
 * @param {string} tag
 * @param {Record<string, unknown> | null} [props]
 * @param {...(Node | string | number | null | undefined | false | Array)} children
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') el.className = String(value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') setStyles(el, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), /** @type {EventListener} */ (value));
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/** Applies inline styles through the CSSOM (CSP-safe); `--*` keys set custom properties. */
export function setStyles(el, styles) {
  for (const [name, value] of Object.entries(styles)) {
    if (name.startsWith('--')) el.style.setProperty(name, String(value));
    else el.style[name] = value;
  }
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces all children of `el`. */
export function replaceChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}
