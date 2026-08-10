/**
 * Guards against double-paying when a Sphere intent's outcome is UNKNOWN
 * (ConnectError code 4201 / ERROR_CODES.INTENT_OUTCOME_UNKNOWN) — e.g. the
 * wallet locked or a host deadline fired *after* the transfer was already
 * delegated to the wallet. Per the SDK's own docs for that code: "the money
 * may or may not have moved" and "a dApp MUST NOT retry on this code."
 *
 * We persist a marker (survives page reload, since the ambiguous state
 * outlives the React component that started the request) so the Vote /
 * Send buttons stay blocked until the user explicitly confirms they've
 * checked their wallet history and it's safe to try again.
 */

const STORAGE_KEY = 'vouch:unresolved-intents:v1';

function loadUnresolved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveUnresolved(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // best-effort; if storage is unavailable the in-memory React state
    // (also updated by callers) still blocks the retry for this session
  }
}

/** Marks `key` as having an unknown outcome. Idempotent. */
export function markUnresolved(key: string): void {
  const keys = loadUnresolved();
  if (!keys.includes(key)) {
    keys.push(key);
    saveUnresolved(keys);
  }
}

export function isUnresolved(key: string): boolean {
  return loadUnresolved().includes(key);
}

/** Call only after the user has manually confirmed it's safe to retry. */
export function clearUnresolved(key: string): void {
  saveUnresolved(loadUnresolved().filter((k) => k !== key));
}
