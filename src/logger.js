/**
 * Minimal structured logger: one JSON object per line, which Cloud Run and
 * Render ingest as searchable fields. User-entered content is never logged.
 * Compatible with `console` (`warn(message, meta)`), so either can be injected.
 *
 * @param {{write?: (line: string) => void, now?: () => Date}} [options]
 */
export function createLogger({ write = (line) => process.stdout.write(`${line}\n`), now = () => new Date() } = {}) {
  const log = (level) => (message, meta) => {
    const entry = { time: now().toISOString(), level, message: String(message) };
    if (meta instanceof Error) entry.error = meta.message;
    else if (meta !== undefined) entry.meta = meta;
    write(JSON.stringify(entry));
  };
  return { info: log('info'), warn: log('warn'), error: log('error') };
}

/** Logger that discards everything (tests). */
export const silentLogger = Object.freeze({ info() {}, warn() {}, error() {} });
