'use client'

import { useEffect, useState } from 'react'
import type { CharacterWithLocation } from '@/lib/repositories/character-repository'
import type { Location } from '@/lib/types/map'

function joinStakedCharacters(
  rows: CharacterWithLocation[],
  locations: Location[]
): CharacterWithLocation[] {
  const locationMap = new Map(locations.map((location) => [location.id, location]))

  return rows.map((row) => {
    const locationId = typeof row.location_id === 'string' ? row.location_id : null
    const location = locationId ? locationMap.get(locationId) : null

    return {
      ...row,
      location: location
        ? {
            id: location.id,
            name: location.name,
            metadata: location.metadata,
          }
        : null,
    } as CharacterWithLocation
  })
}

export function useMapData() {
  const [locations, setLocations] = useState<Location[]>([])
  const [stakedCharacters, setStakedCharacters] = useState<CharacterWithLocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('')
  const [loadingStages] = useState([
    'Initializing WAGDIE World',
    'Connecting to database',
    'Fetching locations',
    'Fetching staked characters',
    'Loading map assets',
    'Finalizing setup',
  ])

  const fetchLocationsFromApi = async (): Promise<Location[]> => {
    const response = await fetch('/api/locations', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const suffix = text ? ` - ${text}` : ''
      throw new Error(`Failed to fetch locations (${response.status})${suffix}`)
    }

    const payload = (await response.json()) as {
      success?: boolean
      data?: Location[]
    } | Location[]

    if (Array.isArray(payload)) {
      return payload
    }

    return Array.isArray(payload.data) ? payload.data : []
  }

  const fetchStakedCharactersFromApi = async (): Promise<CharacterWithLocation[]> => {
    const response = await fetch('/api/characters/staked-map', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const suffix = text ? ` - ${text}` : ''
      throw new Error(
        `Failed to fetch staked characters (${response.status})${suffix}`
      )
    }

    const payload = (await response.json()) as {
      characters?: CharacterWithLocation[]
    }

    return Array.isArray(payload.characters) ? payload.characters : []
  }

  useEffect(() => {
    async function fetchData() {
      if (typeof window === 'undefined') return

      try {
        setIsLoading(true)
        setError(null)

        setLoadingStage('Initializing WAGDIE World')
        setLoadingProgress(10)
        await new Promise((resolve) => setTimeout(resolve, 300))

        setLoadingStage('Connecting to database')
        setLoadingProgress(20)
        await new Promise((resolve) => setTimeout(resolve, 200))

        setLoadingStage('Fetching locations')
        setLoadingProgress(40)

        const locationsData = await fetchLocationsFromApi()

        if (!locationsData || locationsData.length === 0) {
          throw new Error('No map locations returned')
        }

        setLocations(locationsData)
        await new Promise((resolve) => setTimeout(resolve, 200))

        setLoadingStage('Fetching staked characters')
        setLoadingProgress(60)

        let stakedRows: CharacterWithLocation[] = []
        try {
          stakedRows = await fetchStakedCharactersFromApi()
        } catch {
          stakedRows = []
        }

        const stakedData = joinStakedCharacters(stakedRows, locationsData)

        setStakedCharacters(stakedData)
        await new Promise((resolve) => setTimeout(resolve, 200))

        setLoadingStage('Loading map assets')
        setLoadingProgress(80)
        await new Promise((resolve) => setTimeout(resolve, 400))

        setLoadingStage('Finalizing setup')
        setLoadingProgress(100)
        await new Promise((resolve) => setTimeout(resolve, 200))

        setLoadingStage('Complete')
      } catch (err) {
        console.error('[useMapData] Failed to fetch map data:', err)
        const message =
          err instanceof Error ? err.message : 'Failed to fetch map data'
        setError(message)
        setLoadingStage('Error loading data')
      } finally {
        setIsLoading(false)
      }
    }

    void fetchData()
  }, [])

  const refetch = async (): Promise<void> => {
    if (typeof window === 'undefined') return

    setIsRefreshing(true)

    try {
      const rows = await fetchStakedCharactersFromApi()
      setStakedCharacters(joinStakedCharacters(rows, locations))
    } catch (err) {
      console.error('[useMapData] Failed to refresh staked characters:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  return {
    locations,
    stakedCharacters,
    isLoading,
    isRefreshing,
    error,
    loadingProgress,
    loadingStage,
    loadingStages,
    refetch,
  }
}
