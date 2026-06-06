export const VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_IDS = [] as const

const VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_ID_SET = new Set<number>(VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_IDS)

/**
 * True only when the generated asset manifest verified the local base image bytes
 * against the canonical original source bytes.
 */
export function hasLocalCharacterImage(tokenId: number): boolean {
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    return false
  }

  return VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_ID_SET.has(tokenId)
}
