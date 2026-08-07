import { LoreSubmissionRepository } from '@/lib/repositories/lore-submission-repository';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { CreateLoreSubmissionInput } from '@/types/lore-submission';

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: jest.fn(),
}));

const row = {
  id: 'sub-1',
  submitter_address: '0xabcdef0000000000000000000000000000000001',
  token_id: '42',
  title: 'A Fallen Bell Rings',
  summary: 'A community account of a strange bell echoing after the searing.',
  body_markdown: 'A bell rang beneath the ash.',
  tags: null,
  curated_title: null,
  curated_summary: null,
  curated_body_markdown: null,
  curated_tags: null,
  season_id: null,
  character_ids: null,
  location_ids: null,
  status: 'submitted',
  review_note: null,
  status_reason: null,
  last_admin_address: null,
  published_slug: null,
  visibility: 'pending',
  published_kind: null,
  canon_status: 'community',
  canon_stage_id: 'community_recorded',
  canon_note: null,
  canon_path: null,
  publication_snapshot: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
  submitted_at: '2026-05-09T00:00:00.000Z',
  reviewed_at: null,
  published_at: null,
  canonized_at: null,
  closed_at: null,
};

const linkRow = {
  id: 'link-1',
  submission_id: 'sub-1',
  role: 'source_media',
  link_type: 'youtube',
  original_url: 'https://www.youtube.com/watch?v=bell',
  normalized_url: 'https://youtube.com/watch?v=bell',
  display_title: 'Bell video',
  platform: 'youtube',
  author: null,
  published_at: null,
  archived_url: null,
  attribution: null,
  preservation_note: null,
  metadata: { youtubeVideoId: 'bell' },
  sort_order: 0,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const reviewRow = {
  id: 'review-1',
  submission_id: 'sub-1',
  actor_address: row.submitter_address,
  action: 'submit',
  from_status: null,
  to_status: 'submitted',
  note: null,
  created_at: '2026-05-09T00:00:00.000Z',
};

const createInput: CreateLoreSubmissionInput = {
  tokenId: '42',
  title: row.title,
  summary: row.summary,
  bodyMarkdown: row.body_markdown,
  tags: ['bell'],
  characterIds: ['character-42'],
  locationIds: ['ash-pit'],
  links: [{
    role: 'source_media',
    linkType: 'youtube',
    originalUrl: 'https://www.youtube.com/watch?v=bell',
    normalizedUrl: 'https://youtube.com/watch?v=bell',
    displayTitle: 'Bell video',
    platform: 'youtube',
    metadata: { youtubeVideoId: 'bell' },
  }],
};

function mockDetailFrom(submission = row, links = [linkRow], reviews = [reviewRow]) {
  return jest.fn((table: string) => {
    if (table === 'lore_submissions') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: submission, error: null })),
          })),
        })),
      };
    }

    if (table === 'lore_submission_links') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              order: jest.fn(async () => ({ data: links, error: null })),
            })),
          })),
        })),
      };
    }

    if (table === 'lore_submission_reviews') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(async () => ({ data: reviews, error: null })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe('LoreSubmissionRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps nullable database arrays to stable submission DTO arrays', async () => {
    const maybeSingle = jest.fn(async () => ({ data: row, error: null }));
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });

    const repository = new LoreSubmissionRepository();
    const submission = await repository.findById('sub-1');

    expect(from).toHaveBeenCalledWith('lore_submissions');
    expect(eq).toHaveBeenCalledWith('id', 'sub-1');
    expect(submission).toMatchObject({
      id: 'sub-1',
      tags: [],
      character_ids: [],
      location_ids: [],
      canon_path: [],
    });
  });

  it('throws explicit repository errors when Supabase returns an error', async () => {
    const maybeSingle = jest.fn(async () => ({ data: null, error: { message: 'db down' } }));
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.findById('sub-1')).rejects.toThrow('Failed to fetch lore submission: db down');
  });

  // These tests lock the TypeScript repository boundary around transactional RPCs.
  // Full rollback inspection needs a live Supabase/Postgres harness, which this local unit suite does not provide.
  it('creates submissions through a single transactional RPC before reading detail', async () => {
    const rpc = jest.fn(async () => ({ data: 'sub-1', error: null }));
    const from = mockDetailFrom();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();
    const detail = await repository.createSubmission(createInput, row.submitter_address);

    expect(rpc).toHaveBeenCalledWith('create_lore_submission_with_links_and_review', expect.objectContaining({
      p_submitter_address: row.submitter_address,
      p_token_id: '42',
      p_title: row.title,
      p_links: [expect.objectContaining({ normalized_url: 'https://youtube.com/watch?v=bell' })],
    }));
    expect(detail.submission.id).toBe('sub-1');
    expect(detail.links).toHaveLength(1);
    expect(detail.reviews).toHaveLength(1);
  });

  it('creates and publishes submissions through a single transactional RPC before reading detail', async () => {
    const rpc = jest.fn(async () => ({ data: 'sub-1', error: null }));
    const from = mockDetailFrom();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();
    const detail = await repository.createPublishedSubmission(createInput, row.submitter_address, {
      submissionId: '00000000-0000-4000-8000-000000000001',
      publishedSlug: 'a-fallen-bell-rings',
      publishedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(rpc).toHaveBeenCalledWith('create_lore_submission_with_links_review_and_publication', expect.objectContaining({
      p_submission_id: '00000000-0000-4000-8000-000000000001',
      p_submitter_address: row.submitter_address,
      p_token_id: '42',
      p_title: row.title,
      p_links: [expect.objectContaining({ normalized_url: 'https://youtube.com/watch?v=bell' })],
      p_published_slug: 'a-fallen-bell-rings',
      p_published_at: '2026-05-10T00:00:00.000Z',
    }));
    expect(detail.submission.id).toBe('sub-1');
  });

  it('does not attempt follow-up reads when atomic create+publish RPC fails', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'publish review insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.createPublishedSubmission(createInput, row.submitter_address, {
      submissionId: '00000000-0000-4000-8000-000000000001',
      publishedSlug: 'a-fallen-bell-rings',
      publishedAt: '2026-05-10T00:00:00.000Z',
    })).rejects.toThrow('Failed to create and publish lore submission: publish review insert failed');
    expect(from).not.toHaveBeenCalled();
  });

  it('does not attempt separate table writes when create RPC fails', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'link insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.createSubmission(createInput, row.submitter_address))
      .rejects.toThrow('Failed to create lore submission: link insert failed');
    expect(from).not.toHaveBeenCalled();
  });

  it('does not attempt follow-up reads when revise RPC fails', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'replacement link insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.reviseSubmission('sub-1', createInput, row.submitter_address))
      .rejects.toThrow('Failed to revise lore submission: replacement link insert failed');
    expect(rpc).toHaveBeenCalledWith('revise_lore_submission_with_links_and_review', expect.objectContaining({
      p_submission_id: 'sub-1',
      p_actor_address: row.submitter_address,
      p_links: [expect.objectContaining({ normalized_url: 'https://youtube.com/watch?v=bell' })],
    }));
    expect(from).not.toHaveBeenCalled();
  });

  it('revises and publishes submissions through a single transactional RPC before reading detail', async () => {
    const rpc = jest.fn(async () => ({ data: 'sub-1', error: null }));
    const from = mockDetailFrom();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();
    const detail = await repository.revisePublishedSubmission('sub-1', createInput, row.submitter_address, {
      publishedSlug: 'a-fallen-bell-rings',
      publishedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(rpc).toHaveBeenCalledWith('revise_lore_submission_with_links_review_and_publication', expect.objectContaining({
      p_submission_id: 'sub-1',
      p_actor_address: row.submitter_address,
      p_token_id: '42',
      p_links: [expect.objectContaining({ normalized_url: 'https://youtube.com/watch?v=bell' })],
      p_published_slug: 'a-fallen-bell-rings',
      p_published_at: '2026-05-10T00:00:00.000Z',
    }));
    expect(detail?.submission.id).toBe('sub-1');
  });

  it('does not attempt follow-up reads when atomic revise+publish RPC fails', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'replacement link insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.revisePublishedSubmission('sub-1', createInput, row.submitter_address, {
      publishedSlug: 'a-fallen-bell-rings',
      publishedAt: '2026-05-10T00:00:00.000Z',
    })).rejects.toThrow('Failed to revise and publish lore submission: replacement link insert failed');
    expect(from).not.toHaveBeenCalled();
  });

  it('does not attempt follow-up reads when transition RPC fails before review commit', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'review insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.updateStatusConditional(
      'sub-1',
      ['submitted'],
      { status: 'public', visibility: 'public' },
      { actorAddress: row.submitter_address, action: 'publish', note: null },
    )).rejects.toThrow('Failed to update lore submission status: review insert failed');
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null for stale conditional transitions without review side effects', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: null }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();
    const result = await repository.updateStatusConditional(
      'sub-1',
      ['submitted'],
      { status: 'public', visibility: 'public' },
      { actorAddress: row.submitter_address, action: 'publish', note: null },
    );

    expect(result).toBeNull();
    expect(rpc).toHaveBeenCalledWith('transition_lore_submission_with_review', expect.objectContaining({
      p_submission_id: 'sub-1',
      p_expected_statuses: ['submitted'],
      p_actor_address: row.submitter_address,
      p_action: 'publish',
    }));
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces curation transaction failures without follow-up detail reads', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'review insert failed' } }));
    const from = jest.fn();
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ rpc, from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.updateCuration('sub-1', { curated_title: 'Curated Bell' }, row.submitter_address))
      .rejects.toThrow('Failed to update lore submission curation: review insert failed');
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON canon paths before exposing DTOs', async () => {
    const maybeSingle = jest.fn(async () => ({ data: { ...row, canon_path: [{ stageId: 'not-real', status: 'current' }] }, error: null }));
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.findById('sub-1')).rejects.toThrow('Invalid lore submission canon_path[0].stageId');
  });

  it('rejects malformed link metadata before exposing DTOs', async () => {
    const firstOrder = jest.fn(() => ({
      order: jest.fn(async () => ({ data: [{ ...linkRow, metadata: [] }], error: null })),
    }));
    const eq = jest.fn(() => ({ order: firstOrder }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });

    const repository = new LoreSubmissionRepository();

    await expect(repository.listLinks('sub-1')).rejects.toThrow('Invalid lore submission link metadata');
  });
});
