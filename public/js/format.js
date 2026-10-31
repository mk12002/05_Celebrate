/*
 * Pure formatting helpers shared by the UI. No DOM access, so they are unit
 * tested directly under Node.
 */

const LOCALES = { USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', INR: 'en-IN', CAD: 'en-CA', AUD: 'en-AU' };

export const PRIORITY_LABELS = Object.freeze({
  critical: 'Critical: book first',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
});

export const STATUS_LABELS = Object.freeze({
  'to-research': 'To research',
  contacted: 'Contacted',
  quoted: 'Quote received',
  booked: 'Booked',
});

export const EVENT_LABELS = Object.freeze({
  wedding: 'Wedding',
  birthday: 'Birthday',
  community: 'Community event',
});

/** "$12,500" style currency formatting with no decimals. */
export function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat(LOCALES[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

/** "Sat, 12 Jun 2027" from an ISO date, interpreted in UTC to avoid off-by-one days. */
export function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Whole days from `now` (local calendar day) to an ISO date. */
export function daysUntil(iso, now = new Date()) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** Human countdown text: "Today", "Tomorrow", "in 42 days", "3 days ago". */
export function countdownLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
}

/** Fraction of checklist tasks completed, 0-100. */
export function progressPercent(phases) {
  const tasks = phases.flatMap((p) => p.tasks);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Client-side mirror of the server's input rules, for instant feedback.
 * Returns a map of field name -> message (empty when valid).
 */
export function validateEventForm(values, now = new Date()) {
  const errors = {};
  if (!values.eventDate) errors.eventDate = 'Choose the event date.';
  else if (daysUntil(values.eventDate, now) < 0) errors.eventDate = 'The date must be today or later.';
  else if (daysUntil(values.eventDate, now) > 3 * 366) errors.eventDate = 'Plan events up to 3 years ahead.';

  if (!Number.isInteger(values.guestCount) || values.guestCount < 1 || values.guestCount > 10000) {
    errors.guestCount = 'Enter between 1 and 10,000 guests.';
  }
  if (!Number.isFinite(values.budget) || values.budget < 100 || values.budget > 100000000) {
    errors.budget = 'Enter a budget of at least 100.';
  }
  return errors;
}
