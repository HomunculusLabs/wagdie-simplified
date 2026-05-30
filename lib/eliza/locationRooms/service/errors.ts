export class LocationRoomNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Location not found: ${locationId}`)
    this.name = 'LocationRoomNotFoundError'
  }
}

export class LocationRoomFeatureDisabledError extends Error {
  constructor() {
    super('Eliza location rooms are disabled')
    this.name = 'LocationRoomFeatureDisabledError'
  }
}

export class LocationRoomOfficialServiceDisabledError extends Error {
  constructor() {
    super('Official ElizaOS service is not configured')
    this.name = 'LocationRoomOfficialServiceDisabledError'
  }
}

export class LocationRoomNarrativeConfigError extends Error {
  constructor() {
    super('Location room narrative mode requires an admin-managed game-master agent or ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID')
    this.name = 'LocationRoomNarrativeConfigError'
  }
}

export class LocationRoomGameplayConfigError extends Error {
  constructor(message = 'Location room gameplay mode requires official ElizaOS, narrative mode, and a resolvable game-master agent') {
    super(message)
    this.name = 'LocationRoomGameplayConfigError'
  }
}

export class LocationRoomForbiddenError extends Error {
  constructor() {
    super('Wallet does not own an eligible participant at this location')
    this.name = 'LocationRoomForbiddenError'
  }
}

export class LocationRoomInsufficientParticipantsError extends Error {
  constructor() {
    super('At least two eligible participants are required')
    this.name = 'LocationRoomInsufficientParticipantsError'
  }
}

export class LocationRoomManualCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Location room manual trigger is cooling down')
    this.name = 'LocationRoomManualCooldownError'
  }
}

export class LocationRoomManualTickIntentForbiddenError extends Error {
  constructor() {
    super('Combat tick intent is admin-only')
    this.name = 'LocationRoomManualTickIntentForbiddenError'
  }
}

export class LocationRoomTickDisabledError extends Error {
  constructor() {
    super('Location room ticks are disabled')
    this.name = 'LocationRoomTickDisabledError'
  }
}
