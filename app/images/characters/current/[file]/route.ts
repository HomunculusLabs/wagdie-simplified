import { readFile } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { resolveCurrentCharacterImage } from '@/lib/services/assets/character-current-image-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const UNVERSIONED_CACHE_CONTROL = 'no-store'

function parseCharacterPngFile(file: string): number | null {
  const match = /^(\d+)\.png$/.exec(file)
  if (!match) return null

  const tokenId = Number.parseInt(match[1], 10)
  return Number.isInteger(tokenId) && tokenId > 0 ? tokenId : null
}

function imageResponse(bytes: Uint8Array, init: { contentType?: string | null; version?: string | null }) {
  return new NextResponse(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: {
      'Content-Type': init.contentType || 'image/png',
      'Cache-Control': init.version ? IMMUTABLE_CACHE_CONTROL : UNVERSIONED_CACHE_CONTROL,
    },
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
) {
  const params = await context.params
  const tokenId = parseCharacterPngFile(params.file)

  if (tokenId === null) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
    })
  }

  const version = request.nextUrl.searchParams.get('v')
  const resolved = await resolveCurrentCharacterImage(tokenId, {
    version,
    requireServable: true,
  })

  if (!resolved) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
    })
  }

  if (resolved.localFile) {
    try {
      const bytes = await readFile(resolved.localFile)
      return imageResponse(new Uint8Array(bytes), {
        contentType: resolved.contentType,
        version,
      })
    } catch (error) {
      console.error(`[character-current-image-route] Failed to read ${resolved.localFile}:`, error)
      return new NextResponse('Not found', {
        status: 404,
        headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
      })
    }
  }

  if (resolved.backingUrl) {
    try {
      const response = await fetch(resolved.backingUrl)
      if (!response.ok) {
        console.error(
          `[character-current-image-route] Backing image fetch failed for token ${tokenId}: ${response.status}`
        )
        return new NextResponse('Not found', {
          status: 404,
          headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
        })
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      return imageResponse(bytes, {
        contentType: response.headers.get('content-type') || resolved.contentType,
        version,
      })
    } catch (error) {
      console.error(`[character-current-image-route] Failed to fetch ${resolved.backingUrl}:`, error)
      return new NextResponse('Not found', {
        status: 404,
        headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
      })
    }
  }

  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': UNVERSIONED_CACHE_CONTROL },
  })
}
