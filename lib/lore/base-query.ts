import {
  getStaticLoreBaseDataset,
  validateLoreBaseDataset,
  type LoreBaseDataset,
  type LoreBaseSource,
} from './base-dataset';
import type { LoreBaseRepositoryLike } from '../repositories/lore-base-repository';

export type LoreBaseSourceMode = 'static' | 'auto';

export interface LoreBaseQueryOptions {
  source?: LoreBaseSourceMode;
  repository?: LoreBaseRepositoryLike;
  logger?: Pick<Console, 'warn'>;
  validate?: boolean;
}

export interface LoreBaseQueryDiagnostics {
  configuredSource: LoreBaseSourceMode;
  activeSource: LoreBaseSource;
  fallback: {
    used: boolean;
    reason?: string;
  };
}

export interface LoreBaseDatasetLoadResult {
  dataset: LoreBaseDataset;
  diagnostics: LoreBaseQueryDiagnostics;
}

const DEFAULT_SOURCE_MODE: LoreBaseSourceMode = 'auto';
let hasWarnedAboutDbFallback = false;

const getConfiguredSourceMode = (source?: LoreBaseSourceMode): LoreBaseSourceMode => {
  const configured = source ?? process.env.LORE_BASE_SOURCE ?? DEFAULT_SOURCE_MODE;

  if (configured === 'static' || configured === 'auto') {
    return configured;
  }

  return DEFAULT_SOURCE_MODE;
};

const getDefaultRepository = async (): Promise<LoreBaseRepositoryLike> => {
  const { loreBaseRepository } = await import('../repositories/lore-base-repository');
  return loreBaseRepository;
};

const warnFallbackOnce = (logger: Pick<Console, 'warn'>, message: string): void => {
  if (hasWarnedAboutDbFallback) {
    return;
  }

  hasWarnedAboutDbFallback = true;
  logger.warn(message);
};

const loadDatabaseDataset = async (options: LoreBaseQueryOptions): Promise<LoreBaseDataset> => {
  const repository = options.repository ?? await getDefaultRepository();
  const dataset = await repository.loadPublishedDataset();

  if (options.validate !== false) {
    const validation = validateLoreBaseDataset(dataset);
    if (!validation.valid) {
      throw new Error(`Invalid database lore base dataset: ${validation.errors.join('; ')}`);
    }
  }

  return dataset;
};

export const getActiveLoreBaseDatasetWithDiagnostics = async (
  options: LoreBaseQueryOptions = {},
): Promise<LoreBaseDatasetLoadResult> => {
  const configuredSource = getConfiguredSourceMode(options.source);

  if (configuredSource === 'static') {
    const dataset = getStaticLoreBaseDataset();
    return {
      dataset,
      diagnostics: {
        configuredSource,
        activeSource: dataset.source,
        fallback: { used: false },
      },
    };
  }

  try {
    const dataset = await loadDatabaseDataset(options);
    return {
      dataset,
      diagnostics: {
        configuredSource,
        activeSource: dataset.source,
        fallback: { used: false },
      },
    };
  } catch (error) {
    const logger = options.logger ?? console;
    const reason = error instanceof Error ? error.message : String(error);
    warnFallbackOnce(logger, `Falling back to static lore base dataset: ${reason}`);
    const dataset = getStaticLoreBaseDataset();
    return {
      dataset,
      diagnostics: {
        configuredSource,
        activeSource: dataset.source,
        fallback: { used: true, reason },
      },
    };
  }
};

export const getActiveLoreBaseDataset = async (
  options: LoreBaseQueryOptions = {},
): Promise<LoreBaseDataset> => {
  const { dataset } = await getActiveLoreBaseDatasetWithDiagnostics(options);
  return dataset;
};

export const resetLoreBaseQueryWarningsForTests = (): void => {
  hasWarnedAboutDbFallback = false;
};
