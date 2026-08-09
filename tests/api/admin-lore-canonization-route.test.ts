/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/admin/lore/canonization/route';
import { GET as DIAGNOSTICS_GET } from '@/app/api/admin/lore/diagnostics/route';
import { PATCH, DELETE } from '@/app/api/admin/lore/canonization/[eventId]/route';
import { POST as PUBLISH } from '@/app/api/admin/lore/canonization/[eventId]/publish/route';
import { requireAdmin } from '@/lib/api/auth';
import { loreCanonizationService } from '@/lib/services/lore-canonization-service';
import { getEffectiveLoreDiagnostics } from '@/lib/lore/effective-query';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/api/auth', () => ({
  requireAdmin: jest.fn(),
  isAuthError: (result: unknown) => result instanceof NextResponse,
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/lore/effective-query', () => ({
  getEffectiveLoreDiagnostics: jest.fn(),
}));

jest.mock('@/lib/services/lore-canonization-service', () => ({
  loreCanonizationService: {
    listAdminRecords: jest.fn(),
    saveDraft: jest.fn(),
    publishDraft: jest.fn(),
    resetOverride: jest.fn(),
  },
  LoreCanonizationValidationError: class LoreCanonizationValidationError extends Error {
    details: string[];
    constructor(message: string, details: string[]) {
      super(message);
      this.details = details;
    }
  },
  LoreCanonizationNotFoundError: class LoreCanonizationNotFoundError extends Error {},
}));

const routeContext = (eventId = 'event-pilgrims-ashen-road') => ({
  params: Promise.resolve({ eventId }),
});

const jsonRequest = (url: string, method: string, body?: unknown) => new NextRequest(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe('admin lore canonization API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdmin as jest.Mock).mockResolvedValue({ address: '0xAdmin' });
  });

  it('requires admin and lists canonization records', async () => {
    (loreCanonizationService.listAdminRecords as jest.Mock).mockResolvedValueOnce([
      { eventId: 'event-pilgrims-ashen-road' },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/lore/canonization'));

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [{ eventId: 'event-pilgrims-ashen-road' }],
      count: 1,
    });
  });

  it('returns auth errors before listing records', async () => {
    (requireAdmin as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));

    const response = await GET(new NextRequest('http://localhost/api/admin/lore/canonization'));

    expect(response.status).toBe(401);
    expect(loreCanonizationService.listAdminRecords).not.toHaveBeenCalled();
  });

  it('saves draft overrides with the admin wallet address', async () => {
    (loreCanonizationService.saveDraft as jest.Mock).mockResolvedValueOnce({ eventId: 'event-pilgrims-ashen-road' });
    const body = { status: 'canonizing', stageId: 'continuity_review', path: [] };

    const response = await PATCH(
      jsonRequest('http://localhost/api/admin/lore/canonization/event-pilgrims-ashen-road', 'PATCH', body),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreCanonizationService.saveDraft).toHaveBeenCalledWith(
      'event-pilgrims-ashen-road',
      body,
      '0xAdmin',
    );
    await expect(response.json()).resolves.toEqual({ event: { eventId: 'event-pilgrims-ashen-road' } });
  });

  it('publishes draft overrides with the admin wallet address', async () => {
    (loreCanonizationService.publishDraft as jest.Mock).mockResolvedValueOnce({
      eventId: 'event-pilgrims-ashen-road',
      event: { slug: 'pilgrims-ashen-road' },
    });

    const response = await PUBLISH(
      jsonRequest('http://localhost/api/admin/lore/canonization/event-pilgrims-ashen-road/publish', 'POST'),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreCanonizationService.publishDraft).toHaveBeenCalledWith('event-pilgrims-ashen-road', '0xAdmin');
    expect(revalidatePath).toHaveBeenCalledWith('/lore');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/events/pilgrims-ashen-road');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/community/pilgrims-ashen-road');
  });

  it('resets overrides through the service', async () => {
    (loreCanonizationService.resetOverride as jest.Mock).mockResolvedValueOnce({
      eventId: 'event-pilgrims-ashen-road',
      event: { slug: 'pilgrims-ashen-road' },
    });

    const response = await DELETE(
      jsonRequest('http://localhost/api/admin/lore/canonization/event-pilgrims-ashen-road', 'DELETE'),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreCanonizationService.resetOverride).toHaveBeenCalledWith('event-pilgrims-ashen-road');
    expect(revalidatePath).toHaveBeenCalledWith('/lore');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/events/pilgrims-ashen-road');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/community/pilgrims-ashen-road');
    await expect(response.json()).resolves.toEqual({
      message: 'Lore canonization override reset successfully',
      event: {
        eventId: 'event-pilgrims-ashen-road',
        event: { slug: 'pilgrims-ashen-road' },
      },
    });
  });

  it('requires admin and returns no-store effective lore diagnostics', async () => {
    const diagnostics = {
      generatedAt: '2026-06-10T18:00:00.000Z',
      base: { activeSource: 'static', fallback: { used: false } },
      overrides: { status: 'ok', count: 0 },
      submissions: { status: 'ok', count: 0, adaptedCount: 0 },
      collisions: { skippedCount: 0, skipped: [] },
    };
    (getEffectiveLoreDiagnostics as jest.Mock).mockResolvedValueOnce(diagnostics);

    const response = await DIAGNOSTICS_GET(new NextRequest('http://localhost/api/admin/lore/diagnostics'));

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(getEffectiveLoreDiagnostics).toHaveBeenCalledTimes(1);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ diagnostics });
  });

  it('returns a no-store machine-readable error when diagnostics generation fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (getEffectiveLoreDiagnostics as jest.Mock).mockRejectedValueOnce(new Error('diagnostics unavailable'));

    const response = await DIAGNOSTICS_GET(new NextRequest('http://localhost/api/admin/lore/diagnostics'));

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'Failed to generate effective lore diagnostics' });
    expect(errorSpy).toHaveBeenCalledWith('Failed to generate effective lore diagnostics:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('does not generate effective lore diagnostics when admin auth fails', async () => {
    (requireAdmin as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));

    const response = await DIAGNOSTICS_GET(new NextRequest('http://localhost/api/admin/lore/diagnostics'));

    expect(response.status).toBe(401);
    expect(getEffectiveLoreDiagnostics).not.toHaveBeenCalled();
  });
});
