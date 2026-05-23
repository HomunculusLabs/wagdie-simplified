export type LocationRoomTriggerType = 'scheduled' | 'owner' | 'admin'
export type LocationRoomTickStatus = 'pending' | 'processing' | 'completed' | 'skipped' | 'failed' | 'dead'
export type LocationRoomMessageVisibility = 'public' | 'internal'
export type LocationRoomAuthorKind = 'agent' | 'system' | 'wallet' | 'admin' | 'scheduler' | 'game_master'

export type LocationRoom = {
  id: string
  locationId: string
  officialRoomId: string
  officialWorldId: string
  officialUserId: string
  channelId: string
  tickEnabled: boolean
  lastTickAt: string | null
  nextTickAt: string | null
  tickCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type LocationRoomMessage = {
  id: string
  roomId: string
  locationId: string
  tickId: string | null
  sequence: number
  visibility: LocationRoomMessageVisibility
  authorKind: LocationRoomAuthorKind
  tokenId: number | null
  officialAgentId: string | null
  authorName: string
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type LocationRoomTick = {
  id: string
  roomId: string
  locationId: string
  triggerType: LocationRoomTriggerType
  requestedByWallet: string | null
  requestedByTokenId: number | null
  status: LocationRoomTickStatus
  attempts: number
  nextAttemptAt: string
  lockedAt: string | null
  lockedBy: string | null
  selectedTokenId: number | null
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type LocationRoomLocation = {
  id: string
  name: string
}

export type LocationRoomLocationDetails = LocationRoomLocation & {
  chainLocationId: string | null
  active: boolean | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type LocationRoomPublicMessageStats = {
  messageCount: number
  latestSequence: number | null
  latestCreatedAt: string | null
}

export type LocationRoomParticipant = {
  tokenId: number
  name: string
  imageUrl: string | null
  backgroundStory: string | null
  ownerAddress: string | null
  stakerAddress: string | null
  locationId: string
}

export type PublicLocationRoomParticipant = {
  tokenId: number
  name: string
  imageUrl: string | null
}

export type PublicLocationRoomGameplayMessageKind = 'gm_setup' | 'character_action' | 'gm_outcome'

export type PublicLocationRoomMessage = {
  id: string
  sequence: number
  authorKind: LocationRoomAuthorKind
  tokenId: number | null
  authorName: string
  content: string
  createdAt: string
  gameplayMessageKind?: PublicLocationRoomGameplayMessageKind
}

export type PublicGameplayStatusBand = 'healthy' | 'injured' | 'critical' | 'down' | 'dead' | 'fled' | 'unknown'

export type PublicLocationRoomGameplaySummary = {
  mode: 'enabled' | 'disabled'
  status: 'idle' | 'active_encounter' | 'aftermath'
  encounter: {
    publicTitle: string | null
    publicSummary: string | null
    status: 'active' | 'victory' | 'defeat' | 'fled' | 'abandoned'
    round: number
  } | null
  characters: Array<{
    tokenId: number
    name: string | null
    status: 'alive' | 'downed' | 'dead' | 'fled'
    hpBand: PublicGameplayStatusBand
  }>
  monsters: Array<{
    id: string
    name: string
    archetype: string
    status: 'alive' | 'dead'
    hpBand: PublicGameplayStatusBand
  }>
  pendingRewardSummary: {
    victoryText: string | null
    temporaryBoons: string[]
    narrativeRewards: string[]
  } | null
}

export type PublicLocationRoomSummary = {
  id: string
  locationId: string
  locationName: string
  tickEnabled: boolean
  lastTickAt: string | null
  nextTickAt: string | null
  tickCount: number
  createdAt: string
  updatedAt: string
}

export type PublicLocationRoomRead = {
  room: PublicLocationRoomSummary
  participants: PublicLocationRoomParticipant[]
  messages: PublicLocationRoomMessage[]
  gameplay?: PublicLocationRoomGameplaySummary
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
}

export type PaginatedLocationRoomMessages = {
  messages: LocationRoomMessage[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type EnqueueScheduledTicksResult = {
  roomsChecked: number
  enqueued: number
  deduped: number
}

export type ProcessLocationRoomTickResult = {
  tickId: string
  status: Extract<LocationRoomTickStatus, 'completed' | 'skipped' | 'failed' | 'dead'>
  selectedTokenId: number | null
  messageId?: string
  reason?: string
}

export type LocationRoomWorkerResult = {
  enabled: boolean
  enqueued: number
  deduped: number
  processed: number
  completed: number
  skipped: number
  failed: number
  dead: number
  results: ProcessLocationRoomTickResult[]
}

export type RequestLocationRoomTickActor = 'owner' | 'admin'

export type RequestLocationRoomTickInput = {
  actor: RequestLocationRoomTickActor
  walletAddress: string
  now?: Date
}

export type RequestLocationRoomTickResult = {
  roomId: string
  locationId: string
  tickId: string | null
  triggerType: Extract<LocationRoomTriggerType, 'owner' | 'admin'>
  deduped: boolean
  requestedByTokenId: number | null
  participantCount: number
}

export type RequestLocationRoomTickProcessingStatus =
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'dead'
  | 'already_processing'
  | 'not_claimable'

export type RequestLocationRoomTickProcessingSummary = {
  attempted: boolean
  status: RequestLocationRoomTickProcessingStatus
  tickId: string | null
  result?: ProcessLocationRoomTickResult
  reason?: string
}

export type RequestLocationRoomTickAndProcessResult = RequestLocationRoomTickResult & {
  processing: RequestLocationRoomTickProcessingSummary
}

export type LocationRoomNarrativeTurnContext = {
  stateSummary: string
  currentObjective: string | null
  openThreads: string[]
  speakerInstruction: string
  publicNarration?: string | null
}

export type GenerateOfficialLocationRoomTurnInput = {
  room: LocationRoom
  speaker: LocationRoomParticipant
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  narrativeContext?: LocationRoomNarrativeTurnContext
}

export type GenerateOfficialLocationRoomTurnResult = {
  officialAgentId: string
  content: string
}
