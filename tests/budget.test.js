import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATEGORY_SPECS,
  applyBudgetOperations,
  computeBudget,
  finalizeBudget,
  findCategory,
} from '../src/services/budget.js';

const sum = (categories) => categories.reduce((total, c) => total + c.amount, 0);
const base = { eventType: 'wedding', budget: 30000, currency: 'USD', guestCount: 100 };

describe('budget engine: computeBudget', () => {
  it('baseline weights sum to 100% for every event type', () => {
    for (const [type, specs] of Object.entries(CATEGORY_SPECS)) {
      const total = specs.reduce((s, spec) => s + spec.weight, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${type} weights sum to ${total}`);
    }
  });

  for (const eventType of Object.keys(CATEGORY_SPECS)) {
    it(`allocates exactly the total for a ${eventType}`, () => {
      for (const budget of [100, 1234, 30000, 987654]) {
        for (const guestCount of [1, 25, 150, 5000]) {
          const result = computeBudget({ ...base, eventType, budget, guestCount });
          assert.equal(sum(result.categories), budget);
          assert.equal(result.total, budget);
          assert.ok(result.categories.every((c) => c.amount >= 0));
        }
      }
    });
  }

  it('gives catering a bigger share as guest count grows', () => {
    const small = computeBudget({ ...base, guestCount: 40 });
    const large = computeBudget({ ...base, guestCount: 300 });
    const share = (b) => b.categories.find((c) => c.id === 'catering').percent;
    assert.ok(share(large) > share(small));
  });

  it('keeps a 10% contingency normally and 12% for rush events', () => {
    const relaxed = computeBudget(base, { daysUntil: 200 });
    const rush = computeBudget(base, { daysUntil: 20 });
    assert.equal(relaxed.categories.find((c) => c.id === 'contingency').percent, 10);
    assert.equal(rush.categories.find((c) => c.id === 'contingency').percent, 12);
  });

  it('computes per-guest spend and warns when it is too low', () => {
    const tight = computeBudget({ ...base, budget: 2000, guestCount: 200 });
    assert.equal(tight.perGuest, 10);
    assert.match(tight.warnings[0], /tight/);
    assert.deepEqual(computeBudget(base).warnings, []);
  });

  it('scales the per-guest warning for other currencies', () => {
    // ₹2,000 per guest is below the ~₹2,700 wedding guideline; $2,000 would not be.
    const inr = computeBudget({ ...base, currency: 'INR', budget: 200000, guestCount: 100 });
    assert.match(inr.warnings[0], /₹/);
    assert.deepEqual(computeBudget({ ...base, budget: 200000, guestCount: 100 }).warnings, []);
  });

  it('rejects unknown event types', () => {
    assert.throws(() => computeBudget({ ...base, eventType: 'funeral' }), /Unknown event type/);
  });
});

describe('budget engine: findCategory', () => {
  const { categories } = computeBudget(base);
  it('matches by id, label, slug and partial label', () => {
    assert.equal(findCategory(categories, 'catering').id, 'catering');
    assert.equal(findCategory(categories, 'Florals & decor').id, 'decor');
    assert.equal(findCategory(categories, 'Photo & Video').id, 'photography');
    assert.equal(findCategory(categories, 'bar').id, 'catering');
    assert.equal(findCategory(categories, 'live music'), undefined);
    assert.equal(findCategory(categories, ''), undefined);
  });
});

describe('budget engine: applyBudgetOperations', () => {
  const ctx = { eventType: 'wedding', guestCount: 100 };
  const budget = computeBudget(base);

  it('moves a percentage into a new category and keeps the total', () => {
    const before = budget.categories.find((c) => c.id === 'catering').amount;
    const { budget: next, changes } = applyBudgetOperations(
      budget,
      [{ type: 'move', from: 'catering', to: 'Live music', percent: 10 }],
      ctx,
    );
    const moved = Math.round(before * 0.1);
    assert.equal(next.categories.find((c) => c.id === 'catering').amount, before - moved);
    assert.equal(next.categories.find((c) => c.id === 'live-music').amount, moved);
    assert.equal(next.categories.find((c) => c.id === 'live-music').label, 'Live Music');
    assert.equal(sum(next.categories), 30000);
    assert.match(changes[0], /^Moved \$[\d,]+ from Catering & bar to Live Music\.$/);
  });

  it('does not mutate the input budget', () => {
    const snapshot = structuredClone(budget);
    applyBudgetOperations(budget, [{ type: 'move', from: 'catering', to: 'decor', percent: 50 }], ctx);
    assert.deepEqual(budget, snapshot);
  });

  it('caps absolute moves at the source amount', () => {
    const decor = budget.categories.find((c) => c.id === 'decor').amount;
    const { budget: next } = applyBudgetOperations(budget, [{ type: 'move', from: 'decor', to: 'venue', amount: 1e9 }], ctx);
    assert.equal(next.categories.find((c) => c.id === 'decor'), undefined, 'emptied category is removed');
    assert.equal(sum(next.categories), 30000);
    assert.equal(next.categories.find((c) => c.id === 'venue').amount, budget.categories.find((c) => c.id === 'venue').amount + decor);
  });

  it('rescales every category with set_total', () => {
    const { budget: next, changes } = applyBudgetOperations(budget, [{ type: 'set_total', amount: 45000 }], ctx);
    assert.equal(next.total, 45000);
    assert.equal(sum(next.categories), 45000);
    assert.match(changes[0], /Rescaled/);
  });

  it('updates guest count and per-guest spend', () => {
    const result = applyBudgetOperations(budget, [{ type: 'set_guest_count', guestCount: 150 }], ctx);
    assert.equal(result.guestCount, 150);
    assert.equal(result.budget.perGuest, 200);
  });

  it('skips moves from unknown or empty categories', () => {
    const { budget: next, changes } = applyBudgetOperations(budget, [{ type: 'move', from: 'yachts', to: 'decor', percent: 10 }], ctx);
    assert.deepEqual(next.categories.map((c) => c.amount), budget.categories.map((c) => c.amount));
    assert.match(changes[0], /Skipped/);
  });

  it('warns when contingency drops below 5%', () => {
    const { budget: next } = applyBudgetOperations(budget, [{ type: 'move', from: 'contingency', to: 'decor', percent: 80 }], ctx);
    assert.ok(next.warnings.some((w) => /Contingency/.test(w)));
  });

  it('finalizeBudget recomputes totals from category amounts', () => {
    const tampered = { ...budget, total: 1, perGuest: 1, categories: budget.categories.map((c) => ({ ...c, percent: 99 })) };
    const fixed = finalizeBudget(tampered, ctx);
    assert.equal(fixed.total, 30000);
    assert.equal(Math.round(fixed.categories.reduce((s, c) => s + c.percent, 0)), 100);
  });
});
