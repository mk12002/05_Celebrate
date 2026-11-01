import { h, replaceChildren } from '../dom.js';
import { formatDate, progressPercent } from '../format.js';
import { byId } from './shared.js';

/**
 * @typedef {import('./shared.js').Plan} Plan
 * @typedef {import('./shared.js').PlanHandlers} PlanHandlers
 * @typedef {import('../../../src/types.js').Phase} Phase
 */

/** @param {Phase} phase @param {PlanHandlers['onToggleTask']} onToggleTask */
function phaseCard(phase, onToggleTask) {
  const headingId = `phase-${phase.id}`;
  const done = phase.tasks.filter((t) => t.done).length;
  const complete = phase.tasks.length > 0 && done === phase.tasks.length;
  const classes = ['phase', phase.startsNow && 'phase-now', complete && 'phase-done'].filter(Boolean).join(' ');

  const task = (t) => {
    const id = `task-${t.id}`;
    return h(
      'li',
      { className: t.done ? 'task done' : 'task' },
      h('input', {
        type: 'checkbox',
        id,
        checked: t.done,
        onchange: (event) => onToggleTask(phase.id, t.id, event.target.checked),
      }),
      h('label', { for: id }, t.text),
    );
  };

  return h(
    'li',
    { className: classes },
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
    h('ul', { className: 'tasks', 'aria-labelledby': headingId }, phase.tasks.map(task)),
  );
}

/** @param {Plan['timeline']['dayOf']} dayOf */
function runSheet(dayOf) {
  if (!dayOf.length) return h('p', null, 'No day-of schedule yet. Ask the assistant to draft one.');
  return h(
    'ol',
    { className: 'run-sheet', 'aria-label': 'Event day run sheet' },
    dayOf.map((item) =>
      h(
        'li',
        null,
        h('span', { className: 'run-time' }, item.time),
        h('span', { className: 'run-activity' }, item.activity),
      ),
    ),
  );
}

/** @param {Plan} plan @param {Pick<PlanHandlers, 'onToggleTask'>} handlers */
export function renderTimeline(plan, { onToggleTask }) {
  const { phases, dayOf } = plan.timeline;
  const progress = progressPercent(phases);

  replaceChildren(
    byId('panel-timeline'),
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
      phases.map((phase) => phaseCard(phase, onToggleTask)),
    ),
    h('h3', null, 'Day-of schedule'),
    runSheet(dayOf),
  );
}
