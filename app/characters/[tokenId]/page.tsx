'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  CharacterHeader,
  CharacterModals,
  CharacterSheetLayout,
  type CharacterSheetTab,
} from '@/components/characters/detail'
import { useCharacterEditor } from '@/hooks/useCharacterEditor'
import { useCharacterDetailData } from '@/hooks/useCharacterDetailData'
import { useCharacterSave } from '@/hooks/useCharacterSave'
import { useCharacterImageDisplay } from '@/hooks/useCharacterImageDisplay'
import { useCharacterEditGuards } from '@/hooks/useCharacterEditGuards'
import { useAICharacter } from '@/hooks/useAICharacter'
import { Card, CardTitle, CardContent, CardDescription, Button, Spinner } from '@/components/ui'
import { isAdmin } from '@/lib/auth/admin'
import { canEditCharacterForAddress } from '@/lib/domain/character/ownership'
import { useChatDock } from '@/contexts/ChatDockContext'

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV === 'true'

function getSheetTabFromQuery(tab: string | null): CharacterSheetTab {
  if (tab === 'ai-persona') return 'ai-persona'
  if (tab === 'wallet' || tab === 'on-chain') return 'on-chain'
  return 'sheet'
}

export default function CharacterDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address } = useAccount()
  const { openChat } = useChatDock()
  const tokenId = parseInt(params.tokenId as string, 10)

  const [isEditMode, setIsEditMode] = useState(false)
  const [isSearingModalOpen, setIsSearingModalOpen] = useState(false)
  const [isInfectionModalOpen, setIsInfectionModalOpen] = useState(false)
  const [isCureModalOpen, setIsCureModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<CharacterSheetTab>('sheet')

  const { character, setCharacter, isLoading, refetchCharacter } = useCharacterDetailData(tokenId)
  const { aiCharacter } = useAICharacter(String(tokenId))
  const editor = useCharacterEditor({ character, isLoading })
  const userIsAdmin = isAdmin(address)
  const isOwner = canEditCharacterForAddress(character, address, userIsAdmin)

  const name = character?.name || character?.metadata?.name || `Character #${tokenId}`
  const { imageDisclosure, displayedImageUrl, handleImageError } = useCharacterImageDisplay({
    tokenId,
    metadata: character?.metadata,
    imageUrl: character?.image_url,
    infectionStatus: character?.infection_status,
    infected: character?.infected,
  })

  useEffect(() => {
    setActiveTab(getSheetTabFromQuery(searchParams.get('tab')))
  }, [searchParams])

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const shouldOpenSearing = query.get('sear') === 'true' || query.get('searing') === 'true'
    if (shouldOpenSearing && isOwner) {
      setIsSearingModalOpen(true)
    }
  }, [isOwner])

  const handleCancelEdit = useCallback(() => {
    editor.reset()
    setIsEditMode(false)
  }, [editor])

  const handleBack = useCallback(() => {
    // Prefer history-based back so filters/page/sort on /characters survive.
    // Fall back to a clean push when this page was deep-linked from outside the site.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/characters')
  }, [router])

  const handleEditToggle = useCallback(() => {
    if (isEditMode) {
      handleCancelEdit()
      return
    }

    setIsEditMode(true)
  }, [handleCancelEdit, isEditMode])

  const handleSaveComplete = useCallback(() => {
    setIsEditMode(false)
  }, [])

  const { isSaving, saveCharacter } = useCharacterSave({
    tokenId,
    character,
    editorState: editor.state,
    setCharacter,
    onSaved: handleSaveComplete,
    onNoChanges: handleSaveComplete,
  })

  useCharacterEditGuards({
    isEditMode,
    hasUnsavedChanges: editor.hasUnsavedChanges,
    onCancelEdit: handleCancelEdit,
  })

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-soul-950">
      <div className="flex flex-col items-center gap-4"><Spinner size="lg" /><p className="text-neutral-500 font-display tracking-widest text-sm">Loading Character</p></div>
    </div>
  )

  if (!character) return (
    <div className="min-h-screen flex items-center justify-center bg-soul-950">
      <Card className="max-w-md text-center">
        <CardContent className="py-12">
          <div className="text-6xl mb-4 opacity-30">☠</div>
          <CardTitle className="mb-2">Character Not Found</CardTitle>
          <CardDescription>Token ID #{tokenId} does not exist.</CardDescription>
          <Button variant="secondary" onClick={() => router.push('/characters')} className="mt-6">Back to Characters</Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen bg-soul-950">
      <CharacterHeader
        tokenId={tokenId}
        isOwner={isOwner}
        isEditMode={isEditMode}
        isSaving={isSaving}
        onBack={handleBack}
        onEdit={handleEditToggle}
        onSave={saveCharacter}
        onCancel={handleEditToggle}
      />

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <CharacterSheetLayout
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tokenId={tokenId}
          character={character}
          name={name}
          isOwner={isOwner}
          isEditMode={isEditMode}
          editor={editor}
          imageUrl={displayedImageUrl}
          imageDisclosure={imageDisclosure}
          showLoreNav={showLoreNav}
          onImageError={handleImageError}
          onAddCommunityStory={() => router.push(`/lore/submit?tokenId=${tokenId}`)}
          onEnterEditMode={() => setIsEditMode(true)}
          onSear={() => setIsSearingModalOpen(true)}
          onInfect={() => setIsInfectionModalOpen(true)}
          onCure={() => setIsCureModalOpen(true)}
          onChat={() => openChat({ tokenId: String(tokenId), characterName: name, characterId: aiCharacter?.id })}
          showChatAction={Boolean(aiCharacter?.id)}
          chatCharacterId={aiCharacter?.id}
        />
      </div>

      <CharacterModals
        tokenId={tokenId}
        name={name}
        isSearingModalOpen={isSearingModalOpen}
        isInfectionModalOpen={isInfectionModalOpen}
        isCureModalOpen={isCureModalOpen}
        onCloseSearing={() => setIsSearingModalOpen(false)}
        onCloseInfection={() => setIsInfectionModalOpen(false)}
        onCloseCure={() => setIsCureModalOpen(false)}
        onSearingSuccess={refetchCharacter}
      />
    </div>
  )
}
