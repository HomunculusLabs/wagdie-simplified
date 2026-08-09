-- Add explicit original/current character image state.
-- This migration is intentionally additive: legacy image_url remains the
-- compatibility alias for the current served image until later backfills/writers
-- populate the new fields.

ALTER TABLE public.wagdie_characters
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS original_image_url TEXT,
  ADD COLUMN IF NOT EXISTS original_metadata_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS current_image_url TEXT,
  ADD COLUMN IF NOT EXISTS current_image_version TEXT,
  ADD COLUMN IF NOT EXISTS current_image_kind TEXT,
  ADD COLUMN IF NOT EXISTS current_image_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS current_image_storage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_image_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wagdie_characters_current_image_kind_check'
      AND conrelid = 'public.wagdie_characters'::regclass
  ) THEN
    ALTER TABLE public.wagdie_characters
      ADD CONSTRAINT wagdie_characters_current_image_kind_check
      CHECK (
        current_image_kind IS NULL OR
        current_image_kind IN ('base', 'seared', 'infected', 'placeholder', 'repair')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wagdie_characters_current_image_kind
  ON public.wagdie_characters (current_image_kind);

CREATE INDEX IF NOT EXISTS idx_wagdie_characters_current_image_updated_at
  ON public.wagdie_characters (current_image_updated_at);

-- Public clients must not read storage internals directly. App-facing image
-- metadata/provenance should flow through sanitized Next.js routes instead.
REVOKE SELECT ON public.wagdie_characters FROM authenticated;
REVOKE SELECT ON public.wagdie_characters FROM anon;

GRANT SELECT (
  token_id,
  name,
  image_url,
  original_image_url,
  original_metadata_sha256,
  current_image_url,
  current_image_version,
  current_image_kind,
  current_image_sha256,
  current_image_updated_at
) ON public.wagdie_characters TO authenticated;

GRANT SELECT (
  token_id,
  name,
  image_url,
  original_image_url,
  original_metadata_sha256,
  current_image_url,
  current_image_version,
  current_image_kind,
  current_image_sha256,
  current_image_updated_at
) ON public.wagdie_characters TO anon;
