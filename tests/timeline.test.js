import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PHASES, computePhases } from '../src/services/timeline.js';
import { daysUntil, parseIsoDate } from '../src/utils.js';

const NOW = new Date('2026-01-01T10:00:00Z');

describe('timeline: computePhases', () => {
  it('includes every phase for events more than a year away', () => {
    const phases = computePhases('2027-03-01', NOW);
    assert.deepEqual(phases.map((p) => p.id), PHASES.map((p) => p.id));
    assert.equal(phases[0].startsNow, true);
    assert.ok(phases.slice(1).every((p) => !p.startsNow));
  });

  it('drops phases that no longer fit the lead time', () => {
    const phases = computePhases('2026-01-21', NOW); // 20 days away
    assert.deepEqual(phases.map((p) => p.id), ['w2', 'w1', 'day']);
  });

  it('always includes the event day, even for same-day events', () => {
    assert.deepEqual(computePhases('2026-01-01', NOW).map((p) => p.id), ['day']);
  });

  it('computes target dates counting back from the event', () => {
    const phases = computePhases('2026-07-01', NOW);
    assert.equal(phases.find((p) => p.id === 'm1').dueDate, '2026-06-01');
    assert.equal(phases.find((p) => p.id === 'day').dueDate, '2026-07-01');
  });
});

describe('date utilities', () => {
  it('parses valid ISO dates and rejects impossible ones', () => {
    assert.ok(Number.isFinite(parseIsoDate('2028-02-29')));
    assert.ok(Number.isNaN(parseIsoDate('2026-02-31')));
    assert.ok(Number.isNaN(parseIsoDate('01/02/2026')));
  });

  it('counts whole days in UTC', () => {
    assert.equal(daysUntil('2026-01-11', NOW), 10);
    assert.equal(daysUntil('2025-12-31', NOW), -1);
  });
});
