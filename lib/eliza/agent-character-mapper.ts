import type {
  AICharacter,
  CharacterTemplates,
  SafeCharacterSettings,
  StyleConfig,
  UpdateAICharacterInput,
} from '@/types/eliza'

import type { AgentCharacter, CharacterRecord } from '@/lib/eliza/sdk-types'
import { migratePersonalityToBio } from '@/lib/eliza/migration'
import { mergeSafeSettings } from '@/lib/eliza/character-sheet-policy'
import {
  fromAgentMessageExamples,
  toAgentMessageExamples,
} from '@/lib/eliza/message-examples'

type UnknownRecord = Record<string, unknown>

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((v) => typeof v === 'string') as string[]
  return items.length > 0 ? items : []
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringMap(value: unknown): Record<string, string> | undefined {
  if (!isPlainRecord(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return entries.length > 0 ? Object.fromEntries(entries) : {}
}

function getWagdieSettings(character: AgentCharacter): UnknownRecord {
  const settings = (character as UnknownRecord).settings
  if (!isPlainRecord(settings)) return {}

  const wagdie = settings.wagdie
  return isPlainRecord(wagdie) ? wagdie : {}
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function extractLore(character: AgentCharacter): string[] {
  const record = character as UnknownRecord
  const topLevelLore = asStringArray(record.lore)
  if (topLevelLore !== undefined) return topLevelLore

  return asStringArray(getWagdieSettings(character).lore) ?? []
}

function mergeObjectsPreservingUndefined<T extends Record<string, unknown>>(
  existing: T | undefined,
  patch: T | undefined
): T | undefined {
  if (!existing && !patch) return undefined
  const result: Record<string, unknown> = { ...(existing || {}) }

  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      result[key] = value
    }
  }

  return result as T
}

export function readSystem(character: AgentCharacter): string | null {
  const record = character as UnknownRecord
  const system = normalizeNullableString(record.system)
  if (system !== undefined) return system

  const systemPrompt = normalizeNullableString(record.systemPrompt)
  return systemPrompt ?? null
}

function extractSafeSettings(character: AgentCharacter): SafeCharacterSettings | undefined {
  const settings = character.settings as UnknownRecord | undefined
  if (!isPlainRecord(settings)) return undefined

  const safe: SafeCharacterSettings = {}

  const avatar = normalizeNullableString(settings.avatar)
  if (avatar !== undefined) safe.avatar = avatar

  const metadata = settings.metadata
  if (isPlainRecord(metadata) && isPlainRecord(metadata.wagdieUser)) {
    safe.metadata = {
      wagdieUser: metadata.wagdieUser as Record<string, string | number | boolean | null>,
    }
  }

  return Object.keys(safe).length > 0 ? safe : undefined
}

/**
 * Create an AgentCharacter payload from wagdie's AICharacter DTO.
 */
export function toAgentCharacterFromAICharacter(input: Partial<AICharacter>): AgentCharacter {
  const name = isNonEmptyString(input.name) ? input.name.trim() : 'Unnamed Character'

  const bio =
    Array.isArray(input.bio) && input.bio.length > 0
      ? input.bio
      : migratePersonalityToBio(input.personality ?? null)

  const topics = Array.isArray(input.topics) ? input.topics : []
  const explicitLore = Array.isArray(input.lore) ? input.lore : undefined
  const backstory = normalizeNullableString(input.backstory) ?? null

  const loreFromInput =
    explicitLore !== undefined
      ? explicitLore
      : isNonEmptyString(backstory)
        ? [backstory]
        : []

  const messageExamples = toAgentMessageExamples(input.exampleMessages)
  const system = normalizeNullableString((input as Partial<AICharacter>).system) ?? normalizeNullableString(input.systemPrompt) ?? undefined

  const character: AgentCharacter = {
    name,
    system: system ?? undefined,
    bio,
    topics,
    messageExamples,
    style: (input.style as unknown as AgentCharacter['style']) ?? undefined,
    backstory,
    lore: loreFromInput,
    adjectives: asStringArray((input as unknown as UnknownRecord).adjectives) ?? [],
    postExamples: Array.isArray(input.postExamples) ? input.postExamples : [],
  }

  const username = normalizeNullableString(input.username)
  if (username) character.username = username

  const templates = asStringMap(input.templates)
  if (templates !== undefined) character.templates = templates

  if (input.settings) {
    character.settings = mergeSafeSettings(undefined, input.settings)
  }

  return character
}

/**
 * Create a *partial* AgentCharacter patch from wagdie's UpdateAICharacterInput.
 */
export function toAgentCharacterPatchFromUpdate(
  update: UpdateAICharacterInput
): Partial<AgentCharacter> {
  const patch: Partial<AgentCharacter> = {}
  const patchRecord = patch as UnknownRecord

  if (update.name !== undefined) {
    patch.name = update.name
  }

  if (update.username !== undefined) {
    patch.username = update.username === null ? undefined : update.username
    if (update.username === null) patchRecord.username = null
  }

  const system = update.system !== undefined ? update.system : update.systemPrompt
  if (system !== undefined) {
    patchRecord.system = system
  }

  if (update.bio !== undefined) {
    patch.bio = update.bio
  } else if (update.personality !== undefined) {
    patch.bio = migratePersonalityToBio(update.personality ?? null)
  }

  if (update.topics !== undefined) {
    patch.topics = update.topics
  }

  if (update.style !== undefined) {
    patch.style = update.style as unknown as AgentCharacter['style']
  }

  if (update.exampleMessages !== undefined) {
    patch.messageExamples = toAgentMessageExamples(update.exampleMessages)
  }

  if (update.backstory !== undefined) {
    patchRecord.backstory = update.backstory
  }

  if (update.lore !== undefined) {
    patchRecord.lore = update.lore
  }
  if (update.adjectives !== undefined) {
    patchRecord.adjectives = update.adjectives
  }
  if (update.postExamples !== undefined) {
    patchRecord.postExamples = update.postExamples
  }
  if (update.templates !== undefined) {
    patchRecord.templates = update.templates
  }
  if (update.settings !== undefined) {
    patchRecord.settings = update.settings
  }

  return patch
}

/**
 * Merge helper for safe `characters.replaceRecord()` usage.
 */
export function mergeAgentCharacter(
  existing: AgentCharacter,
  patch: Partial<AgentCharacter>
): AgentCharacter {
  const merged: AgentCharacter = { ...existing }
  const mergedRecord = merged as UnknownRecord

  for (const [key, value] of Object.entries(patch as UnknownRecord)) {
    if (value === undefined) continue

    if (key === 'style') {
      merged.style = mergeObjectsPreservingUndefined(
        existing.style as UnknownRecord | undefined,
        value as UnknownRecord | undefined
      ) as AgentCharacter['style']
      continue
    }

    if (key === 'settings') {
      merged.settings = mergeSafeSettings(
        existing.settings,
        value as SafeCharacterSettings | undefined
      )
      continue
    }

    if (key === 'system' || key === 'username' || key === 'templates') {
      if (value === null) {
        delete mergedRecord[key]
      } else if (key === 'templates' && isPlainRecord(value) && Object.keys(value).length === 0) {
        delete mergedRecord.templates
      } else {
        mergedRecord[key] = value
      }
      continue
    }

    mergedRecord[key] = value
  }

  if (!isNonEmptyString(merged.name)) {
    merged.name = isNonEmptyString(existing.name) ? existing.name : 'Unnamed Character'
  }

  return merged
}

/**
 * Apply a wagdie UpdateAICharacterInput to an existing AgentCharacter and return the merged result.
 */
export function applyWagdieUpdateToAgentCharacter(
  existing: AgentCharacter,
  update: UpdateAICharacterInput
): AgentCharacter {
  const patch = toAgentCharacterPatchFromUpdate(update)
  const patchRecord = patch as UnknownRecord

  if (update.backstory !== undefined && update.lore === undefined) {
    const existingLore = extractLore(existing)
    const newBackstory = normalizeNullableString(update.backstory)

    if (existingLore.length === 0 && isNonEmptyString(newBackstory)) {
      patchRecord.lore = [newBackstory]
    } else {
      delete patchRecord.lore
    }
  }

  return mergeAgentCharacter(existing, patch)
}

/**
 * Extract backstory with backward compatibility:
 * - Prefer custom `backstory` key if present
 * - Otherwise fall back to the first `lore` entry if present
 */
export function extractBackstory(character: AgentCharacter): string | null {
  const record = character as UnknownRecord
  const backstory = record.backstory
  if (typeof backstory === 'string') return backstory
  if (backstory === null) return null

  const wagdieSettings = getWagdieSettings(character)
  if (hasOwn(wagdieSettings, 'backstory')) {
    const wagdieBackstory = wagdieSettings.backstory
    if (typeof wagdieBackstory === 'string') return wagdieBackstory
    if (wagdieBackstory === null) return null
  }

  const topLevelLore = asStringArray(record.lore)
  if (topLevelLore && topLevelLore.length > 0) return topLevelLore[0]

  const wagdieLore = asStringArray(wagdieSettings.lore)
  if (wagdieLore && wagdieLore.length > 0) return wagdieLore[0]

  return null
}

/**
 * Map an SDK CharacterRecord into wagdie's AICharacter DTO.
 */
export function toAICharacterFromRecord(tokenId: string, record: CharacterRecord): AICharacter {
  const c = record.character
  const cRecord = c as UnknownRecord

  const bio = Array.isArray(c.bio) ? c.bio : []
  const topics = Array.isArray(c.topics) ? c.topics : []

  const lore = extractLore(c)
  const adjectives = asStringArray(cRecord.adjectives) ?? []
  const postExamples = asStringArray(cRecord.postExamples) ?? []

  const backstory = extractBackstory(c)
  const system = readSystem(c)
  const exampleMessages = fromAgentMessageExamples(c.messageExamples)
  const templates = asStringMap(cRecord.templates) as CharacterTemplates | undefined

  return {
    id: record.id,
    externalId: record.externalId ?? tokenId,
    name: c.name,
    username: normalizeNullableString(c.username) ?? null,
    personality: bio.length > 0 ? bio.join('\n\n') : null,
    backstory,
    system,
    systemPrompt: system,
    exampleMessages,
    templates,
    settings: extractSafeSettings(c),

    bio,
    lore,
    topics,
    adjectives,
    style: (c.style as unknown as StyleConfig) ?? undefined,
    postExamples,
    knowledge: undefined,

    createdAt: record.createdAt ?? '',
    updatedAt: record.updatedAt ?? '',
  }
}
