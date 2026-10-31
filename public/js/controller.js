import { ApiError } from './api.js';
import { todayIso, validateEventForm } from './format.js';
import { buildIcs } from './ics.js';
import { appendChatMessage, renderPlan } from './render.js';

const MAX_HISTORY = 8;
const PROGRESS_INTERVAL_MS = 4000;

/** Messages shown while Gemini works, so a 20-second wait never looks frozen. */
export const PROGRESS_STEPS = Object.freeze([
  'Allocating your budget across categories…',
  'Drafting the countdown timeline…',
  'Shortlisting vendors and vetting questions…',
  'Designing your theme and palette…',
  'Polishing the final plan…',
]);

/**
 * @typedef {{role: 'user' | 'assistant', text: string, changes?: string[]}} ChatMessage
 */

/**
 * @typedef {object} ControllerDeps
 * @property {{getHealth: Function, createPlan: Function, refinePlan: Function}} api
 * @property {{loadSession: Function, saveSession: Function, clearSession: Function}} storage
 * @property {Document} [doc]
 * @property {(text: string) => Promise<void>} [copyText]
 * @property {(blob: Blob, filename: string) => void} [download]
 * @property {() => void} [print]
 * @property {typeof setInterval} [setInterval]
 * @property {typeof clearInterval} [clearInterval]
 */

/**
 * Wires the page together. All browser side effects (network, storage,
 * clipboard, downloads, timers) are injected, so the full UI flow is tested
 * in jsdom.
 *
 * @param {ControllerDeps} deps
 */
export function createController({
  api,
  storage,
  doc = document,
  copyText = (text) => navigator.clipboard.writeText(text),
  download = defaultDownload,
  print = () => window.print(),
  setInterval: startTimer = setInterval,
  clearInterval: stopTimer = clearInterval,
}) {
  // Elements are looked up by known ids from index.html, so a loose type is safe here.
  const $ = (id) => /** @type {any} */ (doc.getElementById(id));

  /** @type {{plan: import('../../src/types.js').Plan | null, chat: ChatMessage[], aiEnabled: boolean}} */
  const state = { plan: null, chat: [], aiEnabled: false };

  const handlers = {
    onToggleTask(phaseId, taskId, done) {
      const task = state.plan.timeline.phases.find((p) => p.id === phaseId)?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      task.done = done;
      persistAndRender();
    },
    onVendorStatus(vendorId, status) {
      const vendor = state.plan.vendors.find((v) => v.id === vendorId);
      if (!vendor) return;
      vendor.status = status;
      persistAndRender();
      announce(`${vendor.service} marked as ${status.replace('-', ' ')}.`);
    },
    async onCopy(text) {
      try {
        await copyText(text);
        announce('Invitation text copied to clipboard.');
      } catch {
        announce('Copy failed. Select the text and copy it manually.');
      }
    },
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function announce(message) {
    $('status').textContent = message;
  }

  function persist() {
    storage.saveSession({ plan: state.plan, chat: state.chat });
  }

  /** Re-renders while restoring focus to the control the user just used. */
  function persistAndRender() {
    const activeId = doc.activeElement?.id;
    persist();
    renderPlan(state.plan, handlers);
    if (activeId) $(activeId)?.focus();
  }

  function setBusy(button, busy, busyLabel) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    const label = button.querySelector('.btn-label') ?? button;
    if (busy) {
      button.dataset.label = label.textContent;
      label.textContent = busyLabel;
    } else if (button.dataset.label) {
      label.textContent = button.dataset.label;
    }
  }

  function showWorkspace(show) {
    $('workspace').hidden = !show;
    $('planner-section').hidden = show;
  }

  function showFallbackNotice() {
    const notice = $('fallback-notice');
    notice.hidden = !(state.plan?.source === 'template' && state.aiEnabled);
  }

  // -------------------------------------------------------------------------
  // Plan form
  // -------------------------------------------------------------------------

  function readForm(form) {
    // Use the document's own window so the controller also runs in jsdom.
    const data = new doc.defaultView.FormData(form);
    const text = (name) => String(data.get(name) ?? '').trim();
    return {
      eventType: text('eventType'),
      title: text('title'),
      eventDate: text('eventDate'),
      guestCount: Number(text('guestCount')),
      budget: Number(text('budget')),
      currency: text('currency'),
      location: text('location'),
      setting: text('setting'),
      vibe: text('vibe'),
      preferences: text('preferences'),
    };
  }

  function fillForm(form, input) {
    for (const [name, value] of Object.entries(input)) {
      const field = form.elements.namedItem(name);
      if (!field) continue;
      if (field instanceof doc.defaultView.RadioNodeList) {
        for (const radio of field) /** @type {HTMLInputElement} */ (radio).checked = /** @type {HTMLInputElement} */ (radio).value === value;
      } else {
        /** @type {HTMLInputElement} */ (field).value = String(value);
      }
    }
  }

  function showFieldErrors(form, errors) {
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');

    let first = null;
    for (const [name, message] of Object.entries(errors)) {
      const input = form.elements.namedItem(name);
      if (!input || !('setAttribute' in input)) continue;
      input.setAttribute('aria-invalid', 'true');
      const slot = $(`${name}-error`);
      if (slot) slot.textContent = message;
      first ??= input;
    }
    first?.focus();
    return Boolean(first);
  }

  /** Cycles progress messages until `stop()` is called. */
  function startProgress() {
    let step = 0;
    announce(PROGRESS_STEPS[0]);
    const timer = startTimer(() => {
      step = Math.min(step + 1, PROGRESS_STEPS.length - 1);
      announce(PROGRESS_STEPS[step]);
    }, PROGRESS_INTERVAL_MS);
    return () => stopTimer(timer);
  }

  async function onPlanSubmit(event) {
    event.preventDefault();
    const form = $('plan-form');
    const values = readForm(form);
    const errorBox = $('form-error');
    errorBox.hidden = true;

    if (showFieldErrors(form, validateEventForm(values))) {
      announce('Please fix the highlighted fields.');
      return;
    }

    const button = $('generate-btn');
    setBusy(button, true, 'Planning…');
    form.setAttribute('aria-busy', 'true');
    const stopProgress = startProgress();

    try {
      const { plan } = await api.createPlan(values);
      state.plan = plan;
      state.chat = [
        { role: 'assistant', text: 'Your plan is ready! Ask me to adjust anything: budget splits, timing, vendors or the theme.' },
      ];
      persist();
      renderChat();
      renderPlan(plan, handlers);
      showFallbackNotice();
      showWorkspace(true);
      selectTab('tab-overview');
      announce('Your plan is ready.');
      $('results-title').focus();
    } catch (error) {
      const fieldErrors = Object.fromEntries((error.details ?? []).map((d) => [d.field, d.message]));
      showFieldErrors(form, fieldErrors);
      errorBox.textContent = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      errorBox.hidden = false;
      announce('');
    } finally {
      stopProgress();
      setBusy(button, false);
      form.removeAttribute('aria-busy');
    }
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  function renderChat() {
    $('chat-log').replaceChildren();
    for (const message of state.chat) appendChatMessage(message);
  }

  async function sendChat(message) {
    const text = message.trim();
    if (!text || !state.plan) return;

    const input = $('chat-input');
    const button = $('chat-send');
    const history = state.chat.slice(-MAX_HISTORY).map(({ role, text: t }) => ({ role, text: t.slice(0, 1500) }));

    /** @type {ChatMessage} */
    const sent = { role: 'user', text };
    state.chat.push(sent);
    appendChatMessage(sent);
    input.value = '';
    setBusy(button, true, 'Thinking…');
    $('results').setAttribute('aria-busy', 'true');
    announce('The assistant is updating your plan.');

    try {
      const result = await api.refinePlan(state.plan, text, history);
      state.plan = result.plan;
      /** @type {ChatMessage} */
      const reply = { role: 'assistant', text: result.reply, changes: result.changes };
      state.chat.push(reply);
      appendChatMessage(reply);
      persist();
      renderPlan(state.plan, handlers);
      announce(result.changes.length ? `Plan updated: ${result.changes.join(' ')}` : 'Reply received.');
    } catch (error) {
      /** @type {ChatMessage} */
      const reply = { role: 'assistant', text: `Sorry, I couldn't apply that: ${error.message}` };
      state.chat.push(reply);
      appendChatMessage(reply);
      input.value = text;
      announce(reply.text);
    } finally {
      setBusy(button, false);
      $('results').removeAttribute('aria-busy');
      input.focus();
    }
  }

  // -------------------------------------------------------------------------
  // Tabs (WAI-ARIA tabs pattern with arrow-key navigation)
  // -------------------------------------------------------------------------

  function tabs() {
    return /** @type {HTMLElement[]} */ ([...doc.querySelectorAll('[role="tab"]')]);
  }

  function selectTab(tabId) {
    for (const tab of tabs()) {
      const selected = tab.id === tabId;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    }
  }

  function onTabKeydown(event) {
    const all = tabs();
    const index = all.indexOf(event.target);
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: all.length - 1 };
    if (index < 0 || !(event.key in moves)) return;
    event.preventDefault();
    const next = all[(moves[event.key] + all.length) % all.length];
    selectTab(next.id);
    next.focus();
  }

  // -------------------------------------------------------------------------
  // Toolbar
  // -------------------------------------------------------------------------

  function fileStem() {
    return (state.plan.input.title || state.plan.input.eventType).replace(/[^\w-]+/g, '-').toLowerCase();
  }

  function downloadPlan() {
    download(new Blob([JSON.stringify(state.plan, null, 2)], { type: 'application/json' }), `${fileStem()}-plan.json`);
    announce('Plan downloaded.');
  }

  function downloadCalendar() {
    download(new Blob([buildIcs(state.plan)], { type: 'text/calendar' }), `${fileStem()}-milestones.ics`);
    announce('Calendar file downloaded. Open it to add every milestone to your calendar.');
  }

  function editDetails() {
    fillForm($('plan-form'), state.plan.input);
    showWorkspace(false);
    $('form-title').textContent = 'Edit details and regenerate';
    $('title').focus();
  }

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------

  async function showAiStatus() {
    const badge = $('ai-status');
    try {
      const health = await api.getHealth();
      state.aiEnabled = Boolean(health.ai);
      badge.textContent = health.ai ? 'Gemini online' : 'AI offline: template mode';
      badge.classList.add(health.ai ? 'badge-ok' : 'badge-warn');
    } catch {
      badge.textContent = 'Server unreachable';
      badge.classList.add('badge-warn');
    }
    showFallbackNotice();
  }

  function restoreSession() {
    const session = storage.loadSession();
    if (!session) return false;
    try {
      state.plan = session.plan;
      state.chat = Array.isArray(session.chat) ? session.chat : [];
      renderPlan(state.plan, handlers);
      renderChat();
      showWorkspace(true);
      return true;
    } catch {
      // Stored data from an older version: start fresh.
      storage.clearSession();
      state.plan = null;
      state.chat = [];
      showWorkspace(false);
      return false;
    }
  }

  function init(now = new Date()) {
    const dateInput = $('eventDate');
    dateInput.min = todayIso(now);

    $('plan-form').addEventListener('submit', onPlanSubmit);
    $('chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      sendChat($('chat-input').value);
    });
    $('chat-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('chat-form').requestSubmit();
      }
    });
    for (const chip of doc.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => sendChat(chip.textContent));
    }
    for (const tab of tabs()) {
      tab.addEventListener('click', () => selectTab(tab.id));
      tab.addEventListener('keydown', onTabKeydown);
    }
    $('edit-btn').addEventListener('click', editDetails);
    $('download-btn').addEventListener('click', downloadPlan);
    $('calendar-btn').addEventListener('click', downloadCalendar);
    $('print-btn').addEventListener('click', print);

    if (!restoreSession()) {
      // Sensible default date: three months from today.
      const inThreeMonths = new Date(now);
      inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);
      dateInput.value = todayIso(inThreeMonths);
    }
    return showAiStatus();
  }

  return { init, state, sendChat, selectTab };
}

function defaultDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
