import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ApiError, createPlan, getHealth, refinePlan } from '../public/js/api.js';
import { buildIcs, escapeIcsText, foldLine } from '../public/js/ics.js';
import { clearSession, loadSession, saveSession } from '../public/js/storage.js';
import { createPlanner } from '../src/services/planner.js';
import { eventInputSchema } from '../src/validation.js';
import { silentLogger, validInput } from './helpers.js';

const plan = await createPlanner({ logger: silentLogger }).generatePlan(eventInputSchema.parse(validInput()));
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.localStorage;
});

/** Stubs fetch with a canned response and records the request. */
function stubFetch(status, body, { reject } = {}) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (reject) throw reject;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return requests;
}

describe('client api.js', () => {
  it('GETs health and POSTs JSON for plans and chat', async () => {
    let requests = stubFetch(200, { status: 'ok' });
    assert.deepEqual(await getHealth(), { status: 'ok' });
    assert.equal(requests[0].url, '/api/health');
    assert.equal(requests[0].options.method, 'GET');

    requests = stubFetch(201, { plan: { id: 'p1' } });
    assert.deepEqual(await createPlan({ eventType: 'wedding' }), { plan: { id: 'p1' } });
    assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(requests[0].options.body), { eventType: 'wedding' });
    assert.ok(requests[0].options.signal instanceof AbortSignal);

    requests = stubFetch(200, { reply: 'ok' });
    await refinePlan({ id: 'p1' }, 'hi', []);
    assert.deepEqual(JSON.parse(requests[0].options.body), { plan: { id: 'p1' }, message: 'hi', history: [] });
  });

  it('turns error responses into ApiError with details', async () => {
    stubFetch(400, { error: 'Invalid request', details: [{ field: 'budget', message: 'Too small' }] });
    await assert.rejects(createPlan({}), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.details[0].field, 'budget');
      return true;
    });
  });

  it('handles non-JSON error bodies, network failures and timeouts', async () => {
    stubFetch(502, '<html>Bad gateway</html>');
    await assert.rejects(getHealth(), /Request failed \(502\)/);

    stubFetch(0, null, { reject: new TypeError('Failed to fetch') });
    await assert.rejects(getHealth(), /Network error/);

    stubFetch(0, null, { reject: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) });
    await assert.rejects(getHealth(), /took too long/);
  });
});

describe('client storage.js', () => {
  function fakeStorage({ throwOn } = {}) {
    const data = new Map();
    const guard = (op) => {
      if (throwOn === op) throw new Error('SecurityError');
    };
    return {
      data,
      getItem: (k) => (guard('get'), data.get(k) ?? null),
      setItem: (k, v) => (guard('set'), data.set(k, v)),
      removeItem: (k) => (guard('remove'), data.delete(k)),
    };
  }

  it('round-trips a session', () => {
    globalThis.localStorage = fakeStorage();
    assert.equal(loadSession(), null);
    saveSession({ plan: { id: 'p' }, chat: [] });
    assert.deepEqual(loadSession(), { plan: { id: 'p' }, chat: [] });
    clearSession();
    assert.equal(loadSession(), null);
  });

  it('ignores corrupt or plan-less data', () => {
    globalThis.localStorage = fakeStorage();
    localStorage.setItem('celebrate.session.v1', '{not json');
    assert.equal(loadSession(), null);
    localStorage.setItem('celebrate.session.v1', '{"chat":[]}');
    assert.equal(loadSession(), null);
  });

  it('keeps working when storage is blocked', () => {
    for (const op of ['get', 'set', 'remove']) {
      globalThis.localStorage = fakeStorage({ throwOn: op });
      assert.doesNotThrow(() => {
        saveSession({ plan: {} });
        loadSession();
        clearSession();
      });
    }
  });
});

describe('client ics.js', () => {
  const now = new Date('2026-10-01T08:30:00.000Z');

  it('escapes special characters and folds long lines', () => {
    assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
    const folded = foldLine('x'.repeat(160));
    assert.ok(folded.split('\r\n').every((line) => line.length <= 75));
    assert.equal(folded.replaceAll('\r\n ', ''), 'x'.repeat(160));
  });

  it('creates one event per milestone plus the event day', () => {
    const ics = buildIcs(plan, now);
    const lines = ics.split('\r\n');
    assert.equal(lines[0], 'BEGIN:VCALENDAR');
    assert.equal(lines.at(-2), 'END:VCALENDAR');
    assert.ok(ics.endsWith('\r\n'));

    const events = ics.match(/BEGIN:VEVENT/g).length;
    const milestones = plan.timeline.phases.filter((p) => p.id !== 'day').length;
    assert.equal(events, milestones + 1);
    assert.ok(ics.includes(`DTSTART;VALUE=DATE:${plan.input.eventDate.replaceAll('-', '')}`));
    assert.ok(ics.includes('DTSTAMP:20261001T083000Z'));
    assert.ok(ics.includes('SUMMARY:Sam & Priya'));
    assert.ok(
      lines.every((line) => line.length <= 75),
      'all lines folded',
    );
  });

  it('marks completed tasks and handles month-end dates', () => {
    const copy = structuredClone(plan);
    copy.timeline.phases[0].tasks[0].done = true;
    copy.timeline.phases[0].dueDate = '2026-12-31';
    const ics = buildIcs(copy, now).replaceAll('\r\n ', '');
    assert.ok(ics.includes('[x] '));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
  });
});
