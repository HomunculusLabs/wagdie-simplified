'use client'

import { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { getCsrfTokenFromCookie } from '@/lib/api/client'
import { ApiError, readApiRaw } from '@/lib/api/client-response'
import { buildCharacterUpdateDiff } from '@/lib/domain/character/update-diff'
import type { Dispatch, SetStateAction } from 'react'
import type { Character } from '@/types/character'
import type { CharacterEditorState } from '@/hooks/useCharacterEditor'

interface UseCharacterSaveInput {
  tokenId: number
  character: Character | null
  editorState: CharacterEditorState
  setCharacter: Dispatch<SetStateAction<Character | null>>
  onSaved: () => void
  onNoChanges: () => void
}

interface UseCharacterSaveReturn {
  isSaving: boolean
  saveCharacter: () => Promise<void>
}

function getCharacterSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const data = error.data
    if (data && typeof data === 'object') {
      const errorData = data as { error?: unknown; details?: unknown }
      if (Array.isArray(errorData.details)) {
        const details = errorData.details.filter((detail): detail is string => typeof detail === 'string')
        if (details.length > 0) {
          const prefix = typeof errorData.error === 'string' && errorData.error.length > 0
            ? errorData.error
            : error.message
          return `${prefix}: ${details.join(', ')}`
        }
      }
    }
  }

  return error instanceof Error ? error.message : 'Failed to save'
}

export function useCharacterSave({
  tokenId,
  character,
  editorState,
  setCharacter,
  onSaved,
  onNoChanges,
}: UseCharacterSaveInput): UseCharacterSaveReturn {
  const [isSaving, setIsSaving] = useState(false)

  const saveCharacter = useCallback(async () => {
    if (!character) return

    try {
      setIsSaving(true)
      const updates = buildCharacterUpdateDiff(character, editorState)

      if (!Object.keys(updates).length) {
        onNoChanges()
        toast.success('No changes')
        return
      }

      const csrfToken = getCsrfTokenFromCookie()
      const response = await fetch(`/api/characters/${tokenId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(updates),
      })

      setCharacter(await readApiRaw<Character>(response, 'Failed to update'))
      onSaved()
      toast.success('Character updated!')
    } catch (error) {
      toast.error(getCharacterSaveErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }, [character, editorState, onNoChanges, onSaved, setCharacter, tokenId])

  return {
    isSaving,
    saveCharacter,
  }
}
