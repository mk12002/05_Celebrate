import { formatMoney } from '../utils.js';

/*
 * Template content used when Gemini is not configured or a call fails.
 * It keeps the app fully usable (and testable) offline; every plan built
 * from it is labelled `source: "template"` in the UI.
 */

const COMMON_TASKS = {
  m12: ['Agree on the guest list size and overall budget', 'Shortlist and visit three venues', 'Set up a shared planning tracker'],
  m6: ['Book the venue and pay the deposit', 'Book key vendors (catering, photography, entertainment)', 'Send save-the-dates'],
  m3: ['Finalise the menu with your caterer', 'Order decor and rentals', 'Send invitations with an RSVP deadline'],
  m1: ['Confirm every vendor in writing, including arrival times', 'Chase outstanding RSVPs', 'Draft the day-of run sheet'],
  w2: ['Give final headcount to caterer and venue', 'Prepare seating or zone plan', 'Assemble an emergency kit'],
  w1: ['Reconfirm deliveries and set-up times', 'Brief helpers on their roles', 'Pack decor and signage by zone'],
  day: ['Arrive early to oversee set-up', 'Keep vendor contacts and payments handy', 'Assign someone to manage the timeline'],
};

const EXTRA_TASKS = {
  wedding: {
    m6: ['Choose wedding attire and schedule fittings'],
    m3: ['Book hair and makeup trial', 'Arrange marriage licence paperwork'],
    m1: ['Write vows and speeches'],
  },
  birthday: {
    m1: ['Order the cake and confirm flavour/allergens'],
    w1: ['Prepare party favour bags'],
  },
  community: {
    m6: ['Apply for event and noise permits', 'Secure public liability insurance'],
    m3: ['Recruit and schedule volunteers', 'Launch promotion on social media and local boards'],
    m1: ['Finalise accessibility, first-aid and waste plans'],
  },
};

const VENDORS = {
  wedding: [
    ['Venue coordinator', 'venue', 'critical', 'm12', 0.9],
    ['Caterer', 'catering', 'critical', 'm6', 0.9],
    ['Photographer & videographer', 'photography', 'high', 'm6', 0.9],
    ['Florist', 'decor', 'high', 'm3', 0.7],
    ['DJ or live band', 'entertainment', 'high', 'm6', 0.9],
    ['Hair & makeup artist', 'attire', 'medium', 'm3', 0.4],
    ['Stationery designer', 'stationery', 'low', 'm3', 0.8],
  ],
  birthday: [
    ['Party venue', 'venue', 'critical', 'm1', 0.9],
    ['Caterer or bakery', 'catering', 'high', 'm1', 0.8],
    ['Entertainer or DJ', 'entertainment', 'high', 'm1', 0.9],
    ['Decor & balloon stylist', 'decor', 'medium', 'w2', 0.8],
    ['Photographer', 'photography', 'medium', 'm1', 0.9],
    ['Favours supplier', 'favors', 'low', 'w2', 0.7],
  ],
  community: [
    ['Venue or site owner', 'venue', 'critical', 'm6', 0.9],
    ['Local council permit office', 'permits', 'critical', 'm6', 0.5],
    ['Food trucks / caterer', 'catering', 'high', 'm3', 0.8],
    ['AV & staging rental', 'equipment', 'high', 'm3', 0.8],
    ['Performers', 'entertainment', 'medium', 'm3', 0.8],
    ['Security & first-aid provider', 'safety', 'high', 'm1', 0.9],
    ['Printer for signage', 'marketing', 'low', 'm1', 0.5],
  ],
};

const QUESTIONS = [
  'What exactly is included in the quoted price, and what costs extra?',
  'What is your deposit, payment schedule and cancellation policy?',
  'Are you available on our date and do you hold the required insurance?',
  'Can you share references from similar events?',
];

const THEMES = {
  wedding: {
    name: 'Garden Romance',
    concept: 'Soft botanical elegance with candlelight and natural textures. Personal touches make it feel intimate at any size.',
    palette: [
      { name: 'Sage', hex: '#8A9A7B' },
      { name: 'Ivory', hex: '#F7F3EA' },
      { name: 'Dusty Rose', hex: '#C98F8F' },
      { name: 'Champagne', hex: '#E6D3B3' },
      { name: 'Olive', hex: '#4F5D2F' },
    ],
    decor: ['Low floral runners with greenery', 'Clustered candles in glass holders', 'Hand-lettered welcome sign', 'Fairy-light canopy over the dance floor'],
    activities: ['Guest book with instant photos', 'First dance and open dance floor', 'Sparkler or petal send-off', 'Lawn games during cocktail hour'],
    menuIdeas: ['Seasonal grazing table', 'Family-style mains', 'Signature his & hers cocktails', 'Late-night snack station'],
  },
  birthday: {
    name: 'Retro Disco Night',
    concept: 'A glittering throwback party with bold colour and an irresistible playlist. Everyone gets a moment on the dance floor.',
    palette: [
      { name: 'Electric Purple', hex: '#6B2FB3' },
      { name: 'Hot Pink', hex: '#E83E8C' },
      { name: 'Gold', hex: '#D4A017' },
      { name: 'Midnight', hex: '#1B1B3A' },
      { name: 'Silver', hex: '#C0C0C8' },
    ],
    decor: ['Mirror-ball centrepiece', 'Balloon arch at the entrance', 'Neon sign with the guest of honour\'s name', 'Photo backdrop with props'],
    activities: ['Dance-off with prizes', 'Photo booth', 'Memory wall of photos through the years', 'Cake and toast moment'],
    menuIdeas: ['Mini sliders and fries', 'Build-your-own taco bar', 'Mocktail and cocktail menu', 'Celebration cake and cupcakes'],
  },
  community: {
    name: 'Neighbourhood Festival',
    concept: 'A welcoming, family-friendly celebration of local talent and food. Clear wayfinding and shaded spaces keep everyone comfortable.',
    palette: [
      { name: 'Sunflower', hex: '#F2B705' },
      { name: 'Park Green', hex: '#2E7D32' },
      { name: 'Sky', hex: '#4FA3D9' },
      { name: 'Brick', hex: '#B5523B' },
      { name: 'Cream', hex: '#FFF8E7' },
    ],
    decor: ['Bunting across entry points', 'Hand-painted zone signs', 'Shaded seating areas with hay bales', 'Map board at the entrance'],
    activities: ['Local band and open-mic stage', 'Kids\' craft corner', 'Community notice and volunteer sign-up booth', 'Food truck alley'],
    menuIdeas: ['Local food trucks', 'Free water refill stations', 'Bake sale by local groups', 'Vegetarian and allergen-labelled options'],
  },
};

const DAY_OF = {
  wedding: [
    ['09:00', 'Vendors arrive; venue set-up begins'],
    ['11:00', 'Hair and makeup'],
    ['14:00', 'First look and portraits'],
    ['15:30', 'Guests arrive'],
    ['16:00', 'Ceremony'],
    ['16:45', 'Cocktail hour and lawn games'],
    ['18:00', 'Reception entrance and dinner'],
    ['19:30', 'Speeches and first dance'],
    ['20:00', 'Dancing'],
    ['22:30', 'Send-off; teardown begins'],
  ],
  birthday: [
    ['15:00', 'Set up decor and photo backdrop'],
    ['17:30', 'Food and drinks ready'],
    ['18:00', 'Guests arrive; welcome drinks'],
    ['19:00', 'Dinner is served'],
    ['20:00', 'Activities and dance-off'],
    ['21:00', 'Cake and toast'],
    ['22:30', 'Wrap-up and favours'],
  ],
  community: [
    ['07:00', 'Site set-up, signage and safety checks'],
    ['09:30', 'Volunteer briefing'],
    ['10:00', 'Gates open'],
    ['11:00', 'Opening remarks and first performance'],
    ['12:30', 'Food trucks at peak service'],
    ['14:00', 'Kids\' activities and workshops'],
    ['16:00', 'Headline performance'],
    ['17:30', 'Closing thanks'],
    ['18:00', 'Teardown and litter pick'],
  ],
};

/**
 * Returns a template "AI-shaped" response so the planner can treat both
 * sources identically.
 */
export function templatePlanContent(input, { budget, phases }) {
  const type = input.eventType;
  const theme = THEMES[type];
  const amountFor = (id) => budget.categories.find((c) => c.id === id)?.amount ?? 0;
  const label = input.title || `your ${type}`;
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${input.eventDate}T00:00:00Z`));

  return {
    summary:
      `A ${input.setting} ${type} for ${input.guestCount} guests with a ${formatMoney(budget.total, budget.currency)} budget. ` +
      `Lock in the venue and the highest-priority vendors first, then layer in decor and the finishing touches.`,
    allocationShifts: [],
    categoryNotes: [],
    phases: phases.map((p) => ({
      phaseId: p.id,
      tasks: [...COMMON_TASKS[p.id], ...(EXTRA_TASKS[type][p.id] ?? [])],
    })),
    dayOf: DAY_OF[type].map(([time, activity]) => ({ time, activity })),
    vendors: VENDORS[type].map(([service, budgetCategory, priority, bookBy, share]) => ({
      service,
      budgetCategory,
      priority,
      bookBy,
      estimatedCost: Math.round(amountFor(budgetCategory) * share),
      questions: QUESTIONS,
    })),
    theme: {
      ...theme,
      invitation: `You're invited to ${label}! Join us on ${date}${input.location ? ` in ${input.location}` : ''} to celebrate together. Please RSVP so we can plan for you.`,
    },
  };
}

const RAINY_ACTIVITIES = [
  'Indoor photo booth with themed props',
  'Board-game and card-game lounge',
  'Live acoustic set or karaoke corner',
  'DIY craft station (cards, crowns or tote bags)',
];

/**
 * Rule-based chat used when Gemini is unavailable. Understands the most
 * common budget request ("reduce X by N% and move it to Y") and rain plans.
 */
export function templateChatResponse(message) {
  const text = message.toLowerCase();
  const move = /(?:reduce|cut|lower|decrease|take)\s+(?:the\s+)?([a-z &]+?)\s+(?:budget\s+)?by\s+(\d{1,3})\s*%.*?\b(?:to|into|for|on)\s+(?:the\s+)?([a-z &]+?)(?:\s+budget)?[.!]?$/.exec(
    text,
  );
  if (move) {
    const [, from, percent, to] = move;
    return {
      reply: `Done: I moved ${percent}% of ${from.trim()} into ${to.trim()}. Check the Budget tab for the new numbers.`,
      budgetOperations: [{ type: 'move', from: from.trim(), to: to.trim(), percent: Number(percent) }],
      addTasks: [],
      addVendors: [],
      addActivities: [],
    };
  }
  if (/\b(rain|rainy|weather|indoor)\b/.test(text)) {
    return {
      reply: `Here are indoor backup ideas I've added to your theme activities: ${RAINY_ACTIVITIES.join('; ')}. Also confirm a covered space or marquee with your venue.`,
      budgetOperations: [],
      addTasks: [{ phaseId: 'm1', text: 'Confirm an indoor or covered backup space with the venue' }],
      addVendors: [],
      addActivities: RAINY_ACTIVITIES,
    };
  }
  return {
    reply:
      'The AI assistant is offline right now, so I can only handle simple requests such as "Reduce catering by 10% and move it to entertainment" or "Suggest indoor backup activities for rain".',
    budgetOperations: [],
    addTasks: [],
    addVendors: [],
    addActivities: [],
  };
}
