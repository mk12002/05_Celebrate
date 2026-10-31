import { DAY_MS, daysUntil, parseIsoDate, toIsoDate } from '../utils.js';

/**
 * Countdown phases. Only phases that still fit before the event date are
 * used, so a party planned 3 weeks out does not get a "12 months out" list.
 */
export const PHASES = Object.freeze([
  { id: 'm12', label: '12 months out', offsetDays: 365 },
  { id: 'm6', label: '6 months out', offsetDays: 180 },
  { id: 'm3', label: '3 months out', offsetDays: 90 },
  { id: 'm1', label: '1 month out', offsetDays: 30 },
  { id: 'w2', label: '2 weeks out', offsetDays: 14 },
  { id: 'w1', label: 'Week of event', offsetDays: 7 },
  { id: 'day', label: 'Day of event', offsetDays: 0 },
]);

export const PHASE_IDS = Object.freeze(PHASES.map((p) => p.id));

/**
 * Returns the phases relevant to an event date, each with a target date.
 * The first phase is flagged `startsNow` because its work begins today.
 *
 * @param {string} eventDate ISO date (YYYY-MM-DD)
 * @param {Date} [now]
 */
export function computePhases(eventDate, now = new Date()) {
  const lead = Math.max(0, daysUntil(eventDate, now));
  const eventTs = parseIsoDate(eventDate);
  return PHASES.filter((phase) => phase.offsetDays <= lead).map((phase, index) => ({
    id: phase.id,
    label: phase.label,
    dueDate: toIsoDate(eventTs - phase.offsetDays * DAY_MS),
    startsNow: index === 0,
    tasks: [],
  }));
}
