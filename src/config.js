const THINKING_LEVELS = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);

/**
 * Reads runtime configuration from environment variables.
 * Accepting `env` as a parameter keeps the function pure and easy to test.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return Object.freeze({
    port: positiveInt(env.PORT, 8080),
    nodeEnv: env.NODE_ENV || 'development',
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    geminiModel: (env.GEMINI_MODEL || 'gemini-3.6-flash').trim(),
    aiTimeoutMs: positiveInt(env.AI_TIMEOUT_MS, 75_000),
    // Empty string disables the override (for models without thinking levels).
    aiThinkingLevel: THINKING_LEVELS.has((env.AI_THINKING_LEVEL ?? 'LOW').toUpperCase())
      ? (env.AI_THINKING_LEVEL ?? 'LOW').toUpperCase()
      : '',
    rateLimitPerMinute: positiveInt(env.RATE_LIMIT_PER_MINUTE, 20),
    cacheTtlMs: positiveInt(env.PLAN_CACHE_TTL_MS, 10 * 60_000),
    // Number of reverse proxies in front of the app (Render / Cloud Run = 1).
    trustProxy: positiveInt(env.TRUST_PROXY, 1),
  });
}
