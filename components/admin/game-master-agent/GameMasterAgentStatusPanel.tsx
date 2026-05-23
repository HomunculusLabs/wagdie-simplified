'use client';

import { Button } from '@/components/ui';
import type { BusyAction, GameMasterAgentAdminState } from './types';

interface GameMasterAgentStatusPanelProps {
  state: GameMasterAgentAdminState;
  busyAction: BusyAction;
  hasUnsavedPersonaChanges?: boolean;
  onBootstrap: () => void;
  onClearSetting: () => void;
}

const sourceLabels = {
  admin: 'Admin setting',
  env: 'Env fallback',
  missing: 'Missing',
} as const;

const settingSourceLabels = {
  admin: 'Admin managed',
  env_adopted: 'Adopted from env',
  deterministic_created: 'Deterministic service agent',
} as const;

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function SourceBadge({ source }: { source: GameMasterAgentAdminState['effectiveSource'] }) {
  const className = source === 'admin'
    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
    : source === 'env'
      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
      : 'border-red-400/40 bg-red-400/10 text-red-200';

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${className}`}>
      {sourceLabels[source]}
    </span>
  );
}

export function GameMasterAgentStatusPanel({
  state,
  busyAction,
  hasUnsavedPersonaChanges = false,
  onBootstrap,
  onClearSetting,
}: GameMasterAgentStatusPanelProps) {
  const hasAdminSetting = Boolean(state.activeSetting);
  const canBootstrap = !hasAdminSetting && busyAction === null;
  const bootstrapLabel = state.envFallback.configured
    ? 'Adopt env fallback'
    : 'Create GM agent';

  return (
    <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl text-soul-accent">Runtime Source</h2>
            <SourceBadge source={state.effectiveSource} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-soul-mist/75">
            Location-room narrative ticks use the admin setting first. If no admin setting exists,
            runtime falls back to the configured environment agent when available.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!hasAdminSetting && (
            <Button
              type="button"
              onClick={onBootstrap}
              isLoading={busyAction === 'bootstrap'}
              disabled={!canBootstrap}
            >
              {bootstrapLabel}
            </Button>
          )}
          {hasAdminSetting && (
            <Button
              type="button"
              variant="danger"
              onClick={onClearSetting}
              isLoading={busyAction === 'clear-setting'}
              disabled={busyAction !== null || hasUnsavedPersonaChanges}
            >
              Clear admin setting
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-soul-accent/10 bg-abyss/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Effective agent id</dt>
          <dd className="mt-1 break-all font-mono text-sm text-soul-bone">
            {state.officialAgentId ?? 'Not configured'}
          </dd>
        </div>
        <div className="rounded border border-soul-accent/10 bg-abyss/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Env fallback</dt>
          <dd className="mt-1 break-all font-mono text-sm text-soul-bone">
            {state.envFallback.configured ? state.envFallback.officialAgentId : 'Not configured'}
          </dd>
        </div>
        <div className="rounded border border-soul-accent/10 bg-abyss/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Official record</dt>
          <dd className={state.officialRecordStatus.available ? 'mt-1 text-sm text-emerald-200' : 'mt-1 text-sm text-amber-200'}>
            {state.officialRecordStatus.available ? 'Available' : state.officialRecordStatus.error ?? 'Unavailable'}
          </dd>
        </div>
        <div className="rounded border border-soul-accent/10 bg-abyss/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Admin setting</dt>
          <dd className="mt-1 text-sm text-soul-bone">
            {state.activeSetting ? settingSourceLabels[state.activeSetting.source] : 'None'}
          </dd>
        </div>
      </dl>

      {state.activeSetting && (
        <div className="mt-4 rounded border border-soul-accent/10 bg-abyss/30 p-3 text-xs text-soul-mist/70">
          <div className="grid gap-2 md:grid-cols-3">
            <span>External id: <span className="font-mono text-soul-bone">{state.activeSetting.externalId ?? '—'}</span></span>
            <span>Updated: <span className="text-soul-bone">{formatDate(state.activeSetting.updatedAt)}</span></span>
            <span>Last validated: <span className="text-soul-bone">{formatDate(state.activeSetting.lastValidatedAt)}</span></span>
          </div>
          {state.activeSetting.validationError && (
            <p className="mt-2 text-amber-200">Validation warning: {state.activeSetting.validationError}</p>
          )}
        </div>
      )}

      {!state.activeSetting && (
        <p className="mt-4 rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          Create or adopt the game-master agent before editing persona or uploading knowledge. Env fallback can run narrative ticks, but admin edits require a persisted setting.
        </p>
      )}
    </section>
  );
}
