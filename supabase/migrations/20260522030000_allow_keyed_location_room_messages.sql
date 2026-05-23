-- Allow gameplay ticks to append multiple retry-safe public messages of the same author kind.
-- Existing narrative/simple ticks remain unkeyed and keep one public message per tick/author kind.

DROP INDEX IF EXISTS idx_eliza_location_room_messages_one_public_gm_per_tick;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_messages_one_unkeyed_public_author_per_tick
  ON eliza_location_room_messages(room_id, tick_id, visibility, author_kind)
  WHERE tick_id IS NOT NULL
    AND visibility = 'public'
    AND COALESCE(metadata->>'dedupeKey', '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_messages_one_keyed_public_author_per_tick
  ON eliza_location_room_messages(room_id, tick_id, visibility, author_kind, (metadata->>'dedupeKey'))
  WHERE tick_id IS NOT NULL
    AND visibility = 'public'
    AND COALESCE(metadata->>'dedupeKey', '') <> '';
