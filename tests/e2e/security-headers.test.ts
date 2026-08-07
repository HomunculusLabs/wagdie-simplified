type Header = { key: string; value: string }
type HeaderRule = { source: string; headers: Header[] }

const nextConfig = require('../../next.config.js') as {
  headers: () => Promise<HeaderRule[]>
}

function headersByKey(headers: Header[]): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]))
}

describe('Security Headers', () => {
  let headerRules: HeaderRule[]

  beforeAll(async () => {
    headerRules = await nextConfig.headers()
  })

  it('applies global security headers to normal routes', () => {
    const globalRule = headerRules.find((rule) => rule.source.includes('(?!characters/'))
    expect(globalRule).toBeDefined()

    const headers = headersByKey(globalRule!.headers)
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['X-DNS-Prefetch-Control']).toBe('off')
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('defines a compatible Content Security Policy for normal routes', () => {
    const globalRule = headerRules.find((rule) => rule.source.includes('(?!characters/'))
    const csp = headersByKey(globalRule!.headers)['Content-Security-Policy']

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data: blob: https:")
    expect(csp).toContain("connect-src 'self' https: wss:")
  })

  it('preserves marketplace embedding for animated character pages', () => {
    const animatedRule = headerRules.find((rule) => rule.source === '/characters/:tokenId/animated')
    expect(animatedRule).toBeDefined()

    const headers = headersByKey(animatedRule!.headers)
    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['X-Frame-Options']).toBeUndefined()
    expect(headers['Content-Security-Policy']).toBeUndefined()
  })

  it('preserves CORS headers for character metadata API responses', () => {
    const metadataRule = headerRules.find((rule) => rule.source === '/api/characters/metadata/:tokenId')
    expect(metadataRule).toBeDefined()

    const headers = headersByKey(metadataRule!.headers)
    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type')
  })
})
