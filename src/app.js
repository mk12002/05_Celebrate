import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createLogger } from './logger.js';
import { createApiRouter } from './routes/api.js';

const REQUEST_ID = /^[\w-]{1,64}$/;

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Builds the Express application. Dependencies are injected so tests can run
 * the full HTTP stack with a fake planner.
 *
 * @param {{planner: ReturnType<import('./services/planner.js').createPlanner>,
 *          config: ReturnType<import('./config.js').loadConfig>,
 *          logger?: ReturnType<import('./logger.js').createLogger>}} deps
 */
export function createApp({ planner, config, logger = createLogger() }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    // The app never needs device APIs; deny them to any injected content.
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  app.use(compression());

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.rateLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' },
  });

  app.use(
    '/api',
    (req, res, next) => {
      // Correlate logs with client reports; accept a well-formed upstream id.
      const incoming = req.get('x-request-id');
      const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      const started = process.hrtime.bigint();
      res.set({ 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
      res.on('finish', () => {
        logger.info('request', {
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        });
      });
      // JSON-only API: rejecting other types also blocks cross-site form posts.
      if (req.method === 'POST' && !req.is('application/json')) {
        return res.status(415).json({ error: 'Content-Type must be application/json' });
      }
      next();
    },
    express.json({ limit: '100kb', strict: true }),
  );
  app.use('/api/plan', apiLimiter);
  app.use('/api/chat', apiLimiter);
  app.use(
    '/api',
    createApiRouter({ planner, aiEnabled: Boolean(config.geminiApiKey), model: config.geminiModel }),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(
    express.static(PUBLIC_DIR, {
      extensions: ['html'],
      maxAge: config.nodeEnv === 'production' ? '1h' : 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // Centralised error handler (4-arity signature): never leak stack traces to clients.
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    logger.error('unhandled error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
