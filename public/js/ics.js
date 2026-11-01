/*
 * Builds an iCalendar (.ics, RFC 5545) file from a plan so organisers can put
 * every milestone and the event itself into Google Calendar, Outlook or
 * Apple Calendar. Pure function: unit tested under Node.
 */

/** Escapes text values per RFC 5545 §3.3.11. */
export function escapeIcsText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 characters (RFC 5545 §3.1). */
export function foldLine(line) {
  const parts = [];
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join('\r\n ');
}

const compactDate = (iso) => iso.replaceAll('-', '');

function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function stamp(now) {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * @param {import('../../src/types.js').Plan} plan
 * @param {Date} [now]
 * @returns {string} calendar file contents with CRLF line endings
 */
export function buildIcs(plan, now = new Date()) {
  const title = plan.input.title || `${plan.input.eventType} celebration`;
  const event = (uid, date, summary, description) => [
    'BEGIN:VEVENT',
    `UID:${uid}@celebrate-planner`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDate(date)}`,
    `DTEND;VALUE=DATE:${compactDate(nextDay(date))}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
  ];

  const milestones = plan.timeline.phases
    .filter((phase) => phase.id !== 'day')
    .flatMap((phase) =>
      event(
        `${plan.id}-${phase.id}`,
        phase.dueDate,
        `${title}: ${phase.label} checklist`,
        phase.tasks.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`).join('\n'),
      ),
    );

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Celebrate//AI Event Planner//EN',
    'CALSCALE:GREGORIAN',
    ...milestones,
    ...event(
      `${plan.id}-event`,
      plan.input.eventDate,
      title,
      [plan.summary, '', ...plan.timeline.dayOf.map((d) => `${d.time} ${d.activity}`)].join('\n'),
    ),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
