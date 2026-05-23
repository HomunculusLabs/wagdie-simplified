/**
 * Character Repository
 * Infrastructure layer - Handles all database access for characters
 * Abstracts Supabase implementation details from business logic
 *
 * This module remains the compatibility facade for existing imports.
 */

import { CharacterOwnershipRepository, type OwnershipSupabaseClient, type OwnershipUpdate, type OwnershipUpdateResult } from './character/character-ownership-repository'
import { CharacterQueryRepository } from './character/character-query-repository'
import { CharacterStakingRepository } from './character/character-staking-repository'
import { CharacterTraitsRepository } from './character/character-traits-repository'
import type { CharacterWithLocation } from './character/character-types'
import { type CharacterRuntimeAssets, noopCharacterRuntimeAssets } from '@/lib/domain/character/character-runtime-assets'
import type {
  AlignmentsResponse,
  Character,
  CharacterConcord,
  CharacterFilters,
  CharactersResponse,
  Concord,
  EditableCharacterFields,
  OriginsResponse,
  TraitCountsResponse,
} from '@/types/character'

export type { CharacterWithLocation, JoinedLocation } from './character/character-types'

export interface ICharacterRepository {
  findMany(filters: CharacterFilters): Promise<CharactersResponse>
  findByTokenIds(tokenIds: number[]): Promise<Character[]>
  findById(tokenId: number): Promise<Character | null>
  update(tokenId: number, updates: Partial<Pick<Character, EditableCharacterFields>>): Promise<Character | null>
  findConcords(tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>>
  getOrigins(): Promise<OriginsResponse>
  getAlignments(): Promise<AlignmentsResponse>
  getTraitCounts(traitType: string): Promise<TraitCountsResponse>
}

type CharacterRepositoryDependencies = {
  queryRepository?: CharacterQueryRepository
  traitsRepository?: CharacterTraitsRepository
  stakingRepository?: CharacterStakingRepository
  ownershipRepository?: CharacterOwnershipRepository
  runtimeAssets?: CharacterRuntimeAssets
}

/**
 * Supabase implementation of character repository.
 *
 * Kept as a public facade to avoid import churn while specialized repositories
 * own query, traits, staking-location, and ownership concerns internally.
 */
export class CharacterRepository implements ICharacterRepository {
  private readonly queryRepository: CharacterQueryRepository
  private readonly traitsRepository: CharacterTraitsRepository
  private readonly stakingRepository: CharacterStakingRepository
  private readonly ownershipRepository: CharacterOwnershipRepository

  constructor(dependencies: CharacterRepositoryDependencies = {}) {
    const runtimeAssets = dependencies.runtimeAssets ?? noopCharacterRuntimeAssets

    this.queryRepository = dependencies.queryRepository ?? new CharacterQueryRepository(runtimeAssets)
    this.traitsRepository = dependencies.traitsRepository ?? new CharacterTraitsRepository(runtimeAssets)
    this.stakingRepository = dependencies.stakingRepository ?? new CharacterStakingRepository(runtimeAssets)
    this.ownershipRepository = dependencies.ownershipRepository ?? new CharacterOwnershipRepository()
  }

  /**
   * Find characters with filtering, pagination, and sorting
   */
  async findMany(filters: CharacterFilters): Promise<CharactersResponse> {
    return this.queryRepository.findMany(filters)
  }

  /**
   * Find characters by token IDs.
   */
  async findByTokenIds(tokenIds: number[]): Promise<Character[]> {
    return this.queryRepository.findByTokenIds(tokenIds)
  }

  /**
   * Find a single character by token ID
   */
  async findById(tokenId: number): Promise<Character | null> {
    return this.queryRepository.findById(tokenId)
  }

  /**
   * Update character data
   * Uses admin client (service role) to bypass RLS since auth is handled at API route level
   */
  async update(
    tokenId: number,
    updates: Partial<Pick<Character, EditableCharacterFields>>
  ): Promise<Character | null> {
    return this.queryRepository.update(tokenId, updates)
  }

  /**
   * Find concords owned by a character
   */
  async findConcords(tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>> {
    return this.queryRepository.findConcords(tokenId)
  }

  /**
   * Get all unique origins with character counts
   * Extracts Body trait from metadata JSONB
   */
  async getOrigins(): Promise<OriginsResponse> {
    return this.traitsRepository.getOrigins()
  }

  /**
   * Get all unique alignments with character counts
   * Extracts Alignment trait from metadata JSONB
   */
  async getAlignments(): Promise<AlignmentsResponse> {
    return this.traitsRepository.getAlignments()
  }

  /**
   * Get counts for any trait type in metadata JSONB
   * Generic method to support Armor, Back, Mask, and other trait filters
   */
  async getTraitCounts(traitType: string): Promise<TraitCountsResponse> {
    return this.traitsRepository.getTraitCounts(traitType)
  }

  async getStakedCharacters(): Promise<CharacterWithLocation[]> {
    return this.stakingRepository.getStakedCharacters()
  }

  /**
   * Get all token IDs from the database
   */
  async getAllTokenIds(): Promise<number[]> {
    return this.ownershipRepository.getAllTokenIds()
  }

  /**
   * Get current ownership state for all characters
   * Returns a map of tokenId -> owner_address
   */
  async getCurrentOwnership(): Promise<Map<number, string | null>> {
    return this.ownershipRepository.getCurrentOwnership()
  }

  /**
   * Bulk update ownership for multiple characters
   * Updates each record individually to avoid constraint issues
   */
  async bulkUpdateOwnership(
    updates: OwnershipUpdate[],
    client?: OwnershipSupabaseClient
  ): Promise<OwnershipUpdateResult> {
    return this.ownershipRepository.bulkUpdateOwnership(updates, client)
  }

  /**
   * Update ownership for a single character
   */
  async updateOwnership(
    tokenId: number,
    ownerAddress: string | null,
    client?: OwnershipSupabaseClient
  ): Promise<boolean> {
    return this.ownershipRepository.updateOwnership(tokenId, ownerAddress, client)
  }
}

// Export singleton instance
export const characterRepository = new CharacterRepository()

export const getStakedCharacters = () => characterRepository.getStakedCharacters()
