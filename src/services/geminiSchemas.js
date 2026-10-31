import { VENDOR_PRIORITIES } from '../constants.js';
import { PHASE_IDS } from './timeline.js';

/*
 * JSON Schemas passed to Gemini via `responseJsonSchema` (structured output).
 * Enums are built per request from the actual category/phase ids, so the model
 * cannot invent ids the budget engine does not know about.
 */

const str = (description) => ({ type: 'string', description });
const strList = (description, maxItems) => ({ type: 'array', items: { type: 'string' }, maxItems, description });

const vendorSchema = (categoryIds) => ({
  type: 'object',
  properties: {
    service: str('Vendor type, e.g. "Caterer", "Florist", "Event permit office"'),
    budgetCategory: { type: 'string', enum: categoryIds, description: 'Budget category that pays this vendor' },
    priority: { type: 'string', enum: [...VENDOR_PRIORITIES] },
    estimatedCost: { type: 'number', description: 'Estimated cost in the plan currency, whole units' },
    bookBy: { type: 'string', enum: [...PHASE_IDS], description: 'Phase by which to have this vendor booked' },
    questions: strList('Must-ask vetting questions for this vendor', 5),
  },
  required: ['service', 'budgetCategory', 'priority', 'estimatedCost', 'bookBy', 'questions'],
});

const themeSchema = {
  type: 'object',
  properties: {
    name: str('Short evocative theme name'),
    concept: str('Two-sentence creative concept'),
    palette: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        properties: { name: str('Colour name'), hex: str('Hex colour like #A1B2C3') },
        required: ['name', 'hex'],
      },
    },
    decor: strList('Concrete decor ideas', 6),
    invitation: str('Ready-to-use invitation wording, under 80 words'),
    activities: strList('Activities or agenda items fitting the vibe', 6),
    menuIdeas: strList('Menu or refreshment ideas', 5),
  },
  required: ['name', 'concept', 'palette', 'decor', 'invitation', 'activities', 'menuIdeas'],
};

const dayOfSchema = {
  type: 'array',
  maxItems: 14,
  items: {
    type: 'object',
    properties: { time: str('24h time HH:MM'), activity: str('What happens') },
    required: ['time', 'activity'],
  },
};

/** Schema for a freshly generated plan. */
export function buildPlanResponseSchema({ categoryIds, phaseIds }) {
  return {
    type: 'object',
    properties: {
      summary: str('2-3 sentence overview of the plan and its priorities'),
      allocationShifts: {
        type: 'array',
        maxItems: 3,
        description: 'Optional budget moves between existing categories, reflecting stated preferences',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', enum: categoryIds },
            to: { type: 'string', enum: categoryIds },
            percent: { type: 'number', description: 'Percent of the source category to move (1-20)' },
            reason: str('Why this shift fits the preferences'),
          },
          required: ['from', 'to', 'percent', 'reason'],
        },
      },
      categoryNotes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { categoryId: { type: 'string', enum: categoryIds }, note: str('Practical spending tip') },
          required: ['categoryId', 'note'],
        },
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            phaseId: { type: 'string', enum: phaseIds },
            tasks: strList('Sequenced, concrete checklist items', 7),
          },
          required: ['phaseId', 'tasks'],
        },
      },
      dayOf: dayOfSchema,
      vendors: { type: 'array', minItems: 5, maxItems: 10, items: vendorSchema(categoryIds) },
      theme: themeSchema,
    },
    required: ['summary', 'allocationShifts', 'categoryNotes', 'phases', 'dayOf', 'vendors', 'theme'],
  };
}

/**
 * Schema for a chat refinement turn. Gemini tends to populate every optional
 * field, so the list fields are required (and usually empty) and wholesale
 * replacements are gated behind explicit boolean flags.
 */
export function buildChatResponseSchema({ categoryIds, phaseIds }) {
  return {
    type: 'object',
    properties: {
      reply: str('Friendly, concise answer explaining what changed or what you suggest'),
      updateTheme: { type: 'boolean', description: 'true ONLY if the user explicitly asked to change the theme' },
      updateDayOf: { type: 'boolean', description: 'true ONLY if the user explicitly asked to change the day-of schedule' },
      budgetOperations: {
        type: 'array',
        maxItems: 5,
        description: 'Empty unless the user asked to change money, totals or guest count',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['move', 'set_total', 'set_guest_count'] },
            from: str(`Source category id (one of: ${categoryIds.join(', ')})`),
            to: str('Target category id, or a short new category label'),
            percent: { type: 'number', description: 'Percent of the source category to move' },
            amount: { type: 'number', description: 'Absolute amount (move) or new total (set_total)' },
            guestCount: { type: 'integer', description: 'New guest count (set_guest_count)' },
          },
          required: ['type'],
        },
      },
      addTasks: {
        type: 'array',
        maxItems: 8,
        description: 'New checklist items implied by the request (e.g. "book a backup marquee"); empty if none',
        items: {
          type: 'object',
          properties: { phaseId: { type: 'string', enum: phaseIds }, text: str('Checklist item') },
          required: ['phaseId', 'text'],
        },
      },
      addVendors: { type: 'array', maxItems: 4, items: vendorSchema(categoryIds), description: 'New vendors only; empty if none' },
      addActivities: strList('New activity ideas you suggested in the reply; empty if none', 6),
      theme: { ...themeSchema, description: 'Omit unless updateTheme is true' },
      dayOf: { ...dayOfSchema, description: 'Full replacement schedule; omit unless updateDayOf is true' },
    },
    required: ['reply', 'updateTheme', 'updateDayOf', 'budgetOperations', 'addTasks', 'addVendors', 'addActivities'],
  };
}
