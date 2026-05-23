import { getCharacterRecordByExternalId } from '@/lib/eliza/characterResolver'
import { getElizaClient } from '@/lib/eliza/client'
import type { AgentCharacter, CharacterRecord } from '@/lib/eliza/sdkAdapter'

export type StoredKnowledgeDocument = {
  id: string
  path: string
  content?: string
}

export type KnowledgeDocumentSummary = {
  id: string
  path: string
  preview: string
  size: number
}

export type KnowledgeDocumentResponse = {
  id: string
  path: string
  filename: string
  content: string
  size: number
}

type KnowledgeCharactersApi = {
  replaceRecord: (
    id: string,
    input: { character: AgentCharacter }
  ) => Promise<CharacterRecord>
}

function isStoredKnowledgeDocument(value: unknown): value is StoredKnowledgeDocument {
  if (!value || typeof value !== 'object') {
    return false
  }

  const doc = value as Record<string, unknown>
  return typeof doc.id === 'string' && typeof doc.path === 'string'
}

export function getKnowledgeDocuments(character: Record<string, unknown>): StoredKnowledgeDocument[] {
  const knowledge = character.knowledge
  if (!Array.isArray(knowledge)) {
    return []
  }

  return knowledge.filter(isStoredKnowledgeDocument)
}

export function toKnowledgeDocumentSummary(
  document: StoredKnowledgeDocument
): KnowledgeDocumentSummary {
  return {
    id: document.id,
    path: document.path,
    preview: document.content?.slice(0, 200) || '',
    size: document.content?.length || 0,
  }
}

export function toKnowledgeDocumentResponse(
  document: StoredKnowledgeDocument
): KnowledgeDocumentResponse {
  return {
    id: document.id,
    path: document.path,
    filename: document.path,
    content: document.content || '',
    size: document.content?.length || 0,
  }
}

export function findKnowledgeDocumentById(
  documents: StoredKnowledgeDocument[],
  documentId: string
): StoredKnowledgeDocument | undefined {
  return documents.find((document) => document.id === documentId)
}

export function removeKnowledgeDocumentById(
  documents: StoredKnowledgeDocument[],
  documentId: string
): StoredKnowledgeDocument[] {
  return documents.filter((document) => document.id !== documentId)
}

export function appendKnowledgeDocument(
  documents: StoredKnowledgeDocument[],
  document: StoredKnowledgeDocument
): StoredKnowledgeDocument[] {
  return [...documents, document]
}

export async function getKnowledgeRecordByTokenId(
  tokenId: string
): Promise<CharacterRecord | null> {
  const client = getElizaClient()
  return getCharacterRecordByExternalId(client, tokenId)
}

export async function replaceKnowledgeDocuments(
  record: CharacterRecord,
  documents: StoredKnowledgeDocument[],
  client = getElizaClient()
): Promise<CharacterRecord> {
  const charactersApi = client.characters as unknown as KnowledgeCharactersApi

  return charactersApi.replaceRecord(record.id, {
    character: {
      ...record.character,
      knowledge: documents,
    },
  })
}
