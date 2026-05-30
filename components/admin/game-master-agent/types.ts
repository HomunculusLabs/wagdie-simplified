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

export type GameMasterCanonicalPersonaStatus = 'unavailable' | 'in_sync' | 'drifted';
export type GameMasterCanonicalKnowledgeLiveStatus = 'missing' | 'in_sync' | 'changed';
export type GameMasterCanonicalKnowledgeSyncStatus = ServiceAgentKnowledgeSyncStatus | 'unsynced' | 'unknown';

export interface GameMasterCanonicalContentReview {
  schemaVersion: 1;
  bundleId: string;
  contentVersion: string;
  reviewToken: string;
  canApply: boolean;
  unavailableReason: string | null;
  persona: {
    status: GameMasterCanonicalPersonaStatus;
    canonicalHash: string;
    liveHash: string | null;
    changedFields: string[];
    lastApplied: {
      hash?: string;
      appliedAt?: string;
      appliedBy?: string | null;
    } | null;
  };
  knowledge: {
    status: 'unavailable' | 'in_sync' | 'drifted' | 'conflict';
    documentLimit: {
      max: number;
      liveCount: number;
      canonicalCount: number;
      preservedLiveCount: number;
      resultingCount: number;
      conflict: boolean;
    };
    documents: Array<{
      id: string;
      title: string;
      path: string;
      mimeType: 'text/plain' | 'text/markdown';
      preview: string;
      size: number;
      canonicalHash: string;
      liveHash: string | null;
      livePath: string | null;
      liveStatus: GameMasterCanonicalKnowledgeLiveStatus;
      syncStatus: GameMasterCanonicalKnowledgeSyncStatus;
      lastSyncedAt: string | null;
      hasSyncError: boolean;
      shouldSync: boolean;
    }>;
    obsoletePreservedDocuments: Array<{
      id: string;
      path: string;
      liveHash: string | null;
      previousBundleId: string | null;
      previousContentVersion: string | null;
      syncStatus: GameMasterCanonicalKnowledgeSyncStatus;
    }>;
    syncStateLookupFailed: boolean;
    lastApplied: {
      appliedAt?: string;
      appliedBy?: string | null;
      documentHashes?: Record<string, string>;
    } | null;
  };
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
  canonicalContent: GameMasterCanonicalContentReview;
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

export interface GameMasterAgentCanonicalApplyResponse {
  state: GameMasterAgentAdminState;
  result: {
    reviewBefore: GameMasterCanonicalContentReview;
    reviewAfter: GameMasterCanonicalContentReview;
    persona?: {
      applied: boolean;
      changedFields: string[];
      hash: string;
    };
    knowledge?: {
      applied: boolean;
      documentLimit: GameMasterCanonicalContentReview['knowledge']['documentLimit'];
      documents: Array<{
        id: string;
        path: string;
        action: 'synced' | 'failed' | 'skipped';
        sync: GameMasterAgentSyncResponse['sync'] | null;
      }>;
    };
  };
}

export type BusyAction =
  | 'load'
  | 'bootstrap'
  | 'save-persona'
  | 'clear-setting'
  | 'upload-knowledge'
  | 'apply-canonical-persona'
  | 'apply-canonical-knowledge'
  | `delete-knowledge:${string}`
  | `retry-knowledge:${string}`
  | null;
