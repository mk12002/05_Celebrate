import { h, replaceChildren, setStyles } from './dom.js';
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

const SETTING_LABELS = { indoor: 'Indoor', outdoor: 'Outdoor', mixed: 'Indoor & outdoor' };

const $ = (id) => document.getElementById(id);

/** Decorative icon: hidden from assistive technology so names stay clean. */
const icon = (glyph) => h('span', { className: 'icon', 'aria-hidden': 'true' }, glyph);

/**
 * Renders every panel of the plan.
 * @param {object} plan
 * @param {{onToggleTask: Function, onVendorStatus: Function, onCopy: Function}} handlers
 */
export function renderPlan(plan, handlers) {
  const { input } = plan;
  $('results-eyebrow').textContent = `${EVENT_LABELS[input.eventType]} · ${formatDate(input.eventDate)}`;
  $('results-title').textContent = input.title || `Your ${EVENT_LABELS[input.eventType].toLowerCase()} plan`;
  const meta = $('results-meta');
  if (meta) {
    meta.textContent = [input.location, `${input.guestCount.toLocaleString()} guests`, SETTING_LABELS[input.setting]].filter(Boolean).join(' · ');
  }
  // The AI theme's palette tints the plan header stripe.
  const palette = plan.theme?.palette ?? [];
  setStyles($('results'), Object.fromEntries(palette.slice(0, 5).map((c, i) => [`--theme-${i + 1}`, c.hex])));

  renderOverview(plan);
  renderBudget(plan);
  renderTimeline(plan, handlers);
  renderVendors(plan, handlers);
  renderTheme(plan, handlers);
}

function sourceNote(plan) {
  return plan.source === 'ai'
    ? h('p', { className: 'source source-ai' }, icon('✦'), ` Generated with Google Gemini (${plan.model}).`)
    : h('p', { className: 'source source-template' }, 'Template plan: the AI service was unavailable, so this uses built-in defaults. Try again later for a personalised plan.');
}

function countdown(days) {
  if (days > 1) {
    return h('p', { className: 'countdown' }, h('span', { className: 'countdown-num' }, days.toLocaleString()), h('span', { className: 'countdown-label' }, 'days to go'));
  }
  return h('p', { className: 'countdown' }, h('span', { className: 'countdown-num countdown-word' }, countdownLabel(days)));
}

export function renderOverview(plan) {
  const { input, budget, timeline } = plan;
  const days = daysUntil(input.eventDate);
  const progress = progressPercent(timeline.phases);
  const nextTasks = timeline.phases.flatMap((p) => p.tasks.map((t) => ({ ...t, phase: p.label }))).filter((t) => !t.done).slice(0, 4);
  const critical = plan.vendors.filter((v) => v.priority === 'critical' && v.status !== 'booked');

  const stat = (glyph, label, value) => h('div', { className: 'stat' }, h('dt', null, icon(glyph), label), h('dd', null, value));

  replaceChildren(
    $('panel-overview'),
    h('h3', { className: 'visually-hidden' }, 'Overview'),
    h('div', { className: 'overview-hero' }, countdown(days), h('p', { className: 'summary' }, plan.summary)),
    h(
      'dl',
      { className: 'stats' },
      stat('👥', 'Guests', input.guestCount.toLocaleString()),
      stat('💰', 'Budget', formatMoney(budget.total, budget.currency)),
      stat('🍽', 'Per guest', formatMoney(budget.perGuest, budget.currency)),
      stat('✅', 'Checklist', `${progress}% done`),
      stat('🎨', 'Theme', plan.theme.name),
    ),
    budget.warnings.length
      ? h('div', { className: 'alert alert-warn' }, h('h4', null, 'Heads up'), h('ul', null, budget.warnings.map((w) => h('li', null, w))))
      : null,
    h(
      'div',
      { className: 'two-col' },
      h(
        'section',
        { className: 'mini-card', 'aria-labelledby': 'next-steps-title' },
        h('h4', { id: 'next-steps-title' }, icon('→'), ' Next steps'),
        nextTasks.length
          ? h('ul', { className: 'plain-list' }, nextTasks.map((t) => h('li', null, t.text, ' ', h('span', { className: 'pill' }, t.phase))))
          : h('p', null, 'Every checklist item is done. Enjoy the celebration!'),
      ),
      h(
        'section',
        { className: 'mini-card', 'aria-labelledby': 'book-first-title' },
        h('h4', { id: 'book-first-title' }, icon('★'), ' Book first'),
        critical.length
          ? h(
              'ul',
              { className: 'plain-list' },
              critical.map((v) => h('li', { className: 'row-between' }, h('span', null, v.service), h('span', { className: 'muted num' }, `~${formatMoney(v.estimatedCost, budget.currency)}`))),
            )
          : h('p', null, 'All critical vendors are booked.'),
      ),
    ),
    sourceNote(plan),
  );
}

/** CSS conic-gradient for the budget donut, one slice per category. */
export function donutGradient(categories) {
  const total = categories.reduce((sum, c) => sum + c.amount, 0) || 1;
  let start = 0;
  const stops = categories.map((c, i) => {
    const end = start + (c.amount / total) * 100;
    const stop = `${CHART_COLORS[i % CHART_COLORS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

export function renderBudget(plan) {
  const { budget } = plan;
  const money = (n) => formatMoney(n, budget.currency);
  const max = Math.max(...budget.categories.map((c) => c.amount), 1);
  const color = (i) => CHART_COLORS[i % CHART_COLORS.length];
  const top = [...budget.categories].sort((a, b) => b.amount - a.amount)[0];

  replaceChildren(
    $('panel-budget'),
    h('h3', null, 'Budget breakdown'),
    h(
      'div',
      { className: 'budget-summary' },
      // The donut is decorative: the table below carries the same numbers.
      h(
        'div',
        { className: 'donut', 'aria-hidden': 'true', style: { background: donutGradient(budget.categories) } },
        h('div', { className: 'donut-hole' }, h('span', { className: 'donut-value' }, money(budget.total)), h('span', { className: 'donut-label' }, 'total')),
      ),
      h(
        'dl',
        { className: 'budget-facts' },
        h('div', null, h('dt', null, 'Per guest'), h('dd', null, money(budget.perGuest))),
        h('div', null, h('dt', null, 'Guests'), h('dd', null, plan.input.guestCount.toLocaleString())),
        h('div', null, h('dt', null, 'Categories'), h('dd', null, String(budget.categories.length))),
        top ? h('div', null, h('dt', null, 'Largest line'), h('dd', null, `${top.label} (${top.percent}%)`)) : null,
      ),
    ),
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
          budget.categories.map((c, i) =>
            h(
              'tr',
              { style: { '--swatch': color(i) } },
              h('th', { scope: 'row' }, h('span', { className: 'dot', 'aria-hidden': 'true' }), c.label),
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
    h('p', { className: 'hint tip' }, icon('💡'), ' Ask the assistant "Move 10% of decor to photography" and the totals rebalance automatically.'),
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
        const done = phase.tasks.filter((t) => t.done).length;
        const complete = phase.tasks.length > 0 && done === phase.tasks.length;
        return h(
          'li',
          { className: `phase${phase.startsNow ? ' phase-now' : ''}${complete ? ' phase-done' : ''}` },
          h(
            'div',
            { className: 'phase-head' },
            h(
              'h4',
              { id: headingId },
              phase.label,
              ' ',
              h('span', { className: 'muted' }, `· by ${formatDate(phase.dueDate)}`),
              phase.startsNow ? h('span', { className: 'badge badge-now' }, 'Start now') : null,
            ),
            h('span', { className: 'phase-count' }, `${done}/${phase.tasks.length} done`),
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
          'ol',
          { className: 'run-sheet', 'aria-label': 'Event day run sheet' },
          dayOf.map((item) => h('li', null, h('span', { className: 'run-time' }, item.time), h('span', { className: 'run-activity' }, item.activity))),
        )
      : h('p', null, 'No day-of schedule yet. Ask the assistant to draft one.'),
  );
}

export function renderVendors(plan, { onVendorStatus }) {
  const phaseLabel = new Map(plan.timeline.phases.map((p) => [p.id, p.label]));
  const categoryLabel = new Map(plan.budget.categories.map((c) => [c.id, c.label]));
  const vendors = [...plan.vendors].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const booked = plan.vendors.filter((v) => v.status === 'booked').length;
  const total = plan.vendors.reduce((sum, v) => sum + v.estimatedCost, 0);

  replaceChildren(
    $('panel-vendors'),
    h('h3', null, 'Vendor checklist'),
    h(
      'div',
      { className: 'progress-row' },
      h('label', { for: 'vendor-progress' }, `${booked} of ${plan.vendors.length} booked`),
      h('progress', { id: 'vendor-progress', max: Math.max(plan.vendors.length, 1), value: booked }, `${booked}`),
      h('span', { className: 'muted' }, `Estimates total ${formatMoney(total, plan.budget.currency)} · sorted by booking priority`),
    ),
    h(
      'ul',
      { className: 'vendor-grid' },
      vendors.map((v) => {
        const selectId = `status-${v.id}`;
        return h(
          'li',
          { className: `vendor priority-${v.priority} status-${v.status}` },
          h('div', { className: 'vendor-head' }, h('h4', null, v.service), h('span', { className: `badge badge-${v.priority}` }, PRIORITY_LABELS[v.priority])),
          h('p', { className: 'vendor-cost' }, formatMoney(v.estimatedCost, plan.budget.currency), h('span', { className: 'muted' }, ' estimate')),
          h(
            'dl',
            { className: 'vendor-meta' },
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
  const [first, second] = theme.palette;
  const list = (glyph, title, items) =>
    items.length
      ? h('section', { className: 'mini-card' }, h('h4', null, icon(glyph), ` ${title}`), h('ul', { className: 'plain-list bullets' }, items.map((i) => h('li', null, i))))
      : null;

  replaceChildren(
    $('panel-theme'),
    h('p', { className: 'eyebrow' }, 'Theme concept'),
    h('h3', { className: 'theme-name' }, theme.name),
    h('p', { className: 'summary' }, theme.concept),
    h('h4', null, 'Colour palette'),
    h(
      'ul',
      { className: 'palette' },
      theme.palette.map((c) =>
        h('li', null, h('span', { className: 'swatch', style: { backgroundColor: c.hex }, 'aria-hidden': 'true' }), h('span', { className: 'swatch-name' }, c.name), h('code', null, c.hex.toUpperCase())),
      ),
    ),
    h('div', { className: 'idea-grid' }, list('✿', 'Decor ideas', theme.decor), list('♫', 'Activities & agenda', theme.activities), list('🍴', 'Menu ideas', theme.menuIdeas)),
    h(
      'section',
      { className: 'invitation', 'aria-labelledby': 'invitation-title' },
      h('h4', { id: 'invitation-title' }, 'Invitation wording'),
      h(
        'div',
        { className: 'invite-card', style: { '--invite-1': first?.hex ?? '', '--invite-2': second?.hex ?? first?.hex ?? '' } },
        h('p', { className: 'invite-kicker' }, 'You are invited'),
        h('blockquote', null, theme.invitation),
      ),
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
