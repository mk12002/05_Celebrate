import { h, replaceChildren } from '../dom.js';
import { countdownLabel, daysUntil, formatMoney, progressPercent } from '../format.js';
import { byId, icon } from './shared.js';

/** @typedef {import('./shared.js').Plan} Plan */

const NEXT_TASK_COUNT = 4;

/** Labels AI-generated plans and explains template fallbacks. */
function sourceNote(plan) {
  return plan.source === 'ai'
    ? h('p', { className: 'source source-ai' }, icon('✦'), ` Generated with Google Gemini (${plan.model}).`)
    : h(
        'p',
        { className: 'source source-template' },
        'Template plan: the AI service was unavailable, so this uses built-in defaults. ' +
          'Try again later for a personalised plan.',
      );
}

/** @param {number} days */
function countdown(days) {
  if (days > 1) {
    return h(
      'p',
      { className: 'countdown' },
      h('span', { className: 'countdown-num' }, days.toLocaleString()),
      h('span', { className: 'countdown-label' }, 'days to go'),
    );
  }
  return h(
    'p',
    { className: 'countdown' },
    h('span', { className: 'countdown-num countdown-word' }, countdownLabel(days)),
  );
}

/** @param {string} glyph @param {string} label @param {string} value */
function stat(glyph, label, value) {
  return h('div', { className: 'stat' }, h('dt', null, icon(glyph), label), h('dd', null, value));
}

/** @param {Plan} plan */
function nextSteps(plan) {
  const tasks = plan.timeline.phases
    .flatMap((phase) => phase.tasks.map((task) => ({ ...task, phase: phase.label })))
    .filter((task) => !task.done)
    .slice(0, NEXT_TASK_COUNT);

  return h(
    'section',
    { className: 'mini-card', 'aria-labelledby': 'next-steps-title' },
    h('h4', { id: 'next-steps-title' }, icon('→'), ' Next steps'),
    tasks.length
      ? h(
          'ul',
          { className: 'plain-list' },
          tasks.map((task) => h('li', null, task.text, ' ', h('span', { className: 'pill' }, task.phase))),
        )
      : h('p', null, 'Every checklist item is done. Enjoy the celebration!'),
  );
}

/** @param {Plan} plan */
function bookFirst(plan) {
  const critical = plan.vendors.filter((v) => v.priority === 'critical' && v.status !== 'booked');
  return h(
    'section',
    { className: 'mini-card', 'aria-labelledby': 'book-first-title' },
    h('h4', { id: 'book-first-title' }, icon('★'), ' Book first'),
    critical.length
      ? h(
          'ul',
          { className: 'plain-list' },
          critical.map((v) =>
            h(
              'li',
              { className: 'row-between' },
              h('span', null, v.service),
              h('span', { className: 'muted num' }, `~${formatMoney(v.estimatedCost, plan.budget.currency)}`),
            ),
          ),
        )
      : h('p', null, 'All critical vendors are booked.'),
  );
}

/** @param {Plan} plan */
export function renderOverview(plan) {
  const { input, budget, timeline } = plan;

  replaceChildren(
    byId('panel-overview'),
    h('h3', { className: 'visually-hidden' }, 'Overview'),
    h(
      'div',
      { className: 'overview-hero' },
      countdown(daysUntil(input.eventDate)),
      h('p', { className: 'summary' }, plan.summary),
    ),
    h(
      'dl',
      { className: 'stats' },
      stat('👥', 'Guests', input.guestCount.toLocaleString()),
      stat('💰', 'Budget', formatMoney(budget.total, budget.currency)),
      stat('🍽', 'Per guest', formatMoney(budget.perGuest, budget.currency)),
      stat('✅', 'Checklist', `${progressPercent(timeline.phases)}% done`),
      stat('🎨', 'Theme', plan.theme.name),
    ),
    budget.warnings.length
      ? h(
          'div',
          { className: 'alert alert-warn' },
          h('h4', null, 'Heads up'),
          h(
            'ul',
            null,
            budget.warnings.map((w) => h('li', null, w)),
          ),
        )
      : null,
    h('div', { className: 'two-col' }, nextSteps(plan), bookFirst(plan)),
    sourceNote(plan),
  );
}
