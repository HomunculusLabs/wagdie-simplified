/**
 * App-owned Eliza gateway contract.
 *
 * These types describe the behavior WAGDIE routes depend on. They intentionally
 * avoid direct Eliza package imports so runtime code can use raw HTTP/Venice
 * without changing route-facing types.
 */

export type {
  AgentCharacter,
  AgentMessage,
  AgentMessageExample,
  AuthTokens,
  CharacterPermissions,
  CharacterRecord,
  CharacterStyle,
  ChatMessage,
  ChatResponse,
  RoleContentMessage,
  StreamCallback,
  StreamCallbacks,
  StreamCompleteCallback,
  StreamErrorCallback,
} from '@/lib/eliza/sdk-types'

import type {
  AgentCharacter,
  AuthTokens,
  CharacterRecord,
  ChatMessage,
  StreamCallbacks,
} from '@/lib/eliza/sdk-types'

export interface WagdieElizaRetryConfig {
  maxRetries: number
  baseDelay: number
  retryServerErrors: boolean
}

export interface WagdieElizaInferenceConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface WagdieElizaClientConfig {
  baseUrl: string
  apiKey?: string
  accessToken?: string
  officialUserId?: string
  walletAddress?: string
  timeout?: number
  retry?: WagdieElizaRetryConfig
  inference?: WagdieElizaInferenceConfig
}

export interface GatewayPaginationParams {
  page?: number
  pageSize?: number
}

export interface GatewayPaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface GatewayNonceResponse {
  nonce: string
  sessionId: string
}

export type GatewayVerifyResponse = AuthTokens

export interface GatewayCharacterCreateInput {
  externalId?: string | null
  character: AgentCharacter
}

export interface GatewayCharacterReplaceInput {
  character: AgentCharacter
}

export interface GatewayConversationSummary {
  id: string
  characterId: string
  characterName?: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
}

export interface GatewayConversationDetail extends GatewayConversationSummary {
  messages: ChatMessage[]
}

export interface GatewayChatSendInput {
  characterId: string
  message: string
  conversationId?: string
  /** Server-side ElizaOS user id derived from WAGDIE wallet auth in official mode. */
  userId?: string
  /** Lowercased WAGDIE wallet address used for server-side official conversation mapping. */
  walletAddress?: string
  /** WAGDIE token id used to scope official conversation mappings when available. */
  tokenId?: string
  /**
   * Optional already-resolved character payload. When omitted, the gateway loads
   * the character record by characterId from the custom Eliza API before calling
   * Venice.
   */
  character?: AgentCharacter
  signal?: AbortSignal
}

export interface WagdieElizaAuthGateway {
  getNonce(): Promise<GatewayNonceResponse>
  verify(message: string, signature: string, sessionId: string): Promise<GatewayVerifyResponse>
}

export interface WagdieElizaCharactersGateway {
  getRecord(id: string): Promise<CharacterRecord>
  getRecordByExternalId(externalId: string): Promise<CharacterRecord | null>
  createRecord(input: GatewayCharacterCreateInput): Promise<CharacterRecord>
  replaceRecord(id: string, input: GatewayCharacterReplaceInput): Promise<CharacterRecord>
}

export interface WagdieElizaChatGateway {
  sendMessageStream(input: GatewayChatSendInput, callbacks: StreamCallbacks): Promise<void>
}

export interface WagdieElizaConversationsGateway {
  list(params?: GatewayPaginationParams): Promise<GatewayPaginatedResponse<GatewayConversationSummary>>
  listForCharacter(
    characterId: string,
    params?: GatewayPaginationParams
  ): Promise<GatewayPaginatedResponse<GatewayConversationSummary>>
  get(id: string): Promise<GatewayConversationDetail>
  delete(id: string): Promise<void>
}

export interface WagdieElizaClient {
  auth: WagdieElizaAuthGateway
  characters: WagdieElizaCharactersGateway
  chat: WagdieElizaChatGateway
  conversations: WagdieElizaConversationsGateway
  verifyCredentials?(): Promise<unknown>
  isAuthenticated?(): boolean
}
