'use client'

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocationRoomHealthDiagnostics } from '@/lib/eliza/locationRooms/adminDiagnostics'

const DEFAULT_LOCATION_ID = '11'

function statusTone(value: boolean | null | undefined) {
  if (value === true) return 'text-green-300'
  if (value === false) return 'text-red-300'
  return 'text-soul-mist'
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function Field({ label, value, tone }: { label: string; value: unknown; tone?: string }) {
  return (
    <div className="rounded border border-soul-accent/10 bg-abyss/50 p-3">
      <dt className="text-xs uppercase tracking-wide text-soul-mist/60">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${tone ?? 'text-soul-bone'}`}>{formatValue(value)}</dd>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <h2 className="font-display text-xl text-soul-accent">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TickList({ ticks }: { ticks: LocationRoomHealthDiagnostics['ticks']['recent'] }) {
  if (ticks.length === 0) {
    return <p className="text-sm text-soul-mist/70">No ticks found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-soul-accent/10 text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-soul-mist/60">
          <tr>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Attempts</th>
            <th className="py-2 pr-3">Trigger</th>
            <th className="py-2 pr-3">Token</th>
            <th className="py-2 pr-3">Next attempt</th>
            <th className="py-2 pr-3">Completed</th>
            <th className="py-2 pr-3">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-soul-accent/10 text-soul-bone">
          {ticks.map((tick) => (
            <tr key={tick.id}>
              <td className="py-2 pr-3">{tick.status}</td>
              <td className="py-2 pr-3">{tick.attempts}</td>
              <td className="py-2 pr-3">{tick.triggerType}</td>
              <td className="py-2 pr-3">{formatValue(tick.selectedTokenId)}</td>
              <td className="py-2 pr-3">{formatValue(tick.nextAttemptAt)}</td>
              <td className="py-2 pr-3">{formatValue(tick.completedAt)}</td>
              <td className="py-2 pr-3 text-red-200">{formatValue(tick.lastError)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function readDiagnostics(locationId: string): Promise<LocationRoomHealthDiagnostics> {
  const response = await fetch(`/api/admin/eliza/location-rooms/${encodeURIComponent(locationId)}/health`, {
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Failed to load location room health diagnostics'
    throw new Error(message)
  }

  return body as LocationRoomHealthDiagnostics
}

export function LocationRoomDiagnosticsContainer() {
  const [locationInput, setLocationInput] = useState(DEFAULT_LOCATION_ID)
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID)
  const [diagnostics, setDiagnostics] = useState<LocationRoomHealthDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSequence = useRef(0)

  const load = useCallback(async (targetLocationId: string) => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setLoading(true)
    setError(null)

    try {
      const nextDiagnostics = await readDiagnostics(targetLocationId)
      if (requestSequence.current !== sequence) return
      setDiagnostics(nextDiagnostics)
    } catch (loadError) {
      if (requestSequence.current !== sequence) return
      setDiagnostics(null)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load diagnostics')
    } finally {
      if (requestSequence.current === sequence) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(locationId)
  }, [load, locationId])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextLocationId = locationInput.trim() || DEFAULT_LOCATION_ID
    setLocationInput(nextLocationId)
    setLocationId(nextLocationId)
  }

  const activeTicks = diagnostics?.ticks.active ?? []
  const recentTicks = diagnostics?.ticks.recent ?? []
  const participantSample = useMemo(
    () => diagnostics?.participants.sample.map((participant) => `#${participant.tokenId} ${participant.name}`).join(', ') ?? '',
    [diagnostics]
  )

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-soul-mist">
          Location ID
          <input
            value={locationInput}
            onChange={(event) => setLocationInput(event.target.value)}
            className="mt-1 w-full rounded border border-soul-accent/30 bg-abyss px-3 py-2 text-soul-bone outline-none focus:border-soul-accent"
            placeholder="11"
          />
        </label>
        <button
          type="submit"
          className="rounded border border-soul-accent bg-soul-accent/15 px-4 py-2 font-display text-sm text-soul-accent transition-colors hover:bg-soul-accent/25"
        >
          Load diagnostics
        </button>
      </form>

      {loading && <p className="text-sm text-soul-mist">Loading location room diagnostics…</p>}
      {error && <p role="alert" className="rounded border border-red-400/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

      {diagnostics && !loading && (
        <>
          <Panel title="Recommended next action">
            <p className="font-display text-2xl text-soul-bone">{diagnostics.recommendedNextAction}</p>
            {diagnostics.canonical.hints.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-soul-mist">
                {diagnostics.canonical.hints.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Location & canonical hints">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Location" value={`${diagnostics.location.id} ${diagnostics.location.name ?? ''}`.trim()} />
                <Field label="Exists" value={diagnostics.location.exists} tone={statusTone(diagnostics.location.exists)} />
                <Field label="Chain location ID" value={diagnostics.location.chainLocationId} />
                <Field label="Active" value={diagnostics.location.active} tone={statusTone(diagnostics.location.active)} />
                <Field label="Canonical ID" value={diagnostics.canonical.canonicalLocationId} />
                <Field label="Is canonical" value={diagnostics.canonical.isCanonical} tone={statusTone(diagnostics.canonical.isCanonical)} />
              </dl>
            </Panel>

            <Panel title="Config & GM readiness">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Location rooms" value={diagnostics.config.locationRoomsEnabled} tone={statusTone(diagnostics.config.locationRoomsEnabled)} />
                <Field label="Official ElizaOS" value={diagnostics.config.officialElizaOsConfigured} tone={statusTone(diagnostics.config.officialElizaOsConfigured)} />
                <Field label="Narrative" value={diagnostics.config.narrativeEnabled} tone={statusTone(diagnostics.config.narrativeEnabled)} />
                <Field label="Gameplay here" value={diagnostics.config.gameplayEnabledForLocation} tone={statusTone(diagnostics.config.gameplayEnabledForLocation)} />
                <Field label="Tick interval" value={`${diagnostics.config.tickIntervalMinutes} min`} />
                <Field label="Max ticks/run" value={diagnostics.config.maxTicksPerRun} />
                <Field label="GM required" value={diagnostics.gmReadiness.required} />
                <Field label="GM ready" value={diagnostics.gmReadiness.ready} tone={statusTone(diagnostics.gmReadiness.ready)} />
                <Field label="GM source" value={diagnostics.gmReadiness.source} />
                <Field label="GM error" value={diagnostics.gmReadiness.safeError} tone="text-red-200" />
              </dl>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Participants & room row">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Participant count" value={`${diagnostics.participants.count}/${diagnostics.participants.minimumRequired}`} />
                <Field label="Participant sample" value={participantSample} />
                <Field label="Room exists" value={diagnostics.room.exists} tone={statusTone(diagnostics.room.exists)} />
                <Field label="Tick enabled" value={diagnostics.room.tickEnabled} tone={statusTone(diagnostics.room.tickEnabled)} />
                <Field label="Last tick" value={diagnostics.room.lastTickAt} />
                <Field label="Next tick" value={diagnostics.room.nextTickAt} />
                <Field label="Tick count" value={diagnostics.room.tickCount} />
                <Field label="Room error" value={diagnostics.room.lastError} tone="text-red-200" />
              </dl>
            </Panel>

            <Panel title="Transcript, narrative & gameplay">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Public messages" value={diagnostics.publicTranscript.messageCount} />
                <Field label="Latest sequence" value={diagnostics.publicTranscript.latestSequence} />
                <Field label="Latest message" value={diagnostics.publicTranscript.latestCreatedAt} />
                <Field label="Narrative state" value={diagnostics.narrative.stateExists} tone={statusTone(diagnostics.narrative.stateExists)} />
                <Field label="Latest beat" value={diagnostics.narrative.latestBeat?.status ?? null} />
                <Field label="Gameplay state" value={diagnostics.gameplay.stateStatus} />
                <Field label="Encounter" value={diagnostics.gameplay.activeEncounterStatus} />
                <Field label="Recent turns" value={diagnostics.gameplay.recentTurnCount} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {diagnostics.narrative.link && <a className="text-soul-accent underline" href={diagnostics.narrative.link}>Open narrative JSON</a>}
                {diagnostics.gameplay.link && <a className="text-soul-accent underline" href={diagnostics.gameplay.link}>Open gameplay JSON</a>}
              </div>
            </Panel>
          </div>

          <Panel title={`Active ticks (${activeTicks.length})`}>
            <TickList ticks={activeTicks} />
          </Panel>

          <Panel title="Recent ticks">
            <TickList ticks={recentTicks} />
          </Panel>
        </>
      )}
    </div>
  )
}
