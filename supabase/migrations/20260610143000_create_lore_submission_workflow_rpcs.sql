-- Transactional workflow boundaries for community lore submissions.
-- Each PL/pgSQL function runs atomically in PostgreSQL: any insert/update/review/link
-- failure rolls back all writes made by that function call.

CREATE OR REPLACE FUNCTION create_lore_submission_with_links_and_review(
  p_submitter_address TEXT,
  p_token_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_body_markdown TEXT,
  p_tags TEXT[],
  p_character_ids TEXT[],
  p_location_ids TEXT[],
  p_links JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id UUID;
  v_links JSONB := COALESCE(p_links, '[]'::JSONB);
BEGIN
  IF jsonb_typeof(v_links) <> 'array' THEN
    RAISE EXCEPTION 'p_links must be a JSON array';
  END IF;

  INSERT INTO lore_submissions (
    submitter_address,
    token_id,
    title,
    summary,
    body_markdown,
    tags,
    character_ids,
    location_ids,
    submitted_at
  ) VALUES (
    p_submitter_address,
    p_token_id,
    p_title,
    p_summary,
    p_body_markdown,
    COALESCE(p_tags, '{}'::TEXT[]),
    COALESCE(p_character_ids, '{}'::TEXT[]),
    COALESCE(p_location_ids, '{}'::TEXT[]),
    NOW()
  )
  RETURNING id INTO v_submission_id;

  INSERT INTO lore_submission_links (
    submission_id,
    role,
    link_type,
    original_url,
    normalized_url,
    display_title,
    platform,
    archived_url,
    attribution,
    metadata,
    sort_order
  )
  SELECT
    v_submission_id,
    link.role,
    link.link_type,
    link.original_url,
    link.normalized_url,
    link.display_title,
    link.platform,
    link.archived_url,
    link.attribution,
    COALESCE(link.metadata, '{}'::JSONB),
    COALESCE(link.sort_order, 0)
  FROM jsonb_to_recordset(v_links) AS link(
    role TEXT,
    link_type TEXT,
    original_url TEXT,
    normalized_url TEXT,
    display_title TEXT,
    platform TEXT,
    archived_url TEXT,
    attribution TEXT,
    metadata JSONB,
    sort_order INTEGER
  );

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  ) VALUES (
    v_submission_id,
    p_submitter_address,
    'submit',
    NULL,
    'submitted',
    NULL
  );

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION revise_lore_submission_with_links_and_review(
  p_submission_id UUID,
  p_actor_address TEXT,
  p_token_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_body_markdown TEXT,
  p_tags TEXT[],
  p_character_ids TEXT[],
  p_location_ids TEXT[],
  p_links JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id UUID;
  v_links JSONB := COALESCE(p_links, '[]'::JSONB);
BEGIN
  IF jsonb_typeof(v_links) <> 'array' THEN
    RAISE EXCEPTION 'p_links must be a JSON array';
  END IF;

  UPDATE lore_submissions
  SET
    title = p_title,
    summary = p_summary,
    body_markdown = p_body_markdown,
    tags = COALESCE(p_tags, '{}'::TEXT[]),
    character_ids = COALESCE(p_character_ids, '{}'::TEXT[]),
    location_ids = COALESCE(p_location_ids, '{}'::TEXT[]),
    status = 'submitted',
    visibility = 'pending',
    review_note = NULL,
    status_reason = NULL,
    submitted_at = NOW()
  WHERE id = p_submission_id
    AND status = 'changes_requested'
    AND submitter_address = p_actor_address
    AND token_id = p_token_id
  RETURNING id INTO v_submission_id;

  IF v_submission_id IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM lore_submission_links
  WHERE submission_id = v_submission_id;

  INSERT INTO lore_submission_links (
    submission_id,
    role,
    link_type,
    original_url,
    normalized_url,
    display_title,
    platform,
    archived_url,
    attribution,
    metadata,
    sort_order
  )
  SELECT
    v_submission_id,
    link.role,
    link.link_type,
    link.original_url,
    link.normalized_url,
    link.display_title,
    link.platform,
    link.archived_url,
    link.attribution,
    COALESCE(link.metadata, '{}'::JSONB),
    COALESCE(link.sort_order, 0)
  FROM jsonb_to_recordset(v_links) AS link(
    role TEXT,
    link_type TEXT,
    original_url TEXT,
    normalized_url TEXT,
    display_title TEXT,
    platform TEXT,
    archived_url TEXT,
    attribution TEXT,
    metadata JSONB,
    sort_order INTEGER
  );

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  ) VALUES (
    v_submission_id,
    p_actor_address,
    'resubmit',
    'changes_requested',
    'submitted',
    NULL
  );

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_lore_submission_with_links_review_and_publication(
  p_submission_id UUID,
  p_submitter_address TEXT,
  p_token_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_body_markdown TEXT,
  p_tags TEXT[],
  p_character_ids TEXT[],
  p_location_ids TEXT[],
  p_links JSONB DEFAULT '[]'::JSONB,
  p_published_slug TEXT DEFAULT NULL,
  p_published_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id UUID := COALESCE(p_submission_id, gen_random_uuid());
  v_links JSONB := COALESCE(p_links, '[]'::JSONB);
BEGIN
  IF jsonb_typeof(v_links) <> 'array' THEN
    RAISE EXCEPTION 'p_links must be a JSON array';
  END IF;

  INSERT INTO lore_submissions (
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
    v_submission_id,
    p_submitter_address,
    p_token_id,
    p_title,
    p_summary,
    p_body_markdown,
    COALESCE(p_tags, '{}'::TEXT[]),
    COALESCE(p_character_ids, '{}'::TEXT[]),
    COALESCE(p_location_ids, '{}'::TEXT[]),
    'public',
    'public',
    'community',
    p_published_slug,
    'community',
    'community_recorded',
    p_published_at,
    p_published_at
  );

  INSERT INTO lore_submission_links (
    submission_id,
    role,
    link_type,
    original_url,
    normalized_url,
    display_title,
    platform,
    archived_url,
    attribution,
    metadata,
    sort_order
  )
  SELECT
    v_submission_id,
    link.role,
    link.link_type,
    link.original_url,
    link.normalized_url,
    link.display_title,
    link.platform,
    link.archived_url,
    link.attribution,
    COALESCE(link.metadata, '{}'::JSONB),
    COALESCE(link.sort_order, 0)
  FROM jsonb_to_recordset(v_links) AS link(
    role TEXT,
    link_type TEXT,
    original_url TEXT,
    normalized_url TEXT,
    display_title TEXT,
    platform TEXT,
    archived_url TEXT,
    attribution TEXT,
    metadata JSONB,
    sort_order INTEGER
  );

  UPDATE lore_submissions
  SET publication_snapshot = jsonb_build_object(
    'title', title,
    'summary', summary,
    'bodyMarkdown', body_markdown,
    'tags', tags,
    'seasonId', season_id,
    'characterIds', character_ids,
    'locationIds', location_ids,
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'role', role,
        'linkType', link_type,
        'originalUrl', original_url,
        'normalizedUrl', normalized_url,
        'displayTitle', display_title,
        'platform', platform,
        'archivedUrl', archived_url,
        'attribution', attribution,
        'metadata', metadata,
        'sortOrder', sort_order
      ) ORDER BY sort_order ASC, created_at ASC)
      FROM lore_submission_links
      WHERE submission_id = v_submission_id
    ), '[]'::JSONB),
    'capturedAt', p_published_at
  )
  WHERE id = v_submission_id;

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  ) VALUES
    (v_submission_id, p_submitter_address, 'submit', NULL, 'submitted', NULL),
    (v_submission_id, p_submitter_address, 'publish', 'submitted', 'public', NULL);

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION revise_lore_submission_with_links_review_and_publication(
  p_submission_id UUID,
  p_actor_address TEXT,
  p_token_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_body_markdown TEXT,
  p_tags TEXT[],
  p_character_ids TEXT[],
  p_location_ids TEXT[],
  p_links JSONB DEFAULT '[]'::JSONB,
  p_published_slug TEXT DEFAULT NULL,
  p_published_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id UUID;
  v_links JSONB := COALESCE(p_links, '[]'::JSONB);
BEGIN
  IF jsonb_typeof(v_links) <> 'array' THEN
    RAISE EXCEPTION 'p_links must be a JSON array';
  END IF;

  UPDATE lore_submissions
  SET
    title = p_title,
    summary = p_summary,
    body_markdown = p_body_markdown,
    tags = COALESCE(p_tags, '{}'::TEXT[]),
    character_ids = COALESCE(p_character_ids, '{}'::TEXT[]),
    location_ids = COALESCE(p_location_ids, '{}'::TEXT[]),
    status = 'public',
    visibility = 'public',
    published_kind = 'community',
    published_slug = p_published_slug,
    canon_status = 'community',
    canon_stage_id = 'community_recorded',
    review_note = NULL,
    status_reason = NULL,
    last_admin_address = NULL,
    reviewed_at = NULL,
    submitted_at = p_published_at,
    published_at = p_published_at
  WHERE id = p_submission_id
    AND status = 'changes_requested'
    AND submitter_address = p_actor_address
    AND token_id = p_token_id
  RETURNING id INTO v_submission_id;

  IF v_submission_id IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM lore_submission_links
  WHERE submission_id = v_submission_id;

  INSERT INTO lore_submission_links (
    submission_id,
    role,
    link_type,
    original_url,
    normalized_url,
    display_title,
    platform,
    archived_url,
    attribution,
    metadata,
    sort_order
  )
  SELECT
    v_submission_id,
    link.role,
    link.link_type,
    link.original_url,
    link.normalized_url,
    link.display_title,
    link.platform,
    link.archived_url,
    link.attribution,
    COALESCE(link.metadata, '{}'::JSONB),
    COALESCE(link.sort_order, 0)
  FROM jsonb_to_recordset(v_links) AS link(
    role TEXT,
    link_type TEXT,
    original_url TEXT,
    normalized_url TEXT,
    display_title TEXT,
    platform TEXT,
    archived_url TEXT,
    attribution TEXT,
    metadata JSONB,
    sort_order INTEGER
  );

  UPDATE lore_submissions
  SET publication_snapshot = jsonb_build_object(
    'title', COALESCE(curated_title, title),
    'summary', COALESCE(curated_summary, summary),
    'bodyMarkdown', COALESCE(curated_body_markdown, body_markdown),
    'tags', COALESCE(curated_tags, tags),
    'seasonId', season_id,
    'characterIds', character_ids,
    'locationIds', location_ids,
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'role', role,
        'linkType', link_type,
        'originalUrl', original_url,
        'normalizedUrl', normalized_url,
        'displayTitle', display_title,
        'platform', platform,
        'archivedUrl', archived_url,
        'attribution', attribution,
        'metadata', metadata,
        'sortOrder', sort_order
      ) ORDER BY sort_order ASC, created_at ASC)
      FROM lore_submission_links
      WHERE submission_id = v_submission_id
    ), '[]'::JSONB),
    'capturedAt', p_published_at
  )
  WHERE id = v_submission_id;

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  ) VALUES
    (v_submission_id, p_actor_address, 'resubmit', 'changes_requested', 'submitted', NULL),
    (v_submission_id, p_actor_address, 'publish', 'submitted', 'public', NULL);

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION transition_lore_submission_with_review(
  p_submission_id UUID,
  p_expected_statuses TEXT[],
  p_updates JSONB,
  p_actor_address TEXT,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_status TEXT;
  v_submission_id UUID;
  v_updates JSONB := COALESCE(p_updates, '{}'::JSONB);
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF jsonb_typeof(v_updates) <> 'object' THEN
    RAISE EXCEPTION 'p_updates must be a JSON object';
  END IF;

  SELECT status INTO v_from_status
  FROM lore_submissions
  WHERE id = p_submission_id
    AND status = ANY(p_expected_statuses)
  FOR UPDATE;

  IF v_from_status IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE lore_submissions
  SET
    status = CASE WHEN v_updates ? 'status' THEN v_updates->>'status' ELSE status END,
    review_note = CASE WHEN v_updates ? 'review_note' THEN v_updates->>'review_note' ELSE review_note END,
    status_reason = CASE WHEN v_updates ? 'status_reason' THEN v_updates->>'status_reason' ELSE status_reason END,
    last_admin_address = CASE WHEN v_updates ? 'last_admin_address' THEN v_updates->>'last_admin_address' ELSE last_admin_address END,
    published_slug = CASE WHEN v_updates ? 'published_slug' THEN v_updates->>'published_slug' ELSE published_slug END,
    visibility = CASE WHEN v_updates ? 'visibility' THEN v_updates->>'visibility' ELSE visibility END,
    published_kind = CASE WHEN v_updates ? 'published_kind' THEN v_updates->>'published_kind' ELSE published_kind END,
    canon_status = CASE WHEN v_updates ? 'canon_status' THEN v_updates->>'canon_status' ELSE canon_status END,
    canon_stage_id = CASE WHEN v_updates ? 'canon_stage_id' THEN v_updates->>'canon_stage_id' ELSE canon_stage_id END,
    canon_note = CASE WHEN v_updates ? 'canon_note' THEN v_updates->>'canon_note' ELSE canon_note END,
    canon_path = CASE WHEN v_updates ? 'canon_path' THEN COALESCE(v_updates->'canon_path', '[]'::JSONB) ELSE canon_path END,
    publication_snapshot = CASE WHEN v_updates ? 'publication_snapshot' THEN v_updates->'publication_snapshot' ELSE publication_snapshot END,
    reviewed_at = CASE
      WHEN v_updates ? 'reviewed_at' THEN (v_updates->>'reviewed_at')::TIMESTAMPTZ
      WHEN p_action NOT IN ('submit', 'resubmit') THEN v_now
      ELSE reviewed_at
    END,
    published_at = CASE WHEN v_updates ? 'published_at' THEN (v_updates->>'published_at')::TIMESTAMPTZ ELSE published_at END,
    canonized_at = CASE WHEN v_updates ? 'canonized_at' THEN (v_updates->>'canonized_at')::TIMESTAMPTZ ELSE canonized_at END,
    closed_at = CASE WHEN v_updates ? 'closed_at' THEN (v_updates->>'closed_at')::TIMESTAMPTZ ELSE closed_at END
  WHERE id = p_submission_id
  RETURNING id INTO v_submission_id;

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  )
  SELECT
    id,
    p_actor_address,
    p_action,
    v_from_status,
    status,
    p_note
  FROM lore_submissions
  WHERE id = p_submission_id;

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_lore_submission_curation_with_review(
  p_submission_id UUID,
  p_updates JSONB,
  p_actor_address TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_submission_id UUID;
  v_updates JSONB := COALESCE(p_updates, '{}'::JSONB);
BEGIN
  IF jsonb_typeof(v_updates) <> 'object' THEN
    RAISE EXCEPTION 'p_updates must be a JSON object';
  END IF;

  SELECT status INTO v_status
  FROM lore_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE lore_submissions
  SET
    curated_title = CASE WHEN v_updates ? 'curated_title' THEN v_updates->>'curated_title' ELSE curated_title END,
    curated_summary = CASE WHEN v_updates ? 'curated_summary' THEN v_updates->>'curated_summary' ELSE curated_summary END,
    curated_body_markdown = CASE WHEN v_updates ? 'curated_body_markdown' THEN v_updates->>'curated_body_markdown' ELSE curated_body_markdown END,
    curated_tags = CASE
      WHEN v_updates ? 'curated_tags' AND v_updates->'curated_tags' = 'null'::JSONB THEN NULL
      WHEN v_updates ? 'curated_tags' THEN ARRAY(SELECT jsonb_array_elements_text(v_updates->'curated_tags'))
      ELSE curated_tags
    END,
    season_id = CASE WHEN v_updates ? 'season_id' THEN v_updates->>'season_id' ELSE season_id END,
    character_ids = CASE
      WHEN v_updates ? 'character_ids' THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_updates->'character_ids', '[]'::JSONB)))
      ELSE character_ids
    END,
    location_ids = CASE
      WHEN v_updates ? 'location_ids' THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_updates->'location_ids', '[]'::JSONB)))
      ELSE location_ids
    END,
    canon_note = CASE WHEN v_updates ? 'canon_note' THEN v_updates->>'canon_note' ELSE canon_note END,
    canon_path = CASE WHEN v_updates ? 'canon_path' THEN COALESCE(v_updates->'canon_path', '[]'::JSONB) ELSE canon_path END,
    last_admin_address = p_actor_address,
    reviewed_at = NOW()
  WHERE id = p_submission_id
  RETURNING id INTO v_submission_id;

  INSERT INTO lore_submission_reviews (
    submission_id,
    actor_address,
    action,
    from_status,
    to_status,
    note
  ) VALUES (
    p_submission_id,
    p_actor_address,
    'curate',
    v_status,
    v_status,
    NULL
  );

  RETURN v_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION create_lore_submission_with_links_and_review(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION revise_lore_submission_with_links_and_review(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_lore_submission_with_links_review_and_publication(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION revise_lore_submission_with_links_review_and_publication(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION transition_lore_submission_with_review(UUID, TEXT[], JSONB, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_lore_submission_curation_with_review(UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_lore_submission_with_links_and_review(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION revise_lore_submission_with_links_and_review(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION create_lore_submission_with_links_review_and_publication(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION revise_lore_submission_with_links_review_and_publication(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], JSONB, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION transition_lore_submission_with_review(UUID, TEXT[], JSONB, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_lore_submission_curation_with_review(UUID, JSONB, TEXT) TO service_role;
