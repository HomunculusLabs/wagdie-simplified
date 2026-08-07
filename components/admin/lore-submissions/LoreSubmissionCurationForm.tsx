'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api/client';
import type { LoreSubmissionDetailDto } from '@/types/lore-submission';
import type { LoreSubmissionAdminReferenceOptions } from './types';

export interface LoreSubmissionCurationFormProps {
  detail: LoreSubmissionDetailDto;
  referenceOptions: LoreSubmissionAdminReferenceOptions;
  onUpdated: (detail: LoreSubmissionDetailDto) => void;
}

function splitValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function LoreSubmissionCurationForm({ detail, referenceOptions, onUpdated }: LoreSubmissionCurationFormProps) {
  const { submission } = detail;
  const [curatedTitle, setCuratedTitle] = useState(submission.curated_title ?? '');
  const [curatedSummary, setCuratedSummary] = useState(submission.curated_summary ?? '');
  const [curatedBodyMarkdown, setCuratedBodyMarkdown] = useState(submission.curated_body_markdown ?? '');
  const [curatedTagsText, setCuratedTagsText] = useState((submission.curated_tags ?? []).join(', '));
  const [seasonId, setSeasonId] = useState(submission.season_id ?? '');
  const [characterIdsText, setCharacterIdsText] = useState(submission.character_ids.join(', '));
  const [locationIdsText, setLocationIdsText] = useState(submission.location_ids.join(', '));
  const [canonNote, setCanonNote] = useState(submission.canon_note ?? '');
  const [canonPathJson, setCanonPathJson] = useState(JSON.stringify(submission.canon_path, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCuratedTitle(submission.curated_title ?? '');
    setCuratedSummary(submission.curated_summary ?? '');
    setCuratedBodyMarkdown(submission.curated_body_markdown ?? '');
    setCuratedTagsText((submission.curated_tags ?? []).join(', '));
    setSeasonId(submission.season_id ?? '');
    setCharacterIdsText(submission.character_ids.join(', '));
    setLocationIdsText(submission.location_ids.join(', '));
    setCanonNote(submission.canon_note ?? '');
    setCanonPathJson(JSON.stringify(submission.canon_path, null, 2));
    setSaved(false);
    setError(null);
  }, [submission.id, submission.updated_at]);

  const characterHelp = useMemo(() => (
    referenceOptions.characters.slice(0, 8).map((item) => item.label).join(' · ')
  ), [referenceOptions.characters]);

  const locationHelp = useMemo(() => (
    referenceOptions.locations.slice(0, 8).map((item) => item.label).join(' · ')
  ), [referenceOptions.locations]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    let canonPath: unknown;
    try {
      canonPath = canonPathJson.trim() ? JSON.parse(canonPathJson) : [];
      if (!Array.isArray(canonPath)) {
        throw new Error('Canon path must be a JSON array');
      }
    } catch (parseError) {
      setSaving(false);
      setError(parseError instanceof Error ? parseError.message : 'Canon path must be valid JSON');
      return;
    }

    try {
      const updated = await apiClient.patchEnvelope<LoreSubmissionDetailDto>(`/api/admin/lore/submissions/${encodeURIComponent(submission.id)}`, {
        curatedTitle: emptyToNull(curatedTitle),
        curatedSummary: emptyToNull(curatedSummary),
        curatedBodyMarkdown: emptyToNull(curatedBodyMarkdown),
        curatedTags: splitValues(curatedTagsText).length > 0 ? splitValues(curatedTagsText) : null,
        seasonId: emptyToNull(seasonId),
        characterIds: splitValues(characterIdsText),
        locationIds: splitValues(locationIdsText),
        canonNote: emptyToNull(canonNote),
        canonPath,
      }, {
        fallbackMessage: 'Failed to save curation',
      });
      onUpdated(updated);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save curation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div>
        <h2 className="font-display text-xl text-soul-accent">Curation metadata</h2>
        <p className="mt-1 text-sm text-soul-mist/70">
          Curated fields override submitter content in community and canon snapshots; they do not gate initial public visibility.
        </p>
      </div>

      {error && <div role="alert" className="rounded border border-soul-ember/40 bg-soul-ember/10 p-3 text-sm whitespace-pre-line text-soul-ember">{error}</div>}
      {saved && <div role="status" className="rounded border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">Curation saved.</div>}

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Curated title</span>
        <input value={curatedTitle} onChange={(event) => setCuratedTitle(event.target.value)} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none" />
      </label>

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Curated summary</span>
        <textarea value={curatedSummary} onChange={(event) => setCuratedSummary(event.target.value)} rows={4} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none" />
      </label>

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Curated Markdown body</span>
        <textarea value={curatedBodyMarkdown} onChange={(event) => setCuratedBodyMarkdown(event.target.value)} rows={10} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 font-mono text-sm text-soul-bone focus:border-soul-accent focus:outline-none" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm text-soul-mist">
          <span className="font-display uppercase tracking-wide">Curated tags</span>
          <input value={curatedTagsText} onChange={(event) => setCuratedTagsText(event.target.value)} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none" />
        </label>

        <label className="block space-y-1 text-sm text-soul-mist">
          <span className="font-display uppercase tracking-wide">Season</span>
          <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none">
            <option value="">No season</option>
            {referenceOptions.seasons.map((season) => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1 text-sm text-soul-mist">
          <span className="font-display uppercase tracking-wide">Character IDs</span>
          <textarea value={characterIdsText} onChange={(event) => setCharacterIdsText(event.target.value)} rows={3} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 font-mono text-sm text-soul-bone focus:border-soul-accent focus:outline-none" />
          {characterHelp && <span className="text-xs text-soul-mist/50">Examples: {characterHelp}</span>}
        </label>

        <label className="block space-y-1 text-sm text-soul-mist">
          <span className="font-display uppercase tracking-wide">Location IDs</span>
          <textarea value={locationIdsText} onChange={(event) => setLocationIdsText(event.target.value)} rows={3} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 font-mono text-sm text-soul-bone focus:border-soul-accent focus:outline-none" />
          {locationHelp && <span className="text-xs text-soul-mist/50">Examples: {locationHelp}</span>}
        </label>
      </div>

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Canon note</span>
        <textarea value={canonNote} onChange={(event) => setCanonNote(event.target.value)} rows={3} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none" />
      </label>

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Canon path JSON</span>
        <textarea value={canonPathJson} onChange={(event) => setCanonPathJson(event.target.value)} rows={6} className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 font-mono text-xs text-soul-bone focus:border-soul-accent focus:outline-none" />
      </label>

      <div className="flex justify-end">
        <Button type="submit" isLoading={saving}>Save curation</Button>
      </div>
    </form>
  );
}
