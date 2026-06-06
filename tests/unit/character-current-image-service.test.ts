import {
  currentImageFromVerifiedBase,
  getCurrentImageFromCharacter,
  type ManifestCharacterBaseImage,
} from '@/lib/services/assets/character-current-image-service'
import type { Character } from '@/types/character'

function createCharacter(overrides: Partial<Character>): Character {
  return {
    token_id: 4702,
    metadata: {},
    ...overrides,
  }
}

describe('character current image service', () => {
  const originalBucket = process.env.SEARING_GCS_BUCKET

  beforeEach(() => {
    process.env.SEARING_GCS_BUCKET = 'seared-wagdie-images'
  })

  afterAll(() => {
    process.env.SEARING_GCS_BUCKET = originalBucket
  })

  it('does not trust DB base current image rows directly', () => {
    const character = createCharacter({
      current_image_url: '/images/characters/current/30.png?v=base-unverified',
      current_image_version: 'base-unverified',
      current_image_kind: 'base',
      current_image_storage: {
        type: 'public-static',
        localPath: '/repo/public/images/characters/30.png',
      },
    })

    expect(getCurrentImageFromCharacter(character)).toBeNull()
    expect(getCurrentImageFromCharacter(character, { requireServable: true })).toBeNull()
  })

  it('rejects arbitrary HTTPS backing URLs for servable current images', () => {
    const character = createCharacter({
      current_image_url: '/images/characters/current/4702.png?v=seared-deadbeef-log0-abcdef1234567890',
      current_image_version: 'seared-deadbeef-log0-abcdef1234567890',
      current_image_kind: 'seared',
      current_image_storage: {
        type: 'gcs',
        backingUrl: 'https://example.test/seared/4702.png',
      },
    })

    expect(getCurrentImageFromCharacter(character, { requireServable: true })).toBeNull()
  })

  it('accepts allowlisted GCS backing URLs for servable seared images', () => {
    const character = createCharacter({
      current_image_url: '/images/characters/current/4702.png?v=seared-deadbeef-log0-abcdef1234567890',
      current_image_version: 'seared-deadbeef-log0-abcdef1234567890',
      current_image_kind: 'seared',
      current_image_storage: {
        type: 'gcs',
        objectName: '4702/seared-deadbeef-log0-abcdef1234567890.png',
        backingUrl: 'https://storage.googleapis.com/seared-wagdie-images/4702/seared-deadbeef-log0-abcdef1234567890.png',
      },
    })

    const resolved = getCurrentImageFromCharacter(character, { requireServable: true })

    expect(resolved).toMatchObject({
      backingUrl: 'https://storage.googleapis.com/seared-wagdie-images/4702/seared-deadbeef-log0-abcdef1234567890.png',
      currentImage: {
        kind: 'seared',
        version: 'seared-deadbeef-log0-abcdef1234567890',
        storage: {
          type: 'gcs',
          objectName: '4702/seared-deadbeef-log0-abcdef1234567890.png',
        },
      },
    })
  })

  it('keeps verified base local filesystem paths internal to the resolver', () => {
    const base: ManifestCharacterBaseImage = {
      tokenId: 30,
      metadataFile: 'public/metadata/characters/30.json',
      originalImageUrl: 'ipfs://original',
      localFile: '/repo/public/images/characters/30.png',
      localUrl: '/images/characters/30.png',
      version: 'base-abcdef1234567890',
      sha256: 'abcdef1234567890',
      byteLength: 4,
      contentType: 'image/png',
      verifiedAt: '2026-06-04T00:00:00.000Z',
    }

    const resolved = currentImageFromVerifiedBase(base)

    expect(resolved.localFile).toBe('/repo/public/images/characters/30.png')
    expect(resolved.currentImage.storage).toEqual({ type: 'public-static' })
  })
})
