-- Transactional helper for appending an ordered batch of location-room transcript messages.
-- The repository uses this for multi-message public publishes so retry/dedupe behavior
-- matches appendMessage() while Postgres owns all-or-nothing writes.

create or replace function append_location_room_messages_batch(
  p_messages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message jsonb;
  v_ordinal integer;
  v_room_id_text text;
  v_location_id text;
  v_tick_id_text text;
  v_author_kind text;
  v_author_name text;
  v_content text;
  v_visibility text;
  v_room_id uuid;
  v_tick_id uuid;
  v_token_id integer;
  v_official_agent_id text;
  v_metadata jsonb;
  v_dedupe_key text;
  v_row eliza_location_room_messages%rowtype;
  v_results jsonb := '[]'::jsonb;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    raise exception 'append_location_room_messages_batch requires a JSON array';
  end if;

  for v_message, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(p_messages) with ordinality
  loop
    if jsonb_typeof(v_message) <> 'object' then
      raise exception 'Message at position % must be a JSON object', v_ordinal;
    end if;

    v_room_id_text := coalesce(v_message->>'room_id', v_message->>'roomId');
    v_location_id := coalesce(v_message->>'location_id', v_message->>'locationId');
    v_tick_id_text := nullif(btrim(coalesce(v_message->>'tick_id', v_message->>'tickId', '')), '');
    v_author_kind := coalesce(v_message->>'author_kind', v_message->>'authorKind');
    v_author_name := coalesce(v_message->>'author_name', v_message->>'authorName');
    v_content := v_message->>'content';
    v_visibility := coalesce(nullif(btrim(v_message->>'visibility'), ''), 'public');
    v_official_agent_id := nullif(btrim(coalesce(v_message->>'official_agent_id', v_message->>'officialAgentId', '')), '');
    v_dedupe_key := nullif(btrim(coalesce(v_message->>'dedupeKey', v_message->>'dedupe_key', '')), '');

    if v_room_id_text is null or btrim(v_room_id_text) = '' then
      raise exception 'Message at position % is missing room_id', v_ordinal;
    end if;
    if v_location_id is null or btrim(v_location_id) = '' then
      raise exception 'Message at position % is missing location_id', v_ordinal;
    end if;
    if v_author_kind is null or btrim(v_author_kind) = '' then
      raise exception 'Message at position % is missing author_kind', v_ordinal;
    end if;
    if v_author_name is null or btrim(v_author_name) = '' then
      raise exception 'Message at position % is missing author_name', v_ordinal;
    end if;
    if v_content is null or btrim(v_content) = '' then
      raise exception 'Message at position % is missing content', v_ordinal;
    end if;

    v_room_id := v_room_id_text::uuid;
    v_tick_id := case when v_tick_id_text is null then null else v_tick_id_text::uuid end;
    v_token_id := case
      when v_message ? 'token_id' and jsonb_typeof(v_message->'token_id') <> 'null' then (v_message->>'token_id')::integer
      when v_message ? 'tokenId' and jsonb_typeof(v_message->'tokenId') <> 'null' then (v_message->>'tokenId')::integer
      else null
    end;

    v_metadata := coalesce(v_message->'metadata', '{}'::jsonb);
    if jsonb_typeof(v_metadata) <> 'object' then
      raise exception 'Message at position % metadata must be a JSON object', v_ordinal;
    end if;

    if v_dedupe_key is not null then
      v_metadata := v_metadata || jsonb_build_object('dedupeKey', v_dedupe_key);
    else
      v_metadata := v_metadata - 'dedupeKey';
    end if;

    if v_tick_id is not null and v_visibility = 'public' then
      if v_dedupe_key is not null then
        select *
          into v_row
          from eliza_location_room_messages
         where room_id = v_room_id
           and tick_id = v_tick_id
           and visibility = v_visibility
           and author_kind = v_author_kind
           and metadata->>'dedupeKey' = v_dedupe_key
         order by sequence asc
         limit 1;
      else
        select *
          into v_row
          from eliza_location_room_messages
         where room_id = v_room_id
           and tick_id = v_tick_id
           and visibility = v_visibility
           and author_kind = v_author_kind
           and coalesce(metadata->>'dedupeKey', '') = ''
         order by sequence asc
         limit 1;
      end if;

      if found then
        v_results := v_results || jsonb_build_array(to_jsonb(v_row));
        continue;
      end if;
    end if;

    begin
      insert into eliza_location_room_messages (
        room_id,
        location_id,
        tick_id,
        visibility,
        author_kind,
        token_id,
        official_agent_id,
        author_name,
        content,
        metadata
      ) values (
        v_room_id,
        v_location_id,
        v_tick_id,
        v_visibility,
        v_author_kind,
        v_token_id,
        v_official_agent_id,
        v_author_name,
        v_content,
        v_metadata
      )
      returning * into v_row;
    exception when unique_violation then
      if v_tick_id is null or v_visibility <> 'public' then
        raise;
      end if;

      if v_dedupe_key is not null then
        select *
          into v_row
          from eliza_location_room_messages
         where room_id = v_room_id
           and tick_id = v_tick_id
           and visibility = v_visibility
           and author_kind = v_author_kind
           and metadata->>'dedupeKey' = v_dedupe_key
         order by sequence asc
         limit 1;
      else
        select *
          into v_row
          from eliza_location_room_messages
         where room_id = v_room_id
           and tick_id = v_tick_id
           and visibility = v_visibility
           and author_kind = v_author_kind
           and coalesce(metadata->>'dedupeKey', '') = ''
         order by sequence asc
         limit 1;
      end if;

      if not found then
        raise;
      end if;
    end;

    v_results := v_results || jsonb_build_array(to_jsonb(v_row));
  end loop;

  return v_results;
end;
$$;

revoke all on function append_location_room_messages_batch(jsonb) from public;
grant execute on function append_location_room_messages_batch(jsonb) to service_role;
