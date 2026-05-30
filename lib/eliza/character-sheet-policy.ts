import type {
  ElizaCharacterExport,
  ExampleMessage,
  PersonaAssistantEditableDraft,
  SafeCharacterSettings,
  UpdateAICharacterInput,
} from '@/types/eliza'
import type { AgentCharacter, AgentMessageExample } from '@/lib/eliza/sdk-types'
import {
  aiPersonaUpdateSchema,
  elizaCharacterExportSchema,
  personaAssistantEditableDraftSchema,
} from '@/lib/eliza/validation'
import {
  fromElizaExportMessageExamples,
  toElizaExportMessageExamples,
} from '@/lib/eliza/eliza-export-mapper'

type UnknownRecord = Record<string, unknown>

export type PolicyIssue = {
  path: string
  reason: 'backend_owned' | 'unsupported' | 'invalid'
  message: string
}

export type PutPolicyResult =
  | { ok: true; update: UpdateAICharacterInput }
  | { ok: false; status: 400; issues: PolicyIssue[] }

export type PersonaAssistantPolicyResult =
  | { ok: true; proposal: PersonaAssistantEditableDraft; warnings: string[] }
  | { ok: false; issues: PolicyIssue[]; warnings: string[] }

export type ImportPolicyResult = {
  agentPatch: Partial<AgentCharacter>
  imported: string[]
  skipped: string[]
  warnings: string[]
}

export const BACKEND_OWNED_EXACT_PATHS = new Set([
  'id',
  'externalId',
  'plugins',
  'secrets',
  'modelProvider',
  'clients',
  'settings.secrets',
  'settings.wagdie',
  'settings.metadata.officialAgentId',
  'settings.metadata.legacyCharacterId',
  'settings.metadata.officialMemoryId',
  'settings.metadata.officialSessionId',
  'settings.metadata.elizaMigration',
  'settings.metadata.migration',
])

export const BACKEND_OWNED_PREFIX_PATHS = [
  'settings.secrets.',
  'settings.wagdie.',
  'settings.metadata.officialAgentId.',
  'settings.metadata.legacyCharacterId.',
  'settings.metadata.officialMemoryId.',
  'settings.metadata.officialSessionId.',
  'settings.metadata.elizaMigration.',
  'settings.metadata.migration.',
]

const USER_MANAGED_TOP_LEVEL = new Set([
  'name',
  'username',
  'personality',
  'backstory',
  'system',
  'systemPrompt',
  'templates',
  'settings',
  'bio',
  'lore',
  'topics',
  'adjectives',
  'style',
  'messageExamples',
  'exampleMessages',
  'postExamples',
  'knowledge',
])

export const ASSISTANT_PERSONA_PROPOSAL_FIELDS = [
  'username',
  'backstory',
  'system',
  'bio',
  'lore',
  'topics',
  'adjectives',
  'style',
  'exampleMessages',
  'postExamples',
  'templates',
  'settings',
] as const

const ASSISTANT_PROPOSAL_TOP_LEVEL = new Set<string>(ASSISTANT_PERSONA_PROPOSAL_FIELDS)
const ASSISTANT_ALIAS_TOP_LEVEL = new Set(['systemPrompt', 'messageExamples'])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function isBackendOwnedPath(path: string): boolean {
  return BACKEND_OWNED_EXACT_PATHS.has(path) || BACKEND_OWNED_PREFIX_PATHS.some((prefix) => path.startsWith(prefix))
}

function collectPaths(value: unknown, prefix = ''): string[] {
  if (!isRecord(value)) return []

  const paths: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    paths.push(path)

    if (isRecord(child)) {
      paths.push(...collectPaths(child, path))
    }
  }
  return paths
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function normalizeTemplates(value: unknown): Record<string, string> | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isRecord(value)) return undefined

  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, body]) => [key.trim(), body] as const)
    .filter(([key]) => key.length > 0)

  if (entries.length === 0) return {}
  return Object.fromEntries(entries)
}

function normalizeSafeSettings(value: unknown): SafeCharacterSettings | undefined {
  if (!isRecord(value)) return undefined

  const settings: SafeCharacterSettings = {}

  if (hasOwn(value, 'avatar')) {
    settings.avatar = normalizeNullableString(value.avatar) ?? null
  }

  const metadata = asRecord(value.metadata)
  if (metadata && hasOwn(metadata, 'wagdieUser')) {
    if (metadata.wagdieUser === null) {
      settings.metadata = { wagdieUser: null }
    } else if (isRecord(metadata.wagdieUser)) {
      settings.metadata = { wagdieUser: metadata.wagdieUser as Record<string, string | number | boolean | null> }
    } else {
      settings.metadata = { wagdieUser: null }
    }
  }

  return Object.keys(settings).length > 0 ? settings : undefined
}

function systemFrom(record: UnknownRecord): { value?: string | null; warning?: string } {
  const system = normalizeNullableString(record.system)
  const systemPrompt = normalizeNullableString(record.systemPrompt)

  if (system !== undefined && systemPrompt !== undefined && system !== systemPrompt) {
    return {
      value: system,
      warning: 'Both system and systemPrompt were provided; system was imported and systemPrompt was ignored.',
    }
  }

  return { value: system !== undefined ? system : systemPrompt }
}

function issueKey(issue: PolicyIssue): string {
  return `${issue.path}:${issue.reason}:${issue.message}`
}

function dedupeIssues(issues: PolicyIssue[]): PolicyIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = issueKey(issue)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isAllowedAssistantSettingsPath(path: string): boolean {
  return (
    path === 'settings.avatar' ||
    path === 'settings.metadata' ||
    path === 'settings.metadata.wagdieUser' ||
    path.startsWith('settings.metadata.wagdieUser.')
  )
}

function convertElizaMessageExamplesAlias(value: unknown): ExampleMessage[] | undefined {
  if (!Array.isArray(value)) return undefined

  const examples: ExampleMessage[] = []

  for (const conversation of value) {
    if (!Array.isArray(conversation) || conversation.length < 2) return undefined

    const texts = conversation
      .map((entry) => {
        const record = asRecord(entry)
        const content = asRecord(record?.content)
        return typeof content?.text === 'string' ? content.text.trim() : ''
      })
      .filter(Boolean)

    if (texts.length < 2) return undefined

    examples.push({ userMessage: texts[0], assistantMessage: texts[1] })
  }

  return examples
}

export function sanitizePersonaAssistantProposal(value: unknown): PersonaAssistantPolicyResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      warnings: [],
      issues: [{ path: '', reason: 'invalid', message: 'Assistant proposal must be an object' }],
    }
  }

  const issues: PolicyIssue[] = []
  const warnings: string[] = []

  for (const path of findBackendOwnedPaths(value)) {
    issues.push({ path, reason: 'backend_owned', message: `${path} is managed by the WAGDIE backend` })
  }

  for (const key of Object.keys(value)) {
    if (ASSISTANT_PROPOSAL_TOP_LEVEL.has(key)) continue
    if (ASSISTANT_ALIAS_TOP_LEVEL.has(key)) continue

    issues.push({
      path: key,
      reason: 'unsupported',
      message: `${key} is not supported in assistant persona proposals`,
    })
  }

  if (hasOwn(value, 'systemPrompt')) {
    if (hasOwn(value, 'system')) {
      issues.push({
        path: 'systemPrompt',
        reason: 'invalid',
        message: 'systemPrompt is an alias and cannot be returned with canonical system',
      })
    } else {
      warnings.push('systemPrompt was normalized to canonical system')
    }
  }

  if (hasOwn(value, 'messageExamples')) {
    if (hasOwn(value, 'exampleMessages')) {
      issues.push({
        path: 'messageExamples',
        reason: 'invalid',
        message: 'messageExamples is an alias and cannot be returned with exampleMessages',
      })
    } else {
      const converted = convertElizaMessageExamplesAlias(value.messageExamples)
      if (!converted) {
        issues.push({
          path: 'messageExamples',
          reason: 'invalid',
          message: 'messageExamples must be an array of Eliza message pairs with content.text values',
        })
      } else {
        warnings.push('messageExamples was normalized to app-facing exampleMessages')
      }
    }
  }

  const settings = asRecord(value.settings)
  if (settings) {
    for (const path of collectPaths(settings, 'settings')) {
      if (!isAllowedAssistantSettingsPath(path) && !isBackendOwnedPath(path)) {
        issues.push({ path, reason: 'unsupported', message: `${path} is not supported in assistant persona proposals` })
      }
    }
  }

  const proposal: UnknownRecord = {}
  for (const key of ASSISTANT_PERSONA_PROPOSAL_FIELDS) {
    if (hasOwn(value, key)) proposal[key] = value[key]
  }

  if (!hasOwn(proposal, 'system') && hasOwn(value, 'systemPrompt')) {
    proposal.system = value.systemPrompt
  }

  if (!hasOwn(proposal, 'exampleMessages') && hasOwn(value, 'messageExamples')) {
    proposal.exampleMessages = convertElizaMessageExamplesAlias(value.messageExamples)
  }

  const parsed = personaAssistantEditableDraftSchema.safeParse(proposal)
  if (!parsed.success) {
    for (const issue of parsed.error.errors) {
      issues.push({ path: issue.path.join('.'), reason: 'invalid', message: issue.message })
    }
  }

  if (issues.length > 0) {
    return { ok: false, warnings: unique(warnings), issues: dedupeIssues(issues) }
  }

  return { ok: true, proposal: parsed.data as PersonaAssistantEditableDraft, warnings: unique(warnings) }
}

export function findBackendOwnedPaths(value: unknown): string[] {
  return unique(collectPaths(value).filter(isBackendOwnedPath))
}

export function findUnsupportedTopLevelFields(value: unknown): string[] {
  if (!isRecord(value)) return []
  return Object.keys(value).filter((key) => !USER_MANAGED_TOP_LEVEL.has(key) && !isBackendOwnedPath(key))
}

export function validatePutCharacterSheetUpdate(value: unknown): PutPolicyResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      status: 400,
      issues: [{ path: '', reason: 'invalid', message: 'Request body must be an object' }],
    }
  }

  const issues: PolicyIssue[] = []

  for (const path of findBackendOwnedPaths(value)) {
    issues.push({ path, reason: 'backend_owned', message: `${path} is managed by the WAGDIE backend` })
  }

  for (const path of findUnsupportedTopLevelFields(value)) {
    issues.push({ path, reason: 'unsupported', message: `${path} is not a supported user-managed character field` })
  }

  const settings = asRecord(value.settings)
  if (settings) {
    for (const path of collectPaths(settings, 'settings')) {
      const allowed =
        path === 'settings.avatar' ||
        path === 'settings.metadata' ||
        path === 'settings.metadata.wagdieUser' ||
        path.startsWith('settings.metadata.wagdieUser.')
      if (!allowed && !isBackendOwnedPath(path)) {
        issues.push({ path, reason: 'unsupported', message: `${path} is not a supported user-managed settings field` })
      }
    }
  }

  const system = normalizeNullableString(value.system)
  const systemPrompt = normalizeNullableString(value.systemPrompt)
  if (system !== undefined && systemPrompt !== undefined && system !== systemPrompt) {
    issues.push({
      path: 'systemPrompt',
      reason: 'invalid',
      message: 'system and systemPrompt conflict; send only system or matching values',
    })
  }

  const parsed = aiPersonaUpdateSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.errors) {
      issues.push({ path: issue.path.join('.'), reason: 'invalid', message: issue.message })
    }
  }

  if (issues.length > 0) {
    return { ok: false, status: 400, issues }
  }

  const update = parsed.success ? parsed.data : value
  return { ok: true, update: update as UpdateAICharacterInput }
}

export function normalizeCharacterSheetImport(value: unknown): ImportPolicyResult {
  const record = isRecord(value) ? value : {}
  const result: ImportPolicyResult = {
    agentPatch: {},
    imported: [],
    skipped: [],
    warnings: [],
  }

  const parsed = elizaCharacterExportSchema.safeParse(record)
  const importData = parsed.success ? parsed.data as UnknownRecord : record

  for (const path of findBackendOwnedPaths(record)) {
    result.skipped.push(path)
    result.warnings.push(`${path} is managed by the WAGDIE backend and was not imported`)
  }

  for (const path of findUnsupportedTopLevelFields(record)) {
    result.skipped.push(path)
    result.warnings.push(`${path} is not supported by WAGDIE character-sheet import and was skipped`)
  }

  if (hasOwn(record, 'name') && typeof record.name === 'string') {
    result.warnings.push(`Imported character name "${record.name}" was ignored. Name is synced from WAGDIE character.`)
  }

  if (Array.isArray(record.knowledge) && record.knowledge.length > 0) {
    result.skipped.push('knowledge')
    result.warnings.push('Knowledge documents must be uploaded separately and were not imported')
  }

  const patch = result.agentPatch as Partial<AgentCharacter> & UnknownRecord

  const fieldImports: Array<[string, unknown, (value: unknown) => unknown]> = [
    ['username', importData.username, normalizeNullableString],
    ['bio', importData.bio, (v) => Array.isArray(v) ? v : undefined],
    ['lore', importData.lore, (v) => Array.isArray(v) ? v : undefined],
    ['backstory', importData.backstory, normalizeNullableString],
    ['topics', importData.topics, (v) => Array.isArray(v) ? v : undefined],
    ['adjectives', importData.adjectives, (v) => Array.isArray(v) ? v : undefined],
    ['style', importData.style, (v) => isRecord(v) ? v : undefined],
    ['postExamples', importData.postExamples, (v) => Array.isArray(v) ? v : undefined],
    ['templates', importData.templates, normalizeTemplates],
    ['settings', importData.settings, normalizeSafeSettings],
  ]

  for (const [field, rawValue, normalize] of fieldImports) {
    if (!hasOwn(record, field)) continue
    const normalized = normalize(rawValue)
    if (normalized !== undefined) {
      patch[field] = normalized
      result.imported.push(field)
    }
  }

  const system = systemFrom(record)
  if (system.warning) result.warnings.push(system.warning)
  if (system.value !== undefined) {
    patch.system = system.value as unknown as AgentCharacter['system']
    if (system.value === null) (patch as UnknownRecord).system = null
    result.imported.push('system')
  }

  if (Array.isArray(importData.messageExamples)) {
    const exportExamples = importData.messageExamples.map((conversation) =>
      Array.isArray(conversation)
        ? conversation.map((message) => {
            const messageRecord = message as UnknownRecord
            return {
              user: String(messageRecord.user ?? messageRecord.name ?? ''),
              content: { text: String((messageRecord.content as { text?: unknown } | undefined)?.text ?? '') },
            }
          })
        : []
    )
    patch.messageExamples = fromElizaExportMessageExamples(exportExamples)
    result.imported.push('messageExamples')
  }

  result.imported = unique(result.imported)
  result.skipped = unique(result.skipped)

  return result
}

function stringArray(value: unknown): string[] | undefined {
  const items = normalizeStringArray(value)
  return items && items.length > 0 ? items : undefined
}

function getWagdieSettings(record: UnknownRecord): UnknownRecord {
  const settings = asRecord(record.settings)
  const wagdie = asRecord(settings?.wagdie)
  return wagdie ?? {}
}

function firstOwnedNullableString(
  records: Array<[UnknownRecord, string]>,
  fallback: string | null
): string | null {
  for (const [record, key] of records) {
    if (!hasOwn(record, key)) continue
    return normalizeNullableString(record[key]) ?? null
  }

  return fallback
}

export function buildCharacterSheetExport(character: AgentCharacter): ElizaCharacterExport {
  const record = character as UnknownRecord
  const wagdieSettings = getWagdieSettings(record)
  const system = normalizeNullableString(record.system) ?? normalizeNullableString(record.systemPrompt) ?? undefined
  const templates = normalizeTemplates(record.templates)
  const settings = normalizeSafeSettings(record.settings)
  const lore = stringArray(record.lore) ?? stringArray(wagdieSettings.lore) ?? []

  const exportData: ElizaCharacterExport = {
    name: typeof character.name === 'string' ? character.name : 'character',
    username: normalizeNullableString(record.username) ?? undefined,
    bio: stringArray(record.bio) ?? [],
    lore,
    backstory: firstOwnedNullableString(
      [[record, 'backstory'], [wagdieSettings, 'backstory']],
      lore[0] ?? null
    ),
    topics: stringArray(record.topics),
    adjectives: stringArray(record.adjectives),
    style: isRecord(record.style) ? record.style as ElizaCharacterExport['style'] : undefined,
    messageExamples: toElizaExportMessageExamples(character.messageExamples as AgentMessageExample[] | undefined),
    postExamples: stringArray(record.postExamples),
    system,
    systemPrompt: system,
    templates: templates && templates !== null ? templates : undefined,
    settings,
  }

  const knowledge = Array.isArray(record.knowledge) ? record.knowledge : undefined
  if (knowledge) {
    exportData.knowledge = knowledge.map((doc) => {
      const knowledgeDoc = doc as { id?: string; path?: string; content?: string }
      return {
        id: knowledgeDoc.id || '',
        path: knowledgeDoc.path || '',
        content: knowledgeDoc.content || '',
      }
    })
  }

  return exportData
}

export function mergeSafeSettings(
  existing: AgentCharacter['settings'] | undefined,
  patch: SafeCharacterSettings | undefined
): AgentCharacter['settings'] | undefined {
  if (!existing && !patch) return undefined

  const merged = { ...(existing || {}) } as Record<string, unknown>

  if (!patch) return merged as AgentCharacter['settings']

  if (Object.prototype.hasOwnProperty.call(patch, 'avatar')) {
    if (patch.avatar === undefined) {
      // Preserve existing avatar.
    } else if (patch.avatar === null || patch.avatar === '') {
      delete merged.avatar
    } else {
      merged.avatar = patch.avatar
    }
  }

  if (patch.metadata && Object.prototype.hasOwnProperty.call(patch.metadata, 'wagdieUser')) {
    const existingMetadata = isRecord(merged.metadata) ? { ...merged.metadata } : {}
    if (patch.metadata.wagdieUser === null || Object.keys(patch.metadata.wagdieUser || {}).length === 0) {
      delete existingMetadata.wagdieUser
    } else {
      existingMetadata.wagdieUser = patch.metadata.wagdieUser
    }

    if (Object.keys(existingMetadata).length > 0) {
      merged.metadata = existingMetadata
    } else {
      delete merged.metadata
    }
  }

  return merged as AgentCharacter['settings']
}
