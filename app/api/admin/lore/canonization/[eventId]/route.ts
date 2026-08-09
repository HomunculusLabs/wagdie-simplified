import { NextRequest } from 'next/server';
import { jsonRaw } from '@/lib/api/responses';
import { requireAdmin, isAuthError } from '@/lib/api/auth';
import { loreCanonizationService } from '@/lib/services/lore-canonization-service';
import { handleLoreCanonizationApiError, readJsonBody } from '../shared';
import { revalidateEffectiveLoreRoutes } from '@/lib/lore/revalidation';

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

const readEventId = async (context: RouteContext): Promise<string> => {
  const params = await context.params;
  return params.eventId;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const eventId = await readEventId(context);
  const body = await readJsonBody(request);

  try {
    const event = await loreCanonizationService.saveDraft(eventId, body, auth.address);
    return jsonRaw({ event });
  } catch (error) {
    return handleLoreCanonizationApiError(error, 'Failed to save lore canonization override');
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const eventId = await readEventId(context);

  try {
    const event = await loreCanonizationService.resetOverride(eventId);
    revalidateEffectiveLoreRoutes(event);
    return jsonRaw({ message: 'Lore canonization override reset successfully', event });
  } catch (error) {
    return handleLoreCanonizationApiError(error, 'Failed to reset lore canonization override');
  }
}
