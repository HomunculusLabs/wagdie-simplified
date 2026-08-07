/**
 * @jest-environment node
 *
 * Live Postgres/Supabase integration coverage for lore submission workflow RPCs.
 *
 * These tests are skipped unless a migrated database URL is provided via one of:
 * - LORE_RPC_TEST_DATABASE_URL
 * - TEST_DATABASE_URL
 * - DATABASE_URL
 * - SUPABASE_DB_URL
 *
 * Recommended local usage:
 *   LORE_RPC_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
 *     bun run test:lore:rpc
 */

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const databaseUrl = process.env.LORE_RPC_TEST_DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? process.env.SUPABASE_DB_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

const submitter = '0x1111111111111111111111111111111111111111';
const admin = '0x2222222222222222222222222222222222222222';

const validLink = {
  role: 'source_media',
  link_type: 'generic',
  original_url: 'https://example.com/source',
  normalized_url: 'https://example.com/source',
  display_title: 'Source',
  platform: 'web',
  archived_url: null,
  attribution: null,
  metadata: {},
  sort_order: 0,
};

const invalidLink = {
  ...validLink,
  link_type: 'invalid-link-type',
};

async function expectRpcFailure(client: Client, sql: string, values: unknown[]): Promise<void> {
  await client.query('SAVEPOINT lore_rpc_failure');
  try {
    await client.query(sql, values);
    throw new Error('Expected RPC to fail');
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected RPC to fail') {
      await client.query('ROLLBACK TO SAVEPOINT lore_rpc_failure');
      await client.query('RELEASE SAVEPOINT lore_rpc_failure');
      throw error;
    }

    await client.query('ROLLBACK TO SAVEPOINT lore_rpc_failure');
    await client.query('RELEASE SAVEPOINT lore_rpc_failure');
  }
}

async function countRows(client: Client, table: string, column: string, value: string): Promise<number> {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [value]);
  return result.rows[0].count;
}

async function insertSubmission(client: Client, args: {
  id: string;
  tokenId?: string;
  status: 'submitted' | 'changes_requested' | 'public' | 'canonized' | 'closed';
  visibility: 'pending' | 'public' | 'hidden';
  publishedKind?: 'community' | 'official' | null;
  publishedSlug?: string | null;
}): Promise<void> {
  await client.query(
    `INSERT INTO lore_submissions (
      id,
      submitter_address,
      token_id,
      title,
      summary,
      body_markdown,
      tags,
      character_ids,
      location_ids,
      status,
      visibility,
      published_kind,
      published_slug,
      canon_status,
      canon_stage_id,
      submitted_at,
      published_at
    ) VALUES (
      $1::uuid,
      $2,
      $3,
      'Live RPC Test Lore',
      'A live integration test record for lore RPC rollback behavior.',
      'This record exists only inside a rolled-back integration test transaction.',
      ARRAY['test'],
      ARRAY[$4],
      ARRAY['test-location'],
      $5,
      $6,
      $7,
      $8,
      'community',
      'community_recorded',
      NOW(),
      CASE WHEN $5 IN ('public', 'canonized') THEN NOW() ELSE NULL END
    )`,
    [
      args.id,
      submitter,
      args.tokenId ?? '42',
      `character-${args.tokenId ?? '42'}`,
      args.status,
      args.visibility,
      args.publishedKind ?? null,
      args.publishedSlug ?? null,
    ],
  );
}

async function insertLink(client: Client, submissionId: string, normalizedUrl = 'https://example.com/original'): Promise<void> {
  await client.query(
    `INSERT INTO lore_submission_links (
      submission_id,
      role,
      link_type,
      original_url,
      normalized_url,
      display_title,
      platform,
      metadata,
      sort_order
    ) VALUES ($1::uuid, 'source_media', 'generic', $2, $2, 'Original source', 'web', '{}'::jsonb, 0)`,
    [submissionId, normalizedUrl],
  );
}

describeWithDatabase('lore submission workflow RPC rollback integration', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  it('rolls back atomic auto-public create when link insertion fails', async () => {
    const submissionId = randomUUID();

    await expectRpcFailure(
      client,
      `SELECT create_lore_submission_with_links_review_and_publication(
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text[],
        $8::text[],
        $9::text[],
        $10::jsonb,
        $11::text,
        NOW()
      )`,
      [
        submissionId,
        submitter,
        '77',
        'Broken Link Submission',
        'A live integration test record that should be rolled back completely.',
        'The invalid link type should make the RPC fail after the submission insert attempt.',
        ['rollback'],
        ['character-77'],
        ['test-location'],
        JSON.stringify([invalidLink]),
        `rpc-rollback-${submissionId}`,
      ],
    );

    await expect(countRows(client, 'lore_submissions', 'id', submissionId)).resolves.toBe(0);
    await expect(countRows(client, 'lore_submission_links', 'submission_id', submissionId)).resolves.toBe(0);
    await expect(countRows(client, 'lore_submission_reviews', 'submission_id', submissionId)).resolves.toBe(0);
  });

  it('preserves prior submission and links when atomic revise publication fails', async () => {
    const submissionId = randomUUID();
    await insertSubmission(client, {
      id: submissionId,
      tokenId: '78',
      status: 'changes_requested',
      visibility: 'pending',
    });
    await insertLink(client, submissionId, 'https://example.com/original-before-revise');

    await expectRpcFailure(
      client,
      `SELECT revise_lore_submission_with_links_review_and_publication(
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text[],
        $8::text[],
        $9::text[],
        $10::jsonb,
        $11::text,
        NOW()
      )`,
      [
        submissionId,
        submitter,
        '78',
        'Broken Revised Submission',
        'A revised live integration record that should keep previous data on failure.',
        'The invalid replacement link should make the RPC fail after the update/delete attempt.',
        ['rollback'],
        ['character-78'],
        ['test-location'],
        JSON.stringify([invalidLink]),
        `rpc-revise-${submissionId}`,
      ],
    );

    const submission = await client.query(
      `SELECT status, visibility, published_kind FROM lore_submissions WHERE id = $1::uuid`,
      [submissionId],
    );
    expect(submission.rows[0]).toEqual({
      status: 'changes_requested',
      visibility: 'pending',
      published_kind: null,
    });

    const links = await client.query(
      `SELECT normalized_url FROM lore_submission_links WHERE submission_id = $1::uuid ORDER BY sort_order ASC`,
      [submissionId],
    );
    expect(links.rows).toEqual([{ normalized_url: 'https://example.com/original-before-revise' }]);
    await expect(countRows(client, 'lore_submission_reviews', 'submission_id', submissionId)).resolves.toBe(0);
  });

  it('returns null for stale transitions without adding review rows', async () => {
    const submissionId = randomUUID();
    await insertSubmission(client, {
      id: submissionId,
      tokenId: '79',
      status: 'submitted',
      visibility: 'pending',
    });

    const result = await client.query(
      `SELECT transition_lore_submission_with_review(
        $1::uuid,
        ARRAY['public']::text[],
        $2::jsonb,
        $3::text,
        'hide',
        'stale transition'
      ) AS id`,
      [
        submissionId,
        JSON.stringify({ status: 'closed', visibility: 'hidden', published_kind: null }),
        admin,
      ],
    );

    expect(result.rows[0].id).toBeNull();
    await expect(countRows(client, 'lore_submission_reviews', 'submission_id', submissionId)).resolves.toBe(0);
  });

  it('closes public lore without violating published_kind visibility constraints', async () => {
    const submissionId = randomUUID();
    await insertSubmission(client, {
      id: submissionId,
      tokenId: '80',
      status: 'public',
      visibility: 'public',
      publishedKind: 'community',
      publishedSlug: `rpc-public-${submissionId}`,
    });
    await insertLink(client, submissionId);

    const result = await client.query(
      `SELECT transition_lore_submission_with_review(
        $1::uuid,
        ARRAY['public']::text[],
        $2::jsonb,
        $3::text,
        'hide',
        'hide public lore'
      ) AS id`,
      [
        submissionId,
        JSON.stringify({
          status: 'closed',
          visibility: 'hidden',
          published_kind: null,
          closed_at: new Date().toISOString(),
        }),
        admin,
      ],
    );

    expect(result.rows[0].id).toBe(submissionId);

    const submission = await client.query(
      `SELECT status, visibility, published_kind FROM lore_submissions WHERE id = $1::uuid`,
      [submissionId],
    );
    expect(submission.rows[0]).toEqual({
      status: 'closed',
      visibility: 'hidden',
      published_kind: null,
    });

    const reviews = await client.query(
      `SELECT action, from_status, to_status FROM lore_submission_reviews WHERE submission_id = $1::uuid`,
      [submissionId],
    );
    expect(reviews.rows).toEqual([{ action: 'hide', from_status: 'public', to_status: 'closed' }]);
  });
});

if (!databaseUrl) {
  describe('lore submission workflow RPC rollback integration', () => {
    it.skip('set LORE_RPC_TEST_DATABASE_URL to run live Postgres rollback tests', () => undefined);
  });
}
