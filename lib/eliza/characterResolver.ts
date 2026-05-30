/**
 * Eliza Character Resolver
 *
 * Centralized helpers to resolve a WAGDIE tokenId to an Eliza CharacterRecord.
 * - getCharacterRecordByExternalId(): canonical lookup by external ID
 * - getCharacterByTokenId(): simple lookup (no side effects)
 * - resolveCharacterByTokenId(): lookup + auto-create default character if missing
 */

import { elizaConfig } from '@/lib/eliza/config'
import type { WagdieElizaClient } from '@/lib/eliza/gateway/types'
import {
  recordLegacyPersonaProfileLink,
  recordPersonaMigrationSuccess,
  syncOfficialPersonaShadow,
} from '@/lib/eliza/personaMigration'
import { buildNeutralDefaultPersonality } from '@/lib/eliza/persona-copy'
import type { CharacterRecord, AgentCharacter } from '@/lib/eliza/sdkAdapter'
import { toAgentCharacterFromAICharacter } from '@/lib/eliza/sdkAdapter'

export type WagdieCharacterDefaults = {
  name: string | null
  backgroundStory: string | null
}

function assertValidTokenId(tokenId: string): string {
  const trimmed = tokenId.trim()
  if (trimmed.length === 0) {
    throw new Error('tokenId is required')
  }
  return trimmed
}

function buildDefaultCharacter(params: {
  tokenId: string
  wagdieDefaults: WagdieCharacterDefaults
}): AgentCharacter {
  const { tokenId, wagdieDefaults } = params

  const name =
    (typeof wagdieDefaults.name === 'string' && wagdieDefaults.name.trim().length > 0
      ? wagdieDefaults.name.trim()
      : null) || `Character #${tokenId}`

  const personality = buildNeutralDefaultPersonality(tokenId)
  const backstory =
    typeof wagdieDefaults.backgroundStory === 'string' ? wagdieDefaults.backgroundStory : null

  // Use adapter mapping to ensure we follow canonical v0.2 AgentCharacter structure:
  // - systemPrompt -> system
  // - personality -> bio[] (via migratePersonalityToBio)
  // - backstory -> custom key + mirrored into lore[]
  // - exampleMessages -> messageExamples
  return toAgentCharacterFromAICharacter({
    name,
    personality,
    backstory,
    systemPrompt: null,
    exampleMessages: [],
    settings: {
      metadata: {
        wagdieUser: {
          personaSource: 'neutral_default',
          defaultNeutralPersona: true,
        },
      },
    },
  })
}

/**
 * Canonical lookup helper to resolve records by external ID.
 * Uses SDK's getRecordByExternalId to get the CharacterRecord directly.
 *
 * This centralizes ID translation and avoids passing WAGDIE token IDs
 * into SDK methods that expect record IDs.
 *
 * @param elizaClient - The Eliza gateway client
 * @param externalId - The external ID (e.g., WAGDIE tokenId)
 * @returns CharacterRecord or null if not found
 */
export async function getCharacterRecordByExternalId(
  elizaClient: WagdieElizaClient,
  externalId: string
): Promise<CharacterRecord | null> {
  const trimmedId = externalId.trim()
  if (trimmedId.length === 0) {
    return null
  }

  // Use SDK's canonical method to get the full CharacterRecord by external ID
  return elizaClient.characters.getRecordByExternalId(trimmedId)
}

/**
 * Get Eliza character by WAGDIE tokenId.
 * No auto-create; returns null if missing.
 *
 * Uses canonical getCharacterRecordByExternalId internally.
 */
export async function getCharacterByTokenId(params: {
  elizaClient: WagdieElizaClient
  tokenId: string
}): Promise<CharacterRecord | null> {
  const tokenId = assertValidTokenId(params.tokenId)
  return getCharacterRecordByExternalId(params.elizaClient, tokenId)
}

/**
 * Resolve Eliza character by WAGDIE tokenId, auto-creating a default character if missing.
 *
 * Uses canonical createRecord to preserve unknown keys and ensure data round-trip.
 */
export async function resolveCharacterByTokenId(params: {
  elizaClient: WagdieElizaClient
  tokenId: string
  wagdieDefaults: WagdieCharacterDefaults
}): Promise<CharacterRecord> {
  const tokenId = assertValidTokenId(params.tokenId)

  // Try to get existing character using canonical record lookup
  const existing = await getCharacterRecordByExternalId(params.elizaClient, tokenId)
  if (existing) {
    return existing
  }

  // Build and create a new character
  const character = buildDefaultCharacter({ tokenId, wagdieDefaults: params.wagdieDefaults })

  // Use canonical createRecord to get back a CharacterRecord
  const created = await params.elizaClient.characters.createRecord({
    externalId: tokenId,
    character,
  })

  if (elizaConfig.mode === 'dual') {
    await syncOfficialPersonaShadow({
      tokenId,
      legacyCharacterId: created.id,
      character: created.character,
    })
  } else if (elizaConfig.mode === 'official') {
    await recordPersonaMigrationSuccess({
      tokenId,
      officialAgentId: created.id,
    })
  } else {
    await recordLegacyPersonaProfileLink({
      tokenId,
      legacyCharacterId: created.id,
    })
  }

  return created
}

/**
 * Get the canonical record ID from a WAGDIE tokenId.
 * Returns null if no character exists for this tokenId.
 *
 * Use this when you need the Eliza record ID for operations like
 * replaceRecord, conversations.listForCharacter, etc.
 */
export async function getRecordIdByTokenId(
  elizaClient: WagdieElizaClient,
  tokenId: string
): Promise<string | null> {
  const record = await getCharacterRecordByExternalId(elizaClient, tokenId)
  return record?.id ?? null
}

export { normalizeExpiresAt } from './sessionAuth'
