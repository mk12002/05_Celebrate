import { h, replaceChildren } from '../dom.js';
import { formatMoney } from '../format.js';
import { byId, icon } from './shared.js';

/**
 * @typedef {import('./shared.js').Plan} Plan
 * @typedef {import('../../../src/types.js').BudgetCategory} BudgetCategory
 */

/** Categorical chart colours, readable as fills on light and dark surfaces. */
export const CHART_COLORS = Object.freeze([
  '#8e3563',
  '#d99a2b',
  '#2a8079',
  '#e0735a',
  '#5161b5',
  '#6f9a5c',
  '#c25788',
  '#9c6a2e',
  '#5f7184',
  '#8d6fc4',
  '#88902f',
  '#3f93c4',
  '#b24a3a',
  '#4c9b8f',
  '#a07850',
]);

/** @param {number} index */
const colorAt = (index) => CHART_COLORS[index % CHART_COLORS.length];

/**
 * CSS conic-gradient for the budget donut, one slice per category.
 * @param {Pick<BudgetCategory, 'amount'>[]} categories
 */
export function donutGradient(categories) {
  const total = categories.reduce((sum, c) => sum + c.amount, 0) || 1;
  let start = 0;
  const stops = categories.map((c, i) => {
    const end = start + (c.amount / total) * 100;
    const stop = `${colorAt(i)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

/** Donut plus headline facts. The donut is decorative: the table carries the same numbers. */
function summary(plan, money) {
  const { budget } = plan;
  const largest = [...budget.categories].sort((a, b) => b.amount - a.amount)[0];
  const fact = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));

  return h(
    'div',
    { className: 'budget-summary' },
    h(
      'div',
      { className: 'donut', 'aria-hidden': 'true', style: { background: donutGradient(budget.categories) } },
      h(
        'div',
        { className: 'donut-hole' },
        h('span', { className: 'donut-value' }, money(budget.total)),
        h('span', { className: 'donut-label' }, 'total'),
      ),
    ),
    h(
      'dl',
      { className: 'budget-facts' },
      fact('Per guest', money(budget.perGuest)),
      fact('Guests', plan.input.guestCount.toLocaleString()),
      fact('Categories', String(budget.categories.length)),
      largest ? fact('Largest line', `${largest.label} (${largest.percent}%)`) : null,
    ),
  );
}

function table(budget, money) {
  const max = Math.max(...budget.categories.map((c) => c.amount), 1);
  const header = ['Category', 'Amount', 'Share', 'Tip'].map((label) =>
    h('th', { scope: 'col', className: label === 'Amount' ? 'num' : null }, label),
  );

  const row = (c, i) =>
    h(
      'tr',
      { style: { '--swatch': colorAt(i) } },
      h('th', { scope: 'row' }, h('span', { className: 'dot', 'aria-hidden': 'true' }), c.label),
      h('td', { className: 'num' }, money(c.amount)),
      h(
        'td',
        { className: 'share' },
        h(
          'span',
          { className: 'bar', 'aria-hidden': 'true' },
          h('span', { className: 'bar-fill', style: { width: `${(c.amount / max) * 100}%` } }),
        ),
        h('span', { className: 'share-value' }, `${c.percent}%`),
      ),
      h('td', { className: 'note' }, c.note || '—'),
    );

  return h(
    'div',
    { className: 'table-wrap' },
    h(
      'table',
      { className: 'budget-table' },
      h('caption', { className: 'visually-hidden' }, 'Budget allocation by category'),
      h('thead', null, h('tr', null, header)),
      h('tbody', null, budget.categories.map(row)),
      h(
        'tfoot',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, 'Total'),
          h('td', { className: 'num' }, money(budget.total)),
          h('td', null, '100%'),
          h('td', null, ''),
        ),
      ),
    ),
  );
}

/** @param {Plan} plan */
export function renderBudget(plan) {
  const { budget } = plan;
  /** @param {number} amount */
  const money = (amount) => formatMoney(amount, budget.currency);

  replaceChildren(
    byId('panel-budget'),
    h('h3', null, 'Budget breakdown'),
    summary(plan, money),
    table(budget, money),
    budget.warnings.length
      ? h(
          'ul',
          { className: 'alert alert-warn' },
          budget.warnings.map((w) => h('li', null, w)),
        )
      : null,
    h(
      'p',
      { className: 'hint tip' },
      icon('💡'),
      ' Ask the assistant "Move 10% of decor to photography" and the totals rebalance automatically.',
    ),
  );
}
