/**
 * Type definitions for Eliza API integration
 * Based on data-model.md specification
 */

// Re-export types from SDK adapter (types defined locally due to TS resolution issues)
export type {
  AgentCharacter,
  AgentMessage,
  AgentMessageExample,
  CharacterRecord,
  AuthTokens,
  StreamCallbacks,
  ChatResponse as SDKChatResponse,
} from '@/lib/eliza/sdkAdapter'

// Re-export app-owned gateway errors for backwards-compatible consumers.
export { ElizaError, WagdieElizaError } from '@/lib/eliza/gateway/errors'

// Define SDK types that aren't exported but we use locally
export interface SDKChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

export interface SDKConversationSummary {
  id: string
  title?: string
  characterId: string
  createdAt: string
  updatedAt: string
}

export interface SDKConversationDetail extends SDKConversationSummary {
  messages: SDKChatMessage[]
}

// Note: SDK v0.2 exports FIELD_LIMITS, but we keep a local FIELD_LIMITS below as the app contract
// to avoid breaking changes if the SDK validation limits change unexpectedly.

/**
 * Style configuration for different communication contexts
 */
export interface StyleConfig {
  all?: string[]   // Universal guidelines, 0-10 items, 200 chars each
  chat?: string[]  // Chat-specific rules, 0-10 items, 200 chars each
  post?: string[]  // Post-specific rules, 0-10 items, 200 chars each
}

export type WagdieUserMetadataValue = string | number | boolean | null

export type CharacterTemplates = Record<string, string>

export interface SafeCharacterSettings {
  avatar?: string | null
  metadata?: {
    wagdieUser?: Record<string, WagdieUserMetadataValue> | null
  }
}

/**
 * Knowledge document for RAG integration
 */
export interface KnowledgeDocument {
  id: string
  filename: string
  content?: string // Only included when explicitly requested
  size: number
  mimeType: 'text/plain' | 'text/markdown'
  uploadedAt: string
}

/**
 * AI Character entity representing an AI persona linked to a WAGDIE character
 * Extended for full Eliza SDK support
 */
export interface AICharacter {
  id: string
  externalId: string // WAGDIE tokenId for linking
  name: string
  /** @deprecated Use bio[] instead */
  personality?: string | null
  username?: string | null
  backstory: string | null
  system?: string | null
  systemPrompt: string | null
  exampleMessages: ExampleMessage[]
  templates?: CharacterTemplates
  settings?: SafeCharacterSettings
  // Extended Eliza fields
  bio?: string[]          // 1-10 items, 500 chars each
  lore?: string[]         // 0-20 items, 500 chars each
  topics?: string[]       // 0-30 items, 50 chars each
  adjectives?: string[]   // 0-20 items, 30 chars each
  style?: StyleConfig
  postExamples?: string[] // 0-20 items, 280 chars each
  knowledge?: KnowledgeDocument[] // 0-5 documents
  createdAt: string
  updatedAt: string
}

/**
 * Example message pair for training character voice
 */
export interface ExampleMessage {
  userMessage: string
  assistantMessage: string
}

/**
 * Conversation entity representing a chat session
 */
export interface Conversation {
  id: string
  characterId: string
  userId: string // Wallet address
  title: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Chat message within a conversation
 */
export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

/**
 * Extended conversation with messages
 */
export interface ConversationDetail extends Conversation {
  messages: ChatMessage[]
  hasMore: boolean
}

/**
 * Input for creating an AI character
 */
export interface CreateAICharacterInput {
  externalId: string
  name: string
  username?: string | null
  /** @deprecated Use bio[] instead */
  personality?: string
  backstory?: string | null
  system?: string | null
  systemPrompt?: string | null
  templates?: CharacterTemplates | null
  settings?: SafeCharacterSettings
  exampleMessages?: ExampleMessage[]
  // Extended Eliza fields
  bio?: string[]
  lore?: string[]
  topics?: string[]
  adjectives?: string[]
  style?: StyleConfig
  postExamples?: string[]
}

/**
 * Input for updating an AI character
 */
export interface UpdateAICharacterInput {
  name?: string
  username?: string | null
  /** @deprecated Use bio[] instead */
  personality?: string
  backstory?: string | null
  system?: string | null
  systemPrompt?: string | null
  templates?: CharacterTemplates | null
  settings?: SafeCharacterSettings
  exampleMessages?: ExampleMessage[]
  // Extended Eliza fields
  bio?: string[]
  lore?: string[]
  topics?: string[]
  adjectives?: string[]
  style?: StyleConfig
  postExamples?: string[]
}

/**
 * Input for sending a chat message
 */
export interface SendMessageInput {
  tokenId: string // WAGDIE character token ID
  message: string
  conversationId?: string
}

export type PersonaAssistantMode = 'chat' | 'generate'

export interface PersonaAssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface PersonaAssistantEditableDraft {
  username?: string | null
  backstory?: string | null
  system?: string | null
  bio?: string[]
  lore?: string[]
  topics?: string[]
  adjectives?: string[]
  style?: StyleConfig
  exampleMessages?: ExampleMessage[]
  postExamples?: string[]
  templates?: CharacterTemplates
  settings?: SafeCharacterSettings
}

export interface PersonaAssistantRequest {
  mode: PersonaAssistantMode
  messages: PersonaAssistantMessage[]
  editorSnapshot: PersonaAssistantEditableDraft
}

export interface PersonaAssistantResponse {
  assistantMessage: PersonaAssistantMessage
  proposal?: PersonaAssistantEditableDraft
  warnings: string[]
}

/**
 * Response from chat API (non-streaming)
 */
export interface ChatResponse {
  id: string
  content: string
  role: 'assistant'
  conversationId: string
  createdAt: string
}

/**
 * Token response from auth API
 */
export interface TokenResponse {
  accessToken: string
  expiresAt: string
}

export interface ElizaAuthNonceResponse {
  sessionId: string
  nonce: string
  message: string
  issuedAt: string
}

export interface ElizaAuthVerifyRequest {
  signature: string
}

/**
 * Error response from API
 */
export interface ErrorResponse {
  error: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Draft AI persona stored in localStorage
 * Extended for full Eliza SDK support
 */
export interface DraftAIPersona {
  tokenId: string
  username?: string | null
  backstory?: string | null
  /** @deprecated Use bio[] instead - kept for migration */
  personality?: string
  system?: string | null
  systemPrompt?: string | null
  templates?: CharacterTemplates | null
  settings?: SafeCharacterSettings
  exampleMessages?: ExampleMessage[]
  // Extended Eliza fields
  bio?: string[]
  lore?: string[]
  topics?: string[]
  adjectives?: string[]
  style?: StyleConfig
  postExamples?: string[]
  knowledgeIds?: string[] // Only IDs, not content
  savedAt: string
}

/**
 * Eliza character export format for import/export functionality
 */
export interface ElizaCharacterExport {
  name: string
  username?: string
  bio: string[]
  lore: string[]
  backstory?: string | null
  topics?: string[]
  adjectives?: string[]
  style?: StyleConfig
  messageExamples?: Array<Array<{
    user: string
    content: { text: string }
  }>>
  postExamples?: string[]
  system?: string
  systemPrompt?: string
  templates?: CharacterTemplates
  settings?: SafeCharacterSettings
  knowledge?: Array<{
    id: string
    path: string
    content: string
  }>
}

/**
 * Streaming event types for SSE
 */
export type StreamEventType = 'token' | 'complete' | 'error'

export interface StreamTokenEvent {
  event: 'token'
  data: { token: string }
}

export interface StreamCompleteEvent {
  event: 'complete'
  data: {
    id: string
    content: string
    conversationId: string
    /** ISO 8601 timestamp when the message was created */
    createdAt?: string
  }
}

export interface StreamErrorEvent {
  event: 'error'
  data: { code?: string; message: string }
}

export type StreamEvent = StreamTokenEvent | StreamCompleteEvent | StreamErrorEvent

/**
 * Field validation limits per data-model.md
 * Extended for full Eliza SDK support
 */
export const FIELD_LIMITS = {
  // Existing fields
  name: 100,
  /** @deprecated Use bio limits instead */
  personality: 2000,
  backstory: 5000,
  systemPrompt: 4000,
  username: 100,
  templateName: 64,
  templateBody: 4000,
  maxTemplates: 20,
  metadataKey: 64,
  metadataStringValue: 500,
  maxMetadataKeys: 50,
  settingsAvatar: 500,
  messageContent: 10000,
  userMessageExample: 500,
  assistantMessageExample: 1000,
  maxExampleMessages: 20,
  // Extended Eliza fields
  bio: 500,
  maxBioEntries: 10,
  lore: 500,
  maxLoreEntries: 20,
  topic: 50,
  maxTopics: 30,
  adjective: 30,
  maxAdjectives: 20,
  styleRule: 200,
  maxStyleRules: 10,
  postExample: 280,
  maxPostExamples: 20,
  maxKnowledgeDocs: 5,
  maxKnowledgeSize: 51200, // 50KB
} as const
