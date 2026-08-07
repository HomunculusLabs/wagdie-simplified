import { ApiClient, getCsrfTokenFromCookie } from '@/lib/api/client';
import { readApiEnvelope, readApiRaw } from '@/lib/api/client-response';

function mockResponse(bodyText: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  return {
    ok: init.status === undefined || (init.status >= 200 && init.status < 300),
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers,
    json: jest.fn(async () => JSON.parse(bodyText)),
    text: jest.fn(async () => bodyText),
    blob: jest.fn(async () => new Blob([bodyText])),
  } as unknown as Response;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  return mockResponse(JSON.stringify(body), {
    ...init,
    headers,
  });
}

describe('API client response helpers', () => {
  it('reads raw JSON responses without envelope unwrapping', async () => {
    const response = jsonResponse({ characters: [{ tokenId: 1 }], totalCount: 1 });

    await expect(readApiRaw(response, 'Failed to fetch characters')).resolves.toEqual({
      characters: [{ tokenId: 1 }],
      totalCount: 1,
    });
  });

  it('reads envelope responses by returning data', async () => {
    const response = jsonResponse({ success: true, data: { id: 'submission-1' } });

    await expect(readApiEnvelope(response, 'Failed to fetch submission')).resolves.toEqual({
      id: 'submission-1',
    });
  });

  it('extracts error messages from details arrays before generic error fields', async () => {
    const response = jsonResponse(
      {
        success: false,
        error: 'Validation failed',
        details: ['Title is required', 'Body is required'],
      },
      { status: 400, statusText: 'Bad Request' }
    );

    await expect(readApiEnvelope(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Title is required\nBody is required',
      status: 400,
      statusText: 'Bad Request',
    });
  });

  it('extracts raw error messages and preserves ApiError.status', async () => {
    const response = jsonResponse(
      { message: 'Session expired' },
      { status: 401, statusText: 'Unauthorized' }
    );

    await expect(readApiRaw(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Session expired',
      status: 401,
      statusText: 'Unauthorized',
    });
  });

  it('prefers raw message fields over machine-code error fields', async () => {
    const response = jsonResponse(
      { error: 'UNAUTHORIZED', message: 'Wallet not connected' },
      { status: 401, statusText: 'Unauthorized' }
    );

    await expect(readApiRaw(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Wallet not connected',
      status: 401,
      statusText: 'Unauthorized',
    });
  });

  it('uses raw error fields when no message is present', async () => {
    const response = jsonResponse(
      { error: 'Invalid wallet address' },
      { status: 400, statusText: 'Bad Request' }
    );

    await expect(readApiRaw(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid wallet address',
      status: 400,
      statusText: 'Bad Request',
    });
  });

  it('keeps envelope error fields ahead of message fields', async () => {
    const response = jsonResponse(
      { success: false, error: 'Validation failed', message: 'Please check your input' },
      { status: 400, statusText: 'Bad Request' }
    );

    await expect(readApiEnvelope(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Validation failed',
      status: 400,
      statusText: 'Bad Request',
    });
  });

  it('allows envelope success responses without data when requireData is false', async () => {
    const response = jsonResponse({ success: true, message: 'Deleted successfully' });

    await expect(readApiEnvelope(response, 'Failed to delete', { requireData: false })).resolves.toBeUndefined();
  });

  it('still returns envelope data when requireData is false and data is present', async () => {
    const response = jsonResponse({ success: true, data: { deleted: true } });

    await expect(readApiEnvelope(response, 'Failed to delete', { requireData: false })).resolves.toEqual({
      deleted: true,
    });
  });

  it('uses plain text response bodies as error messages', async () => {
    const response = mockResponse('Proxy failure', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/plain' },
    });

    await expect(readApiRaw(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Proxy failure',
      status: 502,
      statusText: 'Bad Gateway',
    });
  });

  it('summarizes HTML error pages instead of surfacing raw markup', async () => {
    const response = mockResponse('<!DOCTYPE html><html><head><title>runiverse.ai | 502: Bad gateway</title></head><body>Cloudflare failure</body></html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(readApiRaw(response, 'Fallback failure')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'runiverse.ai | 502: Bad gateway',
      status: 502,
      statusText: 'Bad Gateway',
    });
  });

  it('throws the fallback message for malformed JSON responses', async () => {
    const response = mockResponse('{ invalid json', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(readApiRaw(response, 'Malformed response')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Malformed response',
      status: 200,
      statusText: 'OK',
    });
  });

  it('preserves AbortError thrown while reading JSON bodies', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: jest.fn().mockRejectedValue(abortError),
    } as unknown as Response;

    await expect(readApiRaw(response, 'Malformed response')).rejects.toBe(abortError);
  });
});

describe('ApiClient', () => {
  const originalFetch = global.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(global, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(global, 'document');

  function installBrowserGlobals(cookie = 'csrf-token=csrf-123'): void {
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { origin: 'https://example.test' } },
    });
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: { cookie },
    });
  }

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(global, 'window', originalWindow);
    } else {
      delete (global as typeof globalThis & { window?: unknown }).window;
    }
    if (originalDocument) {
      Object.defineProperty(global, 'document', originalDocument);
    } else {
      delete (global as typeof globalThis & { document?: unknown }).document;
    }
    jest.restoreAllMocks();
  });

  it('keeps raw responses as the default response shape', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new ApiClient('https://example.test');

    await expect(client.get<{ ok: boolean }>('/api/raw')).resolves.toEqual({ ok: true });
  });

  it('unwraps envelope responses when requested', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));

    const client = new ApiClient('https://example.test');

    await expect(client.getEnvelope<{ ok: boolean }>('/api/envelope')).resolves.toEqual({ ok: true });
  });

  it('does not set JSON Content-Type when sending FormData', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new ApiClient('https://example.test');
    const formData = new FormData();
    formData.set('file', new Blob(['hello']), 'hello.txt');

    await client.post<{ ok: boolean }>('/api/upload', formData);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;

    expect(init?.body).toBe(formData);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('reads the CSRF token from a cookie string', () => {
    expect(getCsrfTokenFromCookie('other=1; csrf-token=csrf-123; theme=dark')).toBe('csrf-123');
  });

  it('adds CSRF header to unsafe same-origin browser requests', async () => {
    installBrowserGlobals();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new ApiClient('');

    await client.post<{ ok: boolean }>('/api/auth/logout');

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;

    expect(headers.get('X-CSRF-Token')).toBe('csrf-123');
  });

  it('does not add CSRF header when Authorization is present', async () => {
    installBrowserGlobals();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new ApiClient('');

    await client.post<{ ok: boolean }>('/api/auth/logout', undefined, {
      headers: { Authorization: 'Bearer api-token' },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;

    expect(headers.has('X-CSRF-Token')).toBe(false);
  });

  it('wraps network failures as ApiError with status 0', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    const client = new ApiClient('https://example.test');

    await expect(client.get('/api/raw')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      statusText: 'Network Error',
      message: 'Failed to fetch',
    });
  });
});
