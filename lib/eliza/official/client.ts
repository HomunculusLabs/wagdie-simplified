import { ElizaClient } from '@elizaos/api-client'
import type { Agent } from '@elizaos/api-client'
import type {
  AgentCharacter,
  CharacterRecord,
  GatewayCharacterCreateInput,
  GatewayCharacterReplaceInput,
  GatewayChatSendInput,
  GatewayConversationDetail,
  GatewayConversationSummary,
  GatewayPaginationParams,
  StreamCallbacks,
  WagdieElizaClient,
} from '@/lib/eliza/gateway/types'
import type { WagdieElizaClientConfig } from '@/lib/eliza/gateway/types'
import { createOfficialAgentId } from './ids'
import { WagdieElizaError } from '@/lib/eliza/gateway/errors'
import { normalizeOfficialElizaError, unsupportedOfficialFeature } from './errors'
import {
  createOfficialElizaMessagingClient,
  isOfficialSessionNotFoundResponse,
  type OfficialElizaMessagingClient,
} from './messaging'
import {
  officialConversationRepository,
  type OfficialConversationLink,
  type OfficialConversationRepository,
} from '@/lib/eliza/officialConversationRepository'

type OfficialCharacter = AgentCharacter & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

type OfficialAgentCreateResponse = Agent | { id?: string; character?: OfficialCharacter }
type OfficialClientConfig = WagdieElizaClientConfig & {
  conversationRepository?: OfficialConversationRepository
}

const REQUIRED_WAGDIE_AGENT_PLUGINS = ['@elizaos/plugin-bootstrap', '@elizaos/plugin-venice']

type OfficialSessionMessage = {
  id: string
  content: string
  authorId?: string
  isAgent: boolean
  createdAt?: string | Date | number
  metadata?: Record<string, unknown>
}

function nowIso(): string {
  return new Date().toISOString()
}

function toIso(value: unknown, fallback = nowIso()): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  return fallback
}

function toConversationSummary(link: OfficialConversationLink): GatewayConversationSummary {
  return {
    id: link.id,
    characterId: link.officialAgentId,
    messageCount: link.messageCount,
    lastMessageAt: link.lastMessageAt,
    createdAt: link.createdAt,
  }
}

function mapOfficialSessionMessage(
  message: OfficialSessionMessage,
  fallbackCreatedAt: string
): GatewayConversationDetail['messages'][number] {
  return {
    id: message.id,
    role: message.isAgent ? 'assistant' : 'user',
    content: message.content,
    createdAt: toIso(message.createdAt, fallbackCreatedAt),
  }
}

function getExternalId(character: AgentCharacter): string | null {
  const settings = character.settings
  const wagdie = settings?.wagdie

  if (wagdie && typeof wagdie === 'object' && !Array.isArray(wagdie)) {
    const externalId = (wagdie as Record<string, unknown>).externalId
    if (typeof externalId === 'string') return externalId
  }

  const metadata = settings?.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const externalId = (metadata as Record<string, unknown>).externalId
    if (typeof externalId === 'string') return externalId
  }

  return null
}

function withWagdieMetadata(character: AgentCharacter, externalId?: string | null): OfficialCharacter {
  const { backstory, lore, ...officialCharacter } = character as AgentCharacter & {
    backstory?: unknown
    lore?: unknown
  }
  const existingWagdie =
    character.settings?.wagdie &&
    typeof character.settings.wagdie === 'object' &&
    !Array.isArray(character.settings.wagdie)
      ? (character.settings.wagdie as Record<string, unknown>)
      : {}

  return {
    ...officialCharacter,
    id: character.id as string | undefined,
    plugins: Array.from(new Set([
      ...REQUIRED_WAGDIE_AGENT_PLUGINS,
      ...(Array.isArray(officialCharacter.plugins) ? officialCharacter.plugins : []),
    ])),
    settings: {
      ...character.settings,
      wagdie: {
        ...existingWagdie,
        ...(externalId ? { externalId } : {}),
        ...(backstory !== undefined ? { backstory } : {}),
        ...(lore !== undefined ? { lore } : {}),
      },
    },
  }
}

function normalizeOfficialAgentPayload(agent: OfficialAgentCreateResponse): OfficialCharacter {
  if ('character' in agent && agent.character) {
    return {
      ...agent.character,
      id: agent.character.id ?? agent.id,
    }
  }

  return agent as OfficialCharacter
}

function toCharacterRecord(agent: OfficialAgentCreateResponse): CharacterRecord {
  const character = normalizeOfficialAgentPayload(agent)

  if (!character.id) {
    throw unsupportedOfficialFeature('Official agent response without an id', {
      responseShape: Object.keys(character),
    })
  }

  const createdAt =
    typeof character.createdAt === 'number' ? new Date(character.createdAt).toISOString() : nowIso()
  const updatedAt =
    typeof character.updatedAt === 'number' ? new Date(character.updatedAt).toISOString() : createdAt

  return {
    id: character.id,
    externalId: getExternalId(character),
    character,
    createdAt,
    updatedAt,
  }
}

function getOfficialChatUserId(input: GatewayChatSendInput, configuredUserId?: string): string {
  const userId = input.userId ?? configuredUserId

  if (!userId) {
    throw unsupportedOfficialFeature('Official ElizaOS chat without wallet-scoped user identity', {
      blocker: 'createUserClient() must pass the WAGDIE wallet-derived official user id.',
    })
  }

  return userId
}

function normalizeWalletAddress(value?: string): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function officialConversationNotFound(): WagdieElizaError {
  return new WagdieElizaError('Conversation not found', {
    code: 'NOT_FOUND',
    statusCode: 404,
    details: { adapter: 'official-elizaos' },
  })
}

function getOfficialConversationUserId(configuredUserId?: string): string {
  if (!configuredUserId) {
    throw unsupportedOfficialFeature('Official ElizaOS conversation routes without wallet-scoped user identity', {
      blocker: 'createUserClient() must pass the WAGDIE wallet-derived official user id.',
    })
  }

  return configuredUserId
}

export class OfficialWagdieElizaClient implements WagdieElizaClient {
  private readonly client: ElizaClient
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly officialUserId?: string
  private readonly walletAddress?: string
  private readonly timeout: number
  private readonly conversationRepository: OfficialConversationRepository
  private readonly messaging: OfficialElizaMessagingClient

  constructor(config: OfficialClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.officialUserId = config.officialUserId
    this.walletAddress = normalizeWalletAddress(config.walletAddress)
    this.timeout = config.timeout ?? 30000
    this.conversationRepository = config.conversationRepository ?? officialConversationRepository
    this.client = ElizaClient.create({
      baseUrl: this.baseUrl,
      apiKey: config.apiKey,
      timeout: this.timeout,
    })
    this.messaging = createOfficialElizaMessagingClient({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      timeout: this.timeout,
      client: this.client,
    })
  }

  readonly auth = {
    getNonce: async () => {
      throw unsupportedOfficialFeature('Official ElizaOS SIWE nonce flow', {
        blocker: 'WAGDIE owns browser-facing SIWE/session semantics; do not expose ElizaOS credentials.',
      })
    },
    verify: async () => {
      throw unsupportedOfficialFeature('Official ElizaOS SIWE verify flow', {
        blocker: 'WAGDIE owns browser-facing SIWE/session semantics; do not expose ElizaOS credentials.',
      })
    },
  }

  readonly characters = {
    getRecord: async (id: string): Promise<CharacterRecord> => {
      try {
        return toCharacterRecord(await this.client.agents.getAgent(id as never))
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to load official ElizaOS agent')
      }
    },

    getRecordByExternalId: async (externalId: string): Promise<CharacterRecord | null> => {
      try {
        const { agents } = await this.client.agents.listAgents()

        for (const agent of agents) {
          if (!agent.id) continue

          let record: CharacterRecord
          try {
            record = await this.characters.getRecord(agent.id)
          } catch (error) {
            if (error instanceof WagdieElizaError && error.statusCode === 404) {
              continue
            }
            throw error
          }

          if (record.externalId === externalId) {
            return record
          }
        }

        return null
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to search official ElizaOS agents')
      }
    },

    createRecord: async (input: GatewayCharacterCreateInput): Promise<CharacterRecord> => {
      try {
        const character = withWagdieMetadata(input.character, input.externalId)
        character.id = input.externalId
          ? createOfficialAgentId(input.externalId)
          : character.id ?? createOfficialAgentId(input.externalId)

        const response = (await this.client.agents.createAgent({
          characterJson: character as Record<string, unknown>,
        })) as OfficialAgentCreateResponse

        return toCharacterRecord(response)
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to create official ElizaOS agent')
      }
    },

    replaceRecord: async (id: string, input: GatewayCharacterReplaceInput): Promise<CharacterRecord> => {
      try {
        const current = await this.characters.getRecord(id)
        const character = withWagdieMetadata(input.character, current.externalId)
        character.id = id

        const response = (await this.client.agents.updateAgent(
          id as never,
          character as never
        )) as OfficialAgentCreateResponse

        return toCharacterRecord(response)
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to update official ElizaOS agent')
      }
    },
  }

  readonly chat = {
    sendMessageStream: async (
      input: GatewayChatSendInput,
      callbacks: StreamCallbacks
    ): Promise<void> => {
      const startedAt = Date.now()
      let firstTokenAt: number | null = null
      let link: OfficialConversationLink | null = null
      const officialUserId = getOfficialChatUserId(input, this.officialUserId)
      const walletAddress = normalizeWalletAddress(input.walletAddress ?? this.walletAddress)

      try {
        const ensureOfficialAgentStarted = () =>
          this.messaging.startAgent(input.characterId, { signal: input.signal })

        const createOfficialSession = () =>
          this.messaging.createSession({
            agentId: input.characterId,
            userId: officialUserId,
            metadata: {
              platform: 'wagdie',
              characterId: input.characterId,
              tokenId: input.tokenId,
            },
          })

        if (input.conversationId) {
          link = await this.conversationRepository.findForUser(input.conversationId, officialUserId)
          if (!link || link.officialAgentId !== input.characterId) {
            throw officialConversationNotFound()
          }
          await ensureOfficialAgentStarted()
        } else {
          await ensureOfficialAgentStarted()
          const session = await createOfficialSession()

          try {
            link = await this.conversationRepository.create({
              walletAddress,
              officialUserId,
              tokenId: input.tokenId,
              officialAgentId: input.characterId,
              officialSessionId: session.sessionId,
            })
          } catch (mappingError) {
            await this.messaging.deleteSession(session.sessionId).catch(() => null)
            throw mappingError
          }
        }

        const sendToOfficialSession = (officialSessionId: string) =>
          this.messaging.sendSessionMessage({
            sessionId: officialSessionId,
            content: input.message,
            metadata: {
              source: 'wagdie',
              characterId: input.characterId,
              tokenId: input.tokenId,
              wagdieConversationId: link!.id,
            },
            signal: input.signal,
            transport: 'sse',
          })

        const sendWithOneShotSessionRecovery = async (): Promise<Response> => {
          const freshConversation = !input.conversationId
          const response = await sendToOfficialSession(link!.officialSessionId)
          const isMissingSession = await isOfficialSessionNotFoundResponse(response)

          if (!isMissingSession) {
            if (response.status === 404) {
              console.warn('[Eliza Official Chat] non-recoverable official session 404', {
                conversationId: link!.id,
                officialSessionId: link!.officialSessionId,
                officialAgentId: input.characterId,
                tokenId: input.tokenId,
                freshConversation,
                upstreamStatus: response.status,
              })
            }
            return response
          }

          if (input.signal?.aborted) {
            throw new DOMException('The operation was aborted', 'AbortError')
          }

          const oldOfficialSessionId = link!.officialSessionId
          console.warn('[Eliza Official Chat] recovering missing official session', {
            conversationId: link!.id,
            oldOfficialSessionId,
            officialAgentId: input.characterId,
            tokenId: input.tokenId,
            freshConversation,
            upstreamStatus: response.status,
            recoveryAttempt: 1,
          })

          const replacementSession = await createOfficialSession()

          try {
            link = await this.conversationRepository.rebindSession(
              link!.id,
              officialUserId,
              replacementSession.sessionId
            )
          } catch (rebindError) {
            await this.messaging.deleteSession(replacementSession.sessionId).catch(() => null)
            throw rebindError
          }

          await this.messaging.deleteSession(oldOfficialSessionId).catch(() => null)

          console.info('[Eliza Official Chat] missing official session recovered', {
            conversationId: link!.id,
            oldOfficialSessionId,
            newOfficialSessionId: link!.officialSessionId,
            officialAgentId: input.characterId,
            tokenId: input.tokenId,
            freshConversation,
            recoveryAttempt: 1,
          })

          return sendToOfficialSession(link!.officialSessionId)
        }

        const response = await sendWithOneShotSessionRecovery()

        await this.messaging.collectStreamedResponseText(response, {
          conversationId: link.officialSessionId,
          callbacks: {
            ...callbacks,
            onChunk: (chunk) => {
              firstTokenAt ??= Date.now()
              callbacks.onChunk?.(chunk)
            },
            onComplete: async (message) => {
              await this.conversationRepository.markActivity(link!.id, officialUserId, {
                incrementBy: 2,
                at: message.createdAt ?? nowIso(),
              })
              console.info('[Eliza Official Chat] stream complete', {
                conversationId: link!.id,
                officialSessionId: link!.officialSessionId,
                officialAgentId: input.characterId,
                firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
                durationMs: Date.now() - startedAt,
                outcome: 'complete',
              })
              callbacks.onComplete?.(message, link!.id)
            },
            onError: async (error) => {
              await this.conversationRepository.recordError(link!.id, officialUserId, error).catch(() => null)
              console.warn('[Eliza Official Chat] stream error', {
                conversationId: link!.id,
                officialSessionId: link!.officialSessionId,
                officialAgentId: input.characterId,
                firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
                durationMs: Date.now() - startedAt,
                outcome: 'error',
              })
              callbacks.onError?.(error)
            },
          },
        })
      } catch (error) {
        if (link) {
          await this.conversationRepository.recordError(link.id, officialUserId, error).catch(() => null)
        }
        throw normalizeOfficialElizaError(error, 'Official ElizaOS chat stream failed')
      }
    },
  }

  readonly conversations = {
    list: async (params: GatewayPaginationParams = {}) => {
      const officialUserId = getOfficialConversationUserId(this.officialUserId)
      const response = await this.conversationRepository.listForUser({
        officialUserId,
        page: params.page,
        pageSize: params.pageSize,
      })

      return {
        ...response,
        items: response.items.map(toConversationSummary),
      }
    },

    listForCharacter: async (characterId: string, params: GatewayPaginationParams = {}) => {
      const officialUserId = getOfficialConversationUserId(this.officialUserId)
      const response = await this.conversationRepository.listForUser({
        officialUserId,
        officialAgentId: characterId,
        page: params.page,
        pageSize: params.pageSize,
      })

      return {
        ...response,
        items: response.items.map(toConversationSummary),
      }
    },

    get: async (conversationId: string): Promise<GatewayConversationDetail> => {
      try {
        const officialUserId = getOfficialConversationUserId(this.officialUserId)
        const link = await this.conversationRepository.findForUser(conversationId, officialUserId)
        if (!link) {
          throw officialConversationNotFound()
        }

        const response = (await this.client.sessions.getMessages(link.officialSessionId, {
          limit: 100,
        })) as { messages?: OfficialSessionMessage[]; hasMore?: boolean }
        const messages = (response.messages ?? []).map((message) =>
          mapOfficialSessionMessage(message, link.createdAt)
        )

        return {
          ...toConversationSummary(link),
          messageCount: Math.max(link.messageCount, messages.length),
          messages,
        }
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to load official ElizaOS conversation')
      }
    },

    delete: async (conversationId: string): Promise<void> => {
      try {
        const officialUserId = getOfficialConversationUserId(this.officialUserId)
        const link = await this.conversationRepository.findForUser(conversationId, officialUserId)
        if (!link) {
          throw officialConversationNotFound()
        }

        await this.client.sessions.deleteSession(link.officialSessionId)
        await this.conversationRepository.markDeleted(conversationId, officialUserId)
      } catch (error) {
        throw normalizeOfficialElizaError(error, 'Failed to delete official ElizaOS conversation')
      }
    },
  }

  async verifyCredentials(): Promise<unknown> {
    try {
      return this.client.server.checkHealth()
    } catch (error) {
      throw normalizeOfficialElizaError(error, 'Official ElizaOS health check failed')
    }
  }

  isAuthenticated(): boolean {
    return Boolean(this.apiKey)
  }

}

export function createOfficialWagdieElizaClient(
  config: OfficialClientConfig
): OfficialWagdieElizaClient {
  return new OfficialWagdieElizaClient(config)
}
