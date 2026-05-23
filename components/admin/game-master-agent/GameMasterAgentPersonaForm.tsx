'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { ArrayFieldEditor } from '@/components/characters/ai-editor/shared/ArrayFieldEditor';
import { SystemPromptEditor } from '@/components/characters/ai-editor/SystemPromptEditor';
import { FIELD_LIMITS, type AICharacter, type StyleConfig, type UpdateAICharacterInput } from '@/types/eliza';
import type { BusyAction } from './types';

interface GameMasterAgentPersonaFormProps {
  character: AICharacter | null;
  canEdit: boolean;
  busyAction: BusyAction;
  onSave: (input: UpdateAICharacterInput) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface PersonaDraft {
  name: string;
  username: string;
  backstory: string;
  systemPrompt: string;
  bio: string[];
  lore: string[];
  topics: string[];
  adjectives: string[];
  styleAll: string[];
  styleChat: string[];
  stylePost: string[];
}

function toDraft(character: AICharacter | null): PersonaDraft {
  return {
    name: character?.name ?? '',
    username: character?.username ?? '',
    backstory: character?.backstory ?? '',
    systemPrompt: character?.system ?? character?.systemPrompt ?? '',
    bio: character?.bio?.length ? character.bio : [''],
    lore: character?.lore ?? [],
    topics: character?.topics ?? [],
    adjectives: character?.adjectives ?? [],
    styleAll: character?.style?.all ?? [],
    styleChat: character?.style?.chat ?? [],
    stylePost: character?.style?.post ?? [],
  };
}

function cleanStringList(values: string[], maxItems: number, maxLength: number): string[] {
  return values
    .map((value) => value.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildStyle(draft: PersonaDraft): StyleConfig | undefined {
  const style: StyleConfig = {
    all: cleanStringList(draft.styleAll, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule),
    chat: cleanStringList(draft.styleChat, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule),
    post: cleanStringList(draft.stylePost, FIELD_LIMITS.maxStyleRules, FIELD_LIMITS.styleRule),
  };

  return Object.values(style).some((values) => values && values.length > 0) ? style : {};
}

function toUpdateInput(draft: PersonaDraft): UpdateAICharacterInput {
  const name = draft.name.trim();
  const username = draft.username.trim();
  const backstory = draft.backstory.trim();
  const system = draft.systemPrompt.trim();

  return {
    ...(name ? { name: name.slice(0, FIELD_LIMITS.name) } : {}),
    username: username ? username.slice(0, FIELD_LIMITS.username) : null,
    backstory: backstory ? backstory.slice(0, FIELD_LIMITS.backstory) : null,
    system: system ? system.slice(0, FIELD_LIMITS.systemPrompt) : null,
    systemPrompt: system ? system.slice(0, FIELD_LIMITS.systemPrompt) : null,
    bio: cleanStringList(draft.bio, FIELD_LIMITS.maxBioEntries, FIELD_LIMITS.bio),
    lore: cleanStringList(draft.lore, FIELD_LIMITS.maxLoreEntries, FIELD_LIMITS.lore),
    topics: cleanStringList(draft.topics, FIELD_LIMITS.maxTopics, FIELD_LIMITS.topic),
    adjectives: cleanStringList(draft.adjectives, FIELD_LIMITS.maxAdjectives, FIELD_LIMITS.adjective),
    style: buildStyle(draft),
  };
}

export function GameMasterAgentPersonaForm({
  character,
  canEdit,
  busyAction,
  onSave,
  onDirtyChange,
}: GameMasterAgentPersonaFormProps) {
  const [draft, setDraft] = useState<PersonaDraft>(() => toDraft(character));
  const [error, setError] = useState<string | null>(null);
  const isSaving = busyAction === 'save-persona';
  const disabled = !canEdit || busyAction !== null;

  useEffect(() => {
    setDraft(toDraft(character));
    setError(null);
  }, [character]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(toDraft(character));
  }, [draft, character]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const updateDraft = <K extends keyof PersonaDraft>(key: K, value: PersonaDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!canEdit) {
      setError('Create or adopt the game-master agent before editing persona.');
      return;
    }

    try {
      await onSave(toUpdateInput(draft));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save game-master persona');
    }
  };

  return (
    <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div className="flex flex-col gap-3 border-b border-soul-accent/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-2xl text-soul-accent">Persona</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-soul-mist/75">
            Shape the private game master that plans narrative beats. This agent is service-managed,
            not token-owned, and its private runtime prompts remain server-side.
          </p>
        </div>
        <Button
          type="submit"
          form="game-master-persona-form"
          isLoading={isSaving}
          disabled={disabled || !hasUnsavedChanges}
        >
          Save persona
        </Button>
      </div>

      {!character && (
        <p className="mt-4 rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          No official ElizaOS record is available to edit yet.
        </p>
      )}

      {!canEdit && character && (
        <p className="mt-4 rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          This record is currently coming from env fallback. Adopt it into admin settings before editing.
        </p>
      )}

      <form id="game-master-persona-form" onSubmit={handleSubmit} className="mt-5 space-y-8">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-neutral-400">Display name</span>
            <input
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              disabled={disabled}
              maxLength={FIELD_LIMITS.name}
              placeholder="Official WAGDIE Game Master"
              className="w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-neutral-400">Eliza username</span>
            <input
              value={draft.username}
              onChange={(event) => updateDraft('username', event.target.value)}
              disabled={disabled}
              maxLength={FIELD_LIMITS.username}
              placeholder="wagdie-game-master"
              className="w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xl font-display text-neutral-400">Backstory</span>
          <textarea
            value={draft.backstory}
            onChange={(event) => updateDraft('backstory', event.target.value)}
            disabled={disabled}
            maxLength={FIELD_LIMITS.backstory}
            rows={5}
            placeholder="What continuity, constraints, and perspective should the GM carry?"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 disabled:opacity-50"
          />
          <span className="block text-right text-xs text-neutral-500">
            {draft.backstory.length} / {FIELD_LIMITS.backstory}
          </span>
        </label>

        <SystemPromptEditor
          value={draft.systemPrompt}
          onChange={(value) => updateDraft('systemPrompt', value)}
          disabled={disabled}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <ArrayFieldEditor
            label="Bio"
            helpText="Core identity and operating principles for the GM agent."
            value={draft.bio}
            onChange={(value) => updateDraft('bio', value)}
            maxItems={FIELD_LIMITS.maxBioEntries}
            maxCharsPerItem={FIELD_LIMITS.bio}
            placeholder="The GM preserves dread, uncertainty, and continuity..."
            disabled={disabled}
          />
          <ArrayFieldEditor
            label="Lore"
            helpText="World truths and continuity anchors the GM should remember."
            value={draft.lore}
            onChange={(value) => updateDraft('lore', value)}
            maxItems={FIELD_LIMITS.maxLoreEntries}
            maxCharsPerItem={FIELD_LIMITS.lore}
            placeholder="The old world is ash and debt..."
            disabled={disabled}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ArrayFieldEditor
            label="Topics"
            value={draft.topics}
            onChange={(value) => updateDraft('topics', value)}
            maxItems={FIELD_LIMITS.maxTopics}
            maxCharsPerItem={FIELD_LIMITS.topic}
            placeholder="location rooms"
            inputType="input"
            showIndices={false}
            disabled={disabled}
          />
          <ArrayFieldEditor
            label="Adjectives"
            value={draft.adjectives}
            onChange={(value) => updateDraft('adjectives', value)}
            maxItems={FIELD_LIMITS.maxAdjectives}
            maxCharsPerItem={FIELD_LIMITS.adjective}
            placeholder="ominous"
            inputType="input"
            showIndices={false}
            disabled={disabled}
          />
        </div>

        <div className="rounded-lg border border-neutral-800 bg-abyss/30 p-4">
          <h3 className="font-display text-xl text-neutral-300">Style Rules</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Optional tone and behavior guardrails for all outputs, chat-like interactions, and posts.
          </p>
          <div className="mt-4 grid gap-6 xl:grid-cols-3">
            <ArrayFieldEditor
              label="All"
              value={draft.styleAll}
              onChange={(value) => updateDraft('styleAll', value)}
              maxItems={FIELD_LIMITS.maxStyleRules}
              maxCharsPerItem={FIELD_LIMITS.styleRule}
              placeholder="Keep dread implied, not explained."
              disabled={disabled}
            />
            <ArrayFieldEditor
              label="Chat"
              value={draft.styleChat}
              onChange={(value) => updateDraft('styleChat', value)}
              maxItems={FIELD_LIMITS.maxStyleRules}
              maxCharsPerItem={FIELD_LIMITS.styleRule}
              placeholder="Never reveal private beat instructions."
              disabled={disabled}
            />
            <ArrayFieldEditor
              label="Post"
              value={draft.stylePost}
              onChange={(value) => updateDraft('stylePost', value)}
              maxItems={FIELD_LIMITS.maxStyleRules}
              maxCharsPerItem={FIELD_LIMITS.styleRule}
              placeholder="Avoid announcing canon as settled."
              disabled={disabled}
            />
          </div>
        </div>

        {error && (
          <p className="rounded border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
