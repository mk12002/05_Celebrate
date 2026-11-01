import { createHash, randomUUID } from 'node:crypto';
import { applyBudgetOperations, computeBudget, finalizeBudget, findCategory } from './budget.js';
import { templateChatResponse, templatePlanContent } from './fallback.js';
import { buildChatResponseSchema, buildPlanResponseSchema } from './geminiSchemas.js';
import { CHAT_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT, buildChatPrompt, buildPlanPrompt } from './prompts.js';
import { computePhases } from './timeline.js';
import { TtlCache } from './cache.js';
import { aiChatSchema, aiPlanSchema } from '../validation.js';
import { daysUntil, startOfUtcDay, toIsoDate } from '../utils.js';

/** Largest share of a category Gemini may shift during initial generation. */
const MAX_INITIAL_SHIFT_PERCENT = 20;
const MAX_TASKS_PER_PHASE = 15;
const MAX_VENDORS = 25;
const MAX_ACTIVITIES = 20;

/**
 * Orchestrates plan generation and refinement.
 *
 * Gemini (when configured) supplies the creative and judgement-heavy parts;
 * deterministic code owns the arithmetic and the plan structure. Any AI
 * failure degrades gracefully to template content instead of a 500.
 *
 * @param {{ai?: {model: string, generateJson: Function} | null, cache?: TtlCache,
 *          now?: () => Date, logger?: Pick<Console, 'warn'>}} deps
 */
export function createPlanner({ ai = null, cache = new TtlCache(), now = () => new Date(), logger = console } = {}) {
  /** Calls Gemini and validates the result; returns null on any failure. */
  async function askAi(request, schema) {
    if (!ai) return null;
    try {
      const parsed = schema.safeParse(await ai.generateJson(request));
      if (parsed.success) return parsed.data;
      logger.warn('[planner] AI response failed validation', parsed.error.issues.slice(0, 3));
    } catch (error) {
      logger.warn('[planner] AI request failed:', error?.message ?? error);
    }
    return null;
  }

  /** In-flight generations, so concurrent identical requests share one AI call. */
  const pending = new Map();

  /** Copy of a shared plan with its own identity. */
  const freshCopy = (plan) => ({ ...structuredClone(plan), id: randomUUID(), createdAt: now().toISOString() });

  /**
   * Generates a complete plan for a validated event input.
   * Served from cache when possible; identical concurrent requests are coalesced.
   * @param {import('../types.js').EventInput} input
   * @returns {Promise<import('../types.js').Plan>}
   */
  async function generatePlan(input) {
    const cacheKey = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached) return freshCopy(cached);

    let job = pending.get(cacheKey);
    if (!job) {
      job = buildPlan(input, cacheKey).finally(() => pending.delete(cacheKey));
      pending.set(cacheKey, job);
    }
    return freshCopy(await job);
  }

  async function buildPlan(input, cacheKey) {
    const today = now();
    const lead = Math.max(0, daysUntil(input.eventDate, today));
    const baseline = computeBudget(input, { daysUntil: lead });
    const phases = computePhases(input.eventDate, today);
    const context = { budget: baseline, phases, daysUntil: lead, today: toIsoDate(startOfUtcDay(today)) };

    const aiContent = await askAi(
      {
        system: PLAN_SYSTEM_PROMPT,
        prompt: buildPlanPrompt(input, context),
        schema: buildPlanResponseSchema({
          categoryIds: baseline.categories.map((c) => c.id),
          phaseIds: phases.map((p) => p.id),
        }),
        temperature: 0.8,
      },
      aiPlanSchema,
    );
    const content = aiContent ?? aiPlanSchema.parse(templatePlanContent(input, context));
    const plan = assemblePlan(input, context, content, aiContent ? 'ai' : 'template');

    if (aiContent) cache.set(cacheKey, plan);
    return plan;
  }

  function assemblePlan(input, { budget: baseline, phases }, content, source) {
    // Preference-driven shifts are bounded and never drain the buffer.
    const shifts = content.allocationShifts
      .filter((s) => s.from !== 'contingency' && s.from !== s.to)
      .map((s) => ({
        type: 'move',
        from: s.from,
        to: s.to,
        percent: Math.min(Math.abs(s.percent), MAX_INITIAL_SHIFT_PERCENT),
      }));
    const shifted = applyBudgetOperations(baseline, shifts, input).budget;
    const reasons = new Map(content.allocationShifts.map((s) => [s.to, s.reason]));
    const notes = new Map(content.categoryNotes.map((n) => [n.categoryId, n.note]));
    const categories = shifted.categories.map((c) => ({
      ...c,
      note: [notes.get(c.id), reasons.get(c.id)].filter(Boolean).join(' ').slice(0, 300),
    }));

    const fallback = templatePlanContent(input, { budget: shifted, phases });
    const tasksFor = (phaseId, draft) => draft.phases.find((p) => p.phaseId === phaseId)?.tasks ?? [];

    return {
      id: randomUUID(),
      createdAt: now().toISOString(),
      source,
      model: source === 'ai' ? ai.model : '',
      input,
      summary: content.summary,
      budget: { ...shifted, categories },
      timeline: {
        phases: phases.map((phase) => {
          const aiTasks = tasksFor(phase.id, content);
          const tasks = aiTasks.length ? aiTasks : tasksFor(phase.id, fallback);
          return { ...phase, tasks: tasks.map((text) => ({ id: randomUUID(), text, done: false })) };
        }),
        dayOf: content.dayOf.length ? content.dayOf : fallback.dayOf,
      },
      vendors: normaliseVendors(content.vendors.length ? content.vendors : fallback.vendors, shifted, phases),
      theme: content.theme.palette.length ? content.theme : { ...content.theme, palette: fallback.theme.palette },
    };
  }

  /**
   * Applies a chat message to an existing plan.
   * @returns {Promise<{plan: object, reply: string, changes: string[], source: string}>}
   */
  async function refinePlan(plan, message, history = []) {
    const categoryIds = plan.budget.categories.map((c) => c.id);
    const phaseIds = plan.timeline.phases.map((p) => p.id);
    const aiResult = await askAi(
      {
        system: CHAT_SYSTEM_PROMPT,
        prompt: buildChatPrompt(plan, message, history),
        schema: buildChatResponseSchema({ categoryIds, phaseIds }),
        temperature: 0.5,
      },
      aiChatSchema,
    );
    const result = aiResult ?? aiChatSchema.parse(templateChatResponse(message));
    const { plan: updated, changes } = applyChatResult(plan, result);
    return { plan: updated, reply: result.reply, changes, source: aiResult ? 'ai' : 'template' };
  }

  return { generatePlan, refinePlan };
}

/** Maps vendor drafts onto real budget categories and phases. */
function normaliseVendors(vendors, budget, phases) {
  const phaseIds = new Set(phases.map((p) => p.id));
  const firstPhase = phases[0]?.id ?? 'day';
  return vendors.slice(0, MAX_VENDORS).map((v) => {
    const category = findCategory(budget.categories, v.budgetCategory);
    return {
      id: randomUUID(),
      service: v.service || 'Vendor',
      budgetCategory: category?.id ?? 'contingency',
      priority: v.priority,
      status: 'to-research',
      estimatedCost: Math.round(Math.min(v.estimatedCost, category?.amount ?? v.estimatedCost)),
      bookBy: phaseIds.has(v.bookBy) ? v.bookBy : firstPhase,
      questions: v.questions,
    };
  });
}

/** @param {number} count @param {string} one @param {string} many */
const plural = (count, one, many) => (count === 1 ? one : many);

/** Applies budget operations; client-sent totals are re-derived first, never trusted. */
function applyBudgetChanges(next, result, changes) {
  next.budget = finalizeBudget(next.budget, next.input);
  const budgetResult = applyBudgetOperations(next.budget, result.budgetOperations, {
    eventType: next.input.eventType,
    guestCount: next.input.guestCount,
  });
  next.budget = budgetResult.budget;
  next.input.guestCount = budgetResult.guestCount;
  next.input.budget = next.budget.total;
  changes.push(...budgetResult.changes);
}

function addTasks(next, result, changes) {
  const { phases } = next.timeline;
  let added = 0;
  for (const { phaseId, text } of result.addTasks) {
    const phase = phases.find((p) => p.id === phaseId) ?? phases[0];
    if (!phase || !text || phase.tasks.length >= MAX_TASKS_PER_PHASE) continue;
    phase.tasks.push({ id: randomUUID(), text, done: false });
    added += 1;
  }
  if (added) changes.push(`Added ${added} checklist ${plural(added, 'task', 'tasks')}.`);
}

function addVendors(next, result, changes) {
  if (!result.addVendors.length) return;
  const room = Math.max(0, MAX_VENDORS - next.vendors.length);
  const added = normaliseVendors(result.addVendors.slice(0, room), next.budget, next.timeline.phases);
  next.vendors.push(...added);
  if (added.length) {
    changes.push(`Added ${plural(added.length, 'vendor', 'vendors')}: ${added.map((v) => v.service).join(', ')}.`);
  }
}

// The theme and day-of schedule are replaced only when the model flags an explicit request.
function replaceTheme(next, result, changes) {
  if (!result.updateTheme || !result.theme?.palette.length) return;
  next.theme = result.theme;
  changes.push(`Updated the theme to "${result.theme.name}".`);
}

function replaceDayOf(next, result, changes) {
  if (!result.updateDayOf || !result.dayOf?.length) return;
  next.timeline.dayOf = result.dayOf;
  changes.push('Updated the day-of schedule.');
}

function addActivities(next, result, changes) {
  const known = new Set(next.theme.activities.map((a) => a.toLowerCase()));
  const fresh = result.addActivities.filter((a) => !known.has(a.toLowerCase()));
  if (!fresh.length) return;
  next.theme.activities = [...next.theme.activities, ...fresh].slice(0, MAX_ACTIVITIES);
  changes.push(`Added ${fresh.length} ${plural(fresh.length, 'activity', 'activities')}.`);
}

/** Keeps vendor bookings pointing at budget categories that still exist. */
function reconcileVendorCategories(next) {
  const categoryIds = new Set(next.budget.categories.map((c) => c.id));
  for (const vendor of next.vendors) {
    if (!categoryIds.has(vendor.budgetCategory)) vendor.budgetCategory = 'contingency';
  }
}

/**
 * Pure function: merges a validated chat result into a plan and reports
 * human-readable change descriptions.
 */
export function applyChatResult(plan, result) {
  const next = structuredClone(plan);
  const changes = [];

  applyBudgetChanges(next, result, changes);
  addTasks(next, result, changes);
  addVendors(next, result, changes);
  replaceTheme(next, result, changes);
  addActivities(next, result, changes);
  replaceDayOf(next, result, changes);
  reconcileVendorCategories(next);

  return { plan: next, changes };
}
