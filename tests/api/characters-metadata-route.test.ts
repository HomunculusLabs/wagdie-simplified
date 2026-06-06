/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, OPTIONS } from '@/app/api/characters/metadata/[tokenId]/route'
import {
  buildServedCharacterMetadata,
  CharacterMetadataNotFoundError,
} from '@/lib/services/character-served-metadata-service'

jest.mock('@/lib/services/character-served-metadata-service', () => {
  class CharacterMetadataNotFoundError extends Error {}

  return {
    __esModule: true,
    CharacterMetadataNotFoundError,
    buildServedCharacterMetadata: jest.fn(),
  }
})

const mockedBuildServedCharacterMetadata = buildServedCharacterMetadata as jest.MockedFunction<typeof buildServedCharacterMetadata>

function createRequest(tokenId: string) {
  return new NextRequest(`http://localhost/api/characters/metadata/${tokenId}`)
}

function createParams(tokenId: string) {
  return { params: Promise.resolve({ tokenId }) }
}

describe('Character metadata API route', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it('serves current app-origin image metadata with original provenance', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test/'
    const ipfsImage = 'https://crimson-static-barnacle-945.mypinata.cloud/ipfs/QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t'
    const servedMetadata = {
      name: 'Royal Guard of Beelzus',
      image: 'https://example.test/images/characters/current/30.png?v=base-abcdef1234567890',
      original_image: ipfsImage,
      image_provenance: {
        original_image: ipfsImage,
        current_image: 'https://example.test/images/characters/current/30.png?v=base-abcdef1234567890',
        current_image_version: 'base-abcdef1234567890',
        current_image_kind: 'base',
        source: 'verified-local-base',
      },
    }
    mockedBuildServedCharacterMetadata.mockResolvedValueOnce(servedMetadata)

    const response = await GET(createRequest('30'), createParams('30'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
    )
    await expect(response.json()).resolves.toEqual(servedMetadata)
    expect(mockedBuildServedCharacterMetadata).toHaveBeenCalledWith(30, {
      appOrigin: 'https://example.test',
    })
  })

  it('uses the production app origin when NEXT_PUBLIC_APP_URL is local', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    mockedBuildServedCharacterMetadata.mockResolvedValueOnce({ name: 'Local Config' })

    const response = await GET(createRequest('31'), createParams('31'))

    expect(response.status).toBe(200)
    expect(mockedBuildServedCharacterMetadata).toHaveBeenCalledWith(31, {
      appOrigin: 'https://fateofwagdie.com',
    })
  })

  it('returns 400 for invalid token IDs with CORS and no-store headers', async () => {
    const response = await GET(createRequest('nope'), createParams('nope'))

    expect(response.status).toBe(400)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Invalid token ID' })
    expect(mockedBuildServedCharacterMetadata).not.toHaveBeenCalled()
  })

  it('returns 404 when static original metadata is missing', async () => {
    mockedBuildServedCharacterMetadata.mockRejectedValueOnce(new CharacterMetadataNotFoundError(9999))

    const response = await GET(createRequest('9999'), createParams('9999'))

    expect(response.status).toBe(404)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Metadata not found' })
  })

  it('preserves OPTIONS CORS behavior', async () => {
    const response = await OPTIONS()

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  })
})
