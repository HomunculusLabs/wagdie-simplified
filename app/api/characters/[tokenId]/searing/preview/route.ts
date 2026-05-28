import { NextRequest, NextResponse } from 'next/server'
import { parseStrictPositiveIntParam, parseTokenIdParam } from '@/lib/api/params'
import { getErrorMessage, jsonNoStoreError, withNoStoreHeaders } from '@/lib/api/responses'
import { resolveSearingLayersForCharacter, validateSearingLayerResolution } from '@/lib/domain/searing/searing-layer-resolver'
import { CHARACTERS_TABLE } from '@/lib/db/tables'
import { searingMapMaterializationRepository } from '@/lib/repositories/searing-map-materialization-repository'
import { searingImageComposer } from '@/lib/services/searing-image-composer'
import { characterLocalAssets } from '@/lib/services/assets/character-local-assets'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { CharacterMetadata, InfectionStatus } from '@/types/character'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PreviewCharacter = {
  token_id: number
  metadata: CharacterMetadata | null
  image_url?: string | null
  infection_status?: InfectionStatus | null
  infected?: boolean | null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  const params = await context.params
  const tokenId = parseTokenIdParam(params.tokenId, { min: 1 })
  const concordId = parseStrictPositiveIntParam(request.nextUrl.searchParams.get('concordId'), { min: 1 })

  if (tokenId === null) {
    return jsonNoStoreError('Invalid token ID', 400)
  }

  if (concordId === null) {
    return jsonNoStoreError('concordId is required', 400)
  }

  try {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return jsonNoStoreError('Supabase admin client not configured', 500)
    }

    const [characterResult, concord] = await Promise.all([
      admin
        .from(CHARACTERS_TABLE as never)
        .select('token_id, metadata, image_url, infection_status, infected')
        .eq('token_id', tokenId)
        .maybeSingle(),
      searingMapMaterializationRepository.findByConcordTokenId(concordId),
    ])

    if (characterResult.error) {
      throw new Error(`Failed to fetch character ${tokenId}: ${characterResult.error.message}`)
    }

    const character = characterResult.data as PreviewCharacter | null

    if (!character) {
      return jsonNoStoreError(`Character ${tokenId} not found`, 404)
    }

    if (!concord) {
      return jsonNoStoreError(`No searing map found for concord ${concordId}`, 404)
    }

    const hydratedCharacter = await characterLocalAssets.hydrateCharacter({
      ...character,
      image_url: character.image_url ?? undefined,
      infection_status: character.infection_status ?? undefined,
      infected: character.infected ?? undefined,
    })

    const resolution = resolveSearingLayersForCharacter(hydratedCharacter.metadata, concord)
    validateSearingLayerResolution(resolution)
    const composed = await searingImageComposer.compose(resolution.layers)

    return new NextResponse(new Uint8Array(composed.image), {
      status: 200,
      headers: withNoStoreHeaders({
        'Content-Type': 'image/png',
        'X-Searing-Location': resolution.variant.location,
        'X-Searing-Trait': resolution.variant.newTrait,
      }),
    })
  } catch (error) {
    return jsonNoStoreError(getErrorMessage(error, 'Failed to generate searing preview'), 500)
  }
}
