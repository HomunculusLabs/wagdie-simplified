import { Suspense } from 'react'
import { CharacterDetailClient } from './CharacterDetailClient'
import { getEffectiveTokenCharacterLore } from '@/lib/lore/effective-query'
import type { EffectiveTokenCharacterLore } from '@/lib/lore/types'

export const dynamic = 'force-dynamic'

interface CharacterDetailPageProps {
  params: Promise<{ tokenId: string }>
}

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV === 'true'

function parsePositiveTokenIdParam(tokenIdParam: string): number | null {
  if (!/^\d+$/.test(tokenIdParam)) return null

  const tokenId = Number(tokenIdParam)
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return null

  return tokenId
}

function CharacterDetailLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-soul-950">
      <p className="text-neutral-500 font-display tracking-widest text-sm">Loading Character</p>
    </div>
  )
}

export default async function CharacterDetailPage({ params }: CharacterDetailPageProps) {
  const { tokenId: tokenIdParam } = await params
  const tokenId = parsePositiveTokenIdParam(tokenIdParam)
  let initialLore: EffectiveTokenCharacterLore | null = null
  let initialLoreError: string | undefined

  if (showLoreNav && tokenId !== null) {
    try {
      initialLore = (await getEffectiveTokenCharacterLore(tokenId)) ?? null
    } catch (error) {
      console.error('Failed to load effective character lore', { tokenId, error })
      initialLoreError = 'Character lore is temporarily unavailable.'
    }
  }

  return (
    <Suspense fallback={<CharacterDetailLoadingFallback />}>
      <CharacterDetailClient
        tokenIdParam={tokenIdParam}
        showLoreNav={showLoreNav}
        initialLore={initialLore}
        initialLoreError={initialLoreError}
      />
    </Suspense>
  )
}
