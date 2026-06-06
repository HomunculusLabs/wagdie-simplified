/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/official/messaging', () => ({
  normalizeOfficialResponseText: (text: string) => text.trim(),
}))

import { extractGenerationJsonObject } from '@/lib/eliza/locationRooms/generation/json'

describe('location-room generation JSON extraction', () => {
  it('parses a balanced JSON object before trailing prose', () => {
    expect(extractGenerationJsonObject('{"publicNarration":"The cask splits."}\nExtra note: ignore this.')).toEqual({
      publicNarration: 'The cask splits.',
    })
  })

  it('repairs common model almost-JSON without inventing content', () => {
    const parsed = extractGenerationJsonObject(`{
      publicNarration: 'The cask splits open beside the crow nest.',
      stateSummary: "The room changes",
      openThreads: ['What crawls out?',],
    }`)

    expect(parsed).toEqual({
      publicNarration: 'The cask splits open beside the crow nest.',
      stateSummary: 'The room changes',
      openThreads: ['What crawls out?'],
    })
  })

  it('escapes raw control characters inside model strings', () => {
    const parsed = extractGenerationJsonObject('{"publicNarration":"Line one\nLine two","stateSummary":"A\tB"}')

    expect(parsed).toEqual({
      publicNarration: 'Line one\nLine two',
      stateSummary: 'A\tB',
    })
  })
})
