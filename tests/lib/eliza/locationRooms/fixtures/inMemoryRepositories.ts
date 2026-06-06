import type { LocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import { normalizeAdventureMemory } from '@/lib/eliza/locationRooms/narrativeTypes'
import type {
  LocationRoomNarrativeBeat,
  LocationRoomNarrativeState,
  LocationRoomNarrativeStateSnapshot,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { CreateLocationRoomMessageInput } from '@/lib/eliza/locationRooms/repository'
import type {
  LocationRoom,
  LocationRoomLocation,
  LocationRoomLocationDetails,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomPublicAuthorMessageStats,
  LocationRoomPublicMessageStats,
  LocationRoomTick,
  LocationRoomTurnIntent,
} from '@/lib/eliza/locationRooms/types'
import type { NarrativeHarnessScenario, NarrativeQualityAdventureState } from './scenarios'
import { BASE_TIME } from './scenarios'

export type InMemoryLocationRoomRepositoryOptions = {
  locationMetadata?: Record<string, unknown>
  room?: Partial<LocationRoom>
  pendingTick?: LocationRoomTick | null
  processingTick?: LocationRoomTick | null
  claimTickReturnsNull?: boolean
}

function isRepositoryOptions(value: Record<string, unknown> | InMemoryLocationRoomRepositoryOptions): value is InMemoryLocationRoomRepositoryOptions {
  return 'locationMetadata' in value || 'room' in value || 'pendingTick' in value || 'processingTick' in value || 'claimTickReturnsNull' in value
}

export function roomFor(scenario: NarrativeHarnessScenario): LocationRoom {
  return {
    id: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    officialRoomId: `official-room-${scenario.locationId}`,
    officialWorldId: 'official-world-test',
    officialUserId: 'official-user-test',
    channelId: `wagdie-location-${scenario.locationId}`,
    tickEnabled: true,
    lastTickAt: null,
    nextTickAt: null,
    tickCount: 0,
    lastError: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

export function participantFor(scenario: NarrativeHarnessScenario, character: NarrativeHarnessScenario['characters'][number]): LocationRoomParticipant {
  return {
    tokenId: character.tokenId,
    name: character.name,
    imageUrl: null,
    backgroundStory: character.backgroundStory ?? null,
    ownerAddress: `0x${character.tokenId.toString(16).padStart(40, '0')}`,
    stakerAddress: null,
    locationId: scenario.locationId,
    characterClass: null,
    level: null,
    coreStats: null,
    maxHp: null,
    ac: null,
    speed: null,
  }
}

export function tickFor(scenario: NarrativeHarnessScenario, sequence: number, intent: LocationRoomTurnIntent = 'auto'): LocationRoomTick {
  return {
    id: `tick-${scenario.id}-${sequence}`,
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    gameplayRunId: null,
    turnIntent: intent,
    triggerType: 'admin',
    requestedByWallet: null,
    requestedByTokenId: null,
    status: 'processing',
    attempts: 1,
    nextAttemptAt: new Date(new Date(BASE_TIME).getTime() + sequence * 60_000).toISOString(),
    lockedAt: BASE_TIME,
    lockedBy: 'narrative-harness',
    selectedTokenId: null,
    startedAt: BASE_TIME,
    completedAt: null,
    lastError: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

export function initialNarrativeState(scenario: NarrativeHarnessScenario): LocationRoomNarrativeState {
  return {
    id: `state-${scenario.id}`,
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    stateSummary: scenario.premise,
    currentObjective: scenario.objective,
    openThreads: [scenario.stakes],
    metadata: {},
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

export function stateSnapshot(state: LocationRoomNarrativeState): LocationRoomNarrativeStateSnapshot {
  return {
    stateSummary: state.stateSummary,
    currentObjective: state.currentObjective,
    openThreads: state.openThreads,
  }
}

export class InMemoryLocationRoomRepository {
  public readonly messages: LocationRoomMessage[] = []
  public readonly ticks: LocationRoomTick[] = []
  public completedTicks = 0
  public skippedTicks = 0
  public failedTicks = 0
  private pendingTick: LocationRoomTick | null = null
  private messageSequence = 0
  private readonly room: LocationRoom
  private readonly location: LocationRoomLocationDetails

  private readonly processingTick: LocationRoomTick | null
  private readonly claimTickReturnsNull: boolean

  constructor(
    private readonly scenario: NarrativeHarnessScenario,
    locationMetadataOrOptions: Record<string, unknown> | InMemoryLocationRoomRepositoryOptions = {}
  ) {
    const options = isRepositoryOptions(locationMetadataOrOptions)
      ? locationMetadataOrOptions
      : { locationMetadata: locationMetadataOrOptions }
    this.room = { ...roomFor(scenario), ...(options.room ?? {}) }
    this.location = {
      id: scenario.locationId,
      name: scenario.locationName,
      chainLocationId: null,
      active: true,
      metadata: options.locationMetadata ?? {},
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    }
    this.pendingTick = options.pendingTick ?? null
    this.processingTick = options.processingTick ?? null
    this.claimTickReturnsNull = options.claimTickReturnsNull ?? false
  }

  getRoomSnapshot(): LocationRoom {
    return { ...this.room }
  }

  getPendingTickSnapshot(): LocationRoomTick | null {
    return this.pendingTick ? { ...this.pendingTick } : null
  }

  getTickSnapshots(): LocationRoomTick[] {
    const byId = new Map(this.ticks.map((tick) => [tick.id, tick]))
    if (this.pendingTick) byId.set(this.pendingTick.id, this.pendingTick)
    return [...byId.values()].map((tick) => ({ ...tick }))
  }

  async getLocation(): Promise<LocationRoomLocation | null> {
    return { id: this.location.id, name: this.location.name }
  }

  async getLocationDetails(): Promise<LocationRoomLocationDetails | null> {
    return this.location
  }

  async listLocationsByIds(): Promise<LocationRoomLocationDetails[]> {
    return [this.location]
  }

  async findRoomById(): Promise<LocationRoom | null> {
    return this.room
  }

  async findRoomByLocationId(): Promise<LocationRoom | null> {
    return this.room
  }

  async ensureRoomForLocation(): Promise<LocationRoom> {
    return this.room
  }

  async deleteRoomById(): Promise<void> {
    this.messages.length = 0
    this.ticks.length = 0
    this.pendingTick = null
    this.completedTicks = 0
    this.skippedTicks = 0
    this.failedTicks = 0
    this.room.lastTickAt = null
    this.room.nextTickAt = null
    this.room.tickCount = 0
    this.room.lastError = null
  }

  async listDueRooms(): Promise<LocationRoom[]> {
    return [this.room]
  }

  async enqueueTick(input: { turnIntent?: LocationRoomTurnIntent | null; triggerType?: LocationRoomTick['triggerType']; requestedByWallet?: string | null; requestedByTokenId?: number | null; gameplayRunId?: string | null }): Promise<{ tick: LocationRoomTick | null; deduped: boolean }> {
    if (this.pendingTick && this.pendingTick.status !== 'failed') {
      return { tick: null, deduped: true }
    }
    const tick = {
      ...tickFor(this.scenario, this.completedTicks + this.failedTicks + 1, input.turnIntent ?? 'auto'),
      status: 'pending' as const,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      triggerType: input.triggerType ?? 'admin',
      requestedByWallet: input.requestedByWallet ?? null,
      requestedByTokenId: input.requestedByTokenId ?? null,
      gameplayRunId: input.gameplayRunId ?? null,
    }
    this.pendingTick = tick
    this.ticks.push(tick)
    return { tick, deduped: false }
  }

  async promoteOpenTickIntent(input: { turnIntent: LocationRoomTurnIntent }): Promise<LocationRoomTick | null> {
    if (!this.pendingTick) return null
    this.pendingTick = { ...this.pendingTick, turnIntent: input.turnIntent }
    return this.pendingTick
  }

  async attachTickToGameplayRun(input?: { gameplayRunId?: string | null }): Promise<LocationRoomTick | null> {
    if (!this.pendingTick) return null
    this.pendingTick = { ...this.pendingTick, gameplayRunId: input?.gameplayRunId ?? this.pendingTick.gameplayRunId }
    return this.pendingTick
  }

  async countCompletedGameplayTurnsForRun(): Promise<number> {
    return 0
  }

  async findOpenTickForRoom(): Promise<LocationRoomTick | null> {
    return this.pendingTick
  }

  async findRecentCompletedOwnerTick(): Promise<LocationRoomTick | null> {
    return null
  }

  async findOldestProcessableTickForRoom(): Promise<LocationRoomTick | null> {
    return this.pendingTick
  }

  async findNonStaleProcessingTickForRoom(): Promise<LocationRoomTick | null> {
    return this.processingTick
  }

  async claimTick(tickId: string): Promise<LocationRoomTick | null> {
    if (this.claimTickReturnsNull) return null
    if (!this.pendingTick || this.pendingTick.id !== tickId) return null
    const claimed = { ...this.pendingTick, status: 'processing' as const, lockedAt: BASE_TIME, lockedBy: 'narrative-harness', startedAt: BASE_TIME }
    this.pendingTick = claimed
    this.replaceTickSnapshot(claimed)
    return claimed
  }

  async claimDueTicks(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async listActiveTicksForRoom(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async listRecentTicksForRoom(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async getPublicMessageStats(): Promise<LocationRoomPublicMessageStats> {
    return {
      messageCount: this.messages.length,
      latestSequence: this.messages.at(-1)?.sequence ?? null,
      latestCreatedAt: this.messages.at(-1)?.createdAt ?? null,
    }
  }

  async getPublicAuthorMessageStats(): Promise<LocationRoomPublicAuthorMessageStats> {
    const publicMessages = this.messages.filter((message) => message.visibility === 'public')
    const gmMessages = publicMessages.filter((message) => message.authorKind === 'game_master')
    const agentMessages = publicMessages.filter((message) => message.authorKind === 'agent')
    return {
      messageCount: publicMessages.length,
      gameMasterMessageCount: gmMessages.length,
      agentMessageCount: agentMessages.length,
      latestGameMasterMessageCreatedAt: gmMessages.at(-1)?.createdAt ?? null,
      latestAgentMessageCreatedAt: agentMessages.at(-1)?.createdAt ?? null,
    }
  }

  async markTickSelected(tickId: string, tokenId: number): Promise<LocationRoomTick> {
    const selected = { ...(this.pendingTick ?? tickFor(this.scenario, 0)), id: tickId, selectedTokenId: tokenId }
    this.pendingTick = selected
    return selected
  }

  private normalizeMessageFields(input: CreateLocationRoomMessageInput): {
    visibility: LocationRoomMessage['visibility']
    metadata: Record<string, unknown>
    dedupeKey: string | null
  } {
    const visibility = input.visibility ?? 'public'
    const dedupeKey = input.dedupeKey?.trim() || null
    const metadata = dedupeKey
      ? { ...(input.metadata ?? {}), dedupeKey }
      : { ...(input.metadata ?? {}) }
    if (!dedupeKey) {
      delete metadata.dedupeKey
    }
    return { visibility, metadata, dedupeKey }
  }

  private findDedupedMessage(
    input: CreateLocationRoomMessageInput,
    visibility: LocationRoomMessage['visibility'],
    dedupeKey: string | null,
    candidates: LocationRoomMessage[] = this.messages
  ): LocationRoomMessage | null {
    if (!input.tickId || visibility === 'internal') return null
    return candidates.find((message) => {
      if (
        message.roomId !== input.roomId ||
        message.tickId !== input.tickId ||
        message.visibility !== visibility ||
        message.authorKind !== input.authorKind
      ) {
        return false
      }
      const existingKey = typeof message.metadata.dedupeKey === 'string'
        ? message.metadata.dedupeKey.trim()
        : ''
      return dedupeKey ? existingKey === dedupeKey : existingKey === ''
    }) ?? null
  }

  private buildMessage(
    input: CreateLocationRoomMessageInput,
    sequence: number,
    visibility: LocationRoomMessage['visibility'],
    metadata: Record<string, unknown>
  ): LocationRoomMessage {
    return {
      id: `msg-${this.scenario.id}-${sequence}`,
      roomId: input.roomId,
      locationId: input.locationId,
      tickId: input.tickId ?? null,
      sequence,
      visibility,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata,
      createdAt: new Date(new Date(BASE_TIME).getTime() + sequence * 1000).toISOString(),
    }
  }

  async appendMessage(input: CreateLocationRoomMessageInput): Promise<LocationRoomMessage> {
    const { visibility, metadata, dedupeKey } = this.normalizeMessageFields(input)
    const existing = this.findDedupedMessage(input, visibility, dedupeKey)
    if (existing) return existing

    const message = this.buildMessage(input, ++this.messageSequence, visibility, metadata)
    this.messages.push(message)
    return message
  }

  async appendMessagesBatch(inputs: CreateLocationRoomMessageInput[]): Promise<LocationRoomMessage[]> {
    const staged: LocationRoomMessage[] = []
    const results: LocationRoomMessage[] = []
    let nextSequence = this.messageSequence

    for (const input of inputs) {
      const { visibility, metadata, dedupeKey } = this.normalizeMessageFields(input)
      const existing =
        this.findDedupedMessage(input, visibility, dedupeKey) ??
        this.findDedupedMessage(input, visibility, dedupeKey, staged)
      if (existing) {
        results.push(existing)
        continue
      }

      const message = this.buildMessage(input, ++nextSequence, visibility, metadata)
      staged.push(message)
      results.push(message)
    }

    this.messageSequence = nextSequence
    this.messages.push(...staged)
    return results
  }

  async markTickCompleted(tickId: string): Promise<LocationRoomTick> {
    const completed = { ...(this.pendingTick ?? tickFor(this.scenario, this.completedTicks + 1)), id: tickId, status: 'completed' as const, completedAt: BASE_TIME }
    this.completedTicks += 1
    this.pendingTick = null
    this.room.tickCount += 1
    this.replaceTickSnapshot(completed)
    return completed
  }

  async markTickSkipped(tickId: string): Promise<LocationRoomTick> {
    const skipped = { ...(this.pendingTick ?? tickFor(this.scenario, this.completedTicks + 1)), id: tickId, status: 'skipped' as const, completedAt: BASE_TIME }
    this.skippedTicks += 1
    this.pendingTick = null
    this.replaceTickSnapshot(skipped)
    return skipped
  }

  async markTickFailed(tickId: string, error: string): Promise<LocationRoomTick> {
    const failed = { ...(this.pendingTick ?? tickFor(this.scenario, this.failedTicks + 1)), id: tickId, status: 'failed' as const, lastError: error }
    this.failedTicks += 1
    this.pendingTick = null
    this.replaceTickSnapshot(failed)
    return failed
  }

  async markTickDead(tickId: string, error: string): Promise<LocationRoomTick> {
    const dead = { ...(this.pendingTick ?? tickFor(this.scenario, this.failedTicks + 1)), id: tickId, status: 'dead' as const, lastError: error, completedAt: BASE_TIME }
    this.failedTicks += 1
    this.pendingTick = null
    this.replaceTickSnapshot(dead)
    return dead
  }

  async updateRoomAfterProcessedTick(_room: LocationRoom, params: { now: Date }): Promise<LocationRoom> {
    this.room.lastTickAt = params.now.toISOString()
    this.room.nextTickAt = new Date(params.now.getTime() + 120_000).toISOString()
    this.room.updatedAt = params.now.toISOString()
    return this.room
  }

  async recordRoomError(): Promise<void> {}

  async listPublicMessages(params: { page: number; pageSize: number }): Promise<{ messages: LocationRoomMessage[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
    return {
      messages: this.messages.slice(0, params.pageSize),
      total: this.messages.length,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: this.messages.length > params.page * params.pageSize,
    }
  }

  async listRecentPublicMessages(_roomId: string, limit: number): Promise<LocationRoomMessage[]> {
    return this.messages.slice(-limit)
  }

  private replaceTickSnapshot(tick: LocationRoomTick): void {
    const index = this.ticks.findIndex((candidate) => candidate.id === tick.id)
    if (index >= 0) this.ticks[index] = tick
    else this.ticks.push(tick)
  }
}

export class InMemoryNarrativeRepository {
  private state: LocationRoomNarrativeState
  private readonly beats = new Map<string, LocationRoomNarrativeBeat>()

  constructor(
    private readonly scenario: NarrativeHarnessScenario,
    initialMetadata: Record<string, unknown> = {}
  ) {
    this.state = { ...initialNarrativeState(scenario), metadata: initialMetadata }
  }

  getState(): LocationRoomNarrativeState {
    return this.state
  }

  async findStateByRoomId(): Promise<LocationRoomNarrativeState | null> {
    return this.state
  }

  async ensureStateForRoom(): Promise<LocationRoomNarrativeState> {
    return this.state
  }

  async updateState(_room: Pick<LocationRoom, 'id'>, input: Partial<LocationRoomNarrativeState>): Promise<LocationRoomNarrativeState> {
    this.state = {
      ...this.state,
      stateSummary: input.stateSummary ?? this.state.stateSummary,
      currentObjective: input.currentObjective ?? this.state.currentObjective,
      openThreads: input.openThreads ?? this.state.openThreads,
      metadata: input.metadata ?? this.state.metadata,
      updatedAt: BASE_TIME,
    }
    return this.state
  }

  async findBeatByTickId(tickId: string): Promise<LocationRoomNarrativeBeat | null> {
    return [...this.beats.values()].find((beat) => beat.tickId === tickId) ?? null
  }

  async listRecentBeatsByRoomId(): Promise<LocationRoomNarrativeBeat[]> {
    return [...this.beats.values()].slice(-12)
  }

  async createOrReuseBeat(input: { tick: LocationRoomTick | { id: string }; selectedTokenId?: number | null; gameMasterAgentId?: string | null; stateBefore?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    const tickId = input.tick.id
    const existing = await this.findBeatByTickId(tickId)
    if (existing) return existing
    const beat: LocationRoomNarrativeBeat = {
      id: `beat-${this.scenario.id}-${this.beats.size + 1}`,
      roomId: `room-${this.scenario.locationId}`,
      locationId: this.scenario.locationId,
      tickId,
      status: 'planned',
      selectedTokenId: input.selectedTokenId ?? null,
      gameMasterAgentId: input.gameMasterAgentId ?? null,
      publicNarration: null,
      speakerInstruction: null,
      stateBefore: input.stateBefore ?? stateSnapshot(this.state),
      stateAfter: {},
      metadata: input.metadata ?? {},
      lastError: null,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      completedAt: null,
    }
    this.beats.set(beat.id, beat)
    return beat
  }

  async storeBeatGameMasterOutput(beatId: string, output: { gameMasterAgentId?: string | null; publicNarration?: string | null; speakerInstruction?: string | null; stateAfter?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, {
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })
  }

  async patchBeatMetadata(beatId: string, metadata: Record<string, unknown>): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { metadata })
  }

  async markBeatGameMasterMessageAppended(beatId: string, output: { gameMasterAgentId?: string | null; publicNarration?: string | null; speakerInstruction?: string | null; stateAfter?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, {
      status: 'game_master_message_appended',
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })
  }

  async markBeatCharacterAppended(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'character_appended' })
  }

  async markBeatCompleted(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'completed', completedAt: BASE_TIME })
  }

  async markBeatFailed(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'failed', lastError: error instanceof Error ? error.message : String(error) })
  }

  async markBeatDead(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'dead', lastError: error instanceof Error ? error.message : String(error), completedAt: BASE_TIME })
  }

  getQualityAdventureState(): NarrativeQualityAdventureState {
    const adventure = normalizeAdventureMemory(this.state.metadata)
    return {
      currentStakes: adventure.currentStakes,
      activeDecisionPresent: Boolean(adventure.activeDecision),
      consequenceCount: adventure.consequenceLedger.length,
      discoveryCount: adventure.discoveries.length,
      clockCount: adventure.clocks.length,
      lastDeclaredActionPresent: Boolean(adventure.lastDeclaredAction),
      lastOutcomePresent: Boolean(adventure.lastOutcome),
    }
  }

  private patchBeat(beatId: string, patch: Partial<LocationRoomNarrativeBeat>): LocationRoomNarrativeBeat {
    const existing = this.beats.get(beatId)
    if (!existing) throw new Error(`Missing beat ${beatId}`)
    const next = { ...existing, ...patch, updatedAt: BASE_TIME }
    this.beats.set(beatId, next)
    return next
  }
}

export class StaticMembershipRepository implements LocationRoomMembershipRepository {
  private readonly participants: LocationRoomParticipant[]

  constructor(scenario: NarrativeHarnessScenario, participants?: LocationRoomParticipant[]) {
    this.participants = participants ?? scenario.characters.map((character) => participantFor(scenario, character))
  }

  async listEligibleParticipantsByLocation(): Promise<LocationRoomParticipant[]> {
    return this.participants
  }

  async listEligibleLocationIds(): Promise<string[]> {
    return [...new Set(this.participants.map((participant) => participant.locationId))]
  }

  async walletHasEligibleParticipant(): Promise<boolean> {
    return true
  }
}
