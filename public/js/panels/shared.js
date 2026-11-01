import { h } from '../dom.js';

/**
 * Helpers shared by the plan panels.
 * @typedef {import('../../../src/types.js').Plan} Plan
 * @typedef {{onToggleTask: Function, onVendorStatus: Function, onCopy: Function}} PlanHandlers
 */

/** @param {string} id */
export const byId = (id) => document.getElementById(id);

/**
 * Decorative glyph, hidden from assistive technology so accessible names stay clean.
 * @param {string} glyph
 */
export const icon = (glyph) => h('span', { className: 'icon', 'aria-hidden': 'true' }, glyph);
