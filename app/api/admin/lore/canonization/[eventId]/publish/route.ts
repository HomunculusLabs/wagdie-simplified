import { NextRequest } from 'next/server';
import { jsonRaw } from '@/lib/api/responses';
import { requireAdmin, isAuthError } from '@/lib/api/auth';
import { loreCanonizationService } from '@/lib/services/lore-canonization-service';
import { handleLoreCanonizationApiError } from '../../shared';
import { revalidateEffectiveLoreRoutes } from '@/lib/lore/revalidation';

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const params = await context.params;

  try {
    const event = await loreCanonizationService.publishDraft(params.eventId, auth.address);
    revalidateEffectiveLoreRoutes(event);
    return jsonRaw({ event });
  } catch (error) {
    return handleLoreCanonizationApiError(error, 'Failed to publish lore canonization override');
  }
}
