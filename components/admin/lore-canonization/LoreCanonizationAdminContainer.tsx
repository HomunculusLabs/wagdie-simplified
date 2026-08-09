'use client';

import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/ui';
import { CanonizationEditor } from './CanonizationEditor';
import { CanonizationEventList } from './CanonizationEventList';
import { CanonizationPreview } from './CanonizationPreview';
import type { Canonization } from '@/lib/lore/types';
import type {
  LoreCanonizationAdminRecord,
  LoreCanonizationApiErrorResponse,
  LoreCanonizationApiListResponse,
  LoreCanonizationApiRecordResponse,
} from './types';

const getEditableCanon = (record: LoreCanonizationAdminRecord): Canonization => {
  return record.draftOverride?.canon ?? record.publishedOverride?.canon ?? record.staticCanon;
};

const extractErrors = async (response: Response, fallback: string): Promise<string[]> => {
  try {
    const body = await response.json() as LoreCanonizationApiErrorResponse;
    return body.details?.length ? body.details : [body.error ?? fallback];
  } catch {
    return [fallback];
  }
};

export function LoreCanonizationAdminContainer() {
  const [records, setRecords] = useState<LoreCanonizationAdminRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [editorCanon, setEditorCanon] = useState<Canonization>();
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'save' | 'publish' | 'reset' | null>(null);

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.eventId === selectedEventId) ?? records[0];
  }, [records, selectedEventId]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErrors([]);

      try {
        const response = await fetch('/api/admin/lore/canonization', { cache: 'no-store' });
        if (!response.ok) {
          setErrors(await extractErrors(response, 'Failed to load base event override records'));
          return;
        }

        const body = await response.json() as LoreCanonizationApiListResponse;
        if (!mounted) return;

        setRecords(body.events);
        setSelectedEventId((current) => current ?? body.events[0]?.eventId);
      } catch (error) {
        if (mounted) {
          setErrors([error instanceof Error ? error.message : 'Failed to load base event override records']);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedRecord) {
      setEditorCanon(getEditableCanon(selectedRecord));
      setErrors([]);
    }
  }, [selectedRecord?.eventId]);

  const updateRecord = (record: LoreCanonizationAdminRecord) => {
    setRecords((current) => current.map((item) => (
      item.eventId === record.eventId ? record : item
    )));
    setSelectedEventId(record.eventId);
    setEditorCanon(getEditableCanon(record));
  };

  const submitRecordAction = async (
    action: 'save' | 'publish' | 'reset',
    request: () => Promise<Response>,
    fallback: string,
  ) => {
    setBusyAction(action);
    setErrors([]);

    try {
      const response = await request();
      if (!response.ok) {
        setErrors(await extractErrors(response, fallback));
        return;
      }

      const body = await response.json() as LoreCanonizationApiRecordResponse;
      updateRecord(body.event);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : fallback]);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveDraft = () => {
    if (!selectedRecord || !editorCanon) return;

    submitRecordAction('save', () => fetch(
      `/api/admin/lore/canonization/${encodeURIComponent(selectedRecord.eventId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canon: editorCanon }),
      },
    ), 'Failed to save base event override draft');
  };

  const handlePublish = () => {
    if (!selectedRecord) return;

    submitRecordAction('publish', () => fetch(
      `/api/admin/lore/canonization/${encodeURIComponent(selectedRecord.eventId)}/publish`,
      { method: 'POST' },
    ), 'Failed to publish base event override');
  };

  const handleReset = () => {
    if (!selectedRecord) return;

    if (!window.confirm(`Reset ${selectedRecord.event.title} to the static base-event canon state?`)) {
      return;
    }

    submitRecordAction('reset', () => fetch(
      `/api/admin/lore/canonization/${encodeURIComponent(selectedRecord.eventId)}`,
      { method: 'DELETE' },
    ), 'Failed to reset base event override');
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-soul-accent/20 bg-soul-shadow/70">
        <Spinner />
      </div>
    );
  }

  if (!selectedRecord || !editorCanon) {
    return (
      <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-8 text-center">
        <p className="font-display text-xl text-soul-bone">No lore events found.</p>
        {errors.length > 0 && (
          <p className="mt-3 text-sm text-ember">{errors.join(', ')}</p>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <CanonizationEventList
        records={records}
        selectedEventId={selectedRecord.eventId}
        onSelect={setSelectedEventId}
      />

      <div className="space-y-5">
        <CanonizationEditor
          record={selectedRecord}
          value={editorCanon}
          errors={errors}
          busyAction={busyAction}
          onChange={setEditorCanon}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onReset={handleReset}
        />
        <CanonizationPreview event={selectedRecord.event} canon={editorCanon} />
      </div>
    </div>
  );
}
