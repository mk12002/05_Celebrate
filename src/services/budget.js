import { CURRENCIES, LIMITS } from '../constants.js';
import { clamp, formatMoney, round1, slugify, titleCase } from '../utils.js';

/**
 * Deterministic budget engine.
 *
 * Gemini proposes *what* should change (e.g. "move 10% of catering to live
 * music"); this module does the arithmetic so every plan always sums exactly
 * to the user's total. Amounts are whole currency units.
 */

/**
 * Baseline category weights per event type. `scaling` controls how strongly a
 * category reacts to guest count:
 *  - perGuest: grows with headcount (food, invitations)
 *  - semi:     grows slowly (venue size, decor volume)
 *  - fixed:    independent of headcount (photographer, DJ)
 *  - reserve:  contingency buffer, kept at a fixed share of the total
 */
export const CATEGORY_SPECS = Object.freeze({
  wedding: [
    { id: 'venue', label: 'Venue & rentals', weight: 0.24, scaling: 'semi' },
    { id: 'catering', label: 'Catering & bar', weight: 0.3, scaling: 'perGuest' },
    { id: 'photography', label: 'Photo & video', weight: 0.1, scaling: 'fixed' },
    { id: 'decor', label: 'Florals & decor', weight: 0.09, scaling: 'semi' },
    { id: 'entertainment', label: 'Music & entertainment', weight: 0.08, scaling: 'fixed' },
    { id: 'attire', label: 'Attire & beauty', weight: 0.06, scaling: 'fixed' },
    { id: 'stationery', label: 'Invitations & favors', weight: 0.03, scaling: 'perGuest' },
    { id: 'contingency', label: 'Contingency buffer', weight: 0.1, scaling: 'reserve' },
  ],
  birthday: [
    { id: 'venue', label: 'Venue & rentals', weight: 0.18, scaling: 'semi' },
    { id: 'catering', label: 'Food, drinks & cake', weight: 0.32, scaling: 'perGuest' },
    { id: 'decor', label: 'Decor & balloons', weight: 0.12, scaling: 'semi' },
    { id: 'entertainment', label: 'Entertainment & activities', weight: 0.16, scaling: 'fixed' },
    { id: 'photography', label: 'Photography', weight: 0.06, scaling: 'fixed' },
    { id: 'favors', label: 'Invitations & party favors', weight: 0.06, scaling: 'perGuest' },
    { id: 'contingency', label: 'Contingency buffer', weight: 0.1, scaling: 'reserve' },
  ],
  community: [
    { id: 'venue', label: 'Venue & site fees', weight: 0.18, scaling: 'semi' },
    { id: 'catering', label: 'Food & refreshments', weight: 0.22, scaling: 'perGuest' },
    { id: 'entertainment', label: 'Performers & programming', weight: 0.14, scaling: 'fixed' },
    { id: 'equipment', label: 'AV, staging & rentals', weight: 0.14, scaling: 'semi' },
    { id: 'permits', label: 'Permits & insurance', weight: 0.08, scaling: 'fixed' },
    { id: 'marketing', label: 'Promotion & signage', weight: 0.08, scaling: 'fixed' },
    { id: 'safety', label: 'Security, first aid & sanitation', weight: 0.06, scaling: 'perGuest' },
    { id: 'contingency', label: 'Contingency buffer', weight: 0.1, scaling: 'reserve' },
  ],
});

/** Guest count the baseline weights were tuned for. */
export const REFERENCE_GUESTS = Object.freeze({ wedding: 100, birthday: 25, community: 150 });

/** Rough minimum spend per guest (USD) before we warn the organiser. */
const MIN_PER_GUEST_USD = Object.freeze({ wedding: 60, birthday: 15, community: 8 });

const SCALING_EXPONENT = Object.freeze({ perGuest: 0.35, semi: 0.15, fixed: 0 });

const CONTINGENCY_ID = 'contingency';
const RUSH_LEAD_DAYS = 60;

/**
 * Builds the baseline allocation for an event.
 *
 * @param {{eventType: string, budget: number, currency: string, guestCount: number}} input
 * @param {{daysUntil?: number}} [context]
 */
export function computeBudget(input, { daysUntil } = {}) {
  const { eventType, currency, guestCount } = input;
  const total = Math.round(input.budget);
  const specs = CATEGORY_SPECS[eventType];
  if (!specs) throw new Error(`Unknown event type: ${eventType}`);

  // Short lead times carry rush fees, so hold back a larger buffer.
  const reserveShare = daysUntil !== undefined && daysUntil < RUSH_LEAD_DAYS ? 0.12 : 0.1;
  const ratio = guestCount / REFERENCE_GUESTS[eventType];

  const weighted = specs
    .filter((spec) => spec.scaling !== 'reserve')
    .map((spec) => ({
      ...spec,
      scaled: spec.weight * clamp(ratio ** SCALING_EXPONENT[spec.scaling], 0.5, 2),
    }));
  const weightSum = weighted.reduce((sum, spec) => sum + spec.scaled, 0);

  const categories = weighted.map((spec) => ({
    id: spec.id,
    label: spec.label,
    amount: Math.floor((total * (1 - reserveShare) * spec.scaled) / weightSum),
    percent: 0,
    note: '',
  }));
  const allocated = categories.reduce((sum, c) => sum + c.amount, 0);
  const reserve = specs.find((spec) => spec.scaling === 'reserve');
  categories.push({
    id: reserve.id,
    label: reserve.label,
    amount: total - allocated,
    percent: 0,
    note: '',
  });

  return finalizeBudget({ currency, total, categories }, { eventType, guestCount });
}

/**
 * Recomputes derived fields (total, percentages, per-guest spend, warnings).
 * Called after every mutation so client-supplied numbers are never trusted.
 */
export function finalizeBudget(budget, { eventType, guestCount }) {
  const categories = budget.categories.map((c) => ({ ...c, amount: Math.max(0, Math.round(c.amount)) }));
  const total = categories.reduce((sum, c) => sum + c.amount, 0);
  for (const c of categories) c.percent = total > 0 ? round1((c.amount / total) * 100) : 0;

  const perGuest = guestCount > 0 ? Math.round(total / guestCount) : total;
  return {
    currency: budget.currency,
    total,
    perGuest,
    categories,
    warnings: budgetWarnings({ currency: budget.currency, total, perGuest, categories }, eventType),
  };
}

function budgetWarnings({ currency, total, perGuest, categories }, eventType) {
  const warnings = [];
  const factor = (CURRENCIES[currency] ?? CURRENCIES.USD).perGuestFactor;
  const minPerGuest = Math.round((MIN_PER_GUEST_USD[eventType] ?? 10) * factor);
  if (perGuest < minPerGuest) {
    warnings.push(
      `At ${formatMoney(perGuest, currency)} per guest the budget is tight for a ${eventType}; ` +
        `consider trimming the guest list or choosing a simpler catering style (guide: ${formatMoney(minPerGuest, currency)}+ per guest).`,
    );
  }
  const contingency = categories.find((c) => c.id === CONTINGENCY_ID);
  if (!contingency || contingency.amount < total * 0.05) {
    warnings.push('Contingency is below 5% of the budget; keep a buffer for overruns and last-minute costs.');
  }
  return warnings;
}

/**
 * Finds a category by id, exact label, slug or partial label match.
 * Returns `undefined` when nothing matches.
 */
export function findCategory(categories, ref) {
  if (!ref) return undefined;
  const needle = String(ref).trim().toLowerCase();
  const slug = slugify(ref);
  return (
    categories.find((c) => c.id === needle) ??
    categories.find((c) => c.label.toLowerCase() === needle) ??
    categories.find((c) => c.id === slug) ??
    categories.find((c) => c.label.toLowerCase().includes(needle) || needle.includes(c.id))
  );
}

function uniqueId(categories, label) {
  const base = slugify(label) || 'category';
  let id = base;
  for (let n = 2; categories.some((c) => c.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

/**
 * Applies AI-proposed budget operations to a budget.
 *
 * Supported operations:
 *  - { type: 'move', from, to, percent? | amount? } move money between categories
 *    (creates `to` if it does not exist yet)
 *  - { type: 'set_total', amount } rescale every category to a new total
 *  - { type: 'set_guest_count', guestCount } update headcount for per-guest metrics
 *
 * @returns {{budget: object, guestCount: number, changes: string[]}}
 */
export function applyBudgetOperations(budget, operations, { eventType, guestCount }) {
  let categories = budget.categories.map((c) => ({ ...c }));
  let guests = guestCount;
  const changes = [];
  const money = (n) => formatMoney(n, budget.currency);

  for (const op of operations ?? []) {
    if (op.type === 'move') {
      const from = findCategory(categories, op.from);
      if (!from || from.amount <= 0) {
        changes.push(`Skipped a budget move: "${op.from}" has no funds to move.`);
        continue;
      }
      let to = findCategory(categories, op.to);
      if (to === from) continue;
      if (!to) {
        if (!op.to || categories.length >= LIMITS.maxCategories) {
          changes.push(`Skipped a budget move: could not create category "${op.to}".`);
          continue;
        }
        to = { id: uniqueId(categories, op.to), label: titleCase(op.to), amount: 0, percent: 0, note: '' };
        categories.push(to);
      }
      const requested = Number.isFinite(op.percent)
        ? (from.amount * clamp(op.percent, 0, 100)) / 100
        : Number(op.amount) || 0;
      const amount = Math.round(clamp(requested, 0, from.amount));
      if (amount === 0) continue;
      from.amount -= amount;
      to.amount += amount;
      changes.push(`Moved ${money(amount)} from ${from.label} to ${to.label}.`);
    } else if (op.type === 'set_total') {
      const newTotal = Math.round(clamp(Number(op.amount) || 0, LIMITS.minBudget, LIMITS.maxBudget));
      const oldTotal = categories.reduce((sum, c) => sum + c.amount, 0);
      if (oldTotal <= 0 || newTotal === oldTotal) continue;
      categories = categories.map((c) => ({ ...c, amount: Math.floor((c.amount * newTotal) / oldTotal) }));
      const remainder = newTotal - categories.reduce((sum, c) => sum + c.amount, 0);
      const sink = categories.find((c) => c.id === CONTINGENCY_ID) ?? categories[0];
      sink.amount += remainder;
      changes.push(`Rescaled the total budget from ${money(oldTotal)} to ${money(newTotal)}.`);
    } else if (op.type === 'set_guest_count') {
      const next = Math.round(clamp(Number(op.guestCount) || 0, 1, LIMITS.maxGuests));
      if (next === guests) continue;
      changes.push(`Updated guest count from ${guests} to ${next}.`);
      guests = next;
    }
  }

  // Drop empty categories the user explicitly emptied, but never the buffer.
  categories = categories.filter((c) => c.amount > 0 || c.id === CONTINGENCY_ID);

  return {
    budget: finalizeBudget({ ...budget, categories }, { eventType, guestCount: guests }),
    guestCount: guests,
    changes,
  };
}
