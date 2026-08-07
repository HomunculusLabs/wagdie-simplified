-- Transactional helper for repairing completed searing current-image rows.
-- Keeps searing_events and wagdie_characters in sync when converting legacy seared
-- image URLs to app-origin /images/characters/current/{id}.png?v=... URLs.

create or replace function repair_seared_current_character_image(
  p_token_id integer,
  p_event_id uuid,
  p_event_seared_image_url text,
  p_event_materialization_metadata jsonb,
  p_character_update jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update searing_events
  set
    seared_image_url = p_event_seared_image_url,
    materialization_metadata = coalesce(p_event_materialization_metadata, '{}'::jsonb)
  where id = p_event_id
    and token_id = p_token_id
    and event_type = 'sear'
    and materialization_status = 'completed';

  if not found then
    raise exception 'Completed searing event % for token % was not found', p_event_id, p_token_id;
  end if;

  update wagdie_characters
  set
    image_url = coalesce(p_character_update->>'image_url', image_url),
    metadata = coalesce(p_character_update->'metadata', metadata),
    original_image_url = coalesce(p_character_update->>'original_image_url', original_image_url),
    original_metadata_sha256 = coalesce(p_character_update->>'original_metadata_sha256', original_metadata_sha256),
    current_image_url = coalesce(p_character_update->>'current_image_url', current_image_url),
    current_image_version = coalesce(p_character_update->>'current_image_version', current_image_version),
    current_image_kind = coalesce(p_character_update->>'current_image_kind', current_image_kind),
    current_image_sha256 = coalesce(p_character_update->>'current_image_sha256', current_image_sha256),
    current_image_storage = coalesce(p_character_update->'current_image_storage', current_image_storage),
    current_image_updated_at = coalesce((p_character_update->>'current_image_updated_at')::timestamptz, current_image_updated_at),
    updated_at = now()
  where token_id = p_token_id;

  if not found then
    raise exception 'Character % was not found', p_token_id;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION repair_seared_current_character_image(integer, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION repair_seared_current_character_image(integer, uuid, text, jsonb, jsonb)
  TO service_role;
