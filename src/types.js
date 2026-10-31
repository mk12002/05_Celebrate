/*
 * Shared JSDoc type definitions, checked by `npm run typecheck` (TypeScript in
 * checkJs mode). Runtime validation of the same shapes lives in validation.js.
 */

/**
 * @typedef {'wedding' | 'birthday' | 'community'} EventType
 * @typedef {'critical' | 'high' | 'medium' | 'low'} VendorPriority
 * @typedef {'to-research' | 'contacted' | 'quoted' | 'booked'} VendorStatus
 */

/**
 * @typedef {object} EventInput
 * @property {EventType} eventType
 * @property {string} title
 * @property {number} budget
 * @property {string} currency
 * @property {number} guestCount
 * @property {string} eventDate ISO date (YYYY-MM-DD)
 * @property {string} location
 * @property {'indoor' | 'outdoor' | 'mixed'} setting
 * @property {string} vibe
 * @property {string} preferences
 */

/**
 * @typedef {object} BudgetCategory
 * @property {string} id
 * @property {string} label
 * @property {number} amount whole currency units
 * @property {number} percent share of the total, one decimal
 * @property {string} note
 */

/**
 * @typedef {object} Budget
 * @property {string} currency
 * @property {number} total
 * @property {number} perGuest
 * @property {BudgetCategory[]} categories
 * @property {string[]} warnings
 */

/**
 * @typedef {object} BudgetOperation
 * @property {'move' | 'set_total' | 'set_guest_count'} type
 * @property {string} [from]
 * @property {string} [to]
 * @property {number} [percent]
 * @property {number} [amount]
 * @property {number} [guestCount]
 */

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} text
 * @property {boolean} done
 */

/**
 * @typedef {object} Phase
 * @property {string} id
 * @property {string} label
 * @property {string} dueDate
 * @property {boolean} startsNow
 * @property {Task[]} tasks
 */

/**
 * @typedef {object} Vendor
 * @property {string} id
 * @property {string} service
 * @property {string} budgetCategory
 * @property {VendorPriority} priority
 * @property {VendorStatus} status
 * @property {number} estimatedCost
 * @property {string} bookBy
 * @property {string[]} questions
 */

/**
 * @typedef {object} Theme
 * @property {string} name
 * @property {string} concept
 * @property {{name: string, hex: string}[]} palette
 * @property {string[]} decor
 * @property {string} invitation
 * @property {string[]} activities
 * @property {string[]} menuIdeas
 */

/**
 * @typedef {object} Plan
 * @property {string} id
 * @property {string} createdAt
 * @property {'ai' | 'template'} source
 * @property {string} model
 * @property {EventInput} input
 * @property {string} summary
 * @property {Budget} budget
 * @property {{phases: Phase[], dayOf: {time: string, activity: string}[]}} timeline
 * @property {Vendor[]} vendors
 * @property {Theme} theme
 */

/**
 * @typedef {object} AiClient
 * @property {string} model
 * @property {(request: {system: string, prompt: string, schema: object, temperature?: number}) => Promise<unknown>} generateJson
 */

export {};
