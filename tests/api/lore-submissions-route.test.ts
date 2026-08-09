/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET as COMMUNITY_GET, POST as COMMUNITY_POST } from '@/app/api/lore/submissions/route';
import { GET as COMMUNITY_DETAIL_GET, PATCH as COMMUNITY_DETAIL_PATCH } from '@/app/api/lore/submissions/[submissionId]/route';
import { GET as ADMIN_GET } from '@/app/api/admin/lore/submissions/route';
import { PATCH as ADMIN_PATCH } from '@/app/api/admin/lore/submissions/[submissionId]/route';
import { POST as ADMIN_CANONIZE } from '@/app/api/admin/lore/submissions/[submissionId]/canonize/route';
import { POST as ADMIN_DECANONIZE } from '@/app/api/admin/lore/submissions/[submissionId]/decanonize/route';
import { POST as ADMIN_PUBLISH } from '@/app/api/admin/lore/submissions/[submissionId]/publish/route';
import { POST as ADMIN_REVIEW } from '@/app/api/admin/lore/submissions/[submissionId]/review/route';
import { POST as ADMIN_UNPUBLISH } from '@/app/api/admin/lore/submissions/[submissionId]/unpublish/route';
import { requireAdmin, requireAuth } from '@/lib/api/auth';
import { revalidatePath } from 'next/cache';
import {
  LoreSubmissionConflictError,
  LoreSubmissionValidationError,
  loreSubmissionService,
} from '@/lib/services/lore-submission-service';

jest.mock('@/lib/api/auth', () => ({
  requireAuth: jest.fn(),
  requireAdmin: jest.fn(),
  isAuthError: (result: unknown) => result instanceof NextResponse,
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/services/lore-submission-service', () => {
  const actual = jest.requireActual('@/lib/services/lore-submission-service');
  return {
    ...actual,
    loreSubmissionService: {
      createSubmission: jest.fn(),
      listForSubmitter: jest.fn(),
      getForViewer: jest.fn(),
      reviseSubmission: jest.fn(),
      listAdmin: jest.fn(),
      getAdminDetail: jest.fn(),
      updateCuration: jest.fn(),
      reviewSubmission: jest.fn(),
      publishSubmission: jest.fn(),
      canonizeSubmission: jest.fn(),
      decanonizeSubmission: jest.fn(),
      unpublishSubmission: jest.fn(),
    },
  };
});

const routeContext = (submissionId = 'sub-1') => ({
  params: Promise.resolve({ submissionId }),
});

const jsonRequest = (url: string, method: string, body?: unknown, ip = '203.0.113.10') => new NextRequest(url, {
  method,
  headers: {
    'Content-Type': 'application/json',
    'x-forwarded-for': ip,
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});

type AdminPostHandler = (
  request: NextRequest,
  context: ReturnType<typeof routeContext>,
) => Promise<Response>;

type NoteActionMethod = 'publishSubmission' | 'canonizeSubmission' | 'decanonizeSubmission' | 'unpublishSubmission';

const noteActionRoutes: Array<{
  label: string;
  handler: AdminPostHandler;
  path: string;
  serviceMethod: NoteActionMethod;
}> = [
  {
    label: 'publishes exceptional submitted community lore',
    handler: ADMIN_PUBLISH,
    path: 'publish',
    serviceMethod: 'publishSubmission',
  },
  {
    label: 'canonizes public lore',
    handler: ADMIN_CANONIZE,
    path: 'canonize',
    serviceMethod: 'canonizeSubmission',
  },
  {
    label: 'decanonizes canon lore',
    handler: ADMIN_DECANONIZE,
    path: 'decanonize',
    serviceMethod: 'decanonizeSubmission',
  },
  {
    label: 'unpublishes public lore',
    handler: ADMIN_UNPUBLISH,
    path: 'unpublish',
    serviceMethod: 'unpublishSubmission',
  },
];

describe('lore submission API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.Mock).mockResolvedValue({ address: '0xUser' });
    (requireAdmin as jest.Mock).mockResolvedValue({ address: '0xAdmin' });
  });

  it('requires auth and creates auto-public community submissions through the workflow service', async () => {
    (loreSubmissionService.createSubmission as jest.Mock).mockResolvedValueOnce({ submission: { id: 'sub-1' } });
    const body = { tokenId: '42' };

    const response = await COMMUNITY_POST(jsonRequest('http://localhost/api/lore/submissions', 'POST', body));

    expect(response.status).toBe(201);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(loreSubmissionService.createSubmission).toHaveBeenCalledWith(body, '0xUser');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { submission: { id: 'sub-1' } },
    });
  });

  it('returns auth errors before community service calls', async () => {
    (requireAuth as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'nope' }, { status: 401 }));

    const response = await COMMUNITY_GET(new NextRequest('http://localhost/api/lore/submissions'));

    expect(response.status).toBe(401);
    expect(loreSubmissionService.listForSubmitter).not.toHaveBeenCalled();
  });

  it('maps validation errors from community submission routes', async () => {
    (loreSubmissionService.reviseSubmission as jest.Mock).mockRejectedValueOnce(
      new LoreSubmissionValidationError('Invalid lore submission', ['title: Too small']),
    );

    const response = await COMMUNITY_DETAIL_PATCH(
      jsonRequest('http://localhost/api/lore/submissions/sub-1', 'PATCH', { title: 'No' }, '203.0.113.11'),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid lore submission',
      details: ['title: Too small'],
    });
  });

  it('allows submitter or admin detail lookup through community detail route', async () => {
    (loreSubmissionService.getForViewer as jest.Mock).mockResolvedValueOnce({ submission: { id: 'sub-1' } });

    const response = await COMMUNITY_DETAIL_GET(
      new NextRequest('http://localhost/api/lore/submissions/sub-1'),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreSubmissionService.getForViewer).toHaveBeenCalledWith('sub-1', '0xUser');
  });

  it('requires admin for queue and passes pagination filters', async () => {
    (loreSubmissionService.listAdmin as jest.Mock).mockResolvedValueOnce({ submissions: [], total: 0, page: 2, perPage: 10 });

    const response = await ADMIN_GET(new NextRequest(
      'http://localhost/api/admin/lore/submissions?status=submitted&page=2&perPage=10&query=bell',
    ));

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(loreSubmissionService.listAdmin).toHaveBeenCalledWith({
      status: 'submitted',
      submitter: undefined,
      query: 'bell',
      page: 2,
      perPage: 10,
    });
  });

  it('saves admin curation with the admin wallet', async () => {
    (loreSubmissionService.updateCuration as jest.Mock).mockResolvedValueOnce({ submission: { id: 'sub-1' } });
    const body = { curatedTitle: 'Curated Bell' };

    const response = await ADMIN_PATCH(
      jsonRequest('http://localhost/api/admin/lore/submissions/sub-1', 'PATCH', body),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreSubmissionService.updateCuration).toHaveBeenCalledWith('sub-1', body, '0xAdmin');
  });

  it.each(noteActionRoutes)('$label through the workflow service', async ({ handler, path, serviceMethod }) => {
    (loreSubmissionService[serviceMethod] as jest.Mock).mockResolvedValueOnce({
      submission: { id: 'sub-1', published_slug: 'bell-glow-witness' },
    });

    const response = await handler(
      jsonRequest(`http://localhost/api/admin/lore/submissions/sub-1/${path}`, 'POST', { note: '  ship it  ' }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(loreSubmissionService[serviceMethod]).toHaveBeenCalledWith('sub-1', '0xAdmin', 'ship it');
    expect(revalidatePath).toHaveBeenCalledWith('/lore');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/events/bell-glow-witness');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/community/bell-glow-witness');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { submission: { id: 'sub-1', published_slug: 'bell-glow-witness' } },
    });
  });

  it('keeps successful public-affecting mutations successful when revalidation fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (loreSubmissionService.publishSubmission as jest.Mock).mockResolvedValueOnce({ submission: { id: 'sub-1' } });
    (revalidatePath as jest.Mock).mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });

    const response = await ADMIN_PUBLISH(
      jsonRequest('http://localhost/api/admin/lore/submissions/sub-1/publish', 'POST', { note: 'ship it' }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(loreSubmissionService.publishSubmission).toHaveBeenCalledWith('sub-1', '0xAdmin', 'ship it');
    expect(warnSpy).toHaveBeenCalledWith('Failed to revalidate effective lore routes:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('routes admin review actions through the workflow service and revalidates effective lore', async () => {
    (loreSubmissionService.reviewSubmission as jest.Mock).mockResolvedValueOnce({
      submission: { id: 'sub-1', published_slug: 'bell-glow-witness' },
    });
    const body = { action: 'request_changes', note: 'Please add source context.' };

    const response = await ADMIN_REVIEW(
      jsonRequest('http://localhost/api/admin/lore/submissions/sub-1/review', 'POST', body),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(loreSubmissionService.reviewSubmission).toHaveBeenCalledWith('sub-1', body, '0xAdmin');
    expect(revalidatePath).toHaveBeenCalledWith('/lore');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/events/bell-glow-witness');
    expect(revalidatePath).toHaveBeenCalledWith('/lore/community/bell-glow-witness');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { submission: { id: 'sub-1', published_slug: 'bell-glow-witness' } },
    });
  });

  it('returns admin auth errors before helper-backed action service calls', async () => {
    (requireAdmin as jest.Mock).mockResolvedValueOnce(NextResponse.json({ error: 'nope' }, { status: 403 }));

    const response = await ADMIN_CANONIZE(
      jsonRequest('http://localhost/api/admin/lore/submissions/sub-1/canonize', 'POST', { note: 'canon' }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(loreSubmissionService.canonizeSubmission).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('maps stale helper-backed action transitions to conflicts', async () => {
    (loreSubmissionService.publishSubmission as jest.Mock).mockRejectedValueOnce(
      new LoreSubmissionConflictError('Only submitted lore can be published'),
    );

    const response = await ADMIN_PUBLISH(
      jsonRequest('http://localhost/api/admin/lore/submissions/sub-1/publish', 'POST', { note: 'ship it' }),
      routeContext(),
    );

    expect(response.status).toBe(409);
    expect(loreSubmissionService.publishSubmission).toHaveBeenCalledWith('sub-1', '0xAdmin', 'ship it');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
