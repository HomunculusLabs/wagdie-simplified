'use client'

import { Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { SearingSyncState } from '@/components/characters/searing'
import type { OwnedSearableConcord } from '@/hooks/useSearingConcords'
import {
  getAlignmentForAttributes,
  normalizeNftAttributes,
  resolveSearingVariant,
} from '@/lib/domain/searing/searing-layer-resolver'
import { getCharacterImageFallback, getCharacterImageUrl } from '@/lib/utils/image'
import type { Character } from '@/types/character'
import { getSearingCharacterName } from './searing-page-utils'

interface SearingResultPreviewProps {
  character: Character | null
  concord: OwnedSearableConcord | null
  syncState: SearingSyncState
}

export function SearingResultPreview({
  character,
  concord,
  syncState,
}: SearingResultPreviewProps) {
  const characterName = character ? getSearingCharacterName(character) : 'Select a WAGDIE'
  const sourceImageUrl = character
    ? getCharacterImageUrl(character.token_id, character.metadata, character.image_url, {
      infectionStatus: character.infection_status,
      isInfected: character.infected,
    })
    : getCharacterImageFallback()
  const isMaterializedResult = syncState.status === 'completed'
  const hasSearingPreview = Boolean(character && concord && !isMaterializedResult)
  const searingPreviewUrl = character && concord
    ? `/api/characters/${character.token_id}/searing/preview?concordId=${concord.concordId}`
    : null
  const previewImageUrl = isMaterializedResult
    ? syncState.imageUrl
    : searingPreviewUrl || sourceImageUrl
  const resolvedVariant = character && concord
    ? resolveSearingVariant(concord.map, getAlignmentForAttributes(normalizeNftAttributes(character.metadata)))
    : null
  const imageLabel = isMaterializedResult
    ? 'Materialized seared result'
    : hasSearingPreview
      ? 'Preview only — confirm the transaction to make this permanent'
      : 'Current source art — select a Concord to preview searing'

  return (
    <section className="border border-neutral-800 bg-soul-950/70">
      <div className="border-b border-neutral-800 p-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-soul-accent" />
          <h2 className="font-display text-lg text-neutral-100">Result</h2>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <div className={`aspect-square overflow-hidden border bg-black/40 ${isMaterializedResult || hasSearingPreview ? 'border-soul-accent/60' : 'border-neutral-800'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl}
              alt={characterName}
              className="h-full w-full object-cover [image-rendering:pixelated]"
              onError={(event) => {
                if (event.currentTarget.src !== sourceImageUrl) {
                  event.currentTarget.src = sourceImageUrl
                  return
                }

                event.currentTarget.src = getCharacterImageFallback()
              }}
            />
          </div>
          <p className={`text-xs font-eskapade ${isMaterializedResult || hasSearingPreview ? 'text-soul-accent' : 'text-neutral-500'}`}>
            {imageLabel}
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs uppercase text-neutral-500 font-eskapade">WAGDIE</p>
            <p className="truncate text-xl text-neutral-100 font-eskapade" title={characterName}>
              {characterName}{character ? ` #${character.token_id}` : ''}
            </p>
          </div>

          {concord ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase text-neutral-500 font-eskapade">Concord burned</p>
                <p className="text-base text-soul-accent font-eskapade">{concord.name} #{concord.concordId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(resolvedVariant?.location || concord.location) && (
                  <Badge variant="outline">{resolvedVariant?.location || concord.location}</Badge>
                )}
                {(resolvedVariant?.newTrait || concord.newTrait) && (
                  <Badge variant="accent">{resolvedVariant?.newTrait || concord.newTrait}</Badge>
                )}
                {(resolvedVariant?.makesBald || concord.makesBald) && <Badge variant="default">balding</Badge>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 font-eskapade">Select a Concord to see the searing trait.</p>
          )}
        </div>
      </div>
    </section>
  )
}
