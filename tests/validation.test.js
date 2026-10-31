import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aiChatSchema, aiPlanSchema, eventInputSchema, formatIssues } from '../src/validation.js';
import { aiPlanResponse, futureDate, validInput } from './helpers.js';

describe('validation: event input', () => {
  it('accepts a valid input and applies defaults', () => {
    const { success, data } = eventInputSchema.safeParse({
      eventType: 'birthday',
      budget: 800,
      guestCount: 20,
      eventDate: futureDate(30),
    });
    assert.equal(success, true);
    assert.equal(data.currency, 'USD');
    assert.equal(data.setting, 'mixed');
    assert.equal(data.preferences, '');
  });

  it('trims text and strips control characters', () => {
    const { data } = eventInputSchema.safeParse(validInput({ vibe: '  cosy\u0000 \u0007night  ' }));
    assert.equal(data.vibe, 'cosy night');
  });

  const invalidCases = [
    ['unknown event type', { eventType: 'funeral' }, 'eventType'],
    ['budget too small', { budget: 5 }, 'budget'],
    ['budget as string', { budget: '1000' }, 'budget'],
    ['fractional guests', { guestCount: 10.5 }, 'guestCount'],
    ['too many guests', { guestCount: 20000 }, 'guestCount'],
    ['impossible date', { eventDate: '2027-02-30' }, 'eventDate'],
    ['past date', { eventDate: futureDate(-30) }, 'eventDate'],
    ['date too far ahead', { eventDate: futureDate(2000) }, 'eventDate'],
    ['over-long preferences', { preferences: 'x'.repeat(601) }, 'preferences'],
    ['unknown currency', { currency: 'BTC' }, 'currency'],
    ['unexpected field', { isAdmin: true }, '(root)'],
  ];

  for (const [name, override, field] of invalidCases) {
    it(`rejects ${name}`, () => {
      const result = eventInputSchema.safeParse(validInput(override));
      assert.equal(result.success, false);
      assert.ok(
        formatIssues(result.error).some((issue) => issue.field === field),
        JSON.stringify(formatIssues(result.error)),
      );
    });
  }
});

describe('validation: AI output', () => {
  it('normalises a plan response, dropping invalid colours and times', () => {
    const data = aiPlanSchema.parse(aiPlanResponse);
    assert.deepEqual(data.theme.palette.map((c) => c.hex), ['#556B2F']);
    assert.deepEqual(data.dayOf.map((d) => d.time), ['15:00']);
  });

  it('truncates over-long strings and lists instead of failing', () => {
    const data = aiPlanSchema.parse({
      ...aiPlanResponse,
      summary: 'a'.repeat(5000),
      vendors: Array.from({ length: 30 }, () => aiPlanResponse.vendors[0]),
    });
    assert.equal(data.summary.length, 1200);
    assert.equal(data.vendors.length, 12);
  });

  it('falls back to safe defaults for unknown enum values', () => {
    const vendor = { ...aiPlanResponse.vendors[0], priority: 'urgent!!', bookBy: 'yesterday' };
    const data = aiPlanSchema.parse({ ...aiPlanResponse, vendors: [vendor] });
    assert.equal(data.vendors[0].priority, 'medium');
    assert.equal(data.vendors[0].bookBy, 'm1');
  });

  it('accepts a minimal chat response', () => {
    const data = aiChatSchema.parse({ reply: 'Sure!' });
    assert.deepEqual(data.budgetOperations, []);
    assert.equal(data.theme, undefined);
  });

  it('rejects a plan response missing required sections', () => {
    assert.equal(aiPlanSchema.safeParse({ summary: 'hi' }).success, false);
  });
});
