/**
 * API Client
 * Type-safe fetch wrapper for all API calls.
 *
 * Raw route contracts remain the default. Use `responseShape: 'envelope'`
 * or the `*Envelope` convenience methods for `{ success, data, error }` routes.
 */

import { ApiError } from './client-errors';
import { readApiEnvelope, readApiRaw, type ApiResponseShape } from './client-response';

export { ApiError } from './client-errors';

export type ApiParseMode = 'json' | 'text' | 'blob' | 'response';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function getCsrfTokenFromCookie(cookieString?: string): string | null {
  if (typeof document === 'undefined' && cookieString === undefined) {
    return null;
  }

  const source = cookieString ?? document.cookie;
  const cookies = source.split(';');

  for (const cookie of cookies) {
    const [rawName, ...valueParts] = cookie.trim().split('=');
    if (rawName === CSRF_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

function shouldAttachCsrfHeader(method: string, url: string, headers: Headers): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (SAFE_METHODS.has(method.toUpperCase())) {
    return false;
  }

  if (headers.has(CSRF_HEADER_NAME) || headers.has('Authorization')) {
    return false;
  }

  return new URL(url).origin === window.location.origin;
}

export function applyCsrfHeader(headers: Headers, method: string, url: string): Headers {
  if (!shouldAttachCsrfHeader(method, url, headers)) {
    return headers;
  }

  const token = getCsrfTokenFromCookie();
  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  return headers;
}

/**
 * Request configuration
 */
export interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | null | undefined>;
  responseShape?: ApiResponseShape;
  fallbackMessage?: string;
  requireData?: boolean;
  json?: unknown;
  parseAs?: ApiParseMode;
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function isUrlSearchParamsBody(body: unknown): body is URLSearchParams {
  return typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
}

function isBlobBody(body: unknown): body is Blob {
  return typeof Blob !== 'undefined' && body instanceof Blob;
}

function isArrayBufferBody(body: unknown): body is ArrayBuffer {
  return typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer;
}

function isArrayBufferViewBody(body: unknown): body is ArrayBufferView {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body);
}

function isReadableStreamBody(body: unknown): body is ReadableStream {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
}

function isBodyInit(body: unknown): body is BodyInit {
  return typeof body === 'string'
    || isFormDataBody(body)
    || isUrlSearchParamsBody(body)
    || isBlobBody(body)
    || isArrayBufferBody(body)
    || isArrayBufferViewBody(body)
    || isReadableStreamBody(body);
}

function withBodyConfig(body: unknown, config: RequestConfig = {}): RequestConfig {
  if (body === undefined) {
    return config;
  }

  if (isBodyInit(body)) {
    return {
      ...config,
      body,
    };
  }

  return {
    ...config,
    json: body,
  };
}

/**
 * Type-safe API client
 */
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | null | undefined>): string {
    if (!this.baseUrl && typeof window === 'undefined') {
      throw new ApiError(0, 'Configuration Error', 'ApiClient requires baseUrl outside the browser');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : this.baseUrl;
    const url = new URL(endpoint, this.baseUrl || origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private buildHeaders(headers: HeadersInit | undefined, hasJsonBody: boolean): Headers {
    const requestHeaders = new Headers(headers);

    if (hasJsonBody && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }

    return requestHeaders;
  }

  /**
   * Make HTTP request
   */
  private async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const {
      params,
      responseShape = 'raw',
      fallbackMessage = 'Request failed',
      requireData,
      json,
      parseAs = 'json',
      headers,
      ...fetchConfig
    } = config;

    const url = this.buildUrl(endpoint, params);
    const hasJsonBody = json !== undefined;
    const body = hasJsonBody ? JSON.stringify(json) : fetchConfig.body;

    try {
      const method = fetchConfig.method ?? 'GET';
      const requestHeaders = applyCsrfHeader(this.buildHeaders(headers, hasJsonBody), method, url);

      const response = await fetch(url, {
        ...fetchConfig,
        body,
        headers: requestHeaders,
      });

      if (parseAs === 'response') {
        return response as T;
      }

      if (parseAs === 'text') {
        if (!response.ok) {
          await readApiRaw<unknown>(response, fallbackMessage);
        }

        return await response.text() as T;
      }

      if (parseAs === 'blob') {
        if (!response.ok) {
          await readApiRaw<unknown>(response, fallbackMessage);
        }

        return await response.blob() as T;
      }

      if (responseShape === 'envelope') {
        return readApiEnvelope<T>(response, fallbackMessage, { requireData });
      }

      return readApiRaw<T>(response, fallbackMessage);
    } catch (error) {
      // Re-throw ApiError
      if (error instanceof ApiError) {
        throw error;
      }

      // Network or other errors
      throw new ApiError(
        0,
        'Network Error',
        error instanceof Error ? error.message : 'An unknown error occurred'
      );
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, withBodyConfig(body, {
      ...config,
      method: 'POST',
    }));
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, withBodyConfig(body, {
      ...config,
      method: 'PATCH',
    }));
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'DELETE',
    });
  }

  async getEnvelope<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.get<T>(endpoint, {
      ...config,
      responseShape: 'envelope',
    });
  }

  async postEnvelope<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.post<T>(endpoint, body, {
      ...config,
      responseShape: 'envelope',
    });
  }

  async patchEnvelope<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.patch<T>(endpoint, body, {
      ...config,
      responseShape: 'envelope',
    });
  }

  async deleteEnvelope<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.delete<T>(endpoint, {
      ...config,
      responseShape: 'envelope',
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient('');
