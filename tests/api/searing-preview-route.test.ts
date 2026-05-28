/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/characters/[tokenId]/searing/preview/route'
import { resolveSearingLayersForCharacter } from '@/lib/domain/searing/searing-layer-resolver'
import { searingMapMaterializationRepository } from '@/lib/repositories/searing-map-materialization-repository'
import { characterLocalAssets } from '@/lib/services/assets/character-local-assets'
import { searingImageComposer } from '@/lib/services/searing-image-composer'
import { getSupabaseAdmin } from '@/lib/supabase'

jest.mock('@/lib/domain/searing/searing-layer-resolver', () => ({
  __esModule: true,
  resolveSearingLayersForCharacter: jest.fn(),
  validateSearingLayerResolution: jest.fn(),
}))

jest.mock('@/lib/repositories/searing-map-materialization-repository', () => ({
  __esModule: true,
  searingMapMaterializationRepository: {
    findByConcordTokenId: jest.fn(),
  },
}))

jest.mock('@/lib/services/searing-image-composer', () => ({
  __esModule: true,
  searingImageComposer: {
    compose: jest.fn(),
  },
}))

jest.mock('@/lib/services/assets/character-local-assets', () => ({
  __esModule: true,
  characterLocalAssets: {
    hydrateCharacter: jest.fn(),
  },
}))

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  getSupabaseAdmin: jest.fn(),
}))

function createRequest(query = '') {
  return new NextRequest(`http://localhost/api/characters/7/searing/preview${query}`)
}

function createParams(tokenId: string) {
  return { params: Promise.resolve({ tokenId }) }
}

const mockedGetSupabaseAdmin = jest.mocked(getSupabaseAdmin)
const mockedFindByConcordTokenId = jest.mocked(searingMapMaterializationRepository.findByConcordTokenId)
const mockedHydrateCharacter = jest.mocked(characterLocalAssets.hydrateCharacter)
const mockedResolveSearingLayersForCharacter = jest.mocked(resolveSearingLayersForCharacter)
const mockedCompose = jest.mocked(searingImageComposer.compose)

describe('Searing preview API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('returns no-store invalid token ID response while preserving raw error shape', async () => {
    const response = await GET(createRequest('?concordId=1'), createParams('bad'))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Invalid token ID' })
  })

  it('returns no-store missing concordId response while preserving raw error shape', async () => {
    const response = await GET(createRequest(), createParams('7'))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'concordId is required' })
  })

  it.each(['1abc', '1.5', '1e2', '9007199254740992'])(
    'rejects malformed concordId %s instead of parseInt coercing it',
    async (concordId) => {
      const response = await GET(createRequest(`?concordId=${concordId}`), createParams('7'))

      expect(response.status).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({ error: 'concordId is required' })
    }
  )

  it('resolves preview layers from hydrated current character traits', async () => {
    const staleMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Original Armor' }],
    }
    const currentMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Current Armor' }],
    }
    const character = {
      token_id: 7,
      metadata: staleMetadata,
      image_url: 'https://example.com/current.png',
      infection_status: 'healthy',
      infected: false,
    }
    const concord = { concordTokenId: 3, tokenId: '3', location: 'Armor', new_trait: 'Searing Mark' }
    const maybeSingle = jest.fn(async () => ({ data: character, error: null }))
    const eq = jest.fn(() => ({ maybeSingle }))
    const select = jest.fn(() => ({ eq }))
    const from = jest.fn(() => ({ select }))

    mockedGetSupabaseAdmin.mockReturnValue({ from } as never)
    mockedFindByConcordTokenId.mockResolvedValue(concord as never)
    mockedHydrateCharacter.mockResolvedValue({ ...character, image_url: character.image_url, metadata: currentMetadata } as never)
    mockedResolveSearingLayersForCharacter.mockReturnValue({
      alignment: 'Unknown',
      variant: { location: 'Armor', newTrait: 'Searing Mark', makesBald: false, source: 'default' },
      layers: [{ trait_type: 'Armor', value: 'Current Armor', url: '/layers/current.png', position: 0, seared: 'Searing Mark' }],
    } as never)
    mockedCompose.mockResolvedValue({ image: Buffer.from('png'), layerUrls: ['/layers/current.png'] })

    const response = await GET(createRequest('?concordId=3'), createParams('7'))

    expect(response.status).toBe(200)
    expect(select).toHaveBeenCalledWith('token_id, metadata, image_url, infection_status, infected')
    expect(mockedHydrateCharacter).toHaveBeenCalledWith(character)
    expect(mockedResolveSearingLayersForCharacter).toHaveBeenCalledWith(currentMetadata, concord)
    expect(mockedResolveSearingLayersForCharacter).not.toHaveBeenCalledWith(staleMetadata, concord)
  })
})
