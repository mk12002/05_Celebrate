import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createPlanner } from '../src/services/planner.js';
import { eventInputSchema } from '../src/validation.js';
import { futureDate, silentLogger, validInput } from './helpers.js';

/*
 * End-to-end tests of the browser controller in jsdom: the real index.html,
 * the real render code, and fakes for network, storage, clipboard, downloads
 * and timers.
 */

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const { createController, PROGRESS_STEPS } = await import('../public/js/controller.js');
const { ApiError } = await import('../public/js/api.js');

const basePlan = await createPlanner({ logger: silentLogger }).generatePlan(eventInputSchema.parse(validInput()));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let dom;
let doc;
let $;

function setup({ api: apiOverrides = {}, session = null, health = { ai: true } } = {}) {
  dom = new JSDOM(html, { pretendToBeVisual: true });
  doc = dom.window.document;
  $ = (id) => doc.getElementById(id);
  // render.js resolves elements through the global document.
  Object.assign(globalThis, { document: doc, Node: dom.window.Node });

  const calls = { createPlan: [], refinePlan: [], saved: [], cleared: 0, copied: [], downloads: [], printed: 0 };
  const timers = [];
  const api = {
    getHealth: async () => health,
    createPlan: async (input) => {
      calls.createPlan.push(input);
      return { plan: structuredClone(basePlan) };
    },
    refinePlan: async (plan, message, history) => {
      calls.refinePlan.push({ plan, message, history });
      const next = structuredClone(plan);
      next.summary = 'Updated summary';
      return { plan: next, reply: 'Done!', changes: ['Moved $100 from A to B.'], source: 'ai' };
    },
    ...apiOverrides,
  };
  const storage = {
    loadSession: () => session,
    saveSession: (s) => calls.saved.push(structuredClone(s)),
    clearSession: () => (calls.cleared += 1),
  };
  const controller = createController({
    api,
    storage,
    doc,
    copyText: async (text) => {
      if (text === 'FAIL') throw new Error('denied');
      calls.copied.push(text);
    },
    download: (blob, filename) => calls.downloads.push({ blob, filename }),
    print: () => (calls.printed += 1),
    setInterval: (fn) => timers.push(fn),
    clearInterval: () => timers.splice(0),
  });
  return { controller, calls, timers };
}

function fillValidForm() {
  $('eventDate').value = futureDate(120);
  $('guestCount').value = '80';
  $('budget').value = '12000';
  $('title').value = 'Team picnic';
  doc.querySelector('input[value="community"]').checked = true;
}

const copyButton = () => [...doc.querySelectorAll('#panel-theme button')].find((b) => /Copy/.test(b.textContent));

async function submitPlan() {
  $('plan-form').requestSubmit();
  await flush();
}

describe('controller: start-up', () => {
  it('sets the date limits and a default date three months out', async () => {
    const { controller } = setup();
    await controller.init(new Date(2026, 0, 15));
    assert.equal($('eventDate').min, '2026-01-15');
    assert.equal($('eventDate').value, '2026-04-15');
    assert.equal($('workspace').hidden, true);
  });

  it('shows the AI status badge', async () => {
    let ctx = setup({ health: { ai: true } });
    await ctx.controller.init();
    assert.equal($('ai-status').textContent, 'Gemini online');
    assert.ok($('ai-status').classList.contains('badge-ok'));

    ctx = setup({ health: { ai: false } });
    await ctx.controller.init();
    assert.match($('ai-status').textContent, /template mode/);

    ctx = setup({ api: { getHealth: async () => { throw new Error('offline'); } } });
    await ctx.controller.init();
    assert.equal($('ai-status').textContent, 'Server unreachable');
  });

  it('restores a saved session', async () => {
    const { controller } = setup({ session: { plan: structuredClone(basePlan), chat: [{ role: 'user', text: 'Hi' }] } });
    await controller.init();
    assert.equal($('workspace').hidden, false);
    assert.equal($('planner-section').hidden, true);
    assert.equal(doc.querySelectorAll('#chat-log .msg').length, 1);
  });

  it('clears a corrupt saved session and starts fresh', async () => {
    const { controller, calls } = setup({ session: { plan: { broken: true } } });
    await controller.init();
    assert.equal(calls.cleared, 1);
    assert.equal($('workspace').hidden, true);
  });
});

describe('controller: plan form', () => {
  it('validates fields before calling the API and focuses the first error', async () => {
    const { controller, calls } = setup();
    await controller.init();
    $('eventDate').value = '';
    $('guestCount').value = '0';
    await submitPlan();

    assert.equal(calls.createPlan.length, 0);
    assert.equal($('eventDate').getAttribute('aria-invalid'), 'true');
    assert.equal($('guestCount').getAttribute('aria-invalid'), 'true');
    assert.match($('eventDate-error').textContent, /date/);
    assert.equal(doc.activeElement, $('eventDate'));
    assert.match($('status').textContent, /fix the highlighted fields/);
  });

  it('generates a plan, shows progress, renders it and saves the session', async () => {
    let resolve;
    const received = [];
    const createPlan = (input) => {
      received.push(input);
      return new Promise((r) => (resolve = r));
    };
    const { controller, calls, timers } = setup({ api: { createPlan } });
    await controller.init();
    fillValidForm();
    $('plan-form').requestSubmit();
    await flush();

    assert.equal($('generate-btn').disabled, true);
    assert.equal($('generate-btn').getAttribute('aria-busy'), 'true');
    assert.equal($('plan-form').getAttribute('aria-busy'), 'true');
    assert.equal($('status').textContent, PROGRESS_STEPS[0]);
    for (let i = 0; i < PROGRESS_STEPS.length + 2; i += 1) timers[0]();
    assert.equal($('status').textContent, PROGRESS_STEPS.at(-1), 'progress stops at the last step');

    resolve({ plan: structuredClone(basePlan) });
    await flush();

    assert.deepEqual(received[0], {
      eventType: 'community',
      title: 'Team picnic',
      eventDate: futureDate(120),
      guestCount: 80,
      budget: 12000,
      currency: 'USD',
      location: '',
      setting: 'mixed',
      vibe: '',
      preferences: '',
    });
    assert.equal(timers.length, 0, 'progress timer stopped');
    assert.equal($('workspace').hidden, false);
    assert.equal($('planner-section').hidden, true);
    assert.equal($('generate-btn').disabled, false);
    assert.equal($('plan-form').hasAttribute('aria-busy'), false);
    assert.equal(doc.activeElement, $('results-title'));
    assert.equal($('status').textContent, 'Your plan is ready.');
    assert.equal(calls.saved.at(-1).plan.id, basePlan.id);
    assert.equal(doc.querySelectorAll('#chat-log .msg').length, 1);
  });

  it('warns when the server fell back to a template while AI is enabled', async () => {
    const { controller } = setup({ health: { ai: true } });
    await controller.init();
    fillValidForm();
    await submitPlan();
    assert.equal(basePlan.source, 'template');
    assert.equal($('fallback-notice').hidden, false);
  });

  it('does not warn about templates when AI is switched off', async () => {
    const { controller } = setup({ health: { ai: false } });
    await controller.init();
    fillValidForm();
    await submitPlan();
    assert.equal($('fallback-notice').hidden, true);
  });

  it('shows server-side field errors and messages', async () => {
    const error = new ApiError('Invalid request', { status: 400, details: [{ field: 'budget', message: 'Too small' }] });
    const { controller } = setup({ api: { createPlan: async () => { throw error; } } });
    await controller.init();
    fillValidForm();
    await submitPlan();

    assert.equal($('form-error').hidden, false);
    assert.equal($('form-error').textContent, 'Invalid request');
    assert.equal($('budget-error').textContent, 'Too small');
    assert.equal($('workspace').hidden, true);
  });

  it('shows a generic message for unexpected errors', async () => {
    const { controller } = setup({ api: { createPlan: async () => { throw new TypeError('boom'); } } });
    await controller.init();
    fillValidForm();
    await submitPlan();
    assert.equal($('form-error').textContent, 'Something went wrong. Please try again.');
  });

  it('"Edit details" refills the form from the plan', async () => {
    const { controller } = setup({ session: { plan: structuredClone(basePlan), chat: [] } });
    await controller.init();
    $('edit-btn').click();
    assert.equal($('planner-section').hidden, false);
    assert.equal($('title').value, basePlan.input.title);
    assert.equal($('guestCount').value, String(basePlan.input.guestCount));
    assert.equal(doc.querySelector('input[name="eventType"]:checked').value, basePlan.input.eventType);
    assert.equal($('setting').value, basePlan.input.setting);
    assert.equal(doc.activeElement, $('title'));
  });
});

describe('controller: chat', () => {
  async function ready(apiOverrides) {
    const ctx = setup({ api: apiOverrides, session: { plan: structuredClone(basePlan), chat: [{ role: 'assistant', text: 'Hi' }] } });
    await ctx.controller.init();
    return ctx;
  }

  it('sends the message with history and applies the updated plan', async () => {
    const { calls } = await ready();
    $('chat-input').value = 'Cut decor by 10%';
    $('chat-form').requestSubmit();
    await flush();

    assert.equal(calls.refinePlan[0].message, 'Cut decor by 10%');
    assert.deepEqual(calls.refinePlan[0].history, [{ role: 'assistant', text: 'Hi' }]);
    const messages = [...doc.querySelectorAll('#chat-log .msg')].map((m) => m.textContent);
    assert.equal(messages.length, 3);
    assert.match(messages[2], /Done!.*Moved \$100/);
    assert.equal($('panel-overview').querySelector('.summary').textContent, 'Updated summary');
    assert.match($('status').textContent, /Plan updated/);
    assert.equal($('chat-input').value, '');
    assert.equal($('results').hasAttribute('aria-busy'), false);
    assert.equal(doc.activeElement, $('chat-input'));
  });

  it('sends on Enter but not on Shift+Enter, and ignores blank messages', async () => {
    const { calls } = await ready();
    const { KeyboardEvent } = dom.window;
    $('chat-input').value = '   ';
    $('chat-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    assert.equal(calls.refinePlan.length, 0);

    $('chat-input').value = 'Add a photo booth';
    $('chat-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    await flush();
    assert.equal(calls.refinePlan.length, 0);

    $('chat-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    assert.equal(calls.refinePlan.length, 1);
  });

  it('suggestion chips send their text', async () => {
    const { calls } = await ready();
    const chip = doc.querySelector('.chip');
    chip.click();
    await flush();
    assert.equal(calls.refinePlan[0].message, chip.textContent);
  });

  it('keeps the message and explains when the request fails', async () => {
    await ready({ refinePlan: async () => { throw new Error('Too many requests'); } });
    $('chat-input').value = 'More music';
    $('chat-form').requestSubmit();
    await flush();
    assert.equal($('chat-input').value, 'More music');
    assert.match(doc.querySelector('#chat-log .msg:last-child').textContent, /couldn't apply that: Too many requests/);
  });
});

describe('controller: plan interactions', () => {
  async function ready() {
    const ctx = setup({ session: { plan: structuredClone(basePlan), chat: [] } });
    await ctx.controller.init();
    return ctx;
  }

  it('switches tabs by click and by Arrow, Home and End keys', async () => {
    await ready();
    const { KeyboardEvent } = dom.window;
    const selected = () => doc.querySelector('[role="tab"][aria-selected="true"]').id;
    const visiblePanels = () => [...doc.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id);

    $('tab-budget').click();
    assert.equal(selected(), 'tab-budget');
    assert.deepEqual(visiblePanels(), ['panel-budget']);
    assert.equal($('tab-budget').tabIndex, 0);
    assert.equal($('tab-overview').tabIndex, -1);

    const press = (key) => doc.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    $('tab-budget').focus();
    press('ArrowRight');
    assert.equal(selected(), 'tab-timeline');
    assert.equal(doc.activeElement, $('tab-timeline'));
    press('End');
    assert.equal(selected(), 'tab-theme');
    press('ArrowRight');
    assert.equal(selected(), 'tab-overview', 'wraps around');
    press('ArrowLeft');
    assert.equal(selected(), 'tab-theme');
    press('Home');
    assert.equal(selected(), 'tab-overview');
    press('a');
    assert.equal(selected(), 'tab-overview', 'other keys ignored');
  });

  it('ticking a task saves progress and keeps focus on the checkbox', async () => {
    const { calls } = await ready();
    const checkbox = doc.querySelector('#panel-timeline input[type="checkbox"]');
    const id = checkbox.id;
    checkbox.focus();
    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event('change'));

    assert.equal(calls.saved.at(-1).plan.timeline.phases[0].tasks[0].done, true);
    assert.equal(doc.activeElement.id, id);
    assert.ok($(id).checked);
  });

  it('changing vendor status saves and announces it', async () => {
    const { calls } = await ready();
    const select = doc.querySelector('#panel-vendors select');
    select.value = 'booked';
    select.dispatchEvent(new dom.window.Event('change'));
    assert.ok(calls.saved.at(-1).plan.vendors.some((v) => v.status === 'booked'));
    assert.match($('status').textContent, /marked as booked/);
  });

  it('copies the invitation text', async () => {
    const { calls } = await ready();
    copyButton().click();
    await flush();
    assert.equal(calls.copied[0], basePlan.theme.invitation);
    assert.match($('status').textContent, /copied/);
  });

  it('reports when copying is blocked', async () => {
    const plan = structuredClone(basePlan);
    plan.theme.invitation = 'FAIL';
    const ctx = setup({ session: { plan, chat: [] } });
    await ctx.controller.init();
    copyButton().click();
    await flush();
    assert.match($('status').textContent, /Copy failed/);
  });

  it('downloads the plan as JSON and the milestones as a calendar file', async () => {
    const { calls } = await ready();
    $('download-btn').click();
    $('calendar-btn').click();
    $('print-btn').click();

    const [json, ics] = calls.downloads;
    assert.equal(json.filename, 'sam-priya-plan.json');
    assert.equal(JSON.parse(await json.blob.text()).id, basePlan.id);
    assert.equal(ics.filename, 'sam-priya-milestones.ics');
    assert.equal(ics.blob.type, 'text/calendar');
    assert.match(await ics.blob.text(), /^BEGIN:VCALENDAR/);
    assert.equal(calls.printed, 1);
  });
});
