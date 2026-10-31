/**
 * Shared domain constants. Kept in one place so the validation layer, the
 * budget engine, the Gemini response schemas and the UI agree on vocabulary.
 */

export const EVENT_TYPES = Object.freeze(/** @type {const} */ (['wedding', 'birthday', 'community']));

export const SETTINGS = Object.freeze(/** @type {const} */ (['indoor', 'outdoor', 'mixed']));

export const VENDOR_PRIORITIES = Object.freeze(/** @type {const} */ (['critical', 'high', 'medium', 'low']));

export const VENDOR_STATUSES = Object.freeze(/** @type {const} */ (['to-research', 'contacted', 'quoted', 'booked']));

/**
 * Supported currencies. `perGuestFactor` converts the USD per-guest guideline
 * into a rough local equivalent so budget warnings stay meaningful.
 */
export const CURRENCIES = Object.freeze({
  USD: { locale: 'en-US', perGuestFactor: 1 },
  EUR: { locale: 'de-DE', perGuestFactor: 0.92 },
  GBP: { locale: 'en-GB', perGuestFactor: 0.79 },
  INR: { locale: 'en-IN', perGuestFactor: 45 },
  CAD: { locale: 'en-CA', perGuestFactor: 1.37 },
  AUD: { locale: 'en-AU', perGuestFactor: 1.52 },
});

export const CURRENCY_CODES = Object.freeze(Object.keys(CURRENCIES));

/** Hard limits that protect the API, the LLM context window and the UI. */
export const LIMITS = Object.freeze({
  minBudget: 100,
  maxBudget: 100_000_000,
  maxGuests: 10_000,
  maxCategories: 15,
  maxLeadDays: 3 * 366,
  chatMessageLength: 500,
  chatHistoryItems: 8,
});
