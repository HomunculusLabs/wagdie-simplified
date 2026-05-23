/**
 * Character Service
 * Domain layer - Business logic for character CRUD operations, filtering, and queries
 * Uses repository layer for data access (dependency injection)
 */

import type { ICharacterRepository } from '../repositories'
import { serverCharacterRepository } from '../repositories/character-repository.server'
import type { Character, CharacterFilters, CharactersResponse, CharacterConcord, Concord, EditableCharacterFields } from '@/types/character'

/**
 * Character Service
 * Encapsulates business rules and orchestrates data access
 */
export class CharacterService {
  constructor(private repository: ICharacterRepository) {}

  /**
   * Get characters with filtering, pagination, and sorting
   */
  async getCharacters(filters: CharacterFilters): Promise<CharactersResponse> {
    return this.repository.findMany(filters)
  }

  /**
   * Get characters by token IDs for backend batch hydration.
   */
  async getCharactersByTokenIds(tokenIds: number[]): Promise<Character[]> {
    return this.repository.findByTokenIds(tokenIds)
  }

  /**
   * Get a single character by token ID
   */
  async getCharacter(tokenId: number): Promise<Character | null> {
    return this.repository.findById(tokenId)
  }

  /**
   * Update character data (name, stats, background story, equipment)
   * Business rule: Ownership validation should be done at API route level
   */
  async updateCharacter(
    tokenId: number,
    updates: Partial<Pick<Character, EditableCharacterFields>>
  ): Promise<Character | null> {
    // Additional business logic can be added here (validation, transformation, etc.)
    return this.repository.update(tokenId, updates)
  }

  /**
   * Get concords owned by a character
   */
  async getCharacterConcords(tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>> {
    return this.repository.findConcords(tokenId)
  }

  /**
   * Check if a wallet owns a specific character
   * Checks both owner_address (unstaked) and staker_address (staked)
   */
  async isOwner(tokenId: number, walletAddress: string): Promise<boolean> {
    const character = await this.getCharacter(tokenId)
    if (!character) return false

    const addr = walletAddress.toLowerCase()
    const owner = character.owner_address?.toLowerCase()
    const staker = character.staker_address?.toLowerCase()

    return owner === addr || staker === addr
  }
}

// Export singleton instance
export const characterService = new CharacterService(serverCharacterRepository)

// Export individual functions for backward compatibility
export const getCharacters = (filters: CharacterFilters) => characterService.getCharacters(filters)
export const getCharactersByTokenIds = (tokenIds: number[]) => characterService.getCharactersByTokenIds(tokenIds)
export const getCharacter = (tokenId: number) => characterService.getCharacter(tokenId)
export const updateCharacter = (tokenId: number, updates: Partial<Pick<Character, EditableCharacterFields>>) =>
  characterService.updateCharacter(tokenId, updates)
export const getCharacterConcords = (tokenId: number) => characterService.getCharacterConcords(tokenId)
