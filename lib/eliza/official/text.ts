export const OFFICIAL_ELIZA_MESSAGE_MAX_BYTES = 3900
export const OFFICIAL_ELIZA_UPSTREAM_MAX_CODE_UNITS = 4000
export const OFFICIAL_ELIZA_TRUNCATION_ELLIPSIS = '…'

const replacementCharacter = '\uFFFD'

function utf8Encoder(): TextEncoder {
  return new TextEncoder()
}

export function getOfficialElizaUtf8ByteLength(value: string): number {
  return utf8Encoder().encode(value).length
}

export function getOfficialElizaTextMetrics(value: string): { codeUnits: number; utf8Bytes: number } {
  return {
    codeUnits: value.length,
    utf8Bytes: getOfficialElizaUtf8ByteLength(value),
  }
}

export function sanitizeOfficialElizaText(value: string): string {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)

    if (codeUnit === 0) {
      continue
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1]
        index += 1
      } else {
        output += replacementCharacter
      }
      continue
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      output += replacementCharacter
      continue
    }

    output += value[index]
  }

  return output
}

export function clampOfficialElizaText(
  value: string,
  options: {
    maxBytes?: number
    truncationSuffix?: string
  } = {}
): string {
  const maxBytes = Math.max(0, options.maxBytes ?? OFFICIAL_ELIZA_MESSAGE_MAX_BYTES)
  const sanitized = sanitizeOfficialElizaText(value)
  if (getOfficialElizaUtf8ByteLength(sanitized) <= maxBytes) return sanitized

  const suffix = sanitizeOfficialElizaText(options.truncationSuffix ?? OFFICIAL_ELIZA_TRUNCATION_ELLIPSIS)
  const suffixBytes = getOfficialElizaUtf8ByteLength(suffix)
  if (suffixBytes > maxBytes) {
    return takeOfficialElizaUtf8Prefix(sanitized, maxBytes)
  }

  const prefix = takeOfficialElizaUtf8Prefix(sanitized, maxBytes - suffixBytes).trimEnd()
  const clamped = `${prefix}${suffix}`
  if (getOfficialElizaUtf8ByteLength(clamped) <= maxBytes) return clamped

  return takeOfficialElizaUtf8Prefix(clamped, maxBytes)
}

export function clampOfficialElizaTextPreservingSuffix(
  value: string,
  options: {
    suffixMarker: string
    maxBytes?: number
    truncationNotice?: string
  }
): string {
  const maxBytes = Math.max(0, options.maxBytes ?? OFFICIAL_ELIZA_MESSAGE_MAX_BYTES)
  const text = sanitizeOfficialElizaText(value)
  if (getOfficialElizaUtf8ByteLength(text) <= maxBytes) return text

  const marker = sanitizeOfficialElizaText(options.suffixMarker)
  const markerIndex = marker ? text.lastIndexOf(marker) : -1
  if (markerIndex < 0) {
    return clampOfficialElizaText(text, { maxBytes })
  }

  const prefixSource = text.slice(0, markerIndex)
  const suffix = text.slice(markerIndex)
  const suffixBytes = getOfficialElizaUtf8ByteLength(suffix)
  const notice = sanitizeOfficialElizaText(options.truncationNotice ?? '')
  const noticeBytes = getOfficialElizaUtf8ByteLength(notice)

  if (suffixBytes + noticeBytes <= maxBytes) {
    const prefixBudget = maxBytes - suffixBytes - noticeBytes
    const prefix = takeOfficialElizaUtf8Prefix(prefixSource, prefixBudget).trimEnd()
    return `${prefix}${notice}${suffix}`
  }

  if (suffixBytes <= maxBytes) {
    const prefixBudget = maxBytes - suffixBytes
    const prefix = takeOfficialElizaUtf8Prefix(prefixSource, prefixBudget).trimEnd()
    return `${prefix}${suffix}`
  }

  return clampOfficialElizaText(suffix, { maxBytes })
}

export function takeOfficialElizaUtf8Prefix(value: string, maxBytes: number): string {
  const budget = Math.max(0, maxBytes)
  if (budget === 0) return ''

  const text = sanitizeOfficialElizaText(value)
  let output = ''
  let usedBytes = 0

  for (const codePoint of text) {
    const nextBytes = getOfficialElizaUtf8ByteLength(codePoint)
    if (usedBytes + nextBytes > budget) break
    output += codePoint
    usedBytes += nextBytes
  }

  return output
}
