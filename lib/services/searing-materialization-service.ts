import { createHash } from 'node:crypto'
import { createPublicClient, decodeEventLog, fallback, http, type Address, type Log } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { getContractAddresses } from '../contracts/addresses'
import { searingABI } from '../contracts/abis/searing'
import {
  resolveSearingLayersForCharacter,
  validateSearingLayerResolution,
  type SearingLayerResolution,
} from '../domain/searing/searing-layer-resolver'
import type { ConcordSearingMap } from '../domain/searing/concord-searing-map'
import {
  characterMaterializationRepository,
  type CharacterMaterializationRepository,
} from '../repositories/character-materialization-repository'
import {
  searingEventRepository,
  type SearingEventMaterializationRow,
  type SearingEventRepository,
} from '../repositories/searing-event-repository'
import {
  searingMapMaterializationRepository,
  type SearingMapMaterializationRepository,
} from '../repositories/searing-map-materialization-repository'
import {
  searingImageComposer,
  type SearingImageComposer,
} from './searing-image-composer'
import {
  searingStorageService,
  type SearingStorageService,
} from './searing-storage'
import { buildSearedCharacterImageVersion } from './assets/character-current-image-urls'

export type SearingMaterializationStatus = 'completed' | 'completed_without_image' | 'failed' | 'skipped' | 'processing'

export type SearingMaterializationResult = {
  eventId: string
  tokenId: number
  concordId: number
  transactionHash: string
  status: SearingMaterializationStatus
  imageUrl?: string
  error?: string
  reason?: string
}

export type VerifyTransactionResult = {
  transactionHash: string
  results: SearingMaterializationResult[]
}

type ConcordSearedArgs = {
  wagdieId: number | bigint
  tokenId: number | bigint
  owner: Address
}

type DecodedSearingLog = {
  tokenId: number
  concordId: number
  owner: string | null
  transactionHash: string
  blockNumber: number
  logIndex: number
}

const TRANSACTION_HASH_RE = /^0x[a-fA-F0-9]{64}$/

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toSafeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const numberValue = typeof value === 'bigint' ? Number(value) : Number(value)
  return Number.isSafeInteger(numberValue) ? numberValue : null
}

function normalizeAddress(value: unknown): string | null {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value.toLowerCase()
    : null
}

function isEventBefore(a: SearingEventMaterializationRow, b: SearingEventMaterializationRow): boolean {
  if (a.block_number !== b.block_number) return a.block_number < b.block_number
  return a.log_index < b.log_index
}

function storageVersionForEvent(event: SearingEventMaterializationRow, image: Buffer): string {
  const digest = createHash('sha256').update(image).digest('hex')
  return buildSearedCharacterImageVersion(event.transaction_hash, event.log_index, digest)
}

function isVersionedSearedImageUrl(event: SearingEventMaterializationRow, imageUrl: string | null): boolean {
  if (!imageUrl) return false

  try {
    const url = new URL(imageUrl, 'https://wagdie.local')
    const version = url.searchParams.get('v')
    if (
      url.pathname === `/images/characters/current/${event.token_id}.png` &&
      typeof version === 'string' &&
      /^seared-[a-f0-9]{8}-log\d+-[a-f0-9]{16}$/i.test(version)
    ) {
      return true
    }

    const decodedPath = decodeURIComponent(url.pathname)
    return decodedPath.includes(`/${event.token_id}/`) && !decodedPath.endsWith(`/${event.token_id}.png`)
  } catch {
    return imageUrl.includes(`/${event.token_id}/`) && !imageUrl.endsWith(`/${event.token_id}.png`)
  }
}

function normalizeTokenIds(values: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function getConfiguredSearingChainId(): number {
  const chainId = Number(process.env.CHAIN_ID || 1)
  if (!Number.isInteger(chainId)) {
    throw new Error('Invalid server CHAIN_ID configuration')
  }
  return chainId
}

function getChain(chainId: number) {
  if (chainId === 1) return mainnet
  if (chainId === 11155111) return sepolia
  throw new Error(`Unsupported chain ID: ${chainId}`)
}

function getRpcUrl(chainId: number): string {
  if (chainId === 11155111) {
    return process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  }

  return (
    process.env.HTTP_RPC_URL ||
    process.env.RPC_URL ||
    process.env.ETH_RPC_URL ||
    process.env.MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_MAINNET_RPC_URL ||
    'https://ethereum.publicnode.com'
  )
}

function isSearingContractLog(log: Log, searingAddress: string): boolean {
  return typeof log.address === 'string' && log.address.toLowerCase() === searingAddress.toLowerCase()
}

function buildSearedMetadata(
  concord: ConcordSearingMap,
  resolution: SearingLayerResolution
): Record<string, unknown> {
  return {
    name: concord.token_name,
    image: concord.token_name ? `/images/concords/${concord.concordTokenId}.png` : undefined,
    attributes: [
      { trait_type: 'Concord', value: concord.token_name },
      { trait_type: 'Searing Trait', value: resolution.variant.newTrait },
      { trait_type: 'Searing Location', value: resolution.variant.location },
      { trait_type: 'Alignment', value: resolution.alignment },
    ],
  }
}

export class SearingMaterializationService {
  constructor(
    private readonly events: SearingEventRepository = searingEventRepository,
    private readonly characters: CharacterMaterializationRepository = characterMaterializationRepository,
    private readonly searingMaps: SearingMapMaterializationRepository = searingMapMaterializationRepository,
    private readonly composer: SearingImageComposer = searingImageComposer,
    private readonly storage: SearingStorageService = searingStorageService
  ) {}

  async getEvent(eventId: string): Promise<SearingEventMaterializationRow | null> {
    return this.events.findById(eventId)
  }

  async materializeEvent(
    eventId: string,
    options: { retryFailed?: boolean; repairCompleted?: boolean } = {}
  ): Promise<SearingMaterializationResult> {
    const existing = await this.events.findById(eventId)
    if (existing?.materialization_status === 'completed') {
      const hasCacheSafeImage = isVersionedSearedImageUrl(existing, existing.seared_image_url)
      if (existing.seared_image_url && hasCacheSafeImage && !options.repairCompleted) {
        return {
          eventId: existing.id,
          tokenId: existing.token_id,
          concordId: existing.concord_id,
          transactionHash: existing.transaction_hash,
          status: 'completed',
          imageUrl: existing.seared_image_url,
          reason: 'completed',
        }
      }

      if (!options.repairCompleted) {
        return {
          eventId: existing.id,
          tokenId: existing.token_id,
          concordId: existing.concord_id,
          transactionHash: existing.transaction_hash,
          status: 'completed_without_image',
          reason: existing.seared_image_url ? 'legacy_uncache_safe_image_url' : 'completed_without_image',
        }
      }
    }

    const claim = await this.events.claimForMaterialization(eventId, {
      retryFailed: options.retryFailed,
      includeCompleted: options.repairCompleted && existing?.materialization_status === 'completed',
    })

    if (!claim.claimed) {
      const event = claim.event
      if (!event) {
        return {
          eventId,
          tokenId: 0,
          concordId: 0,
          transactionHash: '',
          status: 'failed',
          error: 'Searing event not found',
        }
      }

      if (event.materialization_status === 'completed' || claim.reason === 'completed') {
        const hasCacheSafeImage = isVersionedSearedImageUrl(event, event.seared_image_url)
        return {
          eventId: event.id,
          tokenId: event.token_id,
          concordId: event.concord_id,
          transactionHash: event.transaction_hash,
          status: event.seared_image_url && hasCacheSafeImage ? 'completed' : 'completed_without_image',
          ...(event.seared_image_url && hasCacheSafeImage ? { imageUrl: event.seared_image_url } : {}),
          reason: event.seared_image_url && hasCacheSafeImage ? 'completed' : event.seared_image_url ? 'legacy_uncache_safe_image_url' : 'completed_without_image',
        }
      }

      return {
        eventId: event.id,
        tokenId: event.token_id,
        concordId: event.concord_id,
        transactionHash: event.transaction_hash,
        status: 'skipped',
        reason: claim.reason,
      }
    }

    return this.materializeClaimedEvent(claim.event)
  }

  async syncLatestIndexedEventForToken(
    tokenId: number,
    options: { retryFailed?: boolean; repairCompleted?: boolean } = {}
  ): Promise<SearingMaterializationResult> {
    const event = await this.events.findLatestForToken(tokenId)
    if (!event) {
      return {
        eventId: '',
        tokenId,
        concordId: 0,
        transactionHash: '',
        status: 'failed',
        error: `No indexed searing event found for token ${tokenId}`,
      }
    }

    return this.materializeEvent(event.id, options)
  }

  async verifyTransactionAndMaterialize(params: {
    tokenId: number
    transactionHash: string
    retryFailed?: boolean
    repairCompleted?: boolean
  }): Promise<VerifyTransactionResult> {
    const transactionHash = params.transactionHash.toLowerCase()
    if (!TRANSACTION_HASH_RE.test(transactionHash)) {
      throw new Error('Invalid transaction hash')
    }

    const chainId = getConfiguredSearingChainId()
    const chain = getChain(chainId)
    const publicClient = createPublicClient({
      chain,
      transport: fallback([
        http(getRpcUrl(chainId)),
        http('https://ethereum.publicnode.com'),
        http('https://rpc.flashbots.net'),
      ]),
    })
    const { searing } = getContractAddresses(chainId)

    const receipt = await publicClient.getTransactionReceipt({
      hash: transactionHash as `0x${string}`,
    })

    const decodedLogs = receipt.logs
      .filter((log) => isSearingContractLog(log, searing))
      .map((log) => this.tryDecodeConcordSearedLog(log, transactionHash))
      .filter((log): log is DecodedSearingLog => log !== null)
      .filter((log) => log.tokenId === params.tokenId)

    if (decodedLogs.length === 0) {
      throw new Error(`Transaction ${transactionHash} does not contain a ConcordSeared event for token ${params.tokenId}`)
    }

    const results: SearingMaterializationResult[] = []
    for (const decoded of decodedLogs) {
      const event = await this.events.insertIfMissing({
        token_id: decoded.tokenId,
        concord_id: decoded.concordId,
        event_type: 'sear',
        transaction_hash: decoded.transactionHash,
        block_number: decoded.blockNumber,
        log_index: decoded.logIndex,
        actor_address: decoded.owner,
        event_timestamp: null,
        metadata: {
          sender: decoded.owner,
          wagdieId: decoded.tokenId,
          concordId: decoded.concordId,
          source: 'sync-route-receipt',
        },
      })

      results.push(await this.materializeEvent(event.id, {
        retryFailed: params.retryFailed,
        repairCompleted: params.repairCompleted,
      }))
    }

    return { transactionHash, results }
  }

  async materializePendingBatch(options: {
    limit: number
    includeFailed?: boolean
    retryFailed?: boolean
    tokenIds?: number[]
  }): Promise<SearingMaterializationResult[]> {
    const tokenIds = options.tokenIds ? normalizeTokenIds(options.tokenIds) : undefined
    const events = await this.events.findPending({
      limit: options.limit,
      includeFailed: options.includeFailed,
      tokenIds,
    })

    const results: SearingMaterializationResult[] = []
    for (const event of events) {
      results.push(await this.materializeEvent(event.id, { retryFailed: options.retryFailed ?? options.includeFailed }))
    }

    return results
  }

  private tryDecodeConcordSearedLog(log: Log, transactionHash: string): DecodedSearingLog | null {
    try {
      const decoded = decodeEventLog({
        abi: searingABI,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName !== 'ConcordSeared') return null

      const args = decoded.args as ConcordSearedArgs
      const tokenId = toSafeNumber(args.wagdieId)
      const concordId = toSafeNumber(args.tokenId)
      const blockNumber = toSafeNumber(log.blockNumber)
      const logIndex = toSafeNumber(log.logIndex)

      if (tokenId === null || concordId === null || blockNumber === null || logIndex === null) {
        return null
      }

      return {
        tokenId,
        concordId,
        owner: normalizeAddress(args.owner),
        transactionHash,
        blockNumber,
        logIndex,
      }
    } catch {
      return null
    }
  }

  private async materializeClaimedEvent(
    event: SearingEventMaterializationRow
  ): Promise<SearingMaterializationResult> {
    if (event.event_type !== 'sear') {
      const skipped = await this.events.markSkipped(event.id, `Unsupported searing event_type: ${event.event_type}`, {
        event_type: event.event_type,
      })
      return {
        eventId: skipped.id,
        tokenId: skipped.token_id,
        concordId: skipped.concord_id,
        transactionHash: skipped.transaction_hash,
        status: 'skipped',
        reason: skipped.materialization_error || undefined,
      }
    }

    try {
      const latestEvent = await this.events.findLatestForToken(event.token_id)
      if (latestEvent && latestEvent.id !== event.id && isEventBefore(event, latestEvent)) {
        const skipped = await this.events.markSkipped(event.id, 'A newer searing event exists for this token', {
          token_id: event.token_id,
          concord_id: event.concord_id,
          newer_event_id: latestEvent.id,
          newer_transaction_hash: latestEvent.transaction_hash,
        })
        return {
          eventId: skipped.id,
          tokenId: skipped.token_id,
          concordId: skipped.concord_id,
          transactionHash: skipped.transaction_hash,
          status: 'skipped',
          reason: skipped.materialization_error || undefined,
        }
      }

      const character = await this.characters.findCharacter(event.token_id)
      if (!character) {
        throw new Error(`Character ${event.token_id} not found`)
      }

      const concord = await this.searingMaps.findByConcordTokenId(event.concord_id)
      if (!concord) {
        throw new Error(`No concord searing map found for concord ${event.concord_id}`)
      }

      const resolution = resolveSearingLayersForCharacter(character.searing_metadata ?? character.metadata, concord)
      validateSearingLayerResolution(resolution)

      const composed = await this.composer.compose(resolution.layers)
      const searedImage = await this.storage.uploadSearedImage(event.token_id, composed.image, {
        version: storageVersionForEvent(event, composed.image),
      })
      const searedImageUrl = searedImage.publicPath
      const materializedAt = new Date().toISOString()
      const searedMetadata = buildSearedMetadata(concord, resolution)

      await this.characters.updateSearingReadModel({
        tokenId: event.token_id,
        concord,
        searedImageUrl,
        searedImageVersion: searedImage.version,
        searedImageSha256: searedImage.sha256,
        searedImageStorage: searedImage.storage,
        searedMetadata,
        materializedAt,
      })

      await this.characters.markCharacterConcordSeared({
        tokenId: event.token_id,
        concord,
        searedAt: materializedAt,
      })

      const completed = await this.events.markCompleted(event.id, searedImageUrl, {
        concord_id: event.concord_id,
        token_id: event.token_id,
        alignment: resolution.alignment,
        variant: resolution.variant,
        layers: resolution.layers.map((layer) => ({
          trait_type: layer.trait_type,
          value: layer.value ?? null,
          url: layer.url,
          seared: layer.seared || null,
        })),
        layer_urls: composed.layerUrls,
        materialized_at: materializedAt,
        current_image: {
          url: searedImage.publicPath,
          version: searedImage.version,
          kind: 'seared',
          sha256: searedImage.sha256,
          source: 'searing-materialization',
          updatedAt: materializedAt,
          storage: searedImage.storage,
        },
        storage: searedImage.storage,
        backing_url: searedImage.storage.backingUrl,
      })

      return {
        eventId: completed.id,
        tokenId: completed.token_id,
        concordId: completed.concord_id,
        transactionHash: completed.transaction_hash,
        status: 'completed',
        imageUrl: completed.seared_image_url || searedImageUrl,
      }
    } catch (error) {
      const message = toErrorMessage(error)
      const failed = await this.events.markFailed(event.id, message, {
        token_id: event.token_id,
        concord_id: event.concord_id,
        failed_at: new Date().toISOString(),
      })

      return {
        eventId: failed.id,
        tokenId: failed.token_id,
        concordId: failed.concord_id,
        transactionHash: failed.transaction_hash,
        status: 'failed',
        error: message,
      }
    }
  }
}

export const searingMaterializationService = new SearingMaterializationService()
