'use client';

import { useMemo, useState } from 'react';
import { Input, Select } from '@/components/ui';
import {
  canonStatusLabels,
  getCanonizationStageDefinition,
  getCanonizationStageOptions,
} from '@/lib/lore/canonization';
import { canonStatuses, loreEventKinds } from '@/lib/lore/types';
import type { Canonization, CanonizationStageId, CanonStatus, LoreEventKind } from '@/lib/lore/types';
import type { LoreCanonizationAdminRecord } from './types';

interface CanonizationEventListProps {
  records: LoreCanonizationAdminRecord[];
  selectedEventId?: string;
  onSelect: (eventId: string) => void;
}

type OverrideFilter = 'all' | 'with' | 'without' | 'draft' | 'published';

const getDisplayCanon = (record: LoreCanonizationAdminRecord): Canonization => {
  return record.draftOverride?.canon ?? record.publishedOverride?.canon ?? record.staticCanon;
};

const eventKindLabels: Record<LoreEventKind, string> = {
  official: 'Official',
  community: 'Community',
};

const overrideOptions: { value: OverrideFilter; label: string }[] = [
  { value: 'all', label: 'All base-event override states' },
  { value: 'with', label: 'Has base-event override' },
  { value: 'without', label: 'Static base canon only' },
  { value: 'draft', label: 'Has draft override' },
  { value: 'published', label: 'Has published override' },
];

export function CanonizationEventList({ records, selectedEventId, onSelect }: CanonizationEventListProps) {
  const [kind, setKind] = useState<'' | LoreEventKind>('');
  const [status, setStatus] = useState<'' | CanonStatus>('');
  const [stage, setStage] = useState<'' | CanonizationStageId>('');
  const [overrideFilter, setOverrideFilter] = useState<OverrideFilter>('all');
  const [keyword, setKeyword] = useState('');

  const filteredRecords = useMemo(() => {
    const token = keyword.trim().toLocaleLowerCase();

    return records.filter((record) => {
      const canon = getDisplayCanon(record);
      const hasDraft = Boolean(record.draftOverride);
      const hasPublished = Boolean(record.publishedOverride);
      const hasOverride = hasDraft || hasPublished;

      if (kind && record.event.kind !== kind) return false;
      if (status && canon.status !== status) return false;
      if (stage && canon.stageId !== stage) return false;
      if (overrideFilter === 'with' && !hasOverride) return false;
      if (overrideFilter === 'without' && hasOverride) return false;
      if (overrideFilter === 'draft' && !hasDraft) return false;
      if (overrideFilter === 'published' && !hasPublished) return false;

      if (!token) return true;

      return [
        record.event.title,
        record.event.summary,
        record.event.id,
        record.event.slug,
        ...record.event.tags,
        ...record.event.keywords,
      ].some((value) => value.toLocaleLowerCase().includes(token));
    });
  }, [records, kind, status, stage, overrideFilter, keyword]);

  return (
    <aside className="space-y-4 rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-4">
      <div>
        <p className="text-xs font-display uppercase tracking-[0.18em] text-soul-accent">
          Base event override records
        </p>
        <p className="mt-1 text-sm text-soul-mist/75">
          {filteredRecords.length} of {records.length} base events visible
        </p>
      </div>

      <div className="grid gap-3">
        <Input
          label="Keyword"
          aria-label="Filter base event override records by keyword"
          value={keyword}
          placeholder="pilgrims, citadel..."
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          label="Base archive kind"
          aria-label="Filter base event override records by base archive kind"
          value={kind}
          options={[
            { value: '', label: 'All kinds' },
            ...loreEventKinds.map((item) => ({ value: item, label: eventKindLabels[item] })),
          ]}
          onChange={(event) => setKind(event.target.value as '' | LoreEventKind)}
        />
        <Select
          label="Status"
          aria-label="Filter base event override records by status"
          value={status}
          options={[
            { value: '', label: 'All statuses' },
            ...canonStatuses.map((item) => ({ value: item, label: canonStatusLabels[item] })),
          ]}
          onChange={(event) => setStatus(event.target.value as '' | CanonStatus)}
        />
        <Select
          label="Stage"
          aria-label="Filter base event override records by stage"
          value={stage}
          options={[
            { value: '', label: 'All stages' },
            ...getCanonizationStageOptions().map((item) => ({ value: item.id, label: item.label })),
          ]}
          onChange={(event) => setStage(event.target.value as '' | CanonizationStageId)}
        />
        <Select
          label="Base event override"
          aria-label="Filter base event override records by override state"
          value={overrideFilter}
          options={overrideOptions}
          onChange={(event) => setOverrideFilter(event.target.value as OverrideFilter)}
        />
      </div>

      <div className="max-h-[42rem] space-y-2 overflow-y-auto pr-1">
        {filteredRecords.map((record) => {
          const canon = getDisplayCanon(record);
          const selected = record.eventId === selectedEventId;
          const stageDef = getCanonizationStageDefinition(canon.stageId);

          return (
            <button
              key={record.eventId}
              type="button"
              onClick={() => onSelect(record.eventId)}
              className={[
                'w-full rounded border p-3 text-left transition-colors',
                selected
                  ? 'border-soul-accent bg-soul-accent/15'
                  : 'border-soul-accent/15 bg-black/20 hover:border-soul-accent/50',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base text-soul-bone">{record.event.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-soul-mist/70">
                    Base kind: {eventKindLabels[record.event.kind]} / {stageDef.shortLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-soul-accent/30 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-soul-accent">
                  {canonStatusLabels[canon.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-wide text-soul-mist/70">
                {record.draftOverride && <span>Draft override</span>}
                {record.publishedOverride && <span>Published override</span>}
                {!record.draftOverride && !record.publishedOverride && <span>Static base canon</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
