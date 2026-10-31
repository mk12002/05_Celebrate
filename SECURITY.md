# Security Policy

## Reporting a vulnerability

Please open a private security advisory on this repository (Security tab → "Report a vulnerability") instead of a public issue. We aim to respond within 72 hours.

## Security design

| Threat | Mitigation |
| --- | --- |
| API key exposure | `GEMINI_API_KEY` is read from the environment on the server only; `.env` is git-ignored and the key is never sent to the browser or logged. |
| XSS | Strict CSP (`script-src 'self'`, no inline scripts or styles). All AI and user text is rendered with `textContent` via the `h()` helper (covered by an XSS regression test). |
| Prompt injection | User text is JSON-encoded inside tagged blocks that the system prompt declares as untrusted data; Gemini output is constrained by a JSON schema and then re-validated with Zod. |
| Malicious input | Strict Zod schemas reject unknown fields, oversized text, invalid dates/colours; control characters are stripped; 100 kB body limit. |
| Tampered client state | Plans sent back for chat are fully re-validated and budget totals are recomputed server-side. |
| Abuse / cost blow-up | Per-IP rate limiting on AI endpoints, request timeouts, response caching. |
| Clickjacking & browser APIs | `frame-ancestors 'none'`, `X-Frame-Options`, restrictive `Permissions-Policy`. |
| Cross-site requests | The API only accepts `application/json` POSTs (anything else gets a 415) and sends no CORS headers, so other sites cannot submit to it. |
| Auditability | Every API response carries an `X-Request-Id`; structured JSON access logs record method, path, status and duration, never user content. |
| Information leakage | Central error handler returns generic messages; `X-Powered-By` disabled. |
| Vulnerable dependencies | `npm audit` runs in CI; production image installs runtime dependencies only and runs as a non-root user. |
