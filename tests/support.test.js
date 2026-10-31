import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogger, silentLogger as quietLogger } from '../src/logger.js';
import { TtlCache } from '../src/services/cache.js';
import { templateChatResponse } from '../src/services/fallback.js';
import { slugify, titleCase } from '../src/utils.js';
import {
  countdownLabel,
  daysUntil,
  formatDate,
  formatMoney,
  progressPercent,
  todayIso,
  validateEventForm,
} from '../public/js/format.js';

describe('structured logger', () => {
  it('writes one JSON line per entry with level, time and metadata', () => {
    const lines = [];
    const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)), now: () => new Date(0) });
    logger.info('request', { status: 200 });
    logger.warn('plain');
    logger.error('failed', new Error('boom'));
    assert.deepEqual(lines, [
      { time: '1970-01-01T00:00:00.000Z', level: 'info', message: 'request', meta: { status: 200 } },
      { time: '1970-01-01T00:00:00.000Z', level: 'warn', message: 'plain' },
      { time: '1970-01-01T00:00:00.000Z', level: 'error', message: 'failed', error: 'boom' },
    ]);
  });

  it('provides a silent logger', () => {
    assert.doesNotThrow(() => quietLogger.info('x'));
  });
});

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let now = 0;
    const cache = new TtlCache({ ttlMs: 100, now: () => now });
    cache.set('a', 1);
    assert.equal(cache.get('a'), 1);
    now = 150;
    assert.equal(cache.get('a'), undefined);
  });

  it('evicts the least recently used entry', () => {
    const cache = new TtlCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.size, 2);
  });
});

describe('offline chat fallback', () => {
  it('parses "reduce X by N% and reallocate it to Y"', () => {
    const result = templateChatResponse('Reduce the catering budget by 10% and reallocate it to live music.');
    assert.deepEqual(result.budgetOperations, [{ type: 'move', from: 'catering', to: 'live music', percent: 10 }]);
  });

  it('suggests indoor activities for rain', () => {
    const result = templateChatResponse('Suggest indoor backup activities for rainy weather');
    assert.ok(result.addActivities.length >= 3);
    assert.equal(result.addTasks[0].phaseId, 'm1');
  });

  it('explains its limits for anything else', () => {
    assert.match(templateChatResponse('Write me a poem').reply, /offline/);
  });
});

describe('string utilities', () => {
  it('slugify and titleCase produce safe labels', () => {
    assert.equal(slugify('  Live Music & DJ! '), 'live-music-dj');
    assert.equal(titleCase('live   music'), 'Live Music');
  });
});

describe('frontend format helpers', () => {
  const now = new Date(2026, 0, 1, 12);

  it('formats money and dates', () => {
    assert.equal(formatMoney(12500, 'USD'), '$12,500');
    assert.equal(formatMoney(150000, 'INR'), '₹1,50,000');
    // ICU versions differ on the comma after the weekday.
    assert.match(formatDate('2027-06-12'), /^Sat,? 12 Jun 2027$/);
    assert.equal(formatDate('not-a-date'), 'not-a-date');
  });

  it('computes countdowns', () => {
    assert.equal(daysUntil('2026-01-11', now), 10);
    assert.equal(countdownLabel(0), 'Today');
    assert.equal(countdownLabel(1), 'Tomorrow');
    assert.equal(countdownLabel(42), 'in 42 days');
    assert.equal(countdownLabel(-1), '1 day ago');
    assert.equal(todayIso(now), '2026-01-01');
  });

  it('computes checklist progress', () => {
    const phases = [{ tasks: [{ done: true }, { done: false }] }, { tasks: [{ done: true }, { done: true }] }];
    assert.equal(progressPercent(phases), 75);
    assert.equal(progressPercent([]), 0);
  });

  it('validates the event form like the server', () => {
    assert.deepEqual(validateEventForm({ eventDate: '2026-03-01', guestCount: 50, budget: 5000 }, now), {});
    const errors = validateEventForm({ eventDate: '2025-12-01', guestCount: 0, budget: 10 }, now);
    assert.deepEqual(Object.keys(errors).sort(), ['budget', 'eventDate', 'guestCount']);
  });
});
