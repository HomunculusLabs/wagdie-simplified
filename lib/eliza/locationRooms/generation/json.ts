import { normalizeOfficialResponseText } from '@/lib/eliza/official/messaging'

export type GenerationJsonObject = Record<string, unknown>

export function normalizeGenerationResponseText(raw: string): string {
  return normalizeOfficialResponseText(raw)
}

export function trimGenerationTextToLimit(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeGenerationResponseText(value)
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null
  return normalized.slice(0, limit).trim() || null
}

export function extractGenerationJsonObject(raw: string, label = 'Generation response'): GenerationJsonObject {
  const text = normalizeGenerationResponseText(raw)
  if (!text) {
    throw new Error(`${label} was empty`)
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? text
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(`${label} did not contain a JSON object`)
  }

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not_object')
    }
    return parsed as GenerationJsonObject
  } catch {
    throw new Error(`${label} contained invalid JSON`)
  }
}
