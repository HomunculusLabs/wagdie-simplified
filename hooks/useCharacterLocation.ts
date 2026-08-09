/**
 * useCharacterLocation Hook
 * Fetches location information for a character by token ID
 */

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CHARACTERS_TABLE } from '@/lib/db/tables'
import type { Location } from '@/types/chat'

interface UseCharacterLocationReturn {
  location: Location | null
  isLoading: boolean
  error: Error | null
}

export function useCharacterLocation(tokenId: number | null): UseCharacterLocationReturn {
  const [location, setLocation] = useState<Location | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!tokenId) {
      setLocation(null)
      setIsLoading(false)
      return
    }

    const client = supabase
    if (!client) {
      setLocation(null)
      setError(new Error('Supabase client is not configured'))
      setIsLoading(false)
      return
    }

    const fetchLocation = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Get character's location_id
        const { data: character, error: charError } = await client
          .from(CHARACTERS_TABLE)
          .select('location_id')
          .eq('token_id', tokenId)
          .single<{ location_id: string | null }>()

        if (charError) {
          throw new Error(`Failed to fetch character location: ${charError.message}`)
        }

        if (!character || !character.location_id) {
          setLocation(null)
          return
        }

        // Get location details
        const { data: locationData, error: locError } = await client
          .from('locations')
          .select('*')
          .eq('id', character.location_id)
          .single<Location>()

        if (locError) {
          throw new Error(`Failed to fetch location details: ${locError.message}`)
        }

        setLocation(locationData as Location)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
        setLocation(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLocation()
  }, [tokenId])

  return {
    location,
    isLoading,
    error
  }
}
