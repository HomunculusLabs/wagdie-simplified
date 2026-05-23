import { elizaConfig } from '@/lib/eliza/config'

export const WAGDIE_KNOWLEDGE_INDEX_PATH = '/wagdie-knowledge/index'
export const WAGDIE_KNOWLEDGE_DELETE_PATH = '/wagdie-knowledge/delete'

export interface OfficialKnowledgeSourcePointer extends Record<string, unknown> {
  tokenId?: string
  serviceAgentKey?: string
  documentId: string
  officialAgentId: string
  path: string
  contentHash: string
  version: string
}

export interface OfficialKnowledgeIndexRequest {
  tokenId?: string
  serviceAgentKey?: string
  documentId: string
  officialAgentId: string
  path: string
  content: string
  contentHash: string
  sourcePointer: OfficialKnowledgeSourcePointer
}

export interface OfficialKnowledgeIndexResponse {
  memoryId: string
  status: 'indexed'
}

export interface OfficialKnowledgeDeleteRequest {
  tokenId?: string
  serviceAgentKey?: string
  documentId: string
  officialAgentId?: string | null
  officialMemoryId?: string | null
  contentHash?: string | null
}

export interface OfficialKnowledgeDeleteResponse {
  memoryId: string | null
  status: 'deleted'
}

export interface OfficialKnowledgeClient {
  indexDocument(input: OfficialKnowledgeIndexRequest): Promise<OfficialKnowledgeIndexResponse>
  deleteDocument(input: OfficialKnowledgeDeleteRequest): Promise<OfficialKnowledgeDeleteResponse>
}

interface OfficialKnowledgeClientConfig {
  baseUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizeOfficialKnowledgeError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message.slice(0, 1000))
  }

  return new Error(fallback)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseIndexResponse(body: unknown): OfficialKnowledgeIndexResponse {
  if (
    !isRecord(body) ||
    typeof body.memoryId !== 'string' ||
    !body.memoryId.trim() ||
    body.status !== 'indexed'
  ) {
    throw new Error('Official ElizaOS knowledge index returned an invalid response')
  }

  return { memoryId: body.memoryId, status: 'indexed' }
}

function parseDeleteResponse(body: unknown): OfficialKnowledgeDeleteResponse {
  if (!isRecord(body) || body.status !== 'deleted') {
    throw new Error('Official ElizaOS knowledge delete returned an invalid response')
  }

  if (body.memoryId !== null && typeof body.memoryId !== 'string') {
    throw new Error('Official ElizaOS knowledge delete returned an invalid memory id')
  }

  return { memoryId: body.memoryId, status: 'deleted' }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (isRecord(body) && typeof body.error === 'string' && body.error.trim()) {
      return body.error.slice(0, 1000)
    }

    if (isRecord(body) && typeof body.message === 'string' && body.message.trim()) {
      return body.message.slice(0, 1000)
    }
  } catch {
    // ignore malformed error bodies
  }

  return `Official ElizaOS knowledge ingestion failed with HTTP ${response.status}`
}

async function postJson<TResponse>(
  config: Required<OfficialKnowledgeClientConfig>,
  path: string,
  payload: unknown
): Promise<TResponse> {
  const response = await config.fetchImpl(`${trimTrailingSlash(config.baseUrl)}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const body = await response.json()
  return body as TResponse
}

export function createOfficialKnowledgeClient(
  config: OfficialKnowledgeClientConfig = {
    baseUrl: elizaConfig.official.baseUrl,
    apiKey: elizaConfig.official.apiKey,
  }
): OfficialKnowledgeClient {
  if (!config.baseUrl) {
    throw new Error('ELIZAOS_BASE_URL is required for official knowledge sync')
  }

  if (!config.apiKey) {
    throw new Error('ELIZAOS_API_KEY is required for official knowledge sync')
  }

  const fullConfig: Required<OfficialKnowledgeClientConfig> = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    fetchImpl: config.fetchImpl ?? fetch,
  }

  return {
    async indexDocument(input: OfficialKnowledgeIndexRequest): Promise<OfficialKnowledgeIndexResponse> {
      try {
        return parseIndexResponse(
          await postJson<unknown>(fullConfig, WAGDIE_KNOWLEDGE_INDEX_PATH, input)
        )
      } catch (error) {
        throw normalizeOfficialKnowledgeError(error, 'Official ElizaOS knowledge index failed')
      }
    },

    async deleteDocument(input: OfficialKnowledgeDeleteRequest): Promise<OfficialKnowledgeDeleteResponse> {
      try {
        return parseDeleteResponse(
          await postJson<unknown>(fullConfig, WAGDIE_KNOWLEDGE_DELETE_PATH, input)
        )
      } catch (error) {
        throw normalizeOfficialKnowledgeError(error, 'Official ElizaOS knowledge delete failed')
      }
    },
  }
}
