import type { AICharacter } from '@/types/eliza';

export type GameMasterAgentEffectiveSource = 'admin' | 'env' | 'missing';
export type GameMasterAgentSettingSource = 'admin' | 'env_adopted' | 'deterministic_created';
export type ServiceAgentKnowledgeSyncStatus = 'pending' | 'indexed' | 'deleted' | 'error';

export interface GameMasterAgentSetting {
  settingKey: string;
  officialAgentId: string;
  externalId: string | null;
  source: GameMasterAgentSettingSource;
  createdBy: string | null;
  updatedBy: string | null;
  lastValidatedAt: string | null;
  validationError: string | null;
  validationErrorAt: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SafeKnowledgeSyncState {
  serviceAgentKey: string;
  documentId: string;
  officialAgentId: string | null;
  officialMemoryId: string | null;
  contentHash: string | null;
  status: ServiceAgentKnowledgeSyncStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  deletedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GameMasterKnowledgeDocument {
  id: string;
  path: string;
  preview: string;
  size: number;
  syncState: SafeKnowledgeSyncState | null;
}

export interface GameMasterAgentAdminState {
  effectiveSource: GameMasterAgentEffectiveSource;
  envFallback: {
    configured: boolean;
    officialAgentId: string | null;
  };
  activeSetting: GameMasterAgentSetting | null;
  officialAgentId: string | null;
  officialRecordStatus: {
    available: boolean;
    error: string | null;
  };
  aiCharacter: AICharacter | null;
  knowledge: GameMasterKnowledgeDocument[];
}

export interface GameMasterAgentSyncResponse {
  state: GameMasterAgentAdminState;
  sync: {
    attempted: boolean;
    ok: boolean;
    state?: SafeKnowledgeSyncState;
    error: string | null;
  };
}

export type BusyAction =
  | 'load'
  | 'bootstrap'
  | 'save-persona'
  | 'clear-setting'
  | 'upload-knowledge'
  | `delete-knowledge:${string}`
  | `retry-knowledge:${string}`
  | null;
