/**
 * @jest-environment node
 */

import { readFile } from 'node:fs/promises'
import { NextRequest } from 'next/server'
import { GET } from '@/app/images/characters/current/[file]/route'
import { resolveCurrentCharacterImage } from '@/lib/services/assets/character-current-image-service'

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}))

jest.mock('@/lib/services/assets/character-current-image-service', () => ({
  __esModule: true,
  resolveCurrentCharacterImage: jest.fn(),
}))

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>
const mockedResolveCurrentCharacterImage = resolveCurrentCharacterImage as jest.MockedFunction<typeof resolveCurrentCharacterImage>

function createRequest(file: string, version?: string) {
  const query = version ? `?v=${encodeURIComponent(version)}` : ''
  return new NextRequest(`http://localhost/images/characters/current/${file}${query}`)
}

function createParams(file: string) {
  return { params: Promise.resolve({ file }) }
}

async function responseBytes(response: Response): Promise<number[]> {
  return Array.from(new Uint8Array(await response.arrayBuffer()))
}

describe('current character image route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as typeof fetch
  })

  it('serves verified base images from the local verified manifest descriptor', async () => {
    mockedResolveCurrentCharacterImage.mockResolvedValueOnce({
      tokenId: 30,
      source: 'manifest-base',
      localFile: '/repo/public/images/characters/30.png',
      contentType: 'image/png',
      currentImage: {
        url: '/images/characters/current/30.png?v=base-abcdef1234567890',
        version: 'base-abcdef1234567890',
        kind: 'base',
        source: 'verified-local-base',
      },
    })
    mockedReadFile.mockResolvedValueOnce(Buffer.from([137, 80, 78, 71]))

    const response = await GET(
      createRequest('30.png', 'base-abcdef1234567890'),
      createParams('30.png')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(await responseBytes(response)).toEqual([137, 80, 78, 71])
    expect(mockedResolveCurrentCharacterImage).toHaveBeenCalledWith(30, {
      version: 'base-abcdef1234567890',
      requireServable: true,
    })
    expect(mockedReadFile).toHaveBeenCalledWith('/repo/public/images/characters/30.png')
  })

  it('proxies GCS-backed seared images through the app-origin route', async () => {
    mockedResolveCurrentCharacterImage.mockResolvedValueOnce({
      tokenId: 4702,
      source: 'db-current',
      backingUrl: 'https://storage.googleapis.com/wagdie/seared/4702.png',
      contentType: 'image/png',
      currentImage: {
        url: '/images/characters/current/4702.png?v=seared-deadbeef-log3-abcdef1234567890',
        version: 'seared-deadbeef-log3-abcdef1234567890',
        kind: 'seared',
        source: 'searing-materialization',
        storage: {
          type: 'gcs',
          backingUrl: 'https://storage.googleapis.com/wagdie/seared/4702.png',
        },
      },
    })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))

    const response = await GET(
      createRequest('4702.png', 'seared-deadbeef-log3-abcdef1234567890'),
      createParams('4702.png')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(await responseBytes(response)).toEqual([1, 2, 3])
    expect(global.fetch).toHaveBeenCalledWith('https://storage.googleapis.com/wagdie/seared/4702.png')
  })

  it('uses no-store cache behavior for unversioned current image requests', async () => {
    mockedResolveCurrentCharacterImage.mockResolvedValueOnce({
      tokenId: 30,
      source: 'manifest-base',
      localFile: '/repo/public/images/characters/30.png',
      contentType: 'image/png',
      currentImage: {
        url: '/images/characters/current/30.png?v=base-abcdef1234567890',
        version: 'base-abcdef1234567890',
        kind: 'base',
        source: 'verified-local-base',
      },
    })
    mockedReadFile.mockResolvedValueOnce(Buffer.from([9]))

    const response = await GET(createRequest('30.png'), createParams('30.png'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedResolveCurrentCharacterImage).toHaveBeenCalledWith(30, {
      version: null,
      requireServable: true,
    })
  })

  it('returns 404 for missing or unverified current images', async () => {
    mockedResolveCurrentCharacterImage.mockResolvedValueOnce(null)

    const response = await GET(
      createRequest('30.png', 'base-unverified'),
      createParams('30.png')
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedReadFile).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not handle the stable smart-contract/base image path', async () => {
    const response = await GET(createRequest('30'), createParams('30'))

    expect(response.status).toBe(404)
    expect(mockedResolveCurrentCharacterImage).not.toHaveBeenCalled()
  })
})
