import { getSupabaseAdmin } from '@/lib/supabase'
import type { LocationRoom } from '../types'
import { defaultGameplayPerformanceCounters } from './types'
import type {
  CreateGameplayEncounterInput,
  CreateOrReuseGameplayTurnInput,
  CreateOrReuseRewardClaimInput,
  CreatePendingDeathReviewInput,
  GameplayCharacterState,
  GameplayCharacterStateMap,
  GameplayEffectiveStats,
  GameplayModifierSource,
  GameplayPerformanceCounters,
  GameplayRewardClaim,
  GameplayRewardClaimBeneficiarySource,
  GameplayRewardClaimLineItem,
  GameplayRewardClaimScoreBreakdown,
  GameplayRewardClaimStatus,
  GameplaySourceStats,
  GameplayDeathReview,
  GameplayDiceRollResult,
  GameplayEncounter,
  GameplayEncounterStatus,
  GameplayRoomState,
  GameplayRoomStatus,
  GameplayTurn,
  GameplayTurnStatus,
  StoreGameplayTurnOutcomeInput,
  UpdateGameplayDeathReviewInput,
  UpdateGameplayEncounterInput,
  UpdateGameplayRoomStateInput,
  EnsureGameplayRoomStateInput,
  ListGameplayDeathReviewsInput,
  ListGameplayRewardClaimsInput,
  UpdateGameplayRewardClaimStatusInput,
} from './types'

const STATES_TABLE = 'eliza_location_room_gameplay_states'
const ENCOUNTERS_TABLE = 'eliza_location_room_gameplay_encounters'
const TURNS_TABLE = 'eliza_location_room_gameplay_turns'
const DEATH_REVIEWS_TABLE = 'eliza_location_room_gameplay_death_reviews'
const REWARD_CLAIMS_TABLE = 'eliza_location_room_gameplay_reward_claims'
const MAX_STORED_ERROR_LENGTH = 1000

const STATE_COLUMNS =
  'id, room_id, location_id, status, active_encounter_id, characters, rewards, metadata, created_at, updated_at'
const ENCOUNTER_COLUMNS =
  'id, room_id, location_id, status, difficulty, round_number, public_title, public_summary, monster_state, reward_plan, mechanics, metadata, last_error, created_at, updated_at, completed_at'
const TURN_COLUMNS =
  'id, room_id, location_id, tick_id, encounter_id, status, selected_token_id, action, dice_results, mechanical_deltas, public_message_ids, outcome_summary, metadata, last_error, created_at, updated_at, completed_at'
const DEATH_REVIEW_COLUMNS =
  'id, room_id, location_id, encounter_id, turn_id, token_id, gameplay_death_status, review_status, admin_wallet, decided_at, burn_sync_status, context, metadata, last_error, created_at, updated_at'
const REWARD_CLAIM_COLUMNS =
  'id, room_id, location_id, encounter_id, turn_id, death_review_id, token_id, beneficiary_wallet, beneficiary_source, status, policy_version, performance_score, score_breakdown, line_items, release_admin_wallet, released_at, metadata, last_error, created_at, updated_at'

type SupabaseError = { code?: string; message: string }
type QueryResult<T> = { data: T | null; error: SupabaseError | null }

type GameplayStateRow = {
  id: string
  room_id: string
  location_id: string
  status: GameplayRoomStatus
  active_encounter_id: string | null
  characters: Record<string, unknown> | null
  rewards: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type GameplayEncounterRow = {
  id: string
  room_id: string
  location_id: string
  status: GameplayEncounterStatus
  difficulty: GameplayEncounter['difficulty']
  round_number: number
  public_title: string | null
  public_summary: string | null
  monster_state: unknown
  reward_plan: unknown
  mechanics: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

type GameplayTurnRow = {
  id: string
  room_id: string
  location_id: string
  tick_id: string
  encounter_id: string | null
  status: GameplayTurnStatus
  selected_token_id: number | null
  action: Record<string, unknown> | null
  dice_results: unknown
  mechanical_deltas: Record<string, unknown> | null
  public_message_ids: unknown
  outcome_summary: string | null
  metadata: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

type GameplayDeathReviewRow = {
  id: string
  room_id: string
  location_id: string
  encounter_id: string
  turn_id: string | null
  token_id: number
  gameplay_death_status: GameplayDeathReview['gameplayDeathStatus']
  review_status: GameplayDeathReview['reviewStatus']
  admin_wallet: string | null
  decided_at: string | null
  burn_sync_status: GameplayDeathReview['burnSyncStatus']
  context: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
}

type GameplayRewardClaimRow = {
  id: string
  room_id: string
  location_id: string
  encounter_id: string
  turn_id: string | null
  death_review_id: string
  token_id: number
  beneficiary_wallet: string
  beneficiary_source: GameplayRewardClaimBeneficiarySource
  status: GameplayRewardClaimStatus
  policy_version: string
  performance_score: number
  score_breakdown: Record<string, unknown> | null
  line_items: unknown
  release_admin_wallet: string | null
  released_at: string | null
  metadata: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
}

function getAdminClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }

  // The generated Supabase Database type does not include this migration yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

// The generated Supabase Database type does not include this migration yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(name: string): any {
  return getAdminClient().from(name as never)
}

function isUniqueViolation(error: SupabaseError | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message)
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeGameplayStatus(value: unknown): GameplayCharacterState['status'] {
  return value === 'alive' || value === 'downed' || value === 'dead' || value === 'fled'
    ? value
    : 'alive'
}

function maybeSourceStats(value: unknown): GameplaySourceStats | undefined {
  const object = asObject(value)
  if (Object.keys(object).length === 0) return undefined
  const maxHp = clampInteger(object.maxHp, 10, 1, 999)
  return {
    str: clampInteger(object.str, 10, 1, 30),
    dex: clampInteger(object.dex, 10, 1, 30),
    con: clampInteger(object.con, 10, 1, 30),
    int: clampInteger(object.int, 10, 1, 30),
    wis: clampInteger(object.wis, 10, 1, 30),
    cha: clampInteger(object.cha, 10, 1, 30),
    hp: clampInteger(object.hp, maxHp, 0, maxHp),
    maxHp,
    ac: clampInteger(object.ac, 10, 1, 30),
    speed: clampInteger(object.speed, 30, 0, 120),
    level: clampInteger(object.level, 1, 1, 20),
    experience: clampInteger(object.experience, 0, 0, 999999999),
  }
}

function maybeEffectiveStats(value: unknown): GameplayEffectiveStats | undefined {
  const object = asObject(value)
  if (Object.keys(object).length === 0) return undefined
  return {
    str: clampInteger(object.str, 10, 1, 30),
    dex: clampInteger(object.dex, 10, 1, 30),
    con: clampInteger(object.con, 10, 1, 30),
    int: clampInteger(object.int, 10, 1, 30),
    wis: clampInteger(object.wis, 10, 1, 30),
    cha: clampInteger(object.cha, 10, 1, 30),
    maxHp: clampInteger(object.maxHp, 10, 1, 999),
    ac: clampInteger(object.ac, 10, 1, 30),
    speed: clampInteger(object.speed, 30, 0, 120),
    level: clampInteger(object.level, 1, 1, 20),
    experience: clampInteger(object.experience, 0, 0, 999999999),
  }
}

function normalizePerformance(value: unknown): GameplayPerformanceCounters {
  const object = asObject(value)
  const defaults = defaultGameplayPerformanceCounters()
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      clampInteger(object[key], fallback, 0, 999999999),
    ])
  ) as GameplayPerformanceCounters
}

function normalizeModifierSources(value: unknown): GameplayModifierSource[] {
  if (!Array.isArray(value)) return []
  return value.filter((source): source is GameplayModifierSource => {
    const object = asObject(source)
    return typeof object.source === 'string' &&
      typeof object.key === 'string' &&
      typeof object.target === 'string' &&
      Number.isFinite(Number(object.value)) &&
      typeof object.label === 'string'
  }).map((source) => ({
    ...source,
    value: clampInteger(source.value, 0, -10, 10),
    label: source.label.slice(0, 120),
  }))
}

function normalizeRewardClaimLineItems(value: unknown): GameplayRewardClaimLineItem[] {
  if (!Array.isArray(value)) return []

  const lineItems: GameplayRewardClaimLineItem[] = []
  for (const item of value) {
    const object = asObject(item)
    if (object.assetType === 'gameplay_reward_points') {
      lineItems.push({
        assetType: 'gameplay_reward_points',
        amount: clampInteger(object.amount, 0, 0, 999999999),
      })
      continue
    }

    if (object.assetType === 'erc1155_concord_entitlement') {
      const contractAddress = typeof object.contractAddress === 'string' ? object.contractAddress : ''
      lineItems.push({
        assetType: 'erc1155_concord_entitlement',
        chainId: clampInteger(object.chainId, 1, 1, 999999999),
        contractAddress,
        concordId: clampInteger(object.concordId, 0, 0, 999999999),
        amount: clampInteger(object.amount, 0, 0, 999999999),
      })
    }
  }

  return lineItems
}

function normalizeRewardClaimScoreBreakdown(value: unknown, finalScore: number): GameplayRewardClaimScoreBreakdown {
  const object = asObject(value)
  return {
    combat: clampInteger(object.combat, 0, 0, 100),
    assist: clampInteger(object.assist, 0, 0, 100),
    survival: clampInteger(object.survival, 0, 0, 100),
    objective: clampInteger(object.objective, 0, 0, 100),
    noncombat: clampInteger(object.noncombat, 0, 0, 100),
    critical: clampInteger(object.critical, 0, -100, 100),
    penalty: clampInteger(object.penalty, 0, 0, 100),
    rawScore: clampInteger(object.rawScore, finalScore, -100, 200),
    difficultyMultiplier: typeof object.difficultyMultiplier === 'number' && Number.isFinite(object.difficultyMultiplier)
      ? object.difficultyMultiplier
      : 1,
    finalScore: clampInteger(object.finalScore, finalScore, 0, 100),
    counters: normalizePerformance(object.counters),
  }
}

function normalizeCharacterState(value: unknown): GameplayCharacterState | null {
  const character = asObject(value) as Partial<GameplayCharacterState>
  if (!Number.isInteger(character.tokenId)) return null
  const maxHp = clampInteger(character.maxHp, 10, 1, 999)

  return {
    tokenId: Number(character.tokenId),
    name: typeof character.name === 'string' ? character.name : character.name ?? null,
    hp: clampInteger(character.hp, maxHp, 0, maxHp),
    maxHp,
    status: normalizeGameplayStatus(character.status),
    xp: clampInteger(character.xp, 0, 0, 999999999),
    temporaryBoons: asStringArray(character.temporaryBoons),
    wounds: asStringArray(character.wounds),
    sourceStats: maybeSourceStats(character.sourceStats),
    effectiveStats: maybeEffectiveStats(character.effectiveStats),
    equipmentSnapshot: character.equipmentSnapshot && typeof character.equipmentSnapshot === 'object'
      ? character.equipmentSnapshot
      : character.equipmentSnapshot === null
        ? null
        : undefined,
    metadataTraits: Array.isArray(character.metadataTraits) ? character.metadataTraits : undefined,
    modifierSources: normalizeModifierSources(character.modifierSources),
    sheetSnapshotAt: typeof character.sheetSnapshotAt === 'string' ? character.sheetSnapshotAt : character.sheetSnapshotAt ?? null,
    ownerAddress: typeof character.ownerAddress === 'string' ? character.ownerAddress : character.ownerAddress ?? null,
    stakerAddress: typeof character.stakerAddress === 'string' ? character.stakerAddress : character.stakerAddress ?? null,
    performance: normalizePerformance(character.performance),
    updatedAt: typeof character.updatedAt === 'string' ? character.updatedAt : character.updatedAt ?? null,
  }
}

function asCharacterMap(value: unknown): GameplayCharacterStateMap {
  const object = asObject(value)
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, character]) => [key, normalizeCharacterState(character)] as const)
      .filter((entry): entry is [string, GameplayCharacterState] => Boolean(entry[1]))
  )
}

function asDiceResults(value: unknown): GameplayDiceRollResult[] {
  return Array.isArray(value) ? value as GameplayDiceRollResult[] : []
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isInteger(value)) return fallback
  return Math.max(1, Math.min(max, Number(value)))
}

function normalizeWallet(value: string | null | undefined): string | null {
  return nullableTrimmed(value)?.toLowerCase() ?? null
}

export function sanitizeGameplayStoredError(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : typeof error === 'string' && error.trim()
      ? error.trim()
      : 'Location room gameplay operation failed'

  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

function mapState(row: GameplayStateRow): GameplayRoomState {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    status: row.status,
    activeEncounterId: row.active_encounter_id,
    characters: asCharacterMap(row.characters),
    rewards: row.rewards ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEncounter(row: GameplayEncounterRow): GameplayEncounter {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    status: row.status,
    difficulty: row.difficulty,
    roundNumber: row.round_number,
    publicTitle: nullableTrimmed(row.public_title),
    publicSummary: nullableTrimmed(row.public_summary),
    monsterState: row.monster_state ?? {},
    rewardPlan: row.reward_plan ?? {},
    mechanics: row.mechanics ?? {},
    metadata: row.metadata ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function mapTurn(row: GameplayTurnRow): GameplayTurn {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    tickId: row.tick_id,
    encounterId: row.encounter_id,
    status: row.status,
    selectedTokenId: row.selected_token_id,
    action: row.action ?? {},
    diceResults: asDiceResults(row.dice_results),
    mechanicalDeltas: row.mechanical_deltas ?? {},
    publicMessageIds: asStringArray(row.public_message_ids),
    outcomeSummary: nullableTrimmed(row.outcome_summary),
    metadata: row.metadata ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function mapDeathReview(row: GameplayDeathReviewRow): GameplayDeathReview {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    encounterId: row.encounter_id,
    turnId: row.turn_id,
    tokenId: row.token_id,
    gameplayDeathStatus: row.gameplay_death_status,
    reviewStatus: row.review_status,
    adminWallet: row.admin_wallet,
    decidedAt: row.decided_at,
    burnSyncStatus: row.burn_sync_status,
    context: row.context ?? {},
    metadata: row.metadata ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRewardClaim(row: GameplayRewardClaimRow): GameplayRewardClaim {
  const performanceScore = clampInteger(row.performance_score, 0, 0, 100)
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    encounterId: row.encounter_id,
    turnId: row.turn_id,
    deathReviewId: row.death_review_id,
    tokenId: row.token_id,
    beneficiaryWallet: row.beneficiary_wallet,
    beneficiarySource: row.beneficiary_source,
    status: row.status,
    policyVersion: row.policy_version,
    performanceScore,
    scoreBreakdown: normalizeRewardClaimScoreBreakdown(row.score_breakdown, performanceScore),
    lineItems: normalizeRewardClaimLineItems(row.line_items),
    releaseAdminWallet: row.release_admin_wallet,
    releasedAt: row.released_at,
    metadata: row.metadata ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface LocationRoomGameplayRepository {
  findStateByRoomId(roomId: string): Promise<GameplayRoomState | null>
  ensureStateForRoom(input: EnsureGameplayRoomStateInput): Promise<GameplayRoomState>
  updateState(room: Pick<LocationRoom, 'id'>, input: UpdateGameplayRoomStateInput): Promise<GameplayRoomState>
  updateCharacterState(room: Pick<LocationRoom, 'id'>, character: GameplayCharacterState): Promise<GameplayRoomState>
  findActiveEncounterByRoomId(roomId: string): Promise<GameplayEncounter | null>
  findEncounterById(encounterId: string): Promise<GameplayEncounter | null>
  createActiveEncounter(input: CreateGameplayEncounterInput): Promise<GameplayEncounter>
  updateEncounter(encounterId: string, input: UpdateGameplayEncounterInput): Promise<GameplayEncounter>
  findTurnByTickId(tickId: string): Promise<GameplayTurn | null>
  listRecentTurnsByRoomId(roomId: string, limit?: number): Promise<GameplayTurn[]>
  createOrReuseTurn(input: CreateOrReuseGameplayTurnInput): Promise<GameplayTurn>
  storeTurnOutcome(turnId: string, input: StoreGameplayTurnOutcomeInput): Promise<GameplayTurn>
  markTurnFailed(turnId: string, error: unknown): Promise<GameplayTurn>
  markTurnDead(turnId: string, error: unknown): Promise<GameplayTurn>
  createPendingDeathReview(input: CreatePendingDeathReviewInput): Promise<GameplayDeathReview>
  listDeathReviews(input?: ListGameplayDeathReviewsInput): Promise<GameplayDeathReview[]>
  findDeathReviewById(reviewId: string): Promise<GameplayDeathReview | null>
  updateDeathReview(reviewId: string, input: UpdateGameplayDeathReviewInput): Promise<GameplayDeathReview>
  createOrReuseRewardClaim(input: CreateOrReuseRewardClaimInput): Promise<GameplayRewardClaim>
  findRewardClaimByDeathReviewId(deathReviewId: string): Promise<GameplayRewardClaim | null>
  listRewardClaims(input?: ListGameplayRewardClaimsInput): Promise<GameplayRewardClaim[]>
  updateRewardClaimStatusByDeathReviewId(deathReviewId: string, input: UpdateGameplayRewardClaimStatusInput): Promise<GameplayRewardClaim | null>
}

export class SupabaseLocationRoomGameplayRepository implements LocationRoomGameplayRepository {
  async findStateByRoomId(roomId: string): Promise<GameplayRoomState | null> {
    const { data, error } = (await table(STATES_TABLE)
      .select(STATE_COLUMNS)
      .eq('room_id', roomId)
      .maybeSingle()) as QueryResult<GameplayStateRow>

    if (error) throw new Error(error.message)
    return data ? mapState(data) : null
  }

  async ensureStateForRoom(input: EnsureGameplayRoomStateInput): Promise<GameplayRoomState> {
    const existing = await this.findStateByRoomId(input.room.id)
    if (existing) return existing

    const { data, error } = (await table(STATES_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        status: 'idle',
        characters: input.characters ?? {},
        metadata: input.metadata ?? {},
      })
      .select(STATE_COLUMNS)
      .single()) as QueryResult<GameplayStateRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findStateByRoomId(input.room.id)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay state insert returned no row')
    return mapState(data)
  }

  async updateState(room: Pick<LocationRoom, 'id'>, input: UpdateGameplayRoomStateInput): Promise<GameplayRoomState> {
    const values: Record<string, unknown> = {}
    if (input.status !== undefined) values.status = input.status
    if (input.activeEncounterId !== undefined) values.active_encounter_id = input.activeEncounterId
    if (input.characters !== undefined) values.characters = input.characters
    if (input.rewards !== undefined) values.rewards = input.rewards
    if (input.metadata !== undefined) values.metadata = input.metadata

    const { data, error } = (await table(STATES_TABLE)
      .update(values)
      .eq('room_id', room.id)
      .select(STATE_COLUMNS)
      .single()) as QueryResult<GameplayStateRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay state update returned no row')
    return mapState(data)
  }

  async updateCharacterState(room: Pick<LocationRoom, 'id'>, character: GameplayCharacterState): Promise<GameplayRoomState> {
    const state = await this.findStateByRoomId(room.id)
    if (!state) throw new Error('Location room gameplay state does not exist')

    return this.updateState(room, {
      characters: {
        ...state.characters,
        [String(character.tokenId)]: character,
      },
    })
  }

  async findActiveEncounterByRoomId(roomId: string): Promise<GameplayEncounter | null> {
    const { data, error } = (await table(ENCOUNTERS_TABLE)
      .select(ENCOUNTER_COLUMNS)
      .eq('room_id', roomId)
      .eq('status', 'active')
      .maybeSingle()) as QueryResult<GameplayEncounterRow>

    if (error) throw new Error(error.message)
    return data ? mapEncounter(data) : null
  }

  async findEncounterById(encounterId: string): Promise<GameplayEncounter | null> {
    const { data, error } = (await table(ENCOUNTERS_TABLE)
      .select(ENCOUNTER_COLUMNS)
      .eq('id', encounterId)
      .maybeSingle()) as QueryResult<GameplayEncounterRow>

    if (error) throw new Error(error.message)
    return data ? mapEncounter(data) : null
  }

  async createActiveEncounter(input: CreateGameplayEncounterInput): Promise<GameplayEncounter> {
    const existing = await this.findActiveEncounterByRoomId(input.room.id)
    if (existing) return existing

    const { data, error } = (await table(ENCOUNTERS_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        status: 'active',
        difficulty: input.difficulty,
        public_title: nullableTrimmed(input.publicTitle),
        public_summary: nullableTrimmed(input.publicSummary),
        monster_state: input.monsterState,
        reward_plan: input.rewardPlan,
        mechanics: input.mechanics ?? {},
        metadata: input.metadata ?? {},
      })
      .select(ENCOUNTER_COLUMNS)
      .single()) as QueryResult<GameplayEncounterRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findActiveEncounterByRoomId(input.room.id)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay encounter insert returned no row')
    return mapEncounter(data)
  }

  async updateEncounter(encounterId: string, input: UpdateGameplayEncounterInput): Promise<GameplayEncounter> {
    const values: Record<string, unknown> = {}
    if (input.status !== undefined) values.status = input.status
    if (input.difficulty !== undefined) values.difficulty = input.difficulty
    if (input.roundNumber !== undefined) values.round_number = input.roundNumber
    if (input.publicTitle !== undefined) values.public_title = nullableTrimmed(input.publicTitle)
    if (input.publicSummary !== undefined) values.public_summary = nullableTrimmed(input.publicSummary)
    if (input.monsterState !== undefined) values.monster_state = input.monsterState
    if (input.rewardPlan !== undefined) values.reward_plan = input.rewardPlan
    if (input.mechanics !== undefined) values.mechanics = input.mechanics
    if (input.metadata !== undefined) values.metadata = input.metadata
    if (input.lastError !== undefined) values.last_error = nullableTrimmed(input.lastError)?.slice(0, MAX_STORED_ERROR_LENGTH) ?? null
    if (input.completedAt !== undefined) values.completed_at = input.completedAt

    const { data, error } = (await table(ENCOUNTERS_TABLE)
      .update(values)
      .eq('id', encounterId)
      .select(ENCOUNTER_COLUMNS)
      .single()) as QueryResult<GameplayEncounterRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay encounter update returned no row')
    return mapEncounter(data)
  }

  async findTurnByTickId(tickId: string): Promise<GameplayTurn | null> {
    const { data, error } = (await table(TURNS_TABLE)
      .select(TURN_COLUMNS)
      .eq('tick_id', tickId)
      .maybeSingle()) as QueryResult<GameplayTurnRow>

    if (error) throw new Error(error.message)
    return data ? mapTurn(data) : null
  }

  async listRecentTurnsByRoomId(roomId: string, limit = 10): Promise<GameplayTurn[]> {
    const safeLimit = normalizeLimit(limit, 10, 50)
    const { data, error } = (await table(TURNS_TABLE)
      .select(TURN_COLUMNS)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)) as QueryResult<GameplayTurnRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapTurn)
  }

  async createOrReuseTurn(input: CreateOrReuseGameplayTurnInput): Promise<GameplayTurn> {
    const existing = await this.findTurnByTickId(input.tick.id)
    if (existing) return existing

    const { data, error } = (await table(TURNS_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        tick_id: input.tick.id,
        encounter_id: input.encounterId ?? null,
        selected_token_id: input.selectedTokenId ?? null,
        status: 'planned',
        metadata: input.metadata ?? {},
      })
      .select(TURN_COLUMNS)
      .single()) as QueryResult<GameplayTurnRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findTurnByTickId(input.tick.id)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay turn insert returned no row')
    return mapTurn(data)
  }

  async storeTurnOutcome(turnId: string, input: StoreGameplayTurnOutcomeInput): Promise<GameplayTurn> {
    const values: Record<string, unknown> = {}
    if (input.status !== undefined) values.status = input.status
    if (input.selectedTokenId !== undefined) values.selected_token_id = input.selectedTokenId
    if (input.action !== undefined) values.action = input.action
    if (input.diceResults !== undefined) values.dice_results = input.diceResults
    if (input.mechanicalDeltas !== undefined) values.mechanical_deltas = input.mechanicalDeltas
    if (input.publicMessageIds !== undefined) values.public_message_ids = input.publicMessageIds
    if (input.outcomeSummary !== undefined) values.outcome_summary = nullableTrimmed(input.outcomeSummary)
    if (input.metadata !== undefined) values.metadata = input.metadata
    if (input.completedAt !== undefined) values.completed_at = input.completedAt

    const { data, error } = (await table(TURNS_TABLE)
      .update(values)
      .eq('id', turnId)
      .select(TURN_COLUMNS)
      .single()) as QueryResult<GameplayTurnRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay turn update returned no row')
    return mapTurn(data)
  }

  async markTurnFailed(turnId: string, error: unknown): Promise<GameplayTurn> {
    return this.updateTurnError(turnId, 'failed', error)
  }

  async markTurnDead(turnId: string, error: unknown): Promise<GameplayTurn> {
    return this.updateTurnError(turnId, 'dead', error)
  }

  async createPendingDeathReview(input: CreatePendingDeathReviewInput): Promise<GameplayDeathReview> {
    const existing = await this.findDeathReviewByTokenAndEncounter(input.tokenId, input.encounterId)
    if (existing) return existing

    const { data, error } = (await table(DEATH_REVIEWS_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        encounter_id: input.encounterId,
        turn_id: input.turnId ?? null,
        token_id: input.tokenId,
        gameplay_death_status: 'dead',
        review_status: 'pending',
        burn_sync_status: 'not_applicable',
        context: input.context ?? {},
        metadata: input.metadata ?? {},
      })
      .select(DEATH_REVIEW_COLUMNS)
      .single()) as QueryResult<GameplayDeathReviewRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findDeathReviewByTokenAndEncounter(input.tokenId, input.encounterId)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay death review insert returned no row')
    return mapDeathReview(data)
  }

  async listDeathReviews(input: ListGameplayDeathReviewsInput = {}): Promise<GameplayDeathReview[]> {
    const safeLimit = normalizeLimit(input.limit, 50, 100)
    let query = table(DEATH_REVIEWS_TABLE)
      .select(DEATH_REVIEW_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (input.reviewStatus && input.reviewStatus !== 'all') {
      query = query.eq('review_status', input.reviewStatus)
    } else if (!input.reviewStatus) {
      query = query.eq('review_status', 'pending')
    }

    const locationId = nullableTrimmed(input.locationId)
    if (locationId) {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = (await query) as QueryResult<GameplayDeathReviewRow[]>
    if (error) throw new Error(error.message)
    return (data ?? []).map(mapDeathReview)
  }

  async findDeathReviewById(reviewId: string): Promise<GameplayDeathReview | null> {
    const { data, error } = (await table(DEATH_REVIEWS_TABLE)
      .select(DEATH_REVIEW_COLUMNS)
      .eq('id', reviewId)
      .maybeSingle()) as QueryResult<GameplayDeathReviewRow>

    if (error) throw new Error(error.message)
    return data ? mapDeathReview(data) : null
  }

  async updateDeathReview(reviewId: string, input: UpdateGameplayDeathReviewInput): Promise<GameplayDeathReview> {
    const values: Record<string, unknown> = {}
    if (input.gameplayDeathStatus !== undefined) values.gameplay_death_status = input.gameplayDeathStatus
    if (input.reviewStatus !== undefined) values.review_status = input.reviewStatus
    if (input.adminWallet !== undefined) values.admin_wallet = normalizeWallet(input.adminWallet)
    if (input.decidedAt !== undefined) values.decided_at = input.decidedAt
    if (input.burnSyncStatus !== undefined) values.burn_sync_status = input.burnSyncStatus
    if (input.context !== undefined) values.context = input.context
    if (input.metadata !== undefined) values.metadata = input.metadata
    if (input.lastError !== undefined) values.last_error = nullableTrimmed(input.lastError)?.slice(0, MAX_STORED_ERROR_LENGTH) ?? null

    const { data, error } = (await table(DEATH_REVIEWS_TABLE)
      .update(values)
      .eq('id', reviewId)
      .select(DEATH_REVIEW_COLUMNS)
      .single()) as QueryResult<GameplayDeathReviewRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay death review update returned no row')
    return mapDeathReview(data)
  }

  async createOrReuseRewardClaim(input: CreateOrReuseRewardClaimInput): Promise<GameplayRewardClaim> {
    const existing = await this.findRewardClaimByDeathReviewId(input.deathReview.id)
    if (existing) return existing

    const beneficiaryWallet = normalizeWallet(input.beneficiaryWallet)
    if (!beneficiaryWallet) {
      throw new Error('Gameplay reward claim beneficiary wallet is required')
    }

    const { data, error } = (await table(REWARD_CLAIMS_TABLE)
      .insert({
        room_id: input.deathReview.roomId,
        location_id: input.deathReview.locationId,
        encounter_id: input.deathReview.encounterId,
        turn_id: input.deathReview.turnId,
        death_review_id: input.deathReview.id,
        token_id: input.deathReview.tokenId,
        beneficiary_wallet: beneficiaryWallet,
        beneficiary_source: input.beneficiarySource,
        status: 'pending_review',
        policy_version: input.policyVersion,
        performance_score: clampInteger(input.performanceScore, 0, 0, 100),
        score_breakdown: input.scoreBreakdown,
        line_items: input.lineItems,
        metadata: input.metadata ?? {},
      })
      .select(REWARD_CLAIM_COLUMNS)
      .single()) as QueryResult<GameplayRewardClaimRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findRewardClaimByDeathReviewId(input.deathReview.id)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room gameplay reward claim insert returned no row')
    return mapRewardClaim(data)
  }

  async findRewardClaimByDeathReviewId(deathReviewId: string): Promise<GameplayRewardClaim | null> {
    const { data, error } = (await table(REWARD_CLAIMS_TABLE)
      .select(REWARD_CLAIM_COLUMNS)
      .eq('death_review_id', deathReviewId)
      .maybeSingle()) as QueryResult<GameplayRewardClaimRow>

    if (error) throw new Error(error.message)
    return data ? mapRewardClaim(data) : null
  }

  async listRewardClaims(input: ListGameplayRewardClaimsInput = {}): Promise<GameplayRewardClaim[]> {
    const safeLimit = normalizeLimit(input.limit, 50, 100)
    let query = table(REWARD_CLAIMS_TABLE)
      .select(REWARD_CLAIM_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (input.status && input.status !== 'all') {
      query = query.eq('status', input.status)
    }

    const locationId = nullableTrimmed(input.locationId)
    if (locationId) query = query.eq('location_id', locationId)

    const roomId = nullableTrimmed(input.roomId)
    if (roomId) query = query.eq('room_id', roomId)

    if (Number.isInteger(input.tokenId)) query = query.eq('token_id', input.tokenId)

    const deathReviewId = nullableTrimmed(input.deathReviewId)
    if (deathReviewId) query = query.eq('death_review_id', deathReviewId)

    if (input.deathReviewIds?.length) query = query.in('death_review_id', input.deathReviewIds)
    if (input.turnIds?.length) query = query.in('turn_id', input.turnIds)

    const { data, error } = (await query) as QueryResult<GameplayRewardClaimRow[]>
    if (error) throw new Error(error.message)
    return (data ?? []).map(mapRewardClaim)
  }

  async updateRewardClaimStatusByDeathReviewId(
    deathReviewId: string,
    input: UpdateGameplayRewardClaimStatusInput
  ): Promise<GameplayRewardClaim | null> {
    const values: Record<string, unknown> = {
      status: input.status,
    }
    if (input.releaseAdminWallet !== undefined) values.release_admin_wallet = normalizeWallet(input.releaseAdminWallet)
    if (input.releasedAt !== undefined) values.released_at = input.releasedAt
    if (input.metadata !== undefined) values.metadata = input.metadata
    if (input.lastError !== undefined) values.last_error = nullableTrimmed(input.lastError)?.slice(0, MAX_STORED_ERROR_LENGTH) ?? null

    const { data, error } = (await table(REWARD_CLAIMS_TABLE)
      .update(values)
      .eq('death_review_id', deathReviewId)
      .select(REWARD_CLAIM_COLUMNS)
      .maybeSingle()) as QueryResult<GameplayRewardClaimRow>

    if (error) throw new Error(error.message)
    return data ? mapRewardClaim(data) : null
  }

  private async updateTurnError(turnId: string, status: Extract<GameplayTurnStatus, 'failed' | 'dead'>, error: unknown): Promise<GameplayTurn> {
    const { data, updateError } = await this.updateTurnRaw(turnId, {
      status,
      last_error: sanitizeGameplayStoredError(error),
    })

    if (updateError) throw new Error(updateError.message)
    if (!data) throw new Error('Location room gameplay turn error update returned no row')
    return mapTurn(data)
  }

  private async updateTurnRaw(turnId: string, values: Record<string, unknown>): Promise<{ data: GameplayTurnRow | null; updateError: SupabaseError | null }> {
    const { data, error } = (await table(TURNS_TABLE)
      .update(values)
      .eq('id', turnId)
      .select(TURN_COLUMNS)
      .single()) as QueryResult<GameplayTurnRow>

    return { data, updateError: error }
  }

  private async findDeathReviewByTokenAndEncounter(tokenId: number, encounterId: string): Promise<GameplayDeathReview | null> {
    const { data, error } = (await table(DEATH_REVIEWS_TABLE)
      .select(DEATH_REVIEW_COLUMNS)
      .eq('token_id', tokenId)
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()) as QueryResult<GameplayDeathReviewRow>

    if (error) throw new Error(error.message)
    return data ? mapDeathReview(data) : null
  }
}

export const locationRoomGameplayRepository = new SupabaseLocationRoomGameplayRepository()
