import { CURRENCIES } from './constants.js';

/** @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Converts free text to a short, URL-safe identifier. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Capitalises each word of a short label. */
export function titleCase(text) {
  return String(text)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    .slice(0, 40);
}

/**
 * Formats an amount in the plan's currency, e.g. "$1,200".
 * @param {number} amount @param {string} currency
 */
export function formatMoney(amount, currency) {
  const { locale } = CURRENCIES[currency] ?? CURRENCIES.USD;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Rounds to one decimal place (used for percentages). */
export const round1 = (value) => Math.round(value * 10) / 10;

/** Parses a YYYY-MM-DD string as a UTC midnight timestamp (ms). */
export function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return Number.NaN;
  const [, y, m, d] = match.map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const date = new Date(ts);
  // Reject roll-overs such as 2026-02-31.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? ts : Number.NaN;
}

/** Returns UTC midnight for the given instant. */
export const startOfUtcDay = (date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Formats a UTC timestamp as YYYY-MM-DD. */
export const toIsoDate = (ts) => new Date(ts).toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

/** Whole days from `now` until the ISO event date (negative when past). */
export function daysUntil(isoDate, now = new Date()) {
  return Math.round((parseIsoDate(isoDate) - startOfUtcDay(now)) / DAY_MS);
}

export { DAY_MS };
