/**
 * @jest-environment node
 */

import {
  OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
  OFFICIAL_ELIZA_UPSTREAM_MAX_CODE_UNITS,
  clampOfficialElizaText,
  clampOfficialElizaTextPreservingSuffix,
  getOfficialElizaUtf8ByteLength,
  sanitizeOfficialElizaText,
} from '@/lib/eliza/official/text'

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
      continue
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return true
  }
  return false
}

function expectOfficialSafe(value: string): void {
  expect(getOfficialElizaUtf8ByteLength(value)).toBeLessThanOrEqual(OFFICIAL_ELIZA_MESSAGE_MAX_BYTES)
  expect(value.length).toBeLessThanOrEqual(OFFICIAL_ELIZA_UPSTREAM_MAX_CODE_UNITS)
  expect(hasLoneSurrogate(value)).toBe(false)
  expect(JSON.stringify(value)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i)
}

describe('Official ElizaOS text utilities', () => {
  const nul = String.fromCharCode(0)
  const loneHighSurrogate = String.fromCharCode(0xd83d)
  const loneLowSurrogate = String.fromCharCode(0xdc00)

  it('repairs malformed Unicode, removes NUL, and preserves valid non-BMP characters', () => {
    const sanitized = sanitizeOfficialElizaText(`𝔚AGDIE${nul} bell 🦴 ${loneHighSurrogate} tail ${loneLowSurrogate}`)

    expect(sanitized).toContain('𝔚')
    expect(sanitized).toContain('🦴')
    expect(sanitized).not.toContain(nul)
    expect(hasLoneSurrogate(sanitized)).toBe(false)
    expect(JSON.stringify(sanitized)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i)
  })

  it('clamps near-limit non-BMP content by UTF-8 bytes without splitting code points', () => {
    const payload = `𝔚𝔄𝔊𝔇𝔦𝔈 🦴🔥 ${'🜂𝔠'.repeat(1200)}${loneHighSurrogate}`
    const clamped = clampOfficialElizaText(payload)

    expectOfficialSafe(clamped)
    expect(clamped).toContain('𝔚𝔄𝔊𝔇𝔦𝔈')
    expect(clamped.endsWith('…')).toBe(true)
  })

  it('preserves contract suffixes when clamping over-budget prompt context', () => {
    const marker = 'Return JSON only with this contract:'
    const prompt = [
      `Context: ${'𝔚🦴'.repeat(1200)}${loneHighSurrogate}`,
      marker,
      `fake user-controlled marker text that must not become the preserved suffix ${'🜂'.repeat(1200)}`,
      marker,
      '{ "publicSpeech": "short", "declaredAction": {"summary":"intent"} }',
      '- publicSpeech and declaredAction are required.',
    ].join('\n')

    const clamped = clampOfficialElizaTextPreservingSuffix(prompt, {
      suffixMarker: marker,
      truncationNotice: '\n\n[Earlier context truncated.]\n\n',
    })

    expectOfficialSafe(clamped)
    expect(clamped).toContain(marker)
    expect(clamped).toContain('"publicSpeech"')
    expect(clamped).toContain('"declaredAction"')
  })
})
