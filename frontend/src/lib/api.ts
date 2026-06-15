// Centralized fetch wrapper for the Hissa backend.
// - Always sends cookies (httpOnly session + readable CSRF).
// - Attaches X-CSRF-Token on every non-GET request.
// - Dispatches a global 'hissa:unauthorized' event on 401 so the app can log out.

export const UNAUTHORIZED_EVENT = 'hissa:unauthorized';

/** Read a cookie value by name (used for the JS-readable CSRF cookie). */
export function getCsrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)hissa_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** When true, returns the raw Response (used for NDJSON streaming). */
  stream?: boolean;
  signal?: AbortSignal;
}

async function buildRequest(path: string, opts: ApiOptions): Promise<Response> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {};

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrf();
  }

  return fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    if (typeof data?.message === 'string') return data.message;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}

/**
 * JSON request helper. Returns parsed JSON (or `undefined` for 204/empty).
 * Throws Error(detail) on non-ok. Dispatches the unauthorized event on 401.
 */
export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await buildRequest(path, opts);

  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error(await extractError(res));
  }
  if (!res.ok) {
    throw new Error(await extractError(res));
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Streaming helper for NDJSON endpoints (apply / apply/multi).
 * Returns the raw Response so callers can read res.body. Throws on non-ok
 * (and fires the unauthorized event on 401) before any streaming begins.
 */
export async function apiStream(path: string, opts: Omit<ApiOptions, 'stream'> = {}): Promise<Response> {
  const res = await buildRequest(path, { ...opts, method: opts.method || 'POST' });

  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error(await extractError(res));
  }
  if (!res.ok || !res.body) {
    throw new Error(await extractError(res));
  }
  return res;
}

/**
 * Parse an NDJSON ReadableStream, invoking `onEvent` for each JSON line.
 * Silently skips malformed lines (matching the existing IPOEngine behavior).
 */
export async function parseNdjson(
  res: Response,
  onEvent: (ev: any) => void,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        /* skip malformed line */
      }
    }
  }
}
