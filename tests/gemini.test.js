import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGeminiClient, isRetryable } from '../src/services/gemini.js';

/** Fake @google/genai client that replays queued results. */
function fakeSdk(...results) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const next = results.shift();
        if (next instanceof Error) throw next;
        return { text: next };
      },
    },
  };
}

const overloaded = () => Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });
const request = { system: 'sys', prompt: 'hi', schema: { type: 'object' } };
const build = (client, extra = {}) =>
  createGeminiClient({ apiKey: 'k', model: 'gemini-test', timeoutMs: 5000, client, sleep: async () => {}, ...extra });

describe('Gemini client', () => {
  it('sends structured-output config and parses JSON', async () => {
    const sdk = fakeSdk('{"ok":true}');
    const result = await build(sdk, { thinkingLevel: 'LOW' }).generateJson(request);
    assert.deepEqual(result, { ok: true });
    const { config, model } = sdk.calls[0];
    assert.equal(model, 'gemini-test');
    assert.equal(config.responseMimeType, 'application/json');
    assert.deepEqual(config.responseJsonSchema, { type: 'object' });
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.ok(config.abortSignal instanceof AbortSignal);
  });

  it('omits thinkingConfig when no level is set', async () => {
    const sdk = fakeSdk('{}');
    await build(sdk).generateJson(request);
    assert.equal(sdk.calls[0].config.thinkingConfig, undefined);
  });

  it('retries once on transient overload errors', async () => {
    const sdk = fakeSdk(overloaded(), '{"ok":1}');
    assert.deepEqual(await build(sdk).generateJson(request), { ok: 1 });
    assert.equal(sdk.calls.length, 2);
  });

  it('gives up after the maximum attempts', async () => {
    const sdk = fakeSdk(overloaded(), overloaded(), '{}');
    await assert.rejects(build(sdk).generateJson(request), /UNAVAILABLE/);
    assert.equal(sdk.calls.length, 2);
  });

  it('does not retry permanent errors or empty responses', async () => {
    const badKey = fakeSdk(Object.assign(new Error('API key not valid'), { status: 400 }));
    await assert.rejects(build(badKey).generateJson(request), /API key/);
    assert.equal(badKey.calls.length, 1);
    await assert.rejects(build(fakeSdk('')).generateJson(request), /empty response/);
  });

  it('classifies retryable errors', () => {
    assert.equal(isRetryable({ status: 429 }), true);
    assert.equal(isRetryable(new Error('RESOURCE_EXHAUSTED: quota')), true);
    assert.equal(isRetryable({ status: 400 }), false);
    assert.equal(isRetryable(undefined), false);
  });
});
