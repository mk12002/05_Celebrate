import { GoogleGenAI } from '@google/genai';

/** HTTP statuses worth one more attempt (rate limit spikes, overload). */
const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for transient Gemini failures such as "503 model overloaded". */
export function isRetryable(error) {
  const status = Number(error?.status ?? error?.code);
  return RETRYABLE_STATUSES.has(status) || /\b(UNAVAILABLE|RESOURCE_EXHAUSTED)\b/.test(String(error?.message));
}

/**
 * Thin wrapper around the Gemini API that returns parsed JSON.
 * The planner depends only on the `{ model, generateJson }` interface, so
 * tests can inject a fake client without touching the network.
 *
 * @param {{apiKey: string, model: string, timeoutMs: number, thinkingLevel?: string,
 *          maxAttempts?: number, sleep?: (ms: number) => Promise<void>, client?: object}} options
 *   `thinkingLevel` (MINIMAL | LOW | MEDIUM | HIGH) trades reasoning depth for
 *   latency; LOW keeps full plans well under a minute. `client` and `sleep`
 *   are injectable for tests.
 */
export function createGeminiClient({
  apiKey,
  model,
  timeoutMs,
  thinkingLevel,
  maxAttempts = 2,
  sleep = wait,
  client = new GoogleGenAI({ apiKey }),
}) {
  return {
    model,
    /**
     * @param {{system: string, prompt: string, schema: object, temperature?: number}} request
     * @returns {Promise<unknown>} parsed JSON response
     */
    async generateJson({ system, prompt, schema, temperature = 0.7 }) {
      // One deadline covers every attempt so retries never exceed the timeout.
      const abortSignal = AbortSignal.timeout(timeoutMs);
      for (let attempt = 1; ; attempt += 1) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: system,
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
              temperature,
              maxOutputTokens: 8192,
              ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
              abortSignal,
            },
          });
          const text = response.text;
          if (!text) throw new Error('Gemini returned an empty response');
          return JSON.parse(text);
        } catch (error) {
          if (attempt >= maxAttempts || abortSignal.aborted || !isRetryable(error)) throw error;
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    },
  };
}
