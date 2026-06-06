import { NextRequest } from 'next/server'
import { parseTokenIdParam } from '@/lib/api/params'
import { jsonRaw, jsonRawError, withNoStoreHeaders } from '@/lib/api/responses'
import {
  buildServedCharacterMetadata,
  CharacterMetadataNotFoundError,
} from '@/lib/services/character-served-metadata-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUCCESS_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
const METADATA_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function withCorsHeaders(headers?: HeadersInit): Headers {
  return new Headers({
    ...METADATA_CORS_HEADERS,
    ...Object.fromEntries(new Headers(headers)),
  })
}

function getMetadataAppOrigin(): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL
  return configuredAppUrl && !configuredAppUrl.includes('localhost')
    ? configuredAppUrl.replace(/\/$/, '')
    : 'https://fateofwagdie.com'
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: withCorsHeaders(),
  })
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  const params = await context.params
  const tokenId = parseTokenIdParam(params.tokenId, { min: 1 })

  if (tokenId === null) {
    return jsonRawError('Invalid token ID', 400, {
      headers: withCorsHeaders(withNoStoreHeaders()),
    })
  }

  try {
    const responseMetadata = await buildServedCharacterMetadata(tokenId, {
      appOrigin: getMetadataAppOrigin(),
    })

    return jsonRaw(responseMetadata, {
      headers: withCorsHeaders({
        'Cache-Control': SUCCESS_CACHE_CONTROL,
      }),
    })
  } catch (error) {
    if (error instanceof CharacterMetadataNotFoundError) {
      return jsonRawError('Metadata not found', 404, {
        headers: withCorsHeaders(withNoStoreHeaders()),
      })
    }

    console.error('Failed to load character metadata:', error)
    return jsonRawError('Failed to load metadata', 500, {
      headers: withCorsHeaders(withNoStoreHeaders()),
    })
  }
}
