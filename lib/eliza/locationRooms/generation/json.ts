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

function parseJsonObject(candidate: string): GenerationJsonObject | null {
  try {
    const parsed = JSON.parse(candidate)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as GenerationJsonObject
  } catch {
    return null
  }
}

function sliceBalancedJsonObject(candidate: string): string | null {
  const firstBrace = candidate.indexOf('{')
  if (firstBrace < 0) return null

  let depth = 0
  let inString = false
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = firstBrace; index < candidate.length; index += 1) {
    const char = candidate[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        inString = false
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      quote = char
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return candidate.slice(firstBrace, index + 1)
    }
  }

  const lastBrace = candidate.lastIndexOf('}')
  if (lastBrace <= firstBrace) return null
  return candidate.slice(firstBrace, lastBrace + 1)
}

function escapeJsonStringValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function quoteSingleQuotedJsonStrings(candidate: string): string {
  return candidate.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value: string) => {
    return `"${escapeJsonStringValue(value.replace(/\\'/g, "'"))}"`
  })
}

function escapeControlCharactersInsideDoubleQuotedStrings(candidate: string): string {
  let output = ''
  let inString = false
  let escaped = false

  for (const char of candidate) {
    if (!inString) {
      output += char
      if (char === '"') inString = true
      continue
    }

    if (escaped) {
      output += char
      escaped = false
      continue
    }

    if (char === '\\') {
      output += char
      escaped = true
      continue
    }

    if (char === '"') {
      output += char
      inString = false
      continue
    }

    if (char === '\n') {
      output += '\\n'
      continue
    }
    if (char === '\r') {
      output += '\\r'
      continue
    }
    if (char === '\t') {
      output += '\\t'
      continue
    }

    output += char
  }

  return output
}

function repairJsonObjectCandidate(candidate: string): string {
  let repaired = candidate.trim()
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  repaired = quoteSingleQuotedJsonStrings(repaired)
  repaired = repaired
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')

  return escapeControlCharactersInsideDoubleQuotedStrings(repaired)
}

export function extractGenerationJsonObject(raw: string, label = 'Generation response'): GenerationJsonObject {
  const text = normalizeGenerationResponseText(raw)
  if (!text) {
    throw new Error(`${label} was empty`)
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? text
  const sliced = sliceBalancedJsonObject(candidate)
  if (!sliced) {
    throw new Error(`${label} did not contain a JSON object`)
  }

  const parsed = parseJsonObject(sliced) ?? parseJsonObject(repairJsonObjectCandidate(sliced))
  if (!parsed) {
    throw new Error(`${label} contained invalid JSON`)
  }
  return parsed
}
