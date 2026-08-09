import { NextRequest } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/api/auth';
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses';
import { getEffectiveLoreDiagnostics } from '@/lib/lore/effective-query';

export async function GET(_request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const diagnostics = await getEffectiveLoreDiagnostics();
    return jsonNoStore({ diagnostics });
  } catch (error) {
    console.error('Failed to generate effective lore diagnostics:', error);
    return jsonNoStoreError('Failed to generate effective lore diagnostics', 500);
  }
}
