/**
 * CharacterCard Component
 * Single character card with image, status badges, and click handler
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image'
import { Card, CardContent, Badge, Button } from '@/components/ui'
import type { Character } from '@/types/character'
import { OwnershipBadge } from '@/components/OwnershipVerificationBanner'
import { getCharacterImageDisclosure } from '@/lib/utils/image'

interface CharacterCardProps {
  character: Character
  onClick?: (tokenId: number) => void
  onSearClick?: (tokenId: number) => void
  showSearingLink?: boolean
  className?: string
}

export function CharacterCard({ character, onClick, onSearClick, showSearingLink = false, className = '' }: CharacterCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const infectionStatus = character.infection_status ?? (character.infected ? 'infected' : 'healthy')
  const imageDisclosure = useMemo(
    () => getCharacterImageDisclosure(character.token_id, character.metadata, character.image_url, {
      infectionStatus,
      isInfected: character.infected,
    }),
    [character.token_id, character.metadata, character.image_url, character.infected, infectionStatus]
  )
  const imageCandidates = imageDisclosure.candidates
  const [imageUrl, setImageUrl] = useState(() => imageDisclosure.primaryUrl)

  // Prefer the DB column (editable, source of truth after renames) over the
  // metadata snapshot (frozen at import time). This matches the detail page
  // at app/characters/[tokenId]/page.tsx so the two views never disagree.
  const name = character.name || character.metadata?.name || `character #${character.token_id}`

  useEffect(() => {
    setIsLoading(true)
    setImageUrl(imageDisclosure.primaryUrl)
  }, [imageDisclosure.primaryUrl])

  const level = character.metadata?.level || character.level
  const characterClass = character.class

  const handleImageError = () => {
    setImageUrl((current) => {
      const currentIndex = imageCandidates.indexOf(current)
      const nextImage = imageCandidates[currentIndex + 1]
      if (nextImage) {
        setIsLoading(true)
        return nextImage
      }
      setIsLoading(false)
      return current
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(character.token_id)
    }
  }

  const handleSearClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onSearClick?.(character.token_id)
  }

  const handleSearKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation()
  }

  return (
    <Card
      onClick={() => onClick?.(character.token_id)}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `View ${name}` : undefined}
      className={`group overflow-hidden rounded-md cursor-pointer transition-all duration-500 hover:-translate-y-0.5 hover:border-soul-accent/40 hover:shadow-[0_0_24px_rgba(200,170,110,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950 ${className}`}
    >
      {/* Character Image */}
      <div className="relative w-full aspect-square overflow-hidden bg-neutral-900">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="absolute inset-0 bg-midnight animate-pulse" />
        )}
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
          className={`object-cover [image-rendering:pixelated] group-hover:scale-105 transition-all duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          unoptimized
          onLoad={() => setIsLoading(false)}
          onError={handleImageError}
        />


        {/* Bottom scrim so badges/token id read on light character art */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Status Badges */}
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex flex-col items-end gap-1">
          <OwnershipBadge tokenId={BigInt(character.token_id)} />
          {/* Dead badge for burned+staked characters */}
          {character.burned && character.location_id && (
            <span className="px-2 py-0.5 bg-red-950/80 border border-red-800/50 text-red-300 text-caption font-display tracking-widest">
              Dead
            </span>
          )}
          {/* Fallen badge for burned but not staked */}
          {character.burned && !character.location_id && (
            <span className="px-2 py-0.5 bg-neutral-900/80 border border-neutral-700/50 text-neutral-400 text-caption font-display tracking-widest">
              Fallen
            </span>
          )}
          {infectionStatus === 'infected' && (
            <span className="px-2 py-0.5 bg-red-950/80 border border-red-900/50 text-red-400 text-caption font-display tracking-widest">
              Infected
            </span>
          )}
          {infectionStatus === 'cured' && (
            <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-900/50 text-emerald-400 text-caption font-display tracking-widest">
              Cured
            </span>
          )}
          {imageDisclosure.hasSearedImage && (
            <span
              className="px-2 py-0.5 bg-soul-accent/20 border border-soul-accent/50 text-soul-accent text-caption font-display tracking-widest"
              title={imageDisclosure.isSearedImageHiddenByInfection ? 'Seared art generated; infected art remains primary' : undefined}
            >
              Seared
            </span>
          )}
          {/* Staked badge only for non-burned staked characters */}
          {character.staking_status === 'staked' && !character.burned && (
            <span className="px-2 py-0.5 bg-blue-950/80 border border-blue-900/50 text-blue-400 text-caption font-display tracking-widest">
              Staked
            </span>
          )}
        </div>

        {/* Token ID Badge */}
        <div className="absolute bottom-2 left-2">
          <Badge variant="accent">#{character.token_id}</Badge>
        </div>
      </div>

      {/* Character Info */}
      <CardContent className="p-3 sm:p-4">
        <h3
          title={name}
          className="text-body-sm sm:text-h4 font-display text-bone group-hover:text-soul-accent transition-colors duration-300 line-clamp-2 min-h-[2.5em] leading-tight lowercase"
        >
          {name.toLowerCase()}
        </h3>
        {(characterClass || level) && (
          <p className="text-body-sm text-mist font-eskapade mt-1 lowercase">
            {characterClass && `${characterClass.toLowerCase()}`}
            {characterClass && level && ' · '}
            {level && `level ${level}`}
          </p>
        )}
        {showSearingLink && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mt-3 w-full lowercase"
            onClick={handleSearClick}
            onKeyDown={handleSearKeyDown}
          >
            sear concord
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
