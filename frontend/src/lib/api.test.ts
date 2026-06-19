import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, apiStream, parseNdjson, getCsrf, UNAUTHORIZED_EVENT } from './api';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Set document.cookie to a known value (jsdom supports the setter). */
function setCookie(value: string) {
  // Clear then set. jsdom appends; for tests we only ever set one cookie.
  document.cookie = value;
}

/** Build a minimal Response-like stub for fetch to resolve with. */
function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => text,
  } as unknown as Response;
}

beforeEach(() => {
  // Fresh fetch spy per test.
  vi.stubGlobal('fetch', vi.fn());
  // Wipe any cookie set by a prior test.
  document.cookie = 'hissa_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── getCsrf ───────────────────────────────────────────────────────────────────

describe('getCsrf', () => {
  it('reads the hissa_csrf cookie value (decoded)', () => {
    setCookie('hissa_csrf=abc%20123');
    expect(getCsrf()).toBe('abc 123');
  });

  it('returns empty string when the cookie is absent', () => {
    expect(getCsrf()).toBe('');
  });
});

// ── api() CSRF + credentials behavior ──────────────────────────────────────────

describe('api() request building', () => {
  it('attaches X-CSRF-Token and credentials:include on non-GET requests', async () => {
    setCookie('hissa_csrf=tok-123');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await api('/api/thing', { method: 'POST', body: { a: 1 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/thing');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-CSRF-Token']).toBe('tok-123');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('does NOT attach X-CSRF-Token on GET requests but still sends credentials', async () => {
    setCookie('hissa_csrf=tok-123');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse([1, 2, 3]));

    const out = await api<number[]>('/api/list');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns undefined for an empty (204-style) body', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse('', { status: 204 }));
    const out = await api('/api/empty');
    expect(out).toBeUndefined();
  });
});

// ── 401 handling ────────────────────────────────────────────────────────────────

describe('api() 401 handling', () => {
  it('dispatches UNAUTHORIZED_EVENT and throws on a 401', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'nope' }, { status: 401, ok: false }));

    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    try {
      await expect(api('/api/secure')).rejects.toThrow('nope');
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, handler);
    }
  });

  it('throws (no unauthorized event) on a generic non-ok response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, { status: 500, ok: false }));

    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    try {
      await expect(api('/api/err')).rejects.toThrow('boom');
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, handler);
    }
  });
});

// ── extractError unwrapping (exercised through api() throws) ─────────────────────

describe('extractError unwrapping', () => {
  async function errorMessageFor(body: unknown): Promise<string> {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(body, { status: 400, ok: false }));
    try {
      await api('/api/x');
      throw new Error('expected api() to throw');
    } catch (e) {
      return (e as Error).message;
    }
  }

  it('unwraps a FastAPI string detail', async () => {
    expect(await errorMessageFor({ detail: 'bad request' })).toBe('bad request');
  });

  it('unwraps a FastAPI validation detail[0].msg', async () => {
    expect(await errorMessageFor({ detail: [{ msg: 'field required' }] })).toBe('field required');
  });

  it('unwraps a generic { message } field', async () => {
    expect(await errorMessageFor({ message: 'something' })).toBe('something');
  });

  it('falls back to HTTP <status> when the body is not JSON', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      status: 503,
      ok: false,
      json: async () => { throw new Error('not json'); },
      text: async () => 'gateway down',
    } as unknown as Response);
    await expect(api('/api/x')).rejects.toThrow('HTTP 503');
  });
});

// ── parseNdjson ──────────────────────────────────────────────────────────────────

describe('parseNdjson', () => {
  /** Build a Response whose body streams the given chunks of text. */
  function streamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    let i = 0;
    const reader = {
      read: async () => {
        if (i < chunks.length) {
          return { done: false, value: encoder.encode(chunks[i++]) };
        }
        return { done: true, value: undefined };
      },
    };
    return { body: { getReader: () => reader } } as unknown as Response;
  }

  it('invokes onEvent for each valid NDJSON line and skips malformed ones', async () => {
    const res = streamResponse([
      '{"type":"a","n":1}\n',
      'not json\n',
      '{"type":"b","n":2}\n',
      '\n', // blank line ignored
    ]);
    const events: unknown[] = [];
    await parseNdjson(res, (ev) => events.push(ev));
    expect(events).toEqual([
      { type: 'a', n: 1 },
      { type: 'b', n: 2 },
    ]);
  });

  it('handles a line split across two chunks', async () => {
    const res = streamResponse(['{"type":"split",', '"ok":true}\n']);
    const events: unknown[] = [];
    await parseNdjson(res, (ev) => events.push(ev));
    expect(events).toEqual([{ type: 'split', ok: true }]);
  });
});

// ── apiStream 401 ────────────────────────────────────────────────────────────────

describe('apiStream', () => {
  it('fires UNAUTHORIZED_EVENT and throws on a 401 before streaming', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'unauth' }, { status: 401, ok: false }));
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    try {
      await expect(apiStream('/api/apply')).rejects.toThrow('unauth');
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, handler);
    }
  });
});
