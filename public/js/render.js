import { setStyles } from './dom.js';
import { EVENT_LABELS, formatDate } from './format.js';
import { renderBudget } from './panels/budget.js';
import { renderOverview } from './panels/overview.js';
import { byId } from './panels/shared.js';
import { renderTheme } from './panels/theme.js';
import { renderTimeline } from './panels/timeline.js';
import { renderVendors } from './panels/vendors.js';

/*
 * Entry point for drawing a plan. Each tab panel lives in its own module under
 * ./panels; this file renders the shared header and delegates to them.
 */

export { appendChatMessage } from './panels/chat.js';
export { CHART_COLORS, donutGradient, renderBudget } from './panels/budget.js';
export { renderOverview } from './panels/overview.js';
export { renderTheme } from './panels/theme.js';
export { renderTimeline } from './panels/timeline.js';
export { renderVendors } from './panels/vendors.js';

/**
 * @typedef {import('./panels/shared.js').Plan} Plan
 * @typedef {import('./panels/shared.js').PlanHandlers} PlanHandlers
 */

const SETTING_LABELS = Object.freeze({ indoor: 'Indoor', outdoor: 'Outdoor', mixed: 'Indoor & outdoor' });
const THEME_STRIPE_COLORS = 5;

/** @param {Plan} plan */
function renderHeader(plan) {
  const { input } = plan;
  const eventLabel = EVENT_LABELS[input.eventType];

  byId('results-eyebrow').textContent = `${eventLabel} · ${formatDate(input.eventDate)}`;
  byId('results-title').textContent = input.title || `Your ${eventLabel.toLowerCase()} plan`;
  byId('results-meta').textContent = [
    input.location,
    `${input.guestCount.toLocaleString()} guests`,
    SETTING_LABELS[input.setting],
  ]
    .filter(Boolean)
    .join(' · ');

  // The AI theme's palette tints the stripe across the top of the plan.
  const palette = plan.theme?.palette ?? [];
  setStyles(
    byId('results'),
    Object.fromEntries(palette.slice(0, THEME_STRIPE_COLORS).map((c, i) => [`--theme-${i + 1}`, c.hex])),
  );
}

/**
 * Renders the plan header and every tab panel.
 * @param {Plan} plan
 * @param {PlanHandlers} handlers
 */
export function renderPlan(plan, handlers) {
  renderHeader(plan);
  renderOverview(plan);
  renderBudget(plan);
  renderTimeline(plan, handlers);
  renderVendors(plan, handlers);
  renderTheme(plan, handlers);
}
