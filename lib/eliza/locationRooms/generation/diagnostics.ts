import { normalizeGenerationResponseText } from './json'

export type GenerationResponseFlags = {
  empty: boolean
  hasJsonObject: boolean
  fencedJson: boolean
  startsWithJsonObject: boolean
}

export type GenerationDiagnosticsStatus = 'accepted' | 'repaired' | 'repair_failed'

export type GenerationDiagnosticsBase<ErrorCategory extends string = string, TransportStage extends string = string> = {
  status: GenerationDiagnosticsStatus
  repairAttempted: boolean
  repaired: boolean
  initialErrorCategory?: ErrorCategory
  repairErrorCategory?: ErrorCategory
  initialErrorMessage?: string
  repairErrorMessage?: string
  transportStage?: TransportStage
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: GenerationResponseFlags
  repairResponseFlags?: GenerationResponseFlags
}

export function sanitizeGenerationDiagnosticError(error: unknown, maxLength = 700): string | undefined {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String(error ?? '')
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…` : normalized
}

export function buildGenerationResponseFlags(raw: string): GenerationResponseFlags {
  const text = normalizeGenerationResponseText(raw)
  return {
    empty: text.length === 0,
    hasJsonObject: /\{[\s\S]*\}/.test(text),
    fencedJson: /```(?:json)?[\s\S]*?```/i.test(text),
    startsWithJsonObject: text.trimStart().startsWith('{'),
  }
}

export function acceptedGenerationDiagnostics<Diagnostics extends GenerationDiagnosticsBase>(
  raw: string,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(raw)
): Diagnostics {
  return {
    status: 'accepted',
    repairAttempted: false,
    repaired: false,
    initialResponseLength: raw.length,
    initialResponseFlags: flags,
  } as Diagnostics
}

export function repairAttemptedGenerationDiagnostics<Diagnostics extends GenerationDiagnosticsBase, ErrorCategory extends string>(
  raw: string,
  initialErrorCategory: ErrorCategory,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(raw),
  initialError?: unknown
): Diagnostics {
  const initialErrorMessage = sanitizeGenerationDiagnosticError(initialError)
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory,
    ...(initialErrorMessage ? { initialErrorMessage } : {}),
    initialResponseLength: raw.length,
    initialResponseFlags: flags,
  } as Diagnostics
}

export function repairTransportFailureDiagnostics<Diagnostics extends GenerationDiagnosticsBase, ErrorCategory extends string, TransportStage extends string>(
  diagnostics: Diagnostics,
  repairText: string,
  repairErrorCategory: ErrorCategory,
  transportStage: TransportStage,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(repairText),
  repairError?: unknown
): Diagnostics {
  const repairErrorMessage = sanitizeGenerationDiagnosticError(repairError)
  return {
    ...diagnostics,
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    repairErrorCategory,
    ...(repairErrorMessage ? { repairErrorMessage } : {}),
    transportStage,
    repairResponseLength: repairText.length,
    repairResponseFlags: flags,
  }
}

export function repairedGenerationDiagnostics<Diagnostics extends GenerationDiagnosticsBase>(
  diagnostics: Diagnostics,
  repairText: string,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(repairText)
): Diagnostics {
  return {
    ...diagnostics,
    status: 'repaired',
    repairAttempted: true,
    repaired: true,
    repairResponseLength: repairText.length,
    repairResponseFlags: flags,
  }
}

export function repairValidationFailureDiagnostics<Diagnostics extends GenerationDiagnosticsBase, ErrorCategory extends string>(
  diagnostics: Diagnostics,
  repairText: string,
  repairErrorCategory: ErrorCategory,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(repairText),
  repairError?: unknown
): Diagnostics {
  const repairErrorMessage = sanitizeGenerationDiagnosticError(repairError)
  return {
    ...diagnostics,
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    repairErrorCategory,
    ...(repairErrorMessage ? { repairErrorMessage } : {}),
    repairResponseLength: repairText.length,
    repairResponseFlags: flags,
  }
}
