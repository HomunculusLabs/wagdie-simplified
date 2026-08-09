// Jest pre-env polyfills for route-handler tests that import `next/server`.
// This file runs via `setupFiles`, before test modules and their static imports.
try {
  const { TextDecoder, TextEncoder } = require('node:util')
  if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder
  if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder
} catch {
  // Ignore text encoder fallback failures.
}

try {
  const { Blob, File } = require('node:buffer')
  if (typeof globalThis.Blob === 'undefined') globalThis.Blob = Blob
  if (typeof globalThis.File === 'undefined') globalThis.File = File
} catch {
  // Ignore Blob/File fallback failures.
}

try {
  const streamWeb = require('node:stream/web')
  if (typeof globalThis.ReadableStream === 'undefined') globalThis.ReadableStream = streamWeb.ReadableStream
  if (typeof globalThis.TransformStream === 'undefined') globalThis.TransformStream = streamWeb.TransformStream
} catch {
  // Ignore stream fallback failures.
}

function installFetchGlobals(fetchImpl) {
  if (!fetchImpl) return
  if (typeof globalThis.fetch === 'undefined' && fetchImpl.fetch) globalThis.fetch = fetchImpl.fetch
  if (typeof globalThis.Request === 'undefined' && fetchImpl.Request) globalThis.Request = fetchImpl.Request
  if (typeof globalThis.Response === 'undefined' && fetchImpl.Response) globalThis.Response = fetchImpl.Response
  if (typeof globalThis.Headers === 'undefined' && fetchImpl.Headers) globalThis.Headers = fetchImpl.Headers
  if (typeof globalThis.FormData === 'undefined' && fetchImpl.FormData) globalThis.FormData = fetchImpl.FormData
}

try {
  installFetchGlobals(require('undici'))
} catch {
  // Some Jest environments cannot initialize undici cleanly; fall back below.
}

try {
  if (typeof globalThis.Request === 'undefined' || typeof globalThis.Response === 'undefined') {
    const nodeFetch = require('node-fetch')
    installFetchGlobals({
      fetch: nodeFetch,
      Request: nodeFetch.Request,
      Response: nodeFetch.Response,
      Headers: nodeFetch.Headers,
    })
  }
} catch {
  // Leave globals untouched if no fetch implementation is available; dependent tests fail explicitly.
}

if (typeof globalThis.Response !== 'undefined' && typeof globalThis.Response.json !== 'function') {
  globalThis.Response.json = function json(body, init) {
    const headers = new globalThis.Headers(init?.headers)
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    return new globalThis.Response(JSON.stringify(body), {
      ...init,
      headers,
    })
  }
}
