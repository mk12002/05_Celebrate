/** ISO date `days` from today (UTC). */
export function futureDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const validInput = (overrides = {}) => ({
  eventType: 'wedding',
  title: 'Sam & Priya',
  budget: 30000,
  currency: 'USD',
  guestCount: 120,
  eventDate: futureDate(200),
  location: 'Lisbon',
  setting: 'outdoor',
  vibe: 'Boho garden',
  preferences: 'Vegetarian menu, live music',
  ...overrides,
});

/** Logger that swallows output so test logs stay readable. */
export const silentLogger = { info() {}, warn() {}, error() {} };

/** Builds a fake Gemini client that returns queued responses or throws. */
export function fakeAi(...responses) {
  const calls = [];
  return {
    model: 'fake-gemini',
    calls,
    async generateJson(request) {
      calls.push(request);
      const next = responses.length > 1 ? responses.shift() : responses[0];
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(request) : structuredClone(next);
    },
  };
}

/** A well-formed AI plan response for the wedding categories. */
export const aiPlanResponse = {
  summary: 'An elegant garden wedding focused on food and music.',
  allocationShifts: [{ from: 'attire', to: 'entertainment', percent: 50, reason: 'Couple loves live music.' }],
  categoryNotes: [{ categoryId: 'catering', note: 'Choose family-style service to save on staff.' }],
  phases: [
    { phaseId: 'm6', tasks: ['Book venue', 'Book caterer'] },
    { phaseId: 'm3', tasks: ['Send invitations'] },
  ],
  dayOf: [
    { time: '15:00', activity: 'Ceremony' },
    { time: '25:99', activity: 'Invalid time is dropped' },
  ],
  vendors: [
    {
      service: 'Live band',
      budgetCategory: 'entertainment',
      priority: 'critical',
      estimatedCost: 999999,
      bookBy: 'm6',
      questions: ['Do you take requests?'],
    },
  ],
  theme: {
    name: 'Olive Grove',
    concept: 'Rustic Mediterranean.',
    palette: [
      { name: 'Olive', hex: '#556B2F' },
      { name: 'Broken', hex: 'red' },
    ],
    decor: ['Olive branches'],
    invitation: 'Join us!',
    activities: ['Lawn games'],
    menuIdeas: ['Mezze'],
  },
};
