import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import axe from 'axe-core';
import { JSDOM } from 'jsdom';
import { createPlanner } from '../src/services/planner.js';
import { eventInputSchema } from '../src/validation.js';
import { silentLogger, validInput } from './helpers.js';

/*
 * Frontend tests: render the real index.html in jsdom, draw a plan with the
 * production render functions, and audit the result with axe-core.
 * (Colour contrast needs a layout engine, so it is checked in a real browser
 * instead; see README.)
 */

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const noop = () => {};
const handlers = { onToggleTask: noop, onVendorStatus: noop, onCopy: noop };

let dom;
let render;
let h;

before(async () => {
  dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  // render.js / dom.js use browser globals at call time.
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node });
  dom.window.eval(axe.source);
  render = await import('../public/js/render.js');
  ({ h } = await import('../public/js/dom.js'));
});

async function audit(context = dom.window.document) {
  const results = await dom.window.axe.run(context, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
    rules: { 'color-contrast': { enabled: false } },
  });
  // Array.from copies out of the jsdom realm so deepEqual compares plain arrays.
  return Array.from(results.violations, (v) => `${v.id}: ${Array.from(v.nodes, (n) => n.target.join(' ')).join(', ')}`);
}

async function samplePlan(overrides = {}) {
  const plan = await createPlanner({ logger: silentLogger }).generatePlan(eventInputSchema.parse(validInput()));
  return { ...plan, ...overrides };
}

function showWorkspace() {
  const { document } = dom.window;
  document.getElementById('workspace').hidden = false;
  document.getElementById('planner-section').hidden = true;
}

describe('UI: accessibility (axe-core)', () => {
  it('the planning form has no WCAG 2.1 AA violations', async () => {
    assert.deepEqual(await audit(), []);
  });

  it('every rendered plan panel has no violations', async () => {
    showWorkspace();
    render.renderPlan(await samplePlan(), handlers);
    render.appendChatMessage({ role: 'assistant', text: 'Done!', changes: ['Moved $10 from A to B.'] });
    const { document } = dom.window;
    for (const panel of document.querySelectorAll('[role="tabpanel"]')) panel.hidden = false;
    assert.deepEqual(await audit(), []);
  });

  it('labels every form control and task checkbox', () => {
    const { document } = dom.window;
    const controls = document.querySelectorAll('input:not([type="radio"]), select, textarea');
    for (const control of controls) {
      const label = document.querySelector(`label[for="${control.id}"]`);
      assert.ok(label, `missing label for #${control.id}`);
    }
  });

  it('wires tabs to their panels', () => {
    const { document } = dom.window;
    const tabs = document.querySelectorAll('[role="tab"]');
    assert.equal(tabs.length, 5);
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    }
  });
});

describe('UI: rendering', () => {
  it('renders AI text as text, never as HTML (XSS-safe)', async () => {
    const payload = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    const plan = await samplePlan({ summary: payload });
    plan.theme = { ...plan.theme, name: payload, decor: [payload] };
    plan.vendors = plan.vendors.map((v) => ({ ...v, service: payload }));
    render.renderPlan(plan, handlers);
    render.appendChatMessage({ role: 'assistant', text: payload });

    const { document } = dom.window;
    assert.equal(document.querySelectorAll('#results img, #results script, #chat-log img').length, 0);
    assert.ok(document.getElementById('panel-overview').textContent.includes(payload));
    assert.equal(dom.window.__pwned, undefined);
  });

  it('shows budget rows that add up and a total row', async () => {
    const plan = await samplePlan();
    render.renderBudget(plan);
    const rows = dom.window.document.querySelectorAll('#panel-budget tbody tr');
    assert.equal(rows.length, plan.budget.categories.length);
    assert.match(dom.window.document.querySelector('#panel-budget tfoot').textContent, /\$30,000/);
  });

  it('calls handlers when tasks are ticked and vendor status changes', async () => {
    const plan = await samplePlan();
    const calls = [];
    render.renderTimeline(plan, { onToggleTask: (...args) => calls.push(['task', ...args]) });
    render.renderVendors(plan, { onVendorStatus: (...args) => calls.push(['vendor', ...args]) });
    const { document, Event } = dom.window;

    const checkbox = document.querySelector('#panel-timeline input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    const select = document.querySelector('#panel-vendors select');
    select.value = 'booked';
    select.dispatchEvent(new Event('change'));

    const firstPhase = plan.timeline.phases[0];
    assert.deepEqual(calls[0], ['task', firstPhase.id, firstPhase.tasks[0].id, true]);
    assert.equal(calls[1][0], 'vendor');
    assert.equal(calls[1][2], 'booked');
  });

  it('labels template plans so users know AI was not used', async () => {
    render.renderOverview(await samplePlan());
    assert.match(dom.window.document.getElementById('panel-overview').textContent, /Template plan/);
    render.renderOverview(await samplePlan({ source: 'ai', model: 'gemini-test' }));
    assert.match(dom.window.document.getElementById('panel-overview').textContent, /Google Gemini \(gemini-test\)/);
  });
});

describe('UI: dom helper', () => {
  it('sets attributes, properties, styles and listeners', () => {
    let clicked = false;
    const el = h('button', { className: 'btn', 'aria-label': 'Go', disabled: true, style: { width: '10px' }, onclick: () => (clicked = true) }, 'Go', null, ['!']);
    assert.equal(el.className, 'btn');
    assert.equal(el.getAttribute('aria-label'), 'Go');
    assert.equal(el.disabled, true);
    assert.equal(el.style.width, '10px');
    assert.equal(el.textContent, 'Go!');
    el.disabled = false;
    el.click();
    assert.equal(clicked, true);
  });
});
