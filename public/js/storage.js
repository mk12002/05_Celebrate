/*
 * Persists the current plan and chat in localStorage so a refresh does not
 * lose work. Storage can be unavailable (private mode, blocked cookies), so
 * every access is guarded and failure simply means "no persistence".
 */

const KEY = 'celebrate.session.v1';

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' && data.plan ? data : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Quota exceeded or storage disabled: keep working in memory.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}
