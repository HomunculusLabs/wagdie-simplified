import type { GenerationDiagnosticsBase } from './diagnostics'

type RepairRunnerFailureOptions<Diagnostics extends GenerationDiagnosticsBase> = {
  diagnostics: Diagnostics
  cause: unknown
}

export type GenerationRepairRunnerOptions<Output, Diagnostics extends GenerationDiagnosticsBase> = {
  initialText: string
  parseInitial: (text: string) => Output
  buildInitialFailureDiagnostics: (text: string, error: unknown) => Diagnostics
  buildAcceptedDiagnostics: (text: string) => Diagnostics
  collectRepairText: (diagnostics: Diagnostics) => Promise<string>
  parseRepair: (text: string) => Output
  buildRepairedDiagnostics: (diagnostics: Diagnostics, repairText: string) => Diagnostics
  buildRepairCollectionFailureDiagnostics: (diagnostics: Diagnostics, repairText: string, error: unknown) => Diagnostics
  buildRepairValidationFailureDiagnostics: (diagnostics: Diagnostics, repairText: string, error: unknown) => Diagnostics
  createRepairCollectionError: (options: RepairRunnerFailureOptions<Diagnostics>) => Error
  createRepairValidationError: (options: RepairRunnerFailureOptions<Diagnostics>) => Error
}

export type GenerationRepairRunnerResult<Output, Diagnostics extends GenerationDiagnosticsBase> = {
  output: Output
  diagnostics: Diagnostics
  responseText: string
}

export async function runGenerationRepair<Output, Diagnostics extends GenerationDiagnosticsBase>(
  options: GenerationRepairRunnerOptions<Output, Diagnostics>
): Promise<GenerationRepairRunnerResult<Output, Diagnostics>> {
  try {
    return {
      output: options.parseInitial(options.initialText),
      diagnostics: options.buildAcceptedDiagnostics(options.initialText),
      responseText: options.initialText,
    }
  } catch (initialError) {
    const diagnostics = options.buildInitialFailureDiagnostics(options.initialText, initialError)
    let repairText = ''

    try {
      repairText = await options.collectRepairText(diagnostics)
    } catch (repairCollectionError) {
      const failedDiagnostics = options.buildRepairCollectionFailureDiagnostics(
        diagnostics,
        repairText,
        repairCollectionError
      )
      throw options.createRepairCollectionError({
        diagnostics: failedDiagnostics,
        cause: repairCollectionError,
      })
    }

    try {
      return {
        output: options.parseRepair(repairText),
        diagnostics: options.buildRepairedDiagnostics(diagnostics, repairText),
        responseText: repairText,
      }
    } catch (repairError) {
      const failedDiagnostics = options.buildRepairValidationFailureDiagnostics(
        diagnostics,
        repairText,
        repairError
      )
      throw options.createRepairValidationError({
        diagnostics: failedDiagnostics,
        cause: repairError,
      })
    }
  }
}
