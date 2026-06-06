import {
  compareImageBytes,
  dedupeImageUrlCandidates,
  describeImageBytes,
} from '@/lib/services/assets/character-image-verification'

const pngA = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
])
const pngB = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0xff, 0xff, 0xff, 0xff,
])

describe('character image verification primitives', () => {
  it('describes bytes with sha256, byte length, and image content type', () => {
    const metadata = describeImageBytes(pngA)

    expect(metadata.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(metadata.byteLength).toBe(pngA.byteLength)
    expect(metadata.contentType).toBe('image/png')
  })

  it('represents token-30-style local/source mismatches without network access', () => {
    const comparison = compareImageBytes(pngA, pngB, 'image/png')

    expect(comparison.matches).toBe(false)
    expect(comparison.error).toContain('hash_mismatch')
    expect(comparison.source.sha256).not.toBe(comparison.local.sha256)
  })

  it('dedupes normalized candidates without treating empties as sources', () => {
    expect(dedupeImageUrlCandidates(['', ' https://a.example/image.png ', 'https://a.example/image.png'])).toEqual([
      'https://a.example/image.png',
    ])
  })
})
