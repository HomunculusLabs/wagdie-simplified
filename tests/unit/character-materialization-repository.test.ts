import { CharacterMaterializationRepository } from '@/lib/repositories/character-materialization-repository'
import type { CharacterRuntimeAssets } from '@/lib/domain/character/character-runtime-assets'

function createRuntimeAssets(overrides: Partial<CharacterRuntimeAssets>): CharacterRuntimeAssets {
  return {
    hydrateCharacter: jest.fn(async (character) => character),
    hydrateCharacters: jest.fn(async (characters) => characters),
    getTraitCounts: jest.fn(async () => null),
    getTokenIdsForTraitFilters: jest.fn(async () => null),
    getTotalCharacters: jest.fn(async () => null),
    ...overrides,
  }
}

function createClient(row: Record<string, unknown> | null) {
  const maybeSingle = jest.fn(async () => ({ data: row, error: null }))
  const selectEq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq: selectEq }))
  const updateEq = jest.fn(async () => ({ data: null, error: null }))
  const update = jest.fn(() => ({ eq: updateEq }))
  const insert = jest.fn(() => ({ data: null, error: null }))
  const from = jest.fn(() => ({ select, update, insert }))

  return {
    client: { from },
    from,
    select,
    selectEq,
    maybeSingle,
    update,
    updateEq,
  }
}

describe('CharacterMaterializationRepository', () => {
  it('hydrates characters before returning them for searing materialization', async () => {
    const staleMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Original Armor' }],
    }
    const currentMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Current Armor' }],
    }
    const row = {
      token_id: 7,
      metadata: staleMetadata,
      image_url: 'https://example.com/original.png',
      infection_status: 'healthy',
      infected: false,
    }
    const { client } = createClient(row)
    const runtimeAssets = createRuntimeAssets({
      hydrateCharacter: jest.fn(async (character) => ({
        ...character,
        metadata: currentMetadata,
        image_url: 'https://example.com/current.png',
      })),
    })
    const repository = new CharacterMaterializationRepository(() => client as never, runtimeAssets)

    const character = await repository.findCharacter(7)

    expect(runtimeAssets.hydrateCharacter).toHaveBeenCalledWith(row)
    expect(character).toMatchObject({
      token_id: 7,
      metadata: staleMetadata,
      searing_metadata: currentMetadata,
      image_url: 'https://example.com/original.png',
    })
  })

  it('preserves raw DB metadata and image fields when writing the searing read model', async () => {
    const staleMetadata = {
      name: 'WAGDIE #7',
      customDbOnlyField: 'preserve me',
      attributes: [{ trait_type: 'Armor', value: 'Original Armor' }],
    }
    const currentMetadata = {
      name: 'WAGDIE #7',
      attributes: [{ trait_type: 'Armor', value: 'Current Armor' }],
    }
    const row = {
      token_id: 7,
      metadata: staleMetadata,
      image_url: 'https://example.com/original.png',
      infection_status: 'healthy',
      infected: false,
    }
    const { client, update } = createClient(row)
    const runtimeAssets = createRuntimeAssets({
      hydrateCharacter: jest.fn(async (character) => ({
        ...character,
        metadata: currentMetadata,
        image_url: 'https://example.com/current.png',
      })),
    })
    const repository = new CharacterMaterializationRepository(() => client as never, runtimeAssets)

    await repository.updateSearingReadModel({
      tokenId: 7,
      concord: {
        concordTokenId: 3,
        tokenId: '3',
        token_name: 'Test Concord',
        location: 'Armor',
        new_trait: 'Searing Mark',
        makesBald: false,
      },
      searedImageUrl: 'https://example.com/seared.png',
      searedMetadata: { name: 'Test Concord' },
      materializedAt: '2026-05-28T00:00:00.000Z',
    })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      image_url: 'https://example.com/seared.png',
      metadata: expect.objectContaining({
        attributes: staleMetadata.attributes,
        customDbOnlyField: 'preserve me',
        image: 'https://example.com/seared.png',
        isSeared: true,
        searImage: 'https://example.com/seared.png',
      }),
    }))
  })

  it('preserves raw infected image URLs instead of hydrated display fallbacks', async () => {
    const row = {
      token_id: 7,
      metadata: {
        attributes: [{ trait_type: 'Armor', value: 'Original Armor' }],
      },
      image_url: 'https://example.com/infected-db.png',
      infection_status: 'infected',
      infected: true,
    }
    const { client, update } = createClient(row)
    const runtimeAssets = createRuntimeAssets({
      hydrateCharacter: jest.fn(async (character) => ({
        ...character,
        metadata: {
          attributes: [{ trait_type: 'Armor', value: 'Current Armor' }],
        },
        image_url: '/images/characters/7.png',
      })),
    })
    const repository = new CharacterMaterializationRepository(() => client as never, runtimeAssets)

    await repository.updateSearingReadModel({
      tokenId: 7,
      concord: {
        concordTokenId: 3,
        tokenId: '3',
        token_name: 'Test Concord',
        location: 'Armor',
        new_trait: 'Searing Mark',
        makesBald: false,
      },
      searedImageUrl: 'https://example.com/seared.png',
      searedMetadata: { name: 'Test Concord' },
      materializedAt: '2026-05-28T00:00:00.000Z',
    })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      image_url: 'https://example.com/infected-db.png',
      metadata: expect.objectContaining({
        image: undefined,
        searImage: 'https://example.com/seared.png',
      }),
    }))
  })
})
