import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'
import sharp from 'sharp'
import type { CharacterMetadata } from '@/types/character'
import type { ConcordSearingMap } from '@/lib/domain/searing/concord-searing-map'
import type { SearingEventMaterializationRow } from '@/lib/repositories/searing-event-repository'

Object.assign(globalThis, { TextDecoder, TextEncoder })

// Require after the TextEncoder polyfill because the materialization service imports viem.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SearingMaterializationService } = require('@/lib/services/searing-materialization-service') as typeof import('@/lib/services/searing-materialization-service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SearingImageComposer } = require('@/lib/services/searing-image-composer') as typeof import('@/lib/services/searing-image-composer')

async function rawRgba(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer()
}

function changedPixelCount(a: Buffer, b: Buffer): number {
  const pixelCount = Math.min(a.length, b.length) / 4
  let changed = 0

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4
    if (
      a[offset] !== b[offset] ||
      a[offset + 1] !== b[offset + 1] ||
      a[offset + 2] !== b[offset + 2] ||
      a[offset + 3] !== b[offset + 3]
    ) {
      changed += 1
    }
  }

  return changed
}

describe('SearingMaterializationService', () => {
  it('materializes #5873 + Orb of the Void into a visibly changed versioned image URL', async () => {
    const metadata = JSON.parse(
      await readFile(path.join(process.cwd(), 'public/metadata/characters/5873.json'), 'utf8')
    ) as CharacterMetadata
    const original = await readFile(path.join(process.cwd(), 'public/images/characters/5873.png'))
    const transactionHash = `0x${'a'.repeat(64)}`
    const event: SearingEventMaterializationRow = {
      id: 'event-5873-orb',
      token_id: 5873,
      concord_id: 999,
      event_type: 'sear',
      transaction_hash: transactionHash,
      block_number: 123,
      log_index: 7,
      actor_address: '0x0000000000000000000000000000000000000001',
      event_timestamp: null,
      metadata: {},
      created_at: new Date(0).toISOString(),
      materialization_status: 'pending',
      materialization_attempts: 0,
      materialization_error: null,
      materialized_at: null,
      seared_image_url: null,
      materialization_metadata: {},
    }
    const concord: ConcordSearingMap = {
      token_name: 'Orb of the Leorn',
      tokenId: String(event.concord_id),
      concordTokenId: event.concord_id,
      location: 'Front',
      new_trait: 'Orb of the Void',
      makesBald: false,
    }
    let uploadedImage: Buffer | null = null
    let uploadedVersion: string | undefined

    const service = new SearingMaterializationService(
      {
        findById: jest.fn(async () => event),
        claimForMaterialization: jest.fn(async () => ({ claimed: true as const, event })),
        findLatestForToken: jest.fn(async () => event),
        markCompleted: jest.fn(async (_id: string, searedImageUrl: string, materializationMetadata: Record<string, unknown>) => ({
          ...event,
          materialization_status: 'completed',
          seared_image_url: searedImageUrl,
          materialization_metadata: materializationMetadata,
        })),
        markFailed: jest.fn(),
        markSkipped: jest.fn(),
      } as never,
      {
        findCharacter: jest.fn(async () => ({ token_id: 5873, metadata })),
        updateSearingReadModel: jest.fn(async () => undefined),
        markCharacterConcordSeared: jest.fn(async () => undefined),
      } as never,
      {
        findByConcordTokenId: jest.fn(async () => concord),
      } as never,
      new SearingImageComposer(),
      {
        uploadSearedImage: jest.fn(async (_tokenId: number, image: Buffer, options?: { version?: string }) => {
          uploadedImage = image
          uploadedVersion = options?.version
          return {
            publicPath: `/images/characters/current/5873.png?v=${uploadedVersion}`,
            version: uploadedVersion || 'seared-aaaaaaaa-log7-0000000000000000',
            sha256: 'f'.repeat(64),
            storage: {
              type: 'gcs',
              objectName: `5873/${uploadedVersion}.png`,
              backingUrl: `https://storage.googleapis.com/seared-wagdie-images/5873/${uploadedVersion}.png`,
            },
          }
        }),
      } as never
    )

    const result = await service.materializeEvent(event.id)

    expect(uploadedVersion).toMatch(new RegExp(`^seared-${transactionHash.slice(2, 10)}-log7-[a-f0-9]{16}$`))
    expect(result).toMatchObject({
      status: 'completed',
      tokenId: 5873,
      concordId: event.concord_id,
      imageUrl: `/images/characters/current/5873.png?v=${uploadedVersion}`,
    })
    expect(uploadedImage).toBeTruthy()
    expect(changedPixelCount(await rawRgba(original), await rawRgba(uploadedImage as Buffer))).toBeGreaterThan(1000)
  })

  it('resolves materialization layers from hydrated searing metadata when available', async () => {
    const transactionHash = `0x${'c'.repeat(64)}`
    const event: SearingEventMaterializationRow = {
      id: 'event-current-traits',
      token_id: 7,
      concord_id: 3,
      event_type: 'sear',
      transaction_hash: transactionHash,
      block_number: 123,
      log_index: 1,
      actor_address: null,
      event_timestamp: null,
      metadata: {},
      created_at: new Date(0).toISOString(),
      materialization_status: 'pending',
      materialization_attempts: 0,
      materialization_error: null,
      materialized_at: null,
      seared_image_url: null,
      materialization_metadata: {},
    }
    const concord: ConcordSearingMap = {
      tokenId: '3',
      concordTokenId: 3,
      location: 'Armor',
      new_trait: 'Searing Mark',
      makesBald: false,
    }
    const staleMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Original Armor' }],
    }
    const currentMetadata = {
      attributes: [{ trait_type: 'Armor', value: 'Current Armor' }],
    }
    const compose = jest.fn(async (layers) => {
      expect(layers).toEqual(expect.arrayContaining([
        expect.objectContaining({ trait_type: 'Armor', value: 'Current Armor' }),
      ]))
      return { image: Buffer.from('current-traits'), layerUrls: ['/layers/current.png'] }
    })
    const markCompleted = jest.fn(async (_id: string, searedImageUrl: string, materializationMetadata: Record<string, unknown>) => ({
      ...event,
      materialization_status: 'completed',
      seared_image_url: searedImageUrl,
      materialization_metadata: materializationMetadata,
    }))
    const service = new SearingMaterializationService(
      {
        findById: jest.fn(async () => event),
        claimForMaterialization: jest.fn(async () => ({ claimed: true as const, event })),
        findLatestForToken: jest.fn(async () => event),
        markCompleted,
        markFailed: jest.fn(),
        markSkipped: jest.fn(),
      } as never,
      {
        findCharacter: jest.fn(async () => ({ token_id: 7, metadata: staleMetadata, searing_metadata: currentMetadata })),
        updateSearingReadModel: jest.fn(async () => undefined),
        markCharacterConcordSeared: jest.fn(async () => undefined),
      } as never,
      {
        findByConcordTokenId: jest.fn(async () => concord),
      } as never,
      { compose } as never,
      {
        uploadSearedImage: jest.fn(async () => ({
          publicPath: '/images/characters/current/7.png?v=seared-cccccccc-log1-abcdef1234567890',
          version: 'seared-cccccccc-log1-abcdef1234567890',
          sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          storage: {
            type: 'gcs',
            objectName: '7/seared-cccccccc-log1-abcdef1234567890.png',
            backingUrl: 'https://storage.googleapis.com/seared-wagdie-images/7/seared-cccccccc-log1-abcdef1234567890.png',
          },
        })),
      } as never
    )

    await expect(service.materializeEvent(event.id)).resolves.toMatchObject({ status: 'completed' })
    expect(markCompleted).toHaveBeenCalledWith(
      event.id,
      '/images/characters/current/7.png?v=seared-cccccccc-log1-abcdef1234567890',
      expect.objectContaining({
        current_image: expect.objectContaining({
          url: '/images/characters/current/7.png?v=seared-cccccccc-log1-abcdef1234567890',
          storage: expect.objectContaining({ type: 'gcs' }),
        }),
        layers: expect.arrayContaining([
          expect.objectContaining({ trait_type: 'Armor', value: 'Current Armor' }),
        ]),
      })
    )
  })

  it('does not treat a legacy deterministic completed image URL as completed when repair is not requested', async () => {
    const transactionHash = `0x${'b'.repeat(64)}`
    const completedLegacyEvent: SearingEventMaterializationRow = {
      id: 'legacy-completed-event',
      token_id: 5873,
      concord_id: 999,
      event_type: 'sear',
      transaction_hash: transactionHash,
      block_number: 123,
      log_index: 7,
      actor_address: null,
      event_timestamp: null,
      metadata: {},
      created_at: new Date(0).toISOString(),
      materialization_status: 'completed',
      materialization_attempts: 1,
      materialization_error: null,
      materialized_at: new Date(0).toISOString(),
      seared_image_url: 'https://storage.googleapis.com/seared-wagdie-images/5873.png',
      materialization_metadata: {},
    }
    const service = new SearingMaterializationService(
      {
        findById: jest.fn(async () => completedLegacyEvent),
        claimForMaterialization: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )

    await expect(service.materializeEvent(completedLegacyEvent.id)).resolves.toMatchObject({
      status: 'completed_without_image',
      reason: 'legacy_uncache_safe_image_url',
    })
  })
})
