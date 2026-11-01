import { h, replaceChildren } from '../dom.js';
import { byId, icon } from './shared.js';

/**
 * @typedef {import('./shared.js').Plan} Plan
 * @typedef {import('./shared.js').PlanHandlers} PlanHandlers
 * @typedef {import('../../../src/types.js').Theme} Theme
 */

/** @param {string} glyph @param {string} title @param {string[]} items */
function ideaList(glyph, title, items) {
  if (!items.length) return null;
  return h(
    'section',
    { className: 'mini-card' },
    h('h4', null, icon(glyph), ` ${title}`),
    h(
      'ul',
      { className: 'plain-list bullets' },
      items.map((item) => h('li', null, item)),
    ),
  );
}

/** @param {Theme['palette']} palette */
function swatches(palette) {
  return h(
    'ul',
    { className: 'palette' },
    palette.map((c) =>
      h(
        'li',
        null,
        h('span', { className: 'swatch', style: { backgroundColor: c.hex }, 'aria-hidden': 'true' }),
        h('span', { className: 'swatch-name' }, c.name),
        h('code', null, c.hex.toUpperCase()),
      ),
    ),
  );
}

/** Invitation card framed in the theme's first two palette colours. */
function invitation(theme, onCopy) {
  const [first, second] = theme.palette;
  return h(
    'section',
    { className: 'invitation', 'aria-labelledby': 'invitation-title' },
    h('h4', { id: 'invitation-title' }, 'Invitation wording'),
    h(
      'div',
      {
        className: 'invite-card',
        style: { '--invite-1': first?.hex ?? '', '--invite-2': second?.hex ?? first?.hex ?? '' },
      },
      h('p', { className: 'invite-kicker' }, 'You are invited'),
      h('blockquote', null, theme.invitation),
    ),
    h(
      'button',
      { type: 'button', className: 'btn btn-ghost', onclick: () => onCopy(theme.invitation) },
      'Copy invitation text',
    ),
  );
}

/** @param {Plan} plan @param {Pick<PlanHandlers, 'onCopy'>} handlers */
export function renderTheme(plan, { onCopy }) {
  const { theme } = plan;

  replaceChildren(
    byId('panel-theme'),
    h('p', { className: 'eyebrow' }, 'Theme concept'),
    h('h3', { className: 'theme-name' }, theme.name),
    h('p', { className: 'summary' }, theme.concept),
    h('h4', null, 'Colour palette'),
    swatches(theme.palette),
    h(
      'div',
      { className: 'idea-grid' },
      ideaList('✿', 'Decor ideas', theme.decor),
      ideaList('♫', 'Activities & agenda', theme.activities),
      ideaList('🍴', 'Menu ideas', theme.menuIdeas),
    ),
    invitation(theme, onCopy),
  );
}
