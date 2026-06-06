import { SearingStorageService } from '@/lib/services/searing-storage'

describe('SearingStorageService object naming', () => {
  it('keeps the legacy token object path when no version is provided', () => {
    const storage = new SearingStorageService({ bucketName: 'bucket', prefix: 'seared' })

    expect(storage.objectNameForToken(5873)).toBe('seared/5873.png')
  })

  it('uses a versioned token subpath when version is provided', () => {
    const storage = new SearingStorageService({ bucketName: 'bucket', prefix: 'seared' })

    expect(storage.objectNameForToken(5873, { version: 'seared-abc12345-log7-0123456789abcdef' })).toBe(
      'seared/5873/seared-abc12345-log7-0123456789abcdef.png'
    )
  })

  it('encodes public object URLs by path segment', () => {
    const storage = new SearingStorageService({ bucketName: 'bucket name', prefix: '' })

    expect(storage.publicUrlForObject('5873/tx abc-log-7.png')).toBe(
      'https://storage.googleapis.com/bucket name/5873/tx%20abc-log-7.png'
    )
  })

  it('returns an app-origin current path descriptor backed by GCS', async () => {
    const saved: Array<{ buffer: Buffer; options?: Record<string, unknown> }> = []
    const storage = new SearingStorageService({
      bucketName: 'bucket',
      prefix: '',
      storageConstructor: (class MockStorage {
        bucket() {
          return {
            file: () => ({
              save: async (buffer: Buffer, options?: Record<string, unknown>) => {
                saved.push({ buffer, options })
              },
            }),
          }
        }
      } as never),
    })
    const image = Buffer.from('seared-image')

    const result = await storage.uploadSearedImage(5873, image, {
      transactionHash: `0x${'a'.repeat(64)}`,
      logIndex: 7,
    })

    expect(result).toMatchObject({
      publicPath: expect.stringMatching(/^\/images\/characters\/current\/5873\.png\?v=seared-aaaaaaaa-log7-[a-f0-9]{16}$/),
      version: expect.stringMatching(/^seared-aaaaaaaa-log7-[a-f0-9]{16}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      storage: expect.objectContaining({
        type: 'gcs',
        objectName: expect.stringMatching(/^5873\/seared-aaaaaaaa-log7-[a-f0-9]{16}\.png$/),
        backingUrl: expect.stringMatching(/^https:\/\/storage\.googleapis\.com\/bucket\/5873\/seared-aaaaaaaa-log7-[a-f0-9]{16}\.png$/),
      }),
    })
    expect(saved).toHaveLength(1)
  })
})
