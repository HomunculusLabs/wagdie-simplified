'use client';

import { Button, Input, Select, TextArea } from '@/components/ui';
import {
  canonStatusLabels,
  getCanonizationStageDefinition,
  getCanonizationStageOptions,
} from '@/lib/lore/canonization';
import { canonStatuses, canonizationStageIds } from '@/lib/lore/types';
import type {
  Canonization,
  CanonizationStageId,
  CanonizationStep,
  CanonizationStepStatus,
  CanonStatus,
  LoreEvent,
} from '@/lib/lore/types';
import type { LoreCanonizationAdminRecord } from './types';

interface CanonizationEditorProps {
  record: LoreCanonizationAdminRecord;
  value: Canonization;
  errors: string[];
  busyAction?: 'save' | 'publish' | 'reset' | null;
  onChange: (value: Canonization) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onReset: () => void;
}

const stepStatuses: CanonizationStepStatus[] = [
  'complete',
  'current',
  'blocked',
  'not_started',
  'skipped',
];

const stepStatusLabels: Record<CanonizationStepStatus, string> = {
  complete: 'Complete',
  current: 'Current',
  blocked: 'Blocked',
  not_started: 'Not started',
  skipped: 'Skipped',
};

const eventKindLabels: Record<LoreEvent['kind'], string> = {
  official: 'Official',
  community: 'Community',
};

const sourceIdsToText = (sourceIds?: string[]) => sourceIds?.join(', ') ?? '';

const parseSourceIds = (value: string) => {
  const sourceIds = value
    .split(/[,\n]/)
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);

  return sourceIds.length > 0 ? [...new Set(sourceIds)] : undefined;
};

const ensureStringOrUndefined = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export function CanonizationEditor({
  record,
  value,
  errors,
  busyAction,
  onChange,
  onSaveDraft,
  onPublish,
  onReset,
}: CanonizationEditorProps) {
  const hasOverride = Boolean(record.draftOverride || record.publishedOverride);
  const canPublish = Boolean(record.draftOverride);
  const stage = getCanonizationStageDefinition(value.stageId);

  const updateCanon = (patch: Partial<Canonization>) => {
    onChange({ ...value, ...patch });
  };

  const updateStep = (index: number, patch: Partial<CanonizationStep>) => {
    updateCanon({
      path: value.path.map((step, stepIndex) => (
        stepIndex === index ? { ...step, ...patch } : step
      )),
    });
  };

  const addStep = () => {
    updateCanon({
      path: [
        ...value.path,
        {
          stageId: value.stageId,
          status: value.path.some((step) => step.status === 'current') ? 'not_started' : 'current',
        },
      ],
    });
  };

  const removeStep = (index: number) => {
    updateCanon({ path: value.path.filter((_, stepIndex) => stepIndex !== index) });
  };

  const resetEditorToStatic = () => {
    onChange(record.staticCanon);
  };

  return (
    <section className="space-y-5 rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-display uppercase tracking-[0.18em] text-soul-accent">
            Base event override editor
          </p>
          <h2 className="mt-2 font-display text-2xl text-soul-bone">{record.event.title}</h2>
          <p className="mt-2 text-sm leading-6 text-soul-mist/75">
            Base archive kind: {eventKindLabels[record.event.kind]} / {record.event.id}
          </p>
        </div>
        <div className="rounded border border-soul-accent/25 bg-black/20 px-3 py-2 text-right text-xs uppercase tracking-wide text-soul-mist/75">
          <p>Editing {record.draftOverride ? 'draft override' : record.publishedOverride ? 'published override' : 'static base canon'}</p>
          <p className="mt-1 text-soul-accent">Current stage: {stage.shortLabel}</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded border border-blood/50 bg-blood/10 p-4 text-sm text-ember">
          <p className="font-display uppercase tracking-wide">Could not complete action</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Canon status"
          aria-label="Base event override canon status"
          value={value.status}
          options={canonStatuses.map((status) => ({ value: status, label: canonStatusLabels[status] }))}
          onChange={(event) => updateCanon({ status: event.target.value as CanonStatus })}
        />
        <Select
          label="Canon stage"
          aria-label="Base event override canon stage"
          value={value.stageId}
          options={getCanonizationStageOptions().map((item) => ({ value: item.id, label: item.label }))}
          onChange={(event) => updateCanon({ stageId: event.target.value as CanonizationStageId })}
        />
      </div>

      <TextArea
        label="Base event canon note"
        aria-label="Base event override canon note"
        value={value.note ?? ''}
        onChange={(event) => updateCanon({ note: ensureStringOrUndefined(event.target.value) })}
        placeholder="Explain the base-event canon override decision..."
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg text-soul-bone">Path steps</p>
            <p className="text-sm text-soul-mist/75">
              Keep exactly one current step; the current step stage must match the top-level stage.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addStep}>
            Add step
          </Button>
        </div>

        <div className="space-y-3">
          {value.path.map((step, index) => {
            const stepStage = getCanonizationStageDefinition(step.stageId);

            return (
              <div key={`${step.stageId}-${index}`} className="rounded border border-soul-accent/15 bg-black/25 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-soul-bone">
                    Step {index + 1}: {step.label ?? stepStage.label}
                  </p>
                  <Button type="button" variant="danger" size="sm" onClick={() => removeStep(index)}>
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Select
                    label="Step stage"
                    aria-label={`Step ${index + 1} stage`}
                    value={step.stageId}
                    options={canonizationStageIds.map((stageId) => ({
                      value: stageId,
                      label: getCanonizationStageDefinition(stageId).label,
                    }))}
                    onChange={(event) => updateStep(index, { stageId: event.target.value as CanonizationStageId })}
                  />
                  <Select
                    label="Step state"
                    aria-label={`Step ${index + 1} state`}
                    value={step.status}
                    options={stepStatuses.map((status) => ({ value: status, label: stepStatusLabels[status] }))}
                    onChange={(event) => updateStep(index, { status: event.target.value as CanonizationStepStatus })}
                  />
                  <Input
                    label="Label"
                    aria-label={`Step ${index + 1} label`}
                    value={step.label ?? ''}
                    onChange={(event) => updateStep(index, { label: ensureStringOrUndefined(event.target.value) })}
                    placeholder={stepStage.label}
                  />
                  <Input
                    label="Date"
                    aria-label={`Step ${index + 1} date`}
                    value={step.date ?? ''}
                    onChange={(event) => updateStep(index, { date: ensureStringOrUndefined(event.target.value) })}
                    placeholder="2026-05-09"
                  />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <TextArea
                    label="Step note"
                    aria-label={`Step ${index + 1} note`}
                    value={step.note ?? ''}
                    onChange={(event) => updateStep(index, { note: ensureStringOrUndefined(event.target.value) })}
                    placeholder={stepStage.description}
                    className="min-h-[90px]"
                  />
                  <TextArea
                    label="Source IDs"
                    aria-label={`Step ${index + 1} source ids`}
                    value={sourceIdsToText(step.sourceIds)}
                    onChange={(event) => updateStep(index, { sourceIds: parseSourceIds(event.target.value) })}
                    placeholder="source-official-site-lore, source-discord-pilgrimage-thread"
                    className="min-h-[90px]"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soul-accent/15 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSaveDraft} isLoading={busyAction === 'save'}>
            Save draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onPublish}
            disabled={!canPublish}
            isLoading={busyAction === 'publish'}
            title={canPublish ? undefined : 'Save a draft before publishing'}
          >
            Publish override
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={resetEditorToStatic}>
            Revert editor
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={onReset}
            disabled={!hasOverride}
            isLoading={busyAction === 'reset'}
          >
            Reset to static canon
          </Button>
        </div>
      </div>
    </section>
  );
}
