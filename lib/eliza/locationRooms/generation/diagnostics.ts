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
  transportStage?: TransportStage
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: GenerationResponseFlags
  repairResponseFlags?: GenerationResponseFlags
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
  flags: GenerationResponseFlags = buildGenerationResponseFlags(raw)
): Diagnostics {
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory,
    initialResponseLength: raw.length,
    initialResponseFlags: flags,
  } as Diagnostics
}

export function repairTransportFailureDiagnostics<Diagnostics extends GenerationDiagnosticsBase, ErrorCategory extends string, TransportStage extends string>(
  diagnostics: Diagnostics,
  repairText: string,
  repairErrorCategory: ErrorCategory,
  transportStage: TransportStage,
  flags: GenerationResponseFlags = buildGenerationResponseFlags(repairText)
): Diagnostics {
  return {
    ...diagnostics,
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    repairErrorCategory,
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
  flags: GenerationResponseFlags = buildGenerationResponseFlags(repairText)
): Diagnostics {
  return {
    ...diagnostics,
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    repairErrorCategory,
    repairResponseLength: repairText.length,
    repairResponseFlags: flags,
  }
}
