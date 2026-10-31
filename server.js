import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createLogger } from './src/logger.js';
import { TtlCache } from './src/services/cache.js';
import { createGeminiClient } from './src/services/gemini.js';
import { createPlanner } from './src/services/planner.js';

const config = loadConfig();
const logger = createLogger();

const ai = config.geminiApiKey
  ? createGeminiClient({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      timeoutMs: config.aiTimeoutMs,
      thinkingLevel: config.aiThinkingLevel,
    })
  : null;

if (!ai) {
  logger.warn('GEMINI_API_KEY is not set; running with template content only');
}

const planner = createPlanner({ ai, logger, cache: new TtlCache({ ttlMs: config.cacheTtlMs }) });
const app = createApp({ planner, config, logger });

const server = app.listen(config.port, () => {
  logger.info('server started', { url: `http://localhost:${config.port}`, ai: ai ? config.geminiModel : 'off' });
});

// Graceful shutdown for container platforms (Cloud Run / Render send SIGTERM).
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
