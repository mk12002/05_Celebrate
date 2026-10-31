import { h, replaceChildren } from './dom.js';
import {
  EVENT_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  countdownLabel,
  daysUntil,
  formatDate,
  formatMoney,
  progressPercent,
} from './format.js';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const $ = (id) => document.getElementById(id);

/**
 * Renders every panel of the plan.
 * @param {object} plan
 * @param {{onToggleTask: Function, onVendorStatus: Function, onCopy: Function}} handlers
 */
export function renderPlan(plan, handlers) {
  $('results-eyebrow').textContent = `${EVENT_LABELS[plan.input.eventType]} · ${formatDate(plan.input.eventDate)}`;
  $('results-title').textContent = plan.input.title || `Your ${EVENT_LABELS[plan.input.eventType].toLowerCase()} plan`;
  renderOverview(plan);
  renderBudget(plan);
  renderTimeline(plan, handlers);
  renderVendors(plan, handlers);
  renderTheme(plan, handlers);
}

function sourceNote(plan) {
  return plan.source === 'ai'
    ? h('p', { className: 'source source-ai' }, `Generated with Google Gemini (${plan.model}).`)
    : h('p', { className: 'source source-template' }, 'Template plan: the AI service was unavailable, so this uses built-in defaults. Try again later for a personalised plan.');
}

export function renderOverview(plan) {
  const { input, budget, timeline } = plan;
  const days = daysUntil(input.eventDate);
  const progress = progressPercent(timeline.phases);
  const nextTasks = timeline.phases.flatMap((p) => p.tasks.map((t) => ({ ...t, phase: p.label }))).filter((t) => !t.done).slice(0, 4);
  const critical = plan.vendors.filter((v) => v.priority === 'critical' && v.status !== 'booked');

  const stat = (label, value) => h('div', { className: 'stat' }, h('dt', null, label), h('dd', null, value));

  replaceChildren(
    $('panel-overview'),
    h('h3', { className: 'visually-hidden' }, 'Overview'),
    h('p', { className: 'summary' }, plan.summary),
    h(
      'dl',
      { className: 'stats' },
      stat('Countdown', countdownLabel(days)),
      stat('Guests', input.guestCount.toLocaleString()),
      stat('Budget', formatMoney(budget.total, budget.currency)),
      stat('Per guest', formatMoney(budget.perGuest, budget.currency)),
      stat('Checklist', `${progress}% done`),
      stat('Theme', plan.theme.name),
    ),
    budget.warnings.length
      ? h('div', { className: 'alert alert-warn' }, h('h4', null, 'Heads up'), h('ul', null, budget.warnings.map((w) => h('li', null, w))))
      : null,
    h(
      'div',
      { className: 'two-col' },
      h(
        'section',
        { 'aria-labelledby': 'next-steps-title' },
        h('h4', { id: 'next-steps-title' }, 'Next steps'),
        nextTasks.length
          ? h('ul', { className: 'plain-list' }, nextTasks.map((t) => h('li', null, t.text, h('span', { className: 'muted' }, ` · ${t.phase}`))))
          : h('p', null, 'Every checklist item is done. Enjoy the celebration!'),
      ),
      h(
        'section',
        { 'aria-labelledby': 'book-first-title' },
        h('h4', { id: 'book-first-title' }, 'Book first'),
        critical.length
          ? h('ul', { className: 'plain-list' }, critical.map((v) => h('li', null, v.service, h('span', { className: 'muted' }, ` · ~${formatMoney(v.estimatedCost, budget.currency)}`))))
          : h('p', null, 'All critical vendors are booked.'),
      ),
    ),
    sourceNote(plan),
  );
}

export function renderBudget(plan) {
  const { budget } = plan;
  const money = (n) => formatMoney(n, budget.currency);
  const max = Math.max(...budget.categories.map((c) => c.amount), 1);

  replaceChildren(
    $('panel-budget'),
    h('h3', null, 'Budget breakdown'),
    h('p', { className: 'hint' }, `${money(budget.total)} total · ${money(budget.perGuest)} per guest for ${plan.input.guestCount} guests.`),
    h(
      'div',
      { className: 'table-wrap' },
      h(
        'table',
        { className: 'budget-table' },
        h('caption', { className: 'visually-hidden' }, 'Budget allocation by category'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col', className: 'num' }, 'Amount'), h('th', { scope: 'col' }, 'Share'), h('th', { scope: 'col' }, 'Tip'))),
        h(
          'tbody',
          null,
          budget.categories.map((c) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, c.label),
              h('td', { className: 'num' }, money(c.amount)),
              h(
                'td',
                { className: 'share' },
                h('span', { className: 'bar', 'aria-hidden': 'true' }, h('span', { className: 'bar-fill', style: { width: `${(c.amount / max) * 100}%` } })),
                h('span', { className: 'share-value' }, `${c.percent}%`),
              ),
              h('td', { className: 'note' }, c.note || '—'),
            ),
          ),
        ),
        h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, 'Total'), h('td', { className: 'num' }, money(budget.total)), h('td', null, '100%'), h('td', null, ''))),
      ),
    ),
    budget.warnings.length ? h('ul', { className: 'alert alert-warn' }, budget.warnings.map((w) => h('li', null, w))) : null,
    h('p', { className: 'hint' }, 'Tip: ask the assistant "Move 10% of decor to photography" and the totals rebalance automatically.'),
  );
}

export function renderTimeline(plan, { onToggleTask }) {
  const { phases, dayOf } = plan.timeline;
  const progress = progressPercent(phases);

  replaceChildren(
    $('panel-timeline'),
    h('h3', null, 'Countdown checklist'),
    h(
      'div',
      { className: 'progress-row' },
      h('label', { for: 'checklist-progress' }, `Overall progress: ${progress}%`),
      h('progress', { id: 'checklist-progress', max: 100, value: progress }, `${progress}%`),
    ),
    h(
      'ol',
      { className: 'phases' },
      phases.map((phase) => {
        const headingId = `phase-${phase.id}`;
        return h(
          'li',
          { className: 'phase' },
          h(
            'h4',
            { id: headingId },
            phase.label,
            ' ',
            h('span', { className: 'muted' }, `· by ${formatDate(phase.dueDate)}`),
            phase.startsNow ? h('span', { className: 'badge badge-now' }, 'Start now') : null,
          ),
          h(
            'ul',
            { className: 'tasks', 'aria-labelledby': headingId },
            phase.tasks.map((task) => {
              const id = `task-${task.id}`;
              return h(
                'li',
                { className: task.done ? 'task done' : 'task' },
                h('input', {
                  type: 'checkbox',
                  id,
                  checked: task.done,
                  onchange: (event) => onToggleTask(phase.id, task.id, event.target.checked),
                }),
                h('label', { for: id }, task.text),
              );
            }),
          ),
        );
      }),
    ),
    h('h3', null, 'Day-of schedule'),
    dayOf.length
      ? h(
          'table',
          { className: 'schedule' },
          h('caption', { className: 'visually-hidden' }, 'Event day run sheet'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Time'), h('th', { scope: 'col' }, 'Activity'))),
          h('tbody', null, dayOf.map((item) => h('tr', null, h('th', { scope: 'row' }, item.time), h('td', null, item.activity)))),
        )
      : h('p', null, 'No day-of schedule yet. Ask the assistant to draft one.'),
  );
}

export function renderVendors(plan, { onVendorStatus }) {
  const phaseLabel = new Map(plan.timeline.phases.map((p) => [p.id, p.label]));
  const categoryLabel = new Map(plan.budget.categories.map((c) => [c.id, c.label]));
  const vendors = [...plan.vendors].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const booked = plan.vendors.filter((v) => v.status === 'booked').length;

  replaceChildren(
    $('panel-vendors'),
    h('h3', null, 'Vendor checklist'),
    h('p', { className: 'hint' }, `${booked} of ${plan.vendors.length} booked. Sorted by booking priority.`),
    h(
      'ul',
      { className: 'vendor-grid' },
      vendors.map((v) => {
        const selectId = `status-${v.id}`;
        return h(
          'li',
          { className: `vendor priority-${v.priority}` },
          h('h4', null, v.service),
          h('p', null, h('span', { className: `badge badge-${v.priority}` }, PRIORITY_LABELS[v.priority])),
          h(
            'dl',
            { className: 'vendor-meta' },
            h('dt', null, 'Estimate'),
            h('dd', null, formatMoney(v.estimatedCost, plan.budget.currency)),
            h('dt', null, 'Budget line'),
            h('dd', null, categoryLabel.get(v.budgetCategory) ?? v.budgetCategory),
            h('dt', null, 'Book by'),
            h('dd', null, phaseLabel.get(v.bookBy) ?? v.bookBy),
          ),
          h('label', { for: selectId, className: 'inline-label' }, 'Status'),
          h(
            'select',
            { id: selectId, onchange: (event) => onVendorStatus(v.id, event.target.value) },
            Object.entries(STATUS_LABELS).map(([value, label]) => h('option', { value, selected: value === v.status }, label)),
          ),
          v.questions.length
            ? h('details', null, h('summary', null, `Questions to ask (${v.questions.length})`), h('ol', null, v.questions.map((q) => h('li', null, q))))
            : null,
        );
      }),
    ),
  );
}

export function renderTheme(plan, { onCopy }) {
  const { theme } = plan;
  const list = (title, items) =>
    items.length ? h('section', null, h('h4', null, title), h('ul', { className: 'plain-list bullets' }, items.map((i) => h('li', null, i)))) : null;

  replaceChildren(
    $('panel-theme'),
    h('h3', null, theme.name),
    h('p', { className: 'summary' }, theme.concept),
    h('h4', null, 'Colour palette'),
    h(
      'ul',
      { className: 'palette' },
      theme.palette.map((c) =>
        h('li', null, h('span', { className: 'swatch', style: { backgroundColor: c.hex }, 'aria-hidden': 'true' }), h('span', { className: 'swatch-name' }, c.name), h('code', null, c.hex.toUpperCase())),
      ),
    ),
    h('div', { className: 'two-col' }, list('Decor ideas', theme.decor), list('Activities & agenda', theme.activities), list('Menu ideas', theme.menuIdeas)),
    h(
      'section',
      { className: 'invitation' },
      h('h4', null, 'Invitation wording'),
      h('blockquote', null, theme.invitation),
      h('button', { type: 'button', className: 'btn btn-ghost', onclick: () => onCopy(theme.invitation) }, 'Copy invitation text'),
    ),
  );
}

/**
 * Appends a chat bubble to the conversation log.
 * @param {{role: 'user' | 'assistant', text: string, changes?: string[]}} message
 */
export function appendChatMessage({ role, text, changes = [] }) {
  const log = $('chat-log');
  log.append(
    h(
      'div',
      { className: `msg msg-${role}` },
      h('p', { className: 'msg-author' }, role === 'user' ? 'You' : 'Celebrate'),
      h('p', null, text),
      changes.length ? h('ul', { className: 'msg-changes', 'aria-label': 'Changes applied' }, changes.map((c) => h('li', null, c))) : null,
    ),
  );
  log.scrollTop = log.scrollHeight;
}
