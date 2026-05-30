/**
 * Eliza Gateway Configuration
 * Environment-based configuration for the app-owned Eliza/Venice gateway
 */

const DEFAULT_ELIZA_BASE_URL = 'https://eliza-api.runiverse.ai' as const
const DEFAULT_VENICE_BASE_URL = 'https://api.venice.ai/api/v1' as const

type ElizaInferenceProvider = 'venice'
export type ElizaIntegrationMode = 'legacy' | 'dual' | 'official'
export type ElizaLocationRoomGameplayDifficulty = 'easy' | 'normal' | 'hard' | 'deadly'
export type ElizaLocationRoomDiceVisibility = 'private' | 'summary' | 'public'
export type ElizaLocationRoomGameplayStatKey =
  | 'str'
  | 'dex'
  | 'con'
  | 'int'
  | 'wis'
  | 'cha'
  | 'maxHp'
  | 'ac'
  | 'speed'
export type ElizaLocationRoomGameplayConcordModifierTarget =
  | ElizaLocationRoomGameplayStatKey
  | 'attack'
  | 'defend'
  | 'help'
  | 'investigate'
  | 'negotiate'
  | 'flee'
  | 'rest'

export type ElizaLocationRoomGameplayConcordModifierConfig = {
  concordId: number
  target: ElizaLocationRoomGameplayConcordModifierTarget
  value: number
  label?: string
}

export type ElizaLocationRoomGameplayConcordRewardTierConfig = {
  minScore: number
  chainId: number
  contractAddress: string
  concordId: number
  amount: number
}

function getIntegrationMode(): ElizaIntegrationMode {
  const mode = process.env.ELIZA_INTEGRATION_MODE

  if (mode === 'dual' || mode === 'official') {
    return mode
  }

  return 'legacy'
}

function getInferenceProvider(): ElizaInferenceProvider {
  return 'venice'
}

function optionalNumberInRange(
  value: string | undefined,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  if (options.integer && !Number.isInteger(parsed)) {
    return undefined
  }

  if (typeof options.min === 'number' && parsed < options.min) {
    return undefined
  }

  if (typeof options.max === 'number' && parsed > options.max) {
    return undefined
  }

  return parsed
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return undefined
}

function optionalStringList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function optionalJsonArray<T>(value: string | undefined): T[] | undefined {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : undefined
  } catch {
    return undefined
  }
}

function getGameplayDifficulty(): ElizaLocationRoomGameplayDifficulty {
  const value = process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEFAULT_DIFFICULTY?.trim().toLowerCase()
  if (value === 'easy' || value === 'hard' || value === 'deadly') {
    return value
  }

  return 'normal'
}

function getGameplayDiceVisibility(): ElizaLocationRoomDiceVisibility {
  const value = process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DICE_VISIBILITY?.trim().toLowerCase()
  if (value === 'summary' || value === 'public') {
    return value
  }

  return 'private'
}

export const elizaConfig = {
  /**
   * Server-only mode flag for the Eliza gateway.
   *
   * `legacy` and `dual` use the app-owned gateway behavior; `official` routes
   * through the WAGDIE-hosted official ElizaOS adapter.
   */
  mode: getIntegrationMode(),

  /**
   * Base URL for Eliza API.
   * Prefer server-only ELIZA_API_URL; NEXT_PUBLIC_ELIZA_API_URL is a fallback.
   */
  baseUrl:
    process.env.ELIZA_API_URL ||
    process.env.NEXT_PUBLIC_ELIZA_API_URL ||
    DEFAULT_ELIZA_BASE_URL,

  /**
   * API key for server-side authentication
   * Only available on server-side
   */
  apiKey: process.env.ELIZA_API_KEY || '',

  /**
   * Request timeout in milliseconds
   */
  timeout: 30000,

  /**
   * Retry configuration for failed requests
   */
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    retryServerErrors: true,
  },

  /**
   * Legacy/dual inference provider configuration.
   *
   * In official mode the hosted ElizaOS service owns Venice provider secrets and
   * streaming; the WAGDIE app only calls that service server-to-server.
   */
  inference: {
    provider: getInferenceProvider(),
    baseUrl:
      process.env.ELIZA_LLM_BASE_URL ||
      process.env.VENICE_API_BASE_URL ||
      process.env.VENICE_BASE_URL ||
      DEFAULT_VENICE_BASE_URL,
    apiKey: process.env.ELIZA_LLM_API_KEY || process.env.VENICE_API_KEY || '',
    model:
      process.env.ELIZA_LLM_MODEL ||
      process.env.VENICE_MODEL ||
      process.env.VENICE_LARGE_MODEL ||
      process.env.VENICE_SMALL_MODEL ||
      '',
    temperature: optionalNumberInRange(process.env.ELIZA_LLM_TEMPERATURE, { min: 0, max: 2 }),
    maxTokens: optionalNumberInRange(process.env.ELIZA_LLM_MAX_TOKENS, {
      min: 1,
      integer: true,
    }),
  },

  /**
   * WAGDIE-hosted official ElizaOS service configuration.
   *
   * The official service owns Venice provider secrets. WAGDIE only stores the
   * service URL and server-to-server credential needed to call ElizaOS.
   */
  official: {
    baseUrl: process.env.ELIZAOS_BASE_URL || '',
    apiKey: process.env.ELIZAOS_API_KEY || '',
    healthPath: process.env.ELIZAOS_HEALTH_PATH || '/api/server/health',
  },

  /**
   * Public location-pin room settings for scheduled elizaOS character turns.
   * Disabled by default until the room domain/API/UI rollout is complete.
   */
  locationRooms: {
    enabled: optionalBoolean(process.env.ELIZA_LOCATION_ROOMS_ENABLED) ?? false,
    tickIntervalMinutes:
      optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES, {
        min: 1,
        integer: true,
      }) ?? 360,
    activeNarrativeTickIntervalMinutes:
      optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_ACTIVE_NARRATIVE_TICK_INTERVAL_MINUTES, {
        min: 1,
        integer: true,
      }) ?? 15,
    workerLocationAllowlist: optionalStringList(
      process.env.ELIZA_LOCATION_ROOM_WORKER_LOCATION_ALLOWLIST ||
        process.env.ELIZA_LOCATION_ROOM_WORKER_LOCATION_IDS
    ) ?? [],
    maxTicksPerRun:
      optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN, {
        min: 1,
        integer: true,
      }) ?? 5,
    transcriptWindow:
      optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_TRANSCRIPT_WINDOW, {
        min: 1,
        integer: true,
      }) ?? 20,
    narrative: {
      enabled: optionalBoolean(process.env.ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED) ?? false,
      gameMasterAgentId: process.env.ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID?.trim() || '',
      publicNarrationMaxLength:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_NARRATIVE_PUBLIC_NARRATION_MAX_LENGTH, {
          min: 1,
          integer: true,
        }) ?? 800,
      stateSummaryMaxLength:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_NARRATIVE_STATE_SUMMARY_MAX_LENGTH, {
          min: 1,
          integer: true,
        }) ?? 2000,
      openThreadsMaxCount:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_NARRATIVE_OPEN_THREADS_MAX_COUNT, {
          min: 0,
          integer: true,
        }) ?? 5,
      openThreadMaxLength:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_NARRATIVE_OPEN_THREAD_MAX_LENGTH, {
          min: 1,
          integer: true,
        }) ?? 240,
      publicGmBeatMaxAgentMessages:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_PUBLIC_GM_BEAT_MAX_AGENT_MESSAGES, {
          min: 1,
          integer: true,
        }) ?? 5,
      publicGmBeatMaxSceneChecks:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_PUBLIC_GM_BEAT_MAX_SCENE_CHECKS, {
          min: 1,
          integer: true,
        }) ?? 3,
      publicGmBeatMinMessagesBetween:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_PUBLIC_GM_BEAT_MIN_MESSAGES_BETWEEN, {
          min: 1,
          integer: true,
        }) ?? 4,
    },
    gameplay: {
      enabled: optionalBoolean(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED) ?? false,
      locationAllowlist: optionalStringList(
        process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_ALLOWLIST ||
          process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_IDS
      ) ?? [],
      defaultDifficulty: getGameplayDifficulty(),
      maxEncounterRounds:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS, {
          min: 1,
          max: 200,
          integer: true,
        }) ?? 6,
      automation: {
        targetCompletedTurns:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS, {
            min: 1,
            max: 10000,
            integer: true,
          }) ?? 20,
        maxActiveRunsPerWorker:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_MAX_ACTIVE_RUNS_PER_WORKER, {
            min: 1,
            max: 100,
            integer: true,
          }) ?? 10,
      },
      actionIntentMaxLength:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_ACTION_INTENT_MAX_LENGTH, {
          min: 1,
          max: 1000,
          integer: true,
        }) ?? 240,
      publicSpeechMaxLength:
        optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_PUBLIC_SPEECH_MAX_LENGTH, {
          min: 1,
          max: 2000,
          integer: true,
        }) ?? 500,
      diceVisibility: getGameplayDiceVisibility(),
      monsterBudget: {
        baseBudgetByLevel: {
          1: optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_BASE_BUDGET_LEVEL_1, {
            min: 1,
            integer: true,
          }) ?? 25,
        },
        minMonsterCount: 1,
        maxMonsterCount:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_MONSTER_COUNT, {
            min: 1,
            max: 12,
            integer: true,
          }) ?? 3,
        maxTotalMonsterHp:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_TOTAL_MONSTER_HP, {
            min: 1,
            integer: true,
          }) ?? 36,
      },
      rewardBudget: {
        maxXpPerCharacter:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_XP_PER_CHARACTER, {
            min: 0,
            integer: true,
          }) ?? 100,
        maxTemporaryBoons:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_TEMPORARY_BOONS, {
            min: 0,
            max: 10,
            integer: true,
          }) ?? 2,
        maxNarrativeRewards:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_NARRATIVE_REWARDS, {
            min: 0,
            max: 10,
            integer: true,
          }) ?? 3,
      },
      stats: {
        enabled: optionalBoolean(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_ENABLED) ?? false,
        refreshSheetOnReconcile:
          optionalBoolean(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_REFRESH_ON_RECONCILE) ?? true,
        modifiers: {
          maxEquipmentModifierPerRoll:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_MAX_EQUIPMENT_MODIFIER_PER_ROLL, {
              min: 0,
              max: 5,
              integer: true,
            }) ?? 1,
          maxNftTraitModifierPerRoll:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_MAX_NFT_TRAIT_MODIFIER_PER_ROLL, {
              min: 0,
              max: 5,
              integer: true,
            }) ?? 1,
          maxSearedConcordModifierPerRoll:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_MAX_SEARED_CONCORD_MODIFIER_PER_ROLL, {
              min: 0,
              max: 5,
              integer: true,
            }) ?? 1,
          maxTotalNonStatModifierPerRoll:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_MAX_TOTAL_NON_STAT_MODIFIER_PER_ROLL, {
              min: 0,
              max: 10,
              integer: true,
            }) ?? 2,
          maxEffectiveAcBonus:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_MAX_EFFECTIVE_AC_BONUS, {
              min: 0,
              max: 10,
              integer: true,
            }) ?? 2,
          concordAllowlist:
            optionalJsonArray<ElizaLocationRoomGameplayConcordModifierConfig>(
              process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_STATS_CONCORD_ALLOWLIST_JSON
            ) ?? [],
        },
      },
      deathRewards: {
        enabled: optionalBoolean(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_ENABLED) ?? false,
        policyVersion: process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_POLICY_VERSION?.trim() || 'death-rewards-v1',
        pointsMultiplier:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_POINTS_MULTIPLIER, {
            min: 0,
          }) ?? 1,
        pointsCap:
          optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_POINTS_CAP, {
            min: 0,
            integer: true,
          }) ?? 100,
        difficultyMultipliers: {
          easy:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_DIFFICULTY_EASY, {
              min: 0,
            }) ?? 0.75,
          normal:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_DIFFICULTY_NORMAL, {
              min: 0,
            }) ?? 1,
          hard:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_DIFFICULTY_HARD, {
              min: 0,
            }) ?? 1.25,
          deadly:
            optionalNumberInRange(process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_DIFFICULTY_DEADLY, {
              min: 0,
            }) ?? 1.5,
        },
        concordEntitlementTiers:
          optionalJsonArray<ElizaLocationRoomGameplayConcordRewardTierConfig>(
            process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_DEATH_REWARDS_CONCORD_TIERS_JSON
          ) ?? [],
      },
    },
  },

  /**
   * Context window size for AI conversations
   * Only recent messages are sent to the AI
   */
  contextWindowSize: 30,

  /**
   * Maximum messages to load per page
   */
  messagesPerPage: 50,
} as const

/**
 * Check if Eliza API is configured
 */
export function isElizaConfigured(): boolean {
  return Boolean(elizaConfig.baseUrl)
}

/**
 * Check if running on server side with API key
 */
export function hasServerAuth(): boolean {
  return typeof window === 'undefined' && Boolean(elizaConfig.apiKey)
}

/**
 * Check if Venice/OpenAI-compatible inference is configured.
 */
export function hasVeniceInference(): boolean {
  return Boolean(
    elizaConfig.inference.baseUrl &&
      elizaConfig.inference.apiKey &&
      elizaConfig.inference.model
  )
}
