'use client'

import { getCharacterImageFallback, getIpfsUrl, getIpfsUrls, type CharacterImageDisclosure } from '@/lib/utils/image'
import type { Character, CharacterCurrentImageKind } from '@/types/character'

interface CharacterImageProvenanceProps {
  character: Character
  imageDisclosure: CharacterImageDisclosure
}

type ProvenanceLink = {
  label: string
  href: string
  display: string
  detail?: string
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getLinkHref(value: string): string {
  return getIpfsUrl(value) || value
}

function shortenUrl(value: string): string {
  if (value.length <= 54) return value
  return `${value.slice(0, 26)}…${value.slice(-21)}`
}

function getCurrentImage(character: Character): { url: string; kind: CharacterCurrentImageKind | string | null; version: string | null } | null {
  const metadataCurrentImage = character.metadata?.currentImage
  const url = stringOrNull(metadataCurrentImage?.url) || stringOrNull(character.current_image_url)

  if (!url) return null

  return {
    url,
    kind: stringOrNull(metadataCurrentImage?.kind) || stringOrNull(character.current_image_kind),
    version: stringOrNull(metadataCurrentImage?.version) || stringOrNull(character.current_image_version),
  }
}

function getOriginalImage(character: Character): string | null {
  return (
    stringOrNull(character.metadata?.originalImage) ||
    stringOrNull(character.original_image_url) ||
    null
  )
}

function buildProvenanceLinks(
  character: Character,
  imageDisclosure: CharacterImageDisclosure
): ProvenanceLink[] {
  const currentImage = getCurrentImage(character)
  const originalImage = getOriginalImage(character)
  const originalImageCandidates = originalImage ? new Set([originalImage, ...getIpfsUrls(originalImage)]) : new Set<string>()
  const fallback = getCharacterImageFallback()
  const displayedPrimary = imageDisclosure.primaryUrl !== fallback ? imageDisclosure.primaryUrl : null
  const links: ProvenanceLink[] = []

  if (currentImage) {
    const kind = currentImage.kind || 'current'
    links.push({
      label: kind === 'base' ? 'Current image' : 'Current / altered image',
      href: getLinkHref(currentImage.url),
      display: currentImage.url,
      detail: currentImage.version ? `${kind} · ${currentImage.version}` : kind,
    })
  } else if (displayedPrimary && !originalImageCandidates.has(displayedPrimary)) {
    links.push({
      label: 'Current / altered image',
      href: getLinkHref(displayedPrimary),
      display: displayedPrimary,
      detail: imageDisclosure.hasSearedImage ? 'seared' : 'runtime primary',
    })
  }

  if (originalImage) {
    links.push({
      label: 'Preserved original image',
      href: getLinkHref(originalImage),
      display: originalImage,
      detail: 'original NFT provenance',
    })

    const sourceHref = getIpfsUrl(originalImage) || originalImage
    links.push({
      label: getIpfsUrl(originalImage) ? 'Canonical IPFS/source image' : 'Canonical source image',
      href: sourceHref,
      display: sourceHref,
    })
  }

  return links
}

export function CharacterImageProvenance({
  character,
  imageDisclosure,
}: CharacterImageProvenanceProps) {
  const links = buildProvenanceLinks(character, imageDisclosure)

  if (links.length === 0) return null

  return (
    <section
      aria-label="Image provenance"
      className="border border-midnight-light/40 bg-black/25 p-4 shadow-inner shadow-black/30"
    >
      <p className="text-[11px] font-display tracking-widest text-mist lowercase">image provenance</p>
      <div className="mt-3 space-y-3">
        {links.map((link) => (
          <div key={`${link.label}:${link.href}`} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] font-display tracking-widest text-dark lowercase">{link.label}</p>
              {link.detail && (
                <p className="text-[10px] font-display tracking-wide text-soul-accent/80 lowercase">{link.detail}</p>
              )}
            </div>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-xs font-eskapade text-soul-accent underline underline-offset-4 hover:text-bone"
              title={link.display}
              aria-label={`${link.label}: ${link.display}`}
            >
              {shortenUrl(link.display)}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
