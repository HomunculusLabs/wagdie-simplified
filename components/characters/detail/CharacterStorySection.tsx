'use client'

import { CharacterStoryTab } from '@/components/characters/detail/CharacterStoryTab'
import { Button } from '@/components/ui'

interface CharacterStorySectionProps {
  story: string
  isEditMode: boolean
  isOwner: boolean
  showLoreNav: boolean
  canSubmitCommunityStory: boolean
  onChange: (story: string) => void
  onAddCommunityStory: () => void
}

export function CharacterStorySection({
  story,
  isEditMode,
  isOwner,
  showLoreNav,
  canSubmitCommunityStory,
  onChange,
  onAddCommunityStory,
}: CharacterStorySectionProps) {
  return (
    <section aria-labelledby="character-story-heading" className="border-t border-midnight-light/40 pt-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="character-story-heading" className="text-h3 font-display text-bone tracking-widest lowercase">
            story
          </h2>
          <p className="text-body-sm text-ash font-eskapade">
            remembered words, origin, and unfinished vows.
          </p>
        </div>
        {showLoreNav && canSubmitCommunityStory && !isEditMode && (
          <Button
            type="button"
            variant="secondary"
            onClick={onAddCommunityStory}
            className="self-start lowercase"
          >
            Add community story
          </Button>
        )}
      </div>
      <CharacterStoryTab
        story={story}
        isEditMode={isEditMode}
        isOwner={isOwner}
        onChange={onChange}
        variant="inline"
      />
    </section>
  )
}
