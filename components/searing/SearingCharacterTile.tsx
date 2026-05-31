'use client'

import { Badge } from '@/components/ui/Badge'
import { getCharacterImageDisclosure, getCharacterImageFallback } from '@/lib/utils/image'
import type { Character } from '@/types/character'
import { getSearingCharacterName, isSearingCharacterSeared } from './searing-page-utils'

interface SearingCharacterTileProps {
  character: Character
  selected: boolean
  disabled?: boolean
  optimisticSearedImageUrl?: string
  onSelect: (character: Character) => void
}

export function SearingCharacterTile({
  character,
  selected,
  disabled,
  optimisticSearedImageUrl,
  onSelect,
}: SearingCharacterTileProps) {
  const name = getSearingCharacterName(character)
  const disclosure = getCharacterImageDisclosure(
    character.token_id,
    character.metadata,
    character.image_url,
    {
      infectionStatus: character.infection_status,
      isInfected: character.infected,
    }
  )
  const imageUrl = optimisticSearedImageUrl && !disclosure.isCurrentlyInfected
    ? optimisticSearedImageUrl
    : disclosure.primaryUrl
  const seared = isSearingCharacterSeared(character) || Boolean(optimisticSearedImageUrl)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(character)}
      className={`group overflow-hidden border bg-black/30 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-soul-accent bg-soul-accent/10 shadow-soul-glow'
          : 'border-neutral-800 hover:border-soul-accent/60'
      }`}
    >
      <div className="aspect-square overflow-hidden bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover [image-rendering:pixelated]"
          onError={(event) => {
            event.currentTarget.src = getCharacterImageFallback()
          }}
        />
      </div>
      <div className="min-w-0 p-3">
        <p className="truncate text-sm text-neutral-100 font-eskapade" title={name}>{name}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-500 font-eskapade">#{character.token_id}</span>
          {seared && (
            <span title={disclosure.isSearedImageHiddenByInfection ? 'Seared art generated; infected art remains primary' : undefined}>
              <Badge variant="outline">seared</Badge>
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
