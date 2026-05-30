import { randomUUID } from 'crypto'
import type {
  EnqueueScheduledTicksResult,
  LocationRoomWorkerResult,
  ProcessLocationRoomTickResult,
  PublicLocationRoomRead,
  RequestLocationRoomTickAndProcessResult,
  RequestLocationRoomTickInput,
  RequestLocationRoomTickResult,
} from './types'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  locationRoomMembershipRepository,
  type LocationRoomMembershipRepository,
} from './membership'
import {
  officialLocationRoomTurnGenerator,
  type OfficialLocationRoomTurnGenerator,
} from './officialTurnGenerator'
import {
  locationRoomNarrativeCoordinator,
  type GameMasterAgentResolver,
  type LocationRoomNarrativeCoordinator,
} from './narrativeCoordinator'
import {
  locationRoomGameplayCoordinator,
  type LocationRoomGameplayCoordinator,
} from './gameplay/coordinator'
import {
  locationRoomGameplayRepository,
  type LocationRoomGameplayRepository,
} from './gameplay/repository'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import { LocationRoomPublicRoomReader } from './service/publicRoomReader'
import { LocationRoomManualTickService } from './service/manualTickService'
import { LocationRoomTickProcessor } from './service/tickProcessor'
import { LocationRoomScheduledWorker } from './service/scheduledWorker'

export {
  LocationRoomFeatureDisabledError,
  LocationRoomForbiddenError,
  LocationRoomGameplayConfigError,
  LocationRoomInsufficientParticipantsError,
  LocationRoomManualCooldownError,
  LocationRoomManualTickIntentForbiddenError,
  LocationRoomNarrativeConfigError,
  LocationRoomNotFoundError,
  LocationRoomOfficialServiceDisabledError,
  LocationRoomTickDisabledError,
} from './service/errors'
export { isLocationRoomGameplayEnabledForLocation } from './service/configGuards'
export { selectLocationRoomSpeaker } from './speakerSelection'

export type LocationRoomServiceOptions = {
  publicRoomReader?: LocationRoomPublicRoomReader
  manualTickService?: LocationRoomManualTickService
  tickProcessor?: LocationRoomTickProcessor
  scheduledWorker?: LocationRoomScheduledWorker
}

export class LocationRoomService {
  private readonly publicRoomReader: LocationRoomPublicRoomReader
  private readonly manualTickService: LocationRoomManualTickService
  private readonly tickProcessor: LocationRoomTickProcessor
  private readonly scheduledWorker: LocationRoomScheduledWorker

  constructor(
    private readonly repository: LocationRoomRepository = locationRoomRepository,
    private readonly membership: LocationRoomMembershipRepository = locationRoomMembershipRepository,
    private readonly turnGenerator: OfficialLocationRoomTurnGenerator = officialLocationRoomTurnGenerator,
    private readonly narrativeCoordinator: LocationRoomNarrativeCoordinator = locationRoomNarrativeCoordinator,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService,
    private readonly gameplayCoordinator: LocationRoomGameplayCoordinator = locationRoomGameplayCoordinator,
    private readonly gameplayRepository: LocationRoomGameplayRepository = locationRoomGameplayRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository = locationRoomNarrativeRepository,
    options: LocationRoomServiceOptions = {}
  ) {
    this.publicRoomReader = options.publicRoomReader ?? new LocationRoomPublicRoomReader(
      this.repository,
      this.membership,
      this.gameplayRepository,
      this.narrativeRepository
    )
    this.manualTickService = options.manualTickService ?? new LocationRoomManualTickService(
      this.repository,
      this.membership,
      this.narrativeRepository,
      this.gameMasterAgentResolver
    )
    this.tickProcessor = options.tickProcessor ?? new LocationRoomTickProcessor({
      repository: this.repository,
      membership: this.membership,
      turnGenerator: this.turnGenerator,
      narrativeCoordinator: this.narrativeCoordinator,
      gameMasterAgentResolver: this.gameMasterAgentResolver,
      gameplayCoordinator: this.gameplayCoordinator,
      gameplayRepository: this.gameplayRepository,
      narrativeRepository: this.narrativeRepository,
    })
    this.scheduledWorker = options.scheduledWorker ?? new LocationRoomScheduledWorker({
      repository: this.repository,
      membership: this.membership,
      gameplayRepository: this.gameplayRepository,
      narrativeRepository: this.narrativeRepository,
      gameMasterAgentResolver: this.gameMasterAgentResolver,
      tickProcessor: this.tickProcessor,
    })
  }

  async getPublicRoom(locationId: string, params: { page?: string | null; pageSize?: string | null } = {}): Promise<PublicLocationRoomRead> {
    return this.publicRoomReader.getPublicRoom(locationId, params)
  }

  async requestTick(locationId: string, input: RequestLocationRoomTickInput): Promise<RequestLocationRoomTickResult> {
    return this.manualTickService.requestTick(locationId, input)
  }

  async requestTickAndProcess(
    locationId: string,
    input: RequestLocationRoomTickInput
  ): Promise<RequestLocationRoomTickAndProcessResult> {
    const now = input.now ?? new Date()
    const prepared = await this.manualTickService.prepareManualTick(locationId, { ...input, now })
    const workerId = `location-room-manual-${randomUUID()}`
    const targetTick = prepared.enqueuedTick ?? await this.repository.findOldestProcessableTickForRoom(prepared.room.id, now)

    if (!targetTick) {
      const processingTick = await this.repository.findNonStaleProcessingTickForRoom(prepared.room.id, now)
      return {
        ...prepared.result,
        processing: processingTick
          ? {
              attempted: false,
              status: 'already_processing',
              tickId: processingTick.id,
              reason: 'Tick is already owned by another worker',
            }
          : {
              attempted: false,
              status: 'not_claimable',
              tickId: null,
              reason: 'No due room tick is currently claimable',
            },
      }
    }

    const claimNow = prepared.enqueuedTickIsFresh && prepared.enqueuedTick?.id === targetTick.id
      ? new Date(Math.max(now.getTime(), new Date(targetTick.nextAttemptAt).getTime()))
      : now
    const claimedTick = await this.repository.claimTick(targetTick.id, workerId, claimNow)
    if (!claimedTick) {
      const processingTick = await this.repository.findNonStaleProcessingTickForRoom(prepared.room.id, now)
      return {
        ...prepared.result,
        processing: processingTick
          ? {
              attempted: false,
              status: 'already_processing',
              tickId: processingTick.id,
              reason: 'Tick is already owned by another worker',
            }
          : {
              attempted: false,
              status: 'not_claimable',
              tickId: targetTick.id,
              reason: 'Target tick was not due or was claimed by another worker',
            },
      }
    }

    const processed = await this.tickProcessor.processClaimedTick(claimedTick, now)
    return {
      ...prepared.result,
      processing: {
        attempted: true,
        status: processed.status,
        tickId: processed.tickId,
        result: processed,
      },
    }
  }

  async enqueueDueScheduledTicks(now?: Date, locationAllowlist?: string[]): Promise<EnqueueScheduledTicksResult> {
    return this.scheduledWorker.enqueueDueScheduledTicks(now, locationAllowlist)
  }

  async processDueTicks(limit?: number, now?: Date): Promise<ProcessLocationRoomTickResult[]> {
    return this.scheduledWorker.processDueTicks(limit, now)
  }

  async runScheduledWorker(now?: Date): Promise<LocationRoomWorkerResult> {
    return this.scheduledWorker.runScheduledWorker(now)
  }
}

export const locationRoomService = new LocationRoomService()
