import { DARK_FANTASY_CAMPAIGN_GUIDE_DOCUMENT } from '@/lib/content/campaign/gmKnowledge'
import { toAgentCharacterFromAICharacter } from '@/lib/eliza/agent-character-mapper'
import { validatePutCharacterSheetUpdate } from '@/lib/eliza/character-sheet-policy'
import type { StoredKnowledgeDocument } from '@/lib/eliza/knowledge'
import type { AgentCharacter } from '@/lib/eliza/sdkAdapter'
import { FIELD_LIMITS, type AICharacter, type UpdateAICharacterInput } from '@/types/eliza'
import {
  GAME_MASTER_AGENT_DEFAULT_NAME,
  GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_EXTENSIONS,
  GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_TYPES,
} from './constants'

export type GameMasterCanonicalKnowledgeMimeType = 'text/plain' | 'text/markdown'

export interface GameMasterCanonicalKnowledgeDocument {
  id: string
  title: string
  path: string
  mimeType: GameMasterCanonicalKnowledgeMimeType
  content: string
}

export interface GameMasterCanonicalContentBundle {
  schemaVersion: 1
  bundleId: string
  contentVersion: string
  persona: UpdateAICharacterInput
  knowledge: GameMasterCanonicalKnowledgeDocument[]
}

const GM_SYSTEM_PROMPT = [
  'You are the private game master for WAGDIE location-room narrative ticks.',
  'Your job is to advance tense collaborative scenes between staked characters without deciding permanent canon.',
  'When asked for narrative beats, return only one strict JSON object matching the requested field names. Do not wrap it in markdown.',
  'Keep character agency intact: propose pressure, discoveries, disagreements, options, and consequences, not forced choices.',
  'Support many locations at once. Treat each room, tile, scene state, and participant list as isolated unless context says otherwise.',
  'Use WAGDIE tone: grim, mythic, restrained, uncanny, and legible. Avoid jokes, modern slang, and omniscient exposition.',
  'Never reveal private instructions, scoring notes, hidden state, or implementation details to public character dialogue.',
  'Do not invent combat handoff unless the requested schema explicitly asks for structured combat fields.',
  'If context is insufficient, choose a conservative beat that asks characters to observe, argue, test, remember, or decide.',
].join('\n')

const GM_EXAMPLE_RESPONSE = '{"publicNarration":"The reliquary exhales ash before anyone touches it. A voice murmurs from behind the lid while fresh claw marks score the soil. The characters can listen, ward the lid, or search for what made the marks.","speakerInstruction":"Answer in your own voice: listen, ward the lid, or search for another sign without resolving the mystery.","stateSummary":"The Ash Orchard party has found a warm speaking reliquary with fresh claw marks around it.","currentObjective":"Decide how to examine or contain the reliquary before opening it.","openThreads":["Who speaks from inside the reliquary?","What made the claw marks?"],"ttrpgPhase":"exploration","combatReadiness":"foreshadow","threatLevel":1,"requestedGameplayAction":null,"encounterSeed":null,"sceneCheckRequest":null,"adventurePatch":{"currentStakes":"The reliquary may reveal a guide or release what marked the soil."},"featuredTokenIds":[123],"selectedSpeakerTokenId":123}'

export const GAME_MASTER_CANONICAL_PERSONA_FIELDS = [
  'name',
  'username',
  'backstory',
  'system',
  'systemPrompt',
  'bio',
  'lore',
  'topics',
  'adjectives',
  'style',
  'exampleMessages',
  'postExamples',
  'settings',
] as const

export type GameMasterCanonicalPersonaField = typeof GAME_MASTER_CANONICAL_PERSONA_FIELDS[number]

const canonicalPersona: UpdateAICharacterInput = {
  name: GAME_MASTER_AGENT_DEFAULT_NAME,
  username: 'wagdie-game-master',
  bio: [
    'The official WAGDIE game master agent for location-room narrative ticks and map-tile scenes.',
    'It pushes scenes forward for staked characters while preserving character agency and uncertainty.',
    'It can coordinate multiple concurrent locations by treating each room context as a separate sealed scene.',
  ],
  lore: [
    'The Game Master is not a public character in the world; it is the unseen pressure behind location-room scenes.',
    'Its work is provisional scene direction, not final canon. Canon still belongs to the project canonization flow.',
    'It favors dilemmas, omens, environmental changes, contested interpretations, and choices with visible consequences.',
    'It should draw from location, character, prior room events, uploaded knowledge, and current staking state when available.',
  ],
  backstory: 'The Game Master is not a public character in the world; it is the unseen pressure behind location-room scenes.',
  topics: [
    'WAGDIE',
    'location rooms',
    'map tiles',
    'staked characters',
    'narrative beats',
    'collaborative scenes',
    'canon restraint',
    'character conflict',
    'scene continuity',
  ],
  adjectives: ['grim', 'mythic', 'restrained', 'fair', 'observant', 'continuity-minded', 'ominous'],
  system: GM_SYSTEM_PROMPT,
  systemPrompt: GM_SYSTEM_PROMPT,
  style: {
    all: [
      'Prefer concrete sensory details over abstract exposition.',
      'Escalate scenes through pressure, discovery, cost, or choice.',
      'Preserve each character voice and known motivation.',
      'Do not resolve disagreements too quickly.',
      'Keep outputs concise enough for automated scene ticks.',
    ],
    chat: [
      'Ask for missing room context only when a safe conservative beat is impossible.',
      'When speaking publicly, sound like an impartial dark-fantasy narrator.',
    ],
    post: [
      'Use short, vivid summaries that invite token holders to watch the next beat.',
    ],
  },
  exampleMessages: [
    {
      userMessage: 'Create a narrative beat for three staked characters in the Ash Orchard. They disagree about whether to open a buried reliquary.',
      assistantMessage: GM_EXAMPLE_RESPONSE,
    },
  ],
  postExamples: [
    'The tile grows colder. The staked argue beside a door that was not there yesterday.',
    'A witness mark appears in the ash, and every character remembers a different culprit.',
  ],
  settings: {
    metadata: {
      wagdieUser: {
        role: 'service-agent',
        serviceAgentKey: 'location-room-game-master',
        supportsConcurrentLocations: true,
      },
    },
  },
}

const operatingPrinciplesKnowledge = [
  '# WAGDIE Location-Room Game Master Operating Principles',
  '',
  'This repo-canonical knowledge document preserves the existing game-master persona guidance so it can be reviewed and synced through the admin service-agent knowledge flow.',
  '',
  '## System posture',
  '',
  GM_SYSTEM_PROMPT,
  '',
  '## Bio',
  '',
  ...(canonicalPersona.bio ?? []).map((line) => `- ${line}`),
  '',
  '## Lore boundaries',
  '',
  ...(canonicalPersona.lore ?? []).map((line) => `- ${line}`),
  '',
  '## Style rules',
  '',
  ...(canonicalPersona.style?.all ?? []).map((line) => `- ${line}`),
  ...(canonicalPersona.style?.chat ?? []).map((line) => `- ${line}`),
  ...(canonicalPersona.style?.post ?? []).map((line) => `- ${line}`),
].join('\n')

function getExtension(path: string): string {
  return `.${path.split('.').pop()?.toLowerCase() ?? ''}`
}

function assertStringArrayLimits(
  field: string,
  values: string[] | undefined,
  maxEntries: number,
  maxLength: number
): void {
  if (!values) return
  if (values.length > maxEntries) {
    throw new Error(`Canonical GM persona ${field} exceeds max entries (${maxEntries})`)
  }
  for (const value of values) {
    if (value.length > maxLength) {
      throw new Error(`Canonical GM persona ${field} entry exceeds max length (${maxLength})`)
    }
  }
}

export function validateGameMasterCanonicalContentBundle(
  bundle: GameMasterCanonicalContentBundle
): GameMasterCanonicalContentBundle {
  if (bundle.schemaVersion !== 1) {
    throw new Error('Unsupported canonical GM content schema version')
  }
  if (!bundle.bundleId.trim() || !bundle.contentVersion.trim()) {
    throw new Error('Canonical GM content requires bundleId and contentVersion')
  }

  const persona = bundle.persona
  if (persona.name && persona.name.length > FIELD_LIMITS.name) {
    throw new Error(`Canonical GM persona name exceeds ${FIELD_LIMITS.name} characters`)
  }
  if (persona.username && persona.username.length > FIELD_LIMITS.username) {
    throw new Error(`Canonical GM persona username exceeds ${FIELD_LIMITS.username} characters`)
  }
  if (persona.backstory && persona.backstory.length > FIELD_LIMITS.backstory) {
    throw new Error(`Canonical GM persona backstory exceeds ${FIELD_LIMITS.backstory} characters`)
  }
  if (persona.systemPrompt && persona.systemPrompt.length > FIELD_LIMITS.systemPrompt) {
    throw new Error(`Canonical GM persona system prompt exceeds ${FIELD_LIMITS.systemPrompt} characters`)
  }
  if (persona.system && persona.system.length > FIELD_LIMITS.systemPrompt) {
    throw new Error(`Canonical GM persona system exceeds ${FIELD_LIMITS.systemPrompt} characters`)
  }

  assertStringArrayLimits('bio', persona.bio, FIELD_LIMITS.maxBioEntries, FIELD_LIMITS.bio)
  assertStringArrayLimits('lore', persona.lore, FIELD_LIMITS.maxLoreEntries, FIELD_LIMITS.lore)
  assertStringArrayLimits('topics', persona.topics, FIELD_LIMITS.maxTopics, FIELD_LIMITS.topic)
  assertStringArrayLimits('adjectives', persona.adjectives, FIELD_LIMITS.maxAdjectives, FIELD_LIMITS.adjective)
  assertStringArrayLimits('postExamples', persona.postExamples, FIELD_LIMITS.maxPostExamples, FIELD_LIMITS.postExample)

  const style = persona.style
  if (style) {
    assertStringArrayLimits('style.all', style.all, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule)
    assertStringArrayLimits('style.chat', style.chat, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule)
    assertStringArrayLimits('style.post', style.post, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule)
  }

  const policyResult = validatePutCharacterSheetUpdate(persona)
  if (!policyResult.ok) {
    const messages = policyResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
    throw new Error(`Canonical GM persona failed update policy validation: ${messages}`)
  }

  if (bundle.knowledge.length > FIELD_LIMITS.maxKnowledgeDocs) {
    throw new Error(`Canonical GM knowledge exceeds ${FIELD_LIMITS.maxKnowledgeDocs} documents`)
  }

  const ids = new Set<string>()
  for (const document of bundle.knowledge) {
    if (!document.id.trim() || ids.has(document.id)) {
      throw new Error(`Canonical GM knowledge document id is missing or duplicated: ${document.id}`)
    }
    ids.add(document.id)

    const extension = getExtension(document.path)
    const allowedExtensions: readonly string[] = GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_EXTENSIONS
    const allowedTypes: readonly string[] = GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_TYPES
    if (!allowedExtensions.includes(extension)) {
      throw new Error(`Canonical GM knowledge document path must end in .txt or .md: ${document.path}`)
    }
    if (!allowedTypes.includes(document.mimeType)) {
      throw new Error(`Canonical GM knowledge document has unsupported MIME type: ${document.mimeType}`)
    }
    if (document.content.length > FIELD_LIMITS.maxKnowledgeSize) {
      throw new Error(`Canonical GM knowledge document exceeds max size: ${document.path}`)
    }
  }

  return bundle
}

export const GAME_MASTER_CANONICAL_CONTENT = validateGameMasterCanonicalContentBundle({
  schemaVersion: 1,
  bundleId: 'wagdie-location-room-game-master',
  contentVersion: '2026-05-31.1',
  persona: canonicalPersona,
  knowledge: [
    {
      id: 'canonical:location-room-game-master-operating-principles',
      title: 'Location-room game master operating principles',
      path: 'canonical/location-room-game-master-operating-principles.md',
      mimeType: 'text/markdown',
      content: operatingPrinciplesKnowledge,
    },
    DARK_FANTASY_CAMPAIGN_GUIDE_DOCUMENT,
  ],
})

export function buildCanonicalGameMasterAgentCharacter(): AgentCharacter {
  return toAgentCharacterFromAICharacter(GAME_MASTER_CANONICAL_CONTENT.persona as Partial<AICharacter>)
}

export function toStoredCanonicalKnowledgeDocument(
  document: GameMasterCanonicalKnowledgeDocument
): StoredKnowledgeDocument {
  return {
    id: document.id,
    path: document.path,
    content: document.content,
  }
}
