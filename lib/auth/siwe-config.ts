import type { NextRequest } from 'next/server'

export type TrustedSiweConfig = {
  domain: string
  uri: string
  chainId: number
}

const PRODUCTION_ORIGIN_ENV_KEYS = [
  'WAGDIE_APP_ORIGIN',
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_URL',
]

const NON_PRODUCTION_ORIGIN_ENV_KEYS = [
  ...PRODUCTION_ORIGIN_ENV_KEYS,
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
]

const CHAIN_ID_ENV_KEYS = ['SIWE_CHAIN_ID', 'NEXT_PUBLIC_CHAIN_ID', 'CHAIN_ID']

function normalizeOrigin(rawOrigin: string): string {
  const origin = rawOrigin.startsWith('http://') || rawOrigin.startsWith('https://')
    ? rawOrigin
    : `https://${rawOrigin}`

  const url = new URL(origin)
  return url.origin
}

function getConfiguredOrigin(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim().length > 0) {
      return normalizeOrigin(value.trim())
    }
  }

  return null
}

function getRequestOrigin(request?: NextRequest): string | null {
  if (!request) {
    return null
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '') || 'https'

  if (!host) {
    return null
  }

  return normalizeOrigin(`${proto}://${host}`)
}

function getTrustedOrigin(request?: NextRequest): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const configuredOrigin = getConfiguredOrigin(
    isProduction ? PRODUCTION_ORIGIN_ENV_KEYS : NON_PRODUCTION_ORIGIN_ENV_KEYS
  )

  if (configuredOrigin) {
    return configuredOrigin
  }

  if (isProduction) {
    throw new Error('Trusted SIWE origin is required in production. Set WAGDIE_APP_ORIGIN or NEXT_PUBLIC_APP_URL.')
  }

  const requestOrigin = getRequestOrigin(request)
  if (requestOrigin) {
    return requestOrigin
  }

  return 'http://localhost:3000'
}

function getTrustedChainId(): number {
  for (const key of CHAIN_ID_ENV_KEYS) {
    const value = process.env[key]
    if (value && value.trim().length > 0) {
      const chainId = Number(value)
      if (!Number.isInteger(chainId) || chainId <= 0) {
        throw new Error(`${key} must be a positive integer`)
      }

      return chainId
    }
  }

  return 1
}

export function getTrustedSiweConfig(request?: NextRequest): TrustedSiweConfig {
  const uri = getTrustedOrigin(request)
  const domain = new URL(uri).host

  return {
    domain,
    uri,
    chainId: getTrustedChainId(),
  }
}
