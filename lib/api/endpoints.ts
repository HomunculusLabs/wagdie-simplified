/**
 * API Endpoints
 * Type-safe API endpoint definitions and client methods
 */

import { apiClient } from './client'
import type { Character, CharacterFilters, CharactersResponse, CharacterConcord, Concord, OriginsResponse, AlignmentsResponse, TraitCountsResponse } from '@/types/character'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Tweet, TweetFilters, TweetsResponse } from '@/types/tweet'
import type { UserSession } from '@/types/wallet'

type CharacterConcordsResponse = {
  concords: Array<CharacterConcord & { concord: Concord }>
}

/**
 * Character API endpoints
 */
export const characterApi = {
  /**
   * Get characters with filters
   */
  getCharacters: (params: CharacterFilters): Promise<CharactersResponse> => apiClient.get<CharactersResponse>('/api/characters', {
    params: {
      tab: params.tab,
      sort: params.sort,
      page: params.page,
      perPage: params.perPage,
      wallet: params.wallet,
      search: params.search,
      hasSheet: params.hasSheet ? true : undefined,
      hasElizaProfile: params.hasElizaProfile ? true : undefined,
      origin: params.origin,
      alignment: params.alignment,
      the17: params.the17,
      armor: params.armor,
      back: params.back,
      mask: params.mask,
    },
    fallbackMessage: 'Failed to fetch characters',
  }),

  /**
   * Get available origins with counts
   */
  getOrigins: (): Promise<OriginsResponse> => apiClient.get<OriginsResponse>('/api/characters/origins', {
    fallbackMessage: 'Failed to fetch origins',
  }),

  /**
   * Get available alignments with counts
   */
  getAlignments: (): Promise<AlignmentsResponse> => apiClient.get<AlignmentsResponse>('/api/characters/alignments', {
    fallbackMessage: 'Failed to fetch alignments',
  }),

  /**
   * Get trait counts for a specific trait type (e.g., Armor, Back, Mask)
   */
  getTraitCounts: (traitType: string): Promise<TraitCountsResponse> => apiClient.get<TraitCountsResponse>(
    `/api/characters/traits/${encodeURIComponent(traitType)}`,
    { fallbackMessage: `Failed to fetch ${traitType} trait counts` }
  ),

  /**
   * Get single character by token ID
   */
  getCharacter: (tokenId: number) =>
    apiClient.get<Character>(`/api/characters/${tokenId}`, {
      fallbackMessage: 'Failed to fetch character',
    }),

  /**
   * Update character
   */
  updateCharacter: (tokenId: number, updates: Partial<Pick<Character, 'background_story' | 'equipment'>>) =>
    apiClient.patch<Character>(`/api/characters/${tokenId}`, updates, {
      fallbackMessage: 'Failed to update character',
    }),

  /**
   * Get character concords
   */
  getCharacterConcords: async (tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>> => {
    const response = await apiClient.get<CharacterConcordsResponse>(`/api/characters/${tokenId}/concords`, {
      fallbackMessage: 'Failed to fetch character concords',
    })
    return response.concords
  },
}

/**
 * Tweet API endpoints
 */
export const tweetApi = {
  /**
   * Get tweets with filters
   */
  getTweets: (filters: TweetFilters) =>
    apiClient.get<TweetsResponse>('/tweets', {
      params: {
        tab: filters.tab,
        sort: filters.sort,
        perPage: filters.perPage,
        startAt: filters.startAt,
      },
    }),
}

/**
 * Auth API endpoints
 */
export const authApi = {
  /**
   * Get nonce for SIWE
   */
  getNonce: (address: string) =>
    apiClient.post<{ nonce: string; domain?: string; uri?: string; chainId?: number }>('/api/auth/nonce', { address }, {
      fallbackMessage: 'Failed to generate nonce',
    }),

  /**
   * Verify SIWE signature
   */
  verify: (params: { address: string; signature: string; message: string }) =>
    apiClient.post<{ success: boolean }>('/api/auth/verify', params, {
      fallbackMessage: 'Failed to verify signature',
    }),

  /**
   * Get current session
   */
  getSession: () =>
    apiClient.get<UserSession>('/api/auth/me', {
      fallbackMessage: 'Failed to fetch current session',
    }),

  /**
   * Logout
   */
  logout: () =>
    apiClient.post<{ success: boolean }>('/api/auth/logout', undefined, {
      fallbackMessage: 'Logout failed',
    }),
}

/**
 * Export all API endpoints
 */
export const api = {
  characters: characterApi,
  tweets: tweetApi,
  auth: authApi,
}
