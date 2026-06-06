jest.mock('@/lib/data/local-character-asset-status', () => ({
  hasLocalCharacterImage: (tokenId: number) => tokenId === 1,
}))

import {
  getCharacterImageCandidates,
  getCharacterImageDisclosure,
  getCharacterImageUrl,
  getIpfsUrl,
} from '@/lib/utils/image'

describe('getCharacterImageUrl', () => {
  it('uses the local static asset for normal unseared tokens', () => {
    expect(getCharacterImageUrl(1, {
      image: 'ipfs://bafkreiexample',
    }, 'https://example.com/db.png')).toBe('/images/characters/1.png')
  })

  it('uses structured current image before verified local base images', () => {
    expect(getCharacterImageUrl(1, {
      currentImage: {
        url: '/images/characters/current/1.png?v=base-abcdef1234567890',
        kind: 'base',
      },
      originalImage: 'ipfs://original-source-image',
    })).toBe('/images/characters/current/1.png?v=base-abcdef1234567890')
  })

  it('uses imported local asset paths before IPFS fallback for unverified normal tokens', () => {
    expect(getCharacterImageUrl(0, {
      image: 'ipfs://legacy-metadata-image',
      originalImage: 'ipfs://preserved-original-image',
      asset_import: {
        local_path: '/images/characters/2.png',
      },
    })).toBe('/images/characters/2.png')
  })

  it('uses infected image candidates before seared and local images when currently infected', () => {
    expect(getCharacterImageUrl(1, {
      isSeared: true,
      currentImage: {
        url: '/images/characters/current/1.png?v=infected-abcdef1234567890',
        kind: 'infected',
      },
      searImage: 'https://example.com/seared.png',
      infectedImage: 'https://cdn.example.com/infected.png',
    }, null, {
      infectionStatus: 'infected',
    })).toBe('/images/characters/current/1.png?v=infected-abcdef1234567890')
  })

  it('uses infected current image when metadata is self-describing and no status override is supplied', () => {
    expect(getCharacterImageUrl(1, {
      currentImage: {
        url: '/images/characters/current/1.png?v=infected-abcdef1234567890',
        kind: 'infected',
      },
    })).toBe('/images/characters/current/1.png?v=infected-abcdef1234567890')
  })

  it('does not use infected current image when an explicit healthy status is supplied', () => {
    expect(getCharacterImageUrl(1, {
      currentImage: {
        url: '/images/characters/current/1.png?v=infected-abcdef1234567890',
        kind: 'infected',
      },
    }, null, {
      infectionStatus: 'healthy',
    })).toBe('/images/characters/1.png')
  })

  it('uses structured seared current image before legacy sear image and local static image', () => {
    expect(getCharacterImageCandidates(1, {
      currentImage: {
        url: '/images/characters/current/1.png?v=seared-deadbeef-log0-abcdef1234567890',
        kind: 'seared',
      },
      searImage: 'https://example.com/legacy-seared.png',
      searing_materialization: {
        seared_image_url: 'https://storage.googleapis.com/seared-wagdie-images/1/tx-test-log-1.png',
      },
    })).toEqual([
      '/images/characters/current/1.png?v=seared-deadbeef-log0-abcdef1234567890',
      'https://storage.googleapis.com/seared-wagdie-images/1/tx-test-log-1.png',
      'https://example.com/legacy-seared.png',
      '/images/characters/1.png',
      '/images/placeholder-character.svg',
    ])
  })

  it('uses DB image URL as a seared candidate when metadata indicates the character is seared', () => {
    expect(getCharacterImageUrl(1, {
      isSeared: true,
    }, 'https://example.com/db-seared.png')).toBe('https://example.com/db-seared.png')
  })

  it('does not promote original metadata image when only isSeared is present', () => {
    expect(getCharacterImageUrl(1, {
      isSeared: true,
      image: 'ipfs://original-source-image',
    })).toBe('/images/characters/1.png')
  })

  it('uses originalImage as the explicit degraded fallback before placeholder', () => {
    expect(getCharacterImageCandidates(0, {
      image: 'ipfs://legacy-metadata-image',
      originalImage: 'ipfs://preserved-original-image',
    }, 'https://example.com/db.png')).toEqual([
      'https://ipfs.io/ipfs/preserved-original-image',
      'https://gateway.pinata.cloud/ipfs/preserved-original-image',
      'https://dweb.link/ipfs/preserved-original-image',
      '/images/placeholder-character.svg',
    ])
  })

  it('falls back to the placeholder when a token has no usable current, original, or local image', () => {
    expect(getCharacterImageUrl(0, {
      image: 'ipfs://bafkreiexample',
    }, 'https://example.com/db.png')).toBe('/images/placeholder-character.svg')
  })

  it('exposes seared image disclosure without changing infected primary precedence', () => {
    const disclosure = getCharacterImageDisclosure(1, {
      isSeared: true,
      searImage: 'https://example.com/seared.png',
      infectedImage: 'https://cdn.example.com/infected.png',
    }, null, {
      infectionStatus: 'infected',
    })

    expect(disclosure.primaryUrl).toBe('https://cdn.example.com/infected.png')
    expect(disclosure.searedImageUrl).toBe('https://example.com/seared.png')
    expect(disclosure.hasSearedImage).toBe(true)
    expect(disclosure.isSearedPrimary).toBe(false)
    expect(disclosure.isCurrentlyInfected).toBe(true)
    expect(disclosure.isSearedImageHiddenByInfection).toBe(true)
  })

  it('marks seared image primary when no infected image masks it', () => {
    const disclosure = getCharacterImageDisclosure(1, {
      isSeared: true,
      searing_materialization: {
        seared_image_url: 'https://storage.googleapis.com/seared-wagdie-images/1/tx-test-log-1.png',
      },
    })

    expect(disclosure.primaryUrl).toBe('https://storage.googleapis.com/seared-wagdie-images/1/tx-test-log-1.png')
    expect(disclosure.searedImageUrl).toBe(disclosure.primaryUrl)
    expect(disclosure.isSearedPrimary).toBe(true)
    expect(disclosure.isSearedImageHiddenByInfection).toBe(false)
  })

  it('still normalizes IPFS URLs for collector and utility callers', () => {
    expect(getIpfsUrl('ipfs://bafkreiexample')).toBe('https://ipfs.io/ipfs/bafkreiexample')
  })
})
