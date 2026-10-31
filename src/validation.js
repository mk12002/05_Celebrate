import { z } from 'zod';
import {
  CURRENCY_CODES,
  EVENT_TYPES,
  LIMITS,
  SETTINGS,
  VENDOR_PRIORITIES,
  VENDOR_STATUSES,
} from './constants.js';
import { daysUntil, parseIsoDate } from './utils.js';
import { PHASE_IDS } from './services/timeline.js';

/*
 * Two families of schemas live here:
 *  1. Strict request schemas: untrusted client input is rejected when it is
 *     malformed or oversized.
 *  2. Lenient AI-output schemas: model output is coerced, trimmed and
 *     truncated so one over-long string never sinks a whole plan.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

// Strips control characters (except newlines and tabs) from user text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanText = (max) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => s.replace(CONTROL_CHARS, '').trim())
    .pipe(z.string().max(max));

const isoDate = z.string().refine((value) => !Number.isNaN(parseIsoDate(value)), {
  message: 'Use a valid date in YYYY-MM-DD format',
});

// ---------------------------------------------------------------------------
// 1. Request schemas
// ---------------------------------------------------------------------------

const eventInputShape = {
  eventType: z.enum(EVENT_TYPES),
  title: cleanText(80).default(''),
  budget: z.number().finite().min(LIMITS.minBudget).max(LIMITS.maxBudget),
  currency: z.enum(CURRENCY_CODES).default('USD'),
  guestCount: z.number().int().min(1).max(LIMITS.maxGuests),
  eventDate: isoDate,
  location: cleanText(100).default(''),
  setting: z.enum(SETTINGS).default('mixed'),
  vibe: cleanText(120).default(''),
  preferences: cleanText(600).default(''),
};

/** Input for creating a new plan; the date must be upcoming. */
export const eventInputSchema = z.strictObject(eventInputShape).superRefine((input, ctx) => {
  const lead = daysUntil(input.eventDate);
  // One day of slack absorbs time-zone differences between browser and server.
  if (lead < -1) {
    ctx.addIssue({ code: 'custom', path: ['eventDate'], message: 'Event date must be today or later' });
  } else if (lead > LIMITS.maxLeadDays) {
    ctx.addIssue({ code: 'custom', path: ['eventDate'], message: 'Event date must be within 3 years' });
  }
});

const categorySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  label: cleanText(60),
  amount: z.number().finite().min(0).max(LIMITS.maxBudget),
  percent: z.number().finite().min(0).max(100),
  note: cleanText(300).default(''),
});

const themeShape = {
  name: cleanText(80),
  concept: cleanText(600),
  palette: z.array(z.strictObject({ name: cleanText(40), hex: z.string().regex(HEX_COLOR) })).max(8),
  decor: z.array(cleanText(240)).max(12),
  invitation: cleanText(900),
  activities: z.array(cleanText(240)).max(20),
  menuIdeas: z.array(cleanText(200)).max(12),
};

/** A full plan as round-tripped by the browser for chat refinement. */
export const planSchema = z.strictObject({
  id: z.string().max(64),
  createdAt: z.string().max(40),
  source: z.enum(['ai', 'template']),
  model: z.string().max(60).default(''),
  input: z.strictObject(eventInputShape),
  summary: cleanText(1200),
  budget: z.strictObject({
    currency: z.enum(CURRENCY_CODES),
    total: z.number().finite().min(0).max(LIMITS.maxBudget),
    perGuest: z.number().finite().min(0),
    categories: z.array(categorySchema).min(1).max(LIMITS.maxCategories),
    warnings: z.array(cleanText(400)).max(10),
  }),
  timeline: z.strictObject({
    phases: z
      .array(
        z.strictObject({
          id: z.enum(PHASE_IDS),
          label: cleanText(40),
          dueDate: isoDate,
          startsNow: z.boolean(),
          tasks: z
            .array(z.strictObject({ id: z.string().max(64), text: cleanText(300), done: z.boolean() }))
            .max(30),
        }),
      )
      .max(PHASE_IDS.length),
    dayOf: z.array(z.strictObject({ time: z.string().regex(TIME_24H), activity: cleanText(240) })).max(30),
  }),
  vendors: z
    .array(
      z.strictObject({
        id: z.string().max(64),
        service: cleanText(80),
        budgetCategory: z.string().max(48),
        priority: z.enum(VENDOR_PRIORITIES),
        status: z.enum(VENDOR_STATUSES),
        estimatedCost: z.number().finite().min(0).max(LIMITS.maxBudget),
        bookBy: z.enum(PHASE_IDS),
        questions: z.array(cleanText(240)).max(8),
      }),
    )
    .max(25),
  theme: z.strictObject(themeShape),
});

export const chatRequestSchema = z.strictObject({
  plan: planSchema,
  message: cleanText(LIMITS.chatMessageLength).pipe(z.string().min(1, 'Message cannot be empty')),
  history: z
    .array(z.strictObject({ role: z.enum(['user', 'assistant']), text: cleanText(1500) }))
    .max(LIMITS.chatHistoryItems)
    .default([]),
});

// ---------------------------------------------------------------------------
// 2. Lenient AI-output schemas
// ---------------------------------------------------------------------------

const aiText = (max) => z.coerce.string().transform((s) => s.replace(CONTROL_CHARS, '').trim().slice(0, max));
const aiList = (item, max) => z.array(item).transform((items) => items.slice(0, max));
const aiTextList = (itemMax, max) =>
  aiList(aiText(itemMax), max).transform((items) => items.filter(Boolean));
const aiNumber = z.coerce.number().transform((n) => (Number.isFinite(n) ? Math.max(0, n) : 0));

const aiVendor = z.object({
  service: aiText(80),
  budgetCategory: aiText(48),
  priority: z.enum(VENDOR_PRIORITIES).catch('medium'),
  estimatedCost: aiNumber,
  bookBy: z.enum(PHASE_IDS).catch('m1'),
  questions: aiTextList(240, 6),
});

const aiTheme = z.object({
  name: aiText(80),
  concept: aiText(600),
  palette: aiList(z.object({ name: aiText(40), hex: z.string().trim() }), 8).transform((colors) =>
    colors.filter((c) => HEX_COLOR.test(c.hex)),
  ),
  decor: aiTextList(240, 10),
  invitation: aiText(900),
  activities: aiTextList(240, 10),
  menuIdeas: aiTextList(200, 8),
});

const aiDayOf = aiList(z.object({ time: z.string().trim(), activity: aiText(240) }), 20).transform((items) =>
  items.filter((item) => TIME_24H.test(item.time) && item.activity),
);

const aiBudgetOperation = z.object({
  type: z.enum(['move', 'set_total', 'set_guest_count']),
  from: aiText(60).optional(),
  to: aiText(60).optional(),
  percent: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  guestCount: z.coerce.number().optional(),
});

/** Shape returned by Gemini when generating a new plan. */
export const aiPlanSchema = z.object({
  summary: aiText(1200),
  allocationShifts: aiList(
    z.object({ from: aiText(48), to: aiText(48), percent: z.coerce.number(), reason: aiText(200).default('') }),
    3,
  ).default([]),
  categoryNotes: aiList(z.object({ categoryId: aiText(48), note: aiText(300) }), LIMITS.maxCategories).default([]),
  phases: aiList(z.object({ phaseId: aiText(8), tasks: aiTextList(300, 8) }), PHASE_IDS.length),
  dayOf: aiDayOf,
  vendors: aiList(aiVendor, 12),
  theme: aiTheme,
});

/** Shape returned by Gemini when refining a plan through chat. */
export const aiChatSchema = z.object({
  reply: aiText(1500),
  updateTheme: z.boolean().catch(false).default(false),
  updateDayOf: z.boolean().catch(false).default(false),
  budgetOperations: aiList(aiBudgetOperation, 5).default([]),
  addTasks: aiList(z.object({ phaseId: aiText(8), text: aiText(300) }), 10).default([]),
  addVendors: aiList(aiVendor, 5).default([]),
  addActivities: aiTextList(240, 8).default([]),
  theme: aiTheme.optional().catch(undefined),
  dayOf: aiDayOf.optional().catch(undefined),
});

/** Flattens Zod issues into `{ field, message }` pairs for API responses. */
export function formatIssues(error) {
  return error.issues.slice(0, 10).map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
