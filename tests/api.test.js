import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPlanner } from '../src/services/planner.js';
import { silentLogger, validInput } from './helpers.js';

function buildApp({ planner = createPlanner({ logger: silentLogger }), env = {} } = {}) {
  return createApp({ planner, config: loadConfig({ RATE_LIMIT_PER_MINUTE: '50', ...env }), logger: silentLogger });
}

describe('API', () => {
  it('GET /api/health reports AI status without leaking the key', async () => {
    const res = await request(buildApp({ env: { GEMINI_API_KEY: 'secret-key' } }))
      .get('/api/health')
      .expect(200);
    assert.deepEqual(res.body, { status: 'ok', ai: true, model: 'gemini-3.6-flash' });
    assert.ok(!JSON.stringify(res.body).includes('secret-key'));
  });

  it('POST /api/plan returns a full plan', async () => {
    const res = await request(buildApp()).post('/api/plan').send(validInput()).expect(201);
    const { plan } = res.body;
    assert.equal(plan.input.eventType, 'wedding');
    assert.ok(plan.budget.categories.length > 0);
    assert.ok(plan.timeline.phases.length > 0);
    assert.ok(plan.vendors.length > 0);
    assert.ok(plan.theme.palette.length > 0);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  it('POST /api/plan returns field-level 400 errors', async () => {
    const res = await request(buildApp())
      .post('/api/plan')
      .send(validInput({ guestCount: 0 }))
      .expect(400);
    assert.equal(res.body.error, 'Invalid request');
    assert.equal(res.body.details[0].field, 'guestCount');
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const app = buildApp();
    await request(app).post('/api/plan').set('Content-Type', 'application/json').send('{"bad":').expect(400);
    const big = validInput({ preferences: 'x'.repeat(200_000) });
    const res = await request(app).post('/api/plan').send(big).expect(413);
    assert.equal(res.body.error, 'Request body too large');
  });

  it('POST /api/chat refines a plan round-tripped from the client', async () => {
    const app = buildApp();
    const { body } = await request(app).post('/api/plan').send(validInput());
    const res = await request(app)
      .post('/api/chat')
      .send({ plan: body.plan, message: 'Reduce catering by 10% and move it to photography', history: [] })
      .expect(200);
    assert.match(res.body.changes[0], /Moved .* from Catering & bar to Photo & video/);
    assert.equal(res.body.plan.budget.total, 30000);
  });

  it('POST /api/chat rejects tampered plans', async () => {
    const app = buildApp();
    const { body } = await request(app).post('/api/plan').send(validInput());
    body.plan.theme.palette[0].hex = 'url(javascript:alert(1))';
    await request(app).post('/api/chat').send({ plan: body.plan, message: 'hi' }).expect(400);
    await request(app).post('/api/chat').send({ plan: body.plan, message: '   ' }).expect(400);
  });

  it('returns a generic 500 without internals when the planner crashes', async () => {
    const planner = {
      generatePlan: async () => {
        throw new Error('db password is hunter2');
      },
    };
    const res = await request(buildApp({ planner })).post('/api/plan').send(validInput()).expect(500);
    assert.ok(!JSON.stringify(res.body).includes('hunter2'));
  });

  it('sets security headers including a strict CSP', async () => {
    const res = await request(buildApp()).get('/').expect(200);
    const csp = res.headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.match(res.headers['permissions-policy'], /camera=\(\)/);
    assert.match(res.headers['strict-transport-security'], /max-age=/);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(res.text, /<html lang="en">/);
  });

  it('revalidates static assets so a deploy never mixes old CSS with new HTML', async () => {
    const app = buildApp({ env: { NODE_ENV: 'production' } });
    const css = await request(app).get('/css/styles.css').expect(200);
    assert.equal(css.headers['cache-control'], 'no-cache');
    assert.ok(css.headers.etag);
    await request(app).get('/css/styles.css').set('If-None-Match', css.headers.etag).expect(304);
  });

  it('rate limits the generation endpoints', async () => {
    const app = buildApp({ env: { RATE_LIMIT_PER_MINUTE: '2' } });
    await request(app).post('/api/plan').send({}).expect(400);
    await request(app).post('/api/plan').send({}).expect(400);
    const res = await request(app).post('/api/plan').send({}).expect(429);
    assert.match(res.body.error, /Too many requests/);
  });

  it('rejects non-JSON POST bodies with 415 (blocks cross-site form posts)', async () => {
    const res = await request(buildApp())
      .post('/api/plan')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('eventType=wedding')
      .expect(415);
    assert.match(res.body.error, /application\/json/);
  });

  it('tags every API response with a request id and logs it without user content', async () => {
    const lines = [];
    const logger = { info: (message, meta) => lines.push({ message, meta }), warn() {}, error() {} };
    const app = createApp({ planner: createPlanner({ logger: silentLogger }), config: loadConfig({}), logger });

    const generated = await request(app)
      .post('/api/plan')
      .send(validInput({ preferences: 'secret allergy' }));
    assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    const echoed = await request(app).get('/api/health').set('X-Request-Id', 'client-123');
    assert.equal(echoed.headers['x-request-id'], 'client-123');
    const rejected = await request(app).get('/api/health').set('X-Request-Id', '<script>');
    assert.notEqual(rejected.headers['x-request-id'], '<script>');

    assert.equal(lines[0].message, 'request');
    assert.deepEqual(Object.keys(lines[0].meta).sort(), ['method', 'ms', 'path', 'requestId', 'status']);
    assert.equal(lines[0].meta.status, 201);
    assert.ok(!JSON.stringify(lines).includes('secret allergy'));
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(buildApp()).get('/api/nope').expect(404);
    assert.equal(res.body.error, 'Not found');
  });
});

describe('config', () => {
  it('uses safe defaults and ignores invalid numbers', () => {
    const config = loadConfig({ PORT: 'abc', RATE_LIMIT_PER_MINUTE: '-5' });
    assert.equal(config.port, 8080);
    assert.equal(config.rateLimitPerMinute, 20);
    assert.equal(config.geminiApiKey, '');
    assert.equal(config.aiThinkingLevel, 'LOW');
    assert.ok(Object.isFrozen(config));
  });

  it('accepts valid thinking levels and disables invalid ones', () => {
    assert.equal(loadConfig({ AI_THINKING_LEVEL: 'minimal' }).aiThinkingLevel, 'MINIMAL');
    assert.equal(loadConfig({ AI_THINKING_LEVEL: '' }).aiThinkingLevel, '');
    assert.equal(loadConfig({ AI_THINKING_LEVEL: 'turbo' }).aiThinkingLevel, '');
  });
});
