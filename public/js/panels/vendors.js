import { h, replaceChildren } from '../dom.js';
import { PRIORITY_LABELS, STATUS_LABELS, formatMoney } from '../format.js';
import { byId } from './shared.js';

/**
 * @typedef {import('./shared.js').Plan} Plan
 * @typedef {import('./shared.js').PlanHandlers} PlanHandlers
 * @typedef {import('../../../src/types.js').Vendor} Vendor
 */

const PRIORITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

/**
 * @param {Vendor} vendor
 * @param {Plan} plan
 * @param {PlanHandlers['onVendorStatus']} onVendorStatus
 */
function vendorCard(vendor, plan, onVendorStatus) {
  const selectId = `status-${vendor.id}`;
  const phaseLabel = plan.timeline.phases.find((p) => p.id === vendor.bookBy)?.label ?? vendor.bookBy;
  const categoryLabel =
    plan.budget.categories.find((c) => c.id === vendor.budgetCategory)?.label ?? vendor.budgetCategory;

  return h(
    'li',
    { className: `vendor priority-${vendor.priority} status-${vendor.status}` },
    h(
      'div',
      { className: 'vendor-head' },
      h('h4', null, vendor.service),
      h('span', { className: `badge badge-${vendor.priority}` }, PRIORITY_LABELS[vendor.priority]),
    ),
    h(
      'p',
      { className: 'vendor-cost' },
      formatMoney(vendor.estimatedCost, plan.budget.currency),
      h('span', { className: 'muted' }, ' estimate'),
    ),
    h(
      'dl',
      { className: 'vendor-meta' },
      h('dt', null, 'Budget line'),
      h('dd', null, categoryLabel),
      h('dt', null, 'Book by'),
      h('dd', null, phaseLabel),
    ),
    h('label', { for: selectId, className: 'inline-label' }, 'Status'),
    h(
      'select',
      { id: selectId, onchange: (event) => onVendorStatus(vendor.id, event.target.value) },
      Object.entries(STATUS_LABELS).map(([value, label]) =>
        h('option', { value, selected: value === vendor.status }, label),
      ),
    ),
    vendor.questions.length
      ? h(
          'details',
          null,
          h('summary', null, `Questions to ask (${vendor.questions.length})`),
          h(
            'ol',
            null,
            vendor.questions.map((q) => h('li', null, q)),
          ),
        )
      : null,
  );
}

/** @param {Plan} plan @param {Pick<PlanHandlers, 'onVendorStatus'>} handlers */
export function renderVendors(plan, { onVendorStatus }) {
  const vendors = [...plan.vendors].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const booked = plan.vendors.filter((v) => v.status === 'booked').length;
  const total = plan.vendors.reduce((sum, v) => sum + v.estimatedCost, 0);

  replaceChildren(
    byId('panel-vendors'),
    h('h3', null, 'Vendor checklist'),
    h(
      'div',
      { className: 'progress-row' },
      h('label', { for: 'vendor-progress' }, `${booked} of ${plan.vendors.length} booked`),
      h('progress', { id: 'vendor-progress', max: Math.max(plan.vendors.length, 1), value: booked }, `${booked}`),
      h(
        'span',
        { className: 'muted' },
        `Estimates total ${formatMoney(total, plan.budget.currency)} · sorted by booking priority`,
      ),
    ),
    h(
      'ul',
      { className: 'vendor-grid' },
      vendors.map((vendor) => vendorCard(vendor, plan, onVendorStatus)),
    ),
  );
}
