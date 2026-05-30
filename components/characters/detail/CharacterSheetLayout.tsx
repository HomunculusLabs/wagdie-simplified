'use client'

import { useEffect, useState } from 'react'
import { AIPersonaTab } from '@/components/characters/ai-editor'
import { PERSONA_ASSISTANT_DOCK_PORTAL_ID, PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT } from '@/components/chat'
import { CharacterActions } from '@/components/characters/detail/CharacterActions'
import { CharacterArtworkCard } from '@/components/characters/detail/CharacterArtworkCard'
import { CharacterEquipmentSection } from '@/components/characters/detail/CharacterEquipmentSection'
import { CharacterIdentityStatsPanel } from '@/components/characters/detail/CharacterIdentityStatsPanel'
import { CharacterStorySection } from '@/components/characters/detail/CharacterStorySection'
import { CharacterWalletTab } from '@/components/characters/detail/CharacterWalletTab'
import { CoreStatsEditor } from '@/components/characters/CoreStatsEditor'
import { DerivedStatsEditor } from '@/components/characters/DerivedStatsEditor'
import { EmptyStatsPrompt } from '@/components/characters/EmptyStatsPrompt'
import { Card, CardContent, Badge, Button, Tabs } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { extractNFTTraits } from '@/lib/utils/nft-traits'
import type { UseCharacterEditorReturn } from '@/hooks/useCharacterEditor'
import type { CharacterImageDisclosure } from '@/lib/utils/image'
import type { PublicChatReadiness } from '@/lib/eliza/chatReadiness'
import type { Character } from '@/types/character'

export type CharacterSheetTab = 'sheet' | 'ai-persona' | 'on-chain'

interface CharacterSheetLayoutProps {
  activeTab: CharacterSheetTab
  onTabChange: (tabId: CharacterSheetTab) => void
  tokenId: number
  character: Character
  name: string
  isOwner: boolean
  isEditMode: boolean
  editor: Pick<
    UseCharacterEditorReturn,
    | 'state'
    | 'setName'
    | 'setStory'
    | 'setCoreStats'
    | 'setDerivedStats'
    | 'setLevelExp'
    | 'assignDefaultStats'
  >
  imageUrl: string
  imageDisclosure: CharacterImageDisclosure
  showLoreNav: boolean
  onImageError: () => void
  onAddCommunityStory: () => void
  onEnterEditMode: () => void
  onSear: () => void
  onInfect: () => void
  onCure: () => void
  onChat: () => void
  chatReadiness: PublicChatReadiness
  onRetryChatReadiness?: () => void
  onPersonaSaved?: () => Promise<void> | void
  showPersonaAssistant?: boolean
}

const sheetTabs: TabItem[] = [
  { id: 'sheet', label: 'sheet' },
  { id: 'ai-persona', label: 'ai persona' },
  { id: 'on-chain', label: 'on-chain' },
]

export function CharacterSheetLayout({
  activeTab,
  onTabChange,
  tokenId,
  character,
  name,
  isOwner,
  isEditMode,
  editor,
  imageUrl,
  imageDisclosure,
  showLoreNav,
  onImageError,
  onAddCommunityStory,
  onEnterEditMode,
  onSear,
  onInfect,
  onCure,
  onChat,
  chatReadiness,
  onRetryChatReadiness,
  onPersonaSaved,
  showPersonaAssistant = isOwner,
}: CharacterSheetLayoutProps) {
  const [isPersonaAssistantDockVisible, setIsPersonaAssistantDockVisible] = useState(false)
  const shouldCompactLeftRail = activeTab === 'ai-persona' && isPersonaAssistantDockVisible
  const chatCharacterId = chatReadiness.status === 'ready' ? chatReadiness.characterId : undefined

  useEffect(() => {
    const handlePersonaAssistantDockVisibility = (event: Event) => {
      const { visible } = (event as CustomEvent<{ visible?: boolean }>).detail ?? {}
      setIsPersonaAssistantDockVisible(Boolean(visible))
    }

    window.addEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)

    return () => {
      window.removeEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)
    }
  }, [])

  const ChatIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )

  const ownerActions = (
    <CharacterActions
      isInfected={character.infection_status === 'infected'}
      onSear={onSear}
      onInfect={onInfect}
      onCure={onCure}
    />
  )

  const level = character.level ?? character.metadata?.level ?? 1
  const characterClass = character.class ?? null
  const traits = extractNFTTraits(character.metadata)
  const alignmentTrait = traits.find((trait) => trait.type.toLowerCase() === 'alignment')
  const healthTrait = traits.find((trait) => trait.type.toLowerCase() === 'health')
  const NONE_VALUES = new Set(['none', 'na', 'n/a', '0', 'false'])
  const isNoneTrait = (value: string) => NONE_VALUES.has(value.trim().toLowerCase())
  const candidateTraits = traits.filter((trait) => {
    const type = trait.type.toLowerCase()
    return trait.category !== 'equipment' && type !== 'alignment' && type !== 'health'
  })
  const secondaryTraits = candidateTraits.filter((trait) => !isNoneTrait(trait.value))
  const inactiveTraits = candidateTraits.filter((trait) => isNoneTrait(trait.value))
  const healthLabel = healthTrait?.value ?? character.infection_status ?? null
  const attrs = {
    str: character.str || 0,
    dex: character.dex || 0,
    con: character.con || 0,
    int: character.int || 0,
    wis: character.wis || 0,
    cha: character.cha || 0,
  }
  const hasCharacterSheet = attrs.str > 0 || attrs.dex > 0 || attrs.con > 0 || attrs.int > 0 || attrs.wis > 0 || attrs.cha > 0
  const hasAnyStats = (character.str ?? 0) > 0 || (character.dex ?? 0) > 0 || (character.hp ?? 0) > 0 || (character.level ?? 1) > 1
  // Characters that have never been customized carry the assignDefaultStats() baseline:
  // all six core stats equal to 10. Render those muted so they don't read as real data.
  const isDefaultStatline =
    attrs.str === 10 && attrs.dex === 10 && attrs.con === 10 &&
    attrs.int === 10 && attrs.wis === 10 && attrs.cha === 10
  const showPlaceholderStats = isDefaultStatline && !isEditMode
  const handleAssignStats = () => {
    editor.assignDefaultStats()
    onEnterEditMode()
  }

  const handleTabChange = (tabId: string) => {
    if (tabId === 'ai-persona' || tabId === 'on-chain') {
      onTabChange(tabId)
      return
    }
    onTabChange('sheet')
  }

  const chatAction = (() => {
    if (chatReadiness.status === 'ready') {
      return (
        <Button variant="secondary" onClick={onChat} className="gap-2 self-start lowercase">
          <ChatIcon /> chat
        </Button>
      )
    }

    if (chatReadiness.status === 'loading') {
      return (
        <div className="self-start border border-midnight-light/40 bg-black/25 px-3 py-2 text-xs font-display lowercase tracking-wide text-mist">
          checking ai persona...
        </div>
      )
    }

    const isError = chatReadiness.status === 'error'
    const message = isError
      ? chatReadiness.message
      : isOwner
        ? 'Open the AI persona tab, review or edit fields, then click Save AI Persona before chatting.'
        : 'This character does not have a public AI persona configured yet.'

    return (
      <div className="max-w-sm self-start border border-amber-800/50 bg-amber-950/20 p-3 text-left">
        <p className="text-xs font-display lowercase tracking-widest text-amber-300">ai persona required before chat</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/75">{message}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => onTabChange('ai-persona')} className="lowercase">
            open ai persona
          </Button>
          {isError && onRetryChatReadiness && (
            <Button variant="secondary" size="sm" onClick={onRetryChatReadiness} className="lowercase">
              retry
            </Button>
          )}
        </div>
      </div>
    )
  })()

  return (
    <Card className="relative !overflow-visible border-soul-accent/25 bg-[radial-gradient(circle_at_top_left,rgba(214,177,103,0.08),transparent_34%),linear-gradient(135deg,rgba(22,17,15,0.96),rgba(8,8,8,0.98))] shadow-2xl shadow-black/50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-soul-accent/60 to-transparent" />
      <CardContent className="p-4 sm:p-6 lg:p-8 xl:p-10">
        <div className="relative" data-persona-dock-compact={shouldCompactLeftRail ? 'true' : 'false'}>
          <div className={`pointer-events-none absolute inset-y-0 hidden w-px bg-gradient-to-b from-transparent via-midnight-light/50 to-transparent ${shouldCompactLeftRail ? 'left-[25%] md:block' : 'left-[39%] lg:block'}`} />
          <div className={`grid grid-cols-1 gap-7 transition-[gap] duration-300 ${shouldCompactLeftRail ? 'md:grid-cols-12 md:gap-5 lg:gap-6' : 'lg:grid-cols-12 lg:gap-10'}`}>
            <aside className={`space-y-4 transition-[width] duration-300 ${shouldCompactLeftRail ? 'md:col-span-3' : 'lg:col-span-5 xl:col-span-4'}`} aria-label="Character artwork and stats">
              <div className="space-y-4 lg:sticky lg:top-24">
                <CharacterArtworkCard
                  name={name}
                  imageUrl={imageUrl}
                  imageDisclosure={imageDisclosure}
                  infectionStatus={character.infection_status}
                  stakingStatus={character.staking_status}
                  onImageError={onImageError}
                  frame="inline"
                />
                <div className={`border border-midnight-light/40 bg-black/25 shadow-inner shadow-black/30 ${shouldCompactLeftRail ? 'space-y-3 p-3' : 'space-y-4 p-4'}`}>
                  <div className="border-b border-midnight-light/30 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-display tracking-widest text-mist lowercase">class</p>
                        <p className={`${shouldCompactLeftRail ? 'text-2xl' : 'text-4xl'} font-display tracking-wider text-bone lowercase`}>
                          {characterClass ?? 'pilgrim'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-display tracking-widest text-mist lowercase">level</p>
                        <p className={`${shouldCompactLeftRail ? 'text-2xl' : 'text-3xl'} font-display text-soul-accent`}>{level}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] font-display tracking-widest text-dark lowercase">token #{tokenId}</p>
                  </div>

                  <div className={`grid grid-cols-1 gap-2 ${shouldCompactLeftRail ? '' : 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'}`}>
                    {alignmentTrait && (
                      <div className="border border-soul-accent/40 bg-soul-accent/10 p-3">
                        <p className="text-[11px] font-display tracking-widest text-soul-accent lowercase">alignment</p>
                        <p className="text-lg font-display text-bone lowercase">{alignmentTrait.value}</p>
                      </div>
                    )}
                    {healthLabel && (
                      <div className="border border-emerald-900/50 bg-emerald-950/20 p-3">
                        <p className="text-[11px] font-display tracking-widest text-emerald-500 lowercase">health</p>
                        <p className="text-lg font-display text-bone lowercase">{healthLabel}</p>
                      </div>
                    )}
                  </div>

                  {(secondaryTraits.length > 0 || inactiveTraits.length > 0) && (
                    <div className="border-t border-midnight-light/30 pt-3">
                      <p className="mb-2 text-[11px] font-display tracking-widest text-mist lowercase">traits</p>
                      {secondaryTraits.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {secondaryTraits.map((trait) => (
                            <Badge key={trait.type} variant={trait.category === 'identity' ? 'accent' : 'default'}>
                              <span className="lowercase">{trait.type}: {trait.value}</span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] font-display tracking-wide text-dark lowercase">no notable traits</p>
                      )}
                      {inactiveTraits.length > 0 && (
                        <details className="group mt-3">
                          <summary className="cursor-pointer list-none text-[11px] font-display tracking-widest text-dark lowercase transition-colors hover:text-mist">
                            <span className="group-open:hidden">+ {inactiveTraits.length} inactive</span>
                            <span className="hidden group-open:inline">- hide inactive</span>
                          </summary>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {inactiveTraits.map((trait) => (
                              <span key={trait.type} className="border border-midnight-light/30 px-2 py-0.5 text-[10px] font-display tracking-wide text-dark/80 lowercase">
                                {trait.type}
                              </span>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  <DerivedStatsEditor
                    stats={isEditMode ? editor.state.derivedStats : { hp: character.hp ?? null, max_hp: character.max_hp ?? null, ac: character.ac ?? null, speed: character.speed ?? null }}
                    isOwner={isOwner}
                    isEditMode={isEditMode}
                    onChange={editor.setDerivedStats}
                    variant="compact"
                  />
                  {(hasCharacterSheet || (isOwner && isEditMode)) && (
                    <CoreStatsEditor
                      stats={isEditMode ? editor.state.coreStats : attrs}
                      isOwner={isOwner}
                      isEditMode={isEditMode}
                      onChange={editor.setCoreStats}
                      placeholder={showPlaceholderStats}
                    />
                  )}
                  {isOwner && !hasAnyStats && !isEditMode && <EmptyStatsPrompt onAssignStats={handleAssignStats} />}
                </div>
                {isOwner && <div className="hidden lg:block">{ownerActions}</div>}
              </div>
            </aside>

            <div className={`space-y-7 transition-[width] duration-300 ${shouldCompactLeftRail ? 'md:col-span-9' : 'lg:col-span-7 xl:col-span-8'}`}>
              <div className="flex flex-col gap-4 border-b border-midnight-light/40 pb-6 sm:flex-row sm:items-start sm:justify-between">
                <CharacterIdentityStatsPanel
                  name={name}
                  isOwner={isOwner}
                  isEditMode={isEditMode}
                  editor={editor}
                />
                {chatAction}
              </div>

              <Tabs
                id="character-sheet-tabs"
                items={sheetTabs}
                activeId={activeTab}
                onChange={handleTabChange}
              />

              {activeTab === 'sheet' && (
                <div className="space-y-7">
                  <CharacterStorySection
                    story={editor.state.story}
                    isEditMode={isEditMode}
                    isOwner={isOwner}
                    showLoreNav={showLoreNav}
                    onChange={editor.setStory}
                    onAddCommunityStory={onAddCommunityStory}
                  />
                  <CharacterEquipmentSection character={character} isEditMode={isEditMode} />
                  {isOwner && <div className="lg:hidden">{ownerActions}</div>}
                </div>
              )}

              {activeTab === 'ai-persona' && (
                <div className="border border-midnight-light/35 bg-black/20 p-4 sm:p-6">
                  <AIPersonaTab
                    tokenId={String(tokenId)}
                    isOwner={isOwner}
                    characterName={name}
                    characterBackstory={editor.state.story}
                    characterId={chatCharacterId}
                    assistantPortalId={PERSONA_ASSISTANT_DOCK_PORTAL_ID}
                    showPersonaAssistant={showPersonaAssistant}
                    onPersonaSaved={onPersonaSaved}
                  />
                </div>
              )}

              {activeTab === 'on-chain' && (
                <div className="border border-midnight-light/35 bg-black/20 p-4 sm:p-6">
                  <CharacterWalletTab
                    tokenId={tokenId}
                    ownerAddress={character.owner_address ?? null}
                    stakerAddress={character.staker_address ?? null}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
