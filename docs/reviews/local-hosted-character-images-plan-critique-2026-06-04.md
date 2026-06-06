# Local-Hosted Character Images Plan — Critique

**Source:** `docs/plans/local-hosted-character-images-2026-06-04.md`
**Compared against:** `prompt-exports/oracle-plan-2026-06-04-063451-current-image-plan-d-4e66.md`
**Date:** 2026-06-04
**Scope:** Plan critique only — not a rewrite.

## 1. Top under-specified seams

1. **`current_image_storage` JSONB shape is never typed.** Item 2 declares the column, Item 6 says "stream from backing storage using DB `current_image_storage`", Item 8 says "backing storage details go into `current_image_storage`" — but no field shape is given. The export defined `{ type: 'public-static' | 'gcs', objectName?, backingUrl?, localPath? }` (export §3.A) and that was dropped. An implementer will invent an ad-hoc shape that Items 6/8/9 then have to retro-fit.
2. **How the current-image route actually reads GCS bytes.** Item 6 says "stream from backing storage" with no answer to: HTTP fetch from `storage.googleapis.com` vs `@google-cloud/storage` SDK? Auth (the current bucket is public per `lib/services/searing-storage.ts:51-91`)? Edge vs Node runtime? Also: Next.js route precedence vs the existing static `public/images/characters/*.png` — the export flagged this explicitly ("Validate route precedence"); the plan does not. The new path uses a `current/` subpath so it should be safe, but the plan should still pin runtime + fetch strategy.
3. **Version-string format.** Item 1 says "version format supports base and seared images, including a hash component." The export pinned concrete formats (`base-{sha16}`, `seared-{tx8}-log{logIndex}-{sha16}`). Without this, Items 4, 6, 8, and 9 cannot agree on the cache-busting key, and the "Completed/cache-safe detection accepts the new app-origin seared URL format" assertion in Item 8 has nothing to match against.

## 2. Specificity balance

**Over-specified (let the implementer own it):**
- Item 4 mandates "Collector seared candidate order matches runtime order where dynamic repair is involved." Under the new contract, the collector preserves originals — whether it should touch seared candidates at all is a tactical call the implementer should make after seeing Item 5/8 land. This is a hold-over from the legacy collector.
- Item 2's column list is fine, but pinning `current_image_kind` enum values (`base | seared | infected | placeholder`) in the plan, then again restating them in `metadata.currentImage.kind`, will create needless friction if the implementer wants a 5th state (e.g. `repair`) during migration.

**Useful framing the export had that the plan dropped:**
- `metadata.currentImage.source` enum (`'verified-local-base' | 'searing-materialization' | 'infection-materialization' | 'repair'`) — a clean provenance audit trail in the export, reduced to a bare `source` field in the plan.
- Animation route stance: export gave a concrete default ("keep original/static behavior unless product wants dynamic previews. Document explicitly."); the plan only files it under Open Questions, leaving Item 7's siblings unguided.
- Migration step "Update character read model with `metadata.originalImage` if absent" during searing materialization (export §3.F.4). The plan's Item 8 says only "preserves original image fields" — silent on populating them when absent, which matters for sears that race ahead of Item 9 backfill (see §3 below).

## 3. Contradictions and missing dependencies

- **Hydration fallback diverges from NFT-route fallback.** Item 7 says NFT metadata "preserves original `image`" when no verified current exists. Item 5 says hydrated top-level `image_url` falls back to **placeholder** when base is unverified. Result: during the verification gap, OpenSea sees the original IPFS image while the in-app character page shows a placeholder. Either both should degrade to original, or this divergence must be called out as intentional.
- **Item 8 vs Item 9 race.** Item 8 deploys searing changes that write `current_image_url` but not `original_image_url` (no rule says "populate originals if absent"). Item 9 is the only step that backfills originals. Any sear between Item 8 deploy and Item 9 run loses the chance to capture the original — exactly the failure mode the whole plan is trying to prevent. Either Item 8 should also seed originals when missing, or the sequence must force Item 9 to run on token X before Item 8 can sear token X.
- **`hasLocalCharacterImage()` semantics swap mid-flight.** Item 4 says it must mean "verified local base image." Item 5 depends on Item 4. But Item 4 also says client-safe generated status "should stay small" — so the generated list might shrink from 6666 entries to a verified subset. Any consumer of `hasLocalCharacterImage` outside the named files (not enumerated) will silently behave differently. Plan should either grep-audit consumers or guarantee the generated module's return type stays boolean-compatible.
- **Item 11 → Item 10 ordering.** Item 11 depends on Item 10, which depends on Item 8. Yet Item 11 also covers "Searing tests expect app-origin current URLs" — those tests should be written *with* Item 8, not parked in a separate phase.

## 4. Over-planning / cut candidates

- **Item 11 (consolidated test pass)** duplicates the per-item "Done when" test asserts. Fold each test concern into its originating item; delete Item 11 as a phase.
- **Item 12 monitoring laundry list.** Six distinct metrics named ("hash mismatches, unverified manifest entries, external app-visible image URLs, …"). Pick one or two leading indicators (e.g. "tokens with `current_image_url` IS NULL", "events with non-app-origin `seared_image_url`") and let ops add the rest reactively.
- **Open Questions §1** (`original_image` vs `originalImage` vs `image_provenance`) is a naming bikeshed. Existing metadata route already returns snake_case attributes — picking `original_image` follows precedent. Decide it now; don't block implementation on it.
- **Item 3 (extract verification primitives)** is justifiable only because Item 9 reuses them. If repair-time hashing can live inline in Item 9, Item 3 collapses into Item 4.

## 5. Questions whose answers would change implementation order

1. **Is the current-image route allowed to fetch GCS at request time, or must seared bytes be mirrored into a public bucket served by CDN?** If mirroring is required, Item 8's storage service must do a second upload and Item 6 simplifies to a redirect/proxy — this is a fundamental Item 6 vs Item 8 swap.
2. **Must seared dynamic attributes (Seared Trait, Seared Token, Concord) appear in the NFT metadata response, or runtime-only?** The plan assumes "yes" in Open Questions but doesn't gate Item 7 on it. If NFT-required, Item 8 must land before Item 7 (currently they share the same dependency level).
3. **During the transition, is the character-page UI allowed to show the original IPFS image, or must it show a placeholder until verified?** Determines whether Item 5 ships standalone or waits for Item 9 backfill on the full token range.
4. **Is OpenSea refresh operator-triggered (current `scripts/refresh-opensea-metadata.ts` model) or automatic per materialization?** If automatic, Item 8 grows a new hook; if operator-only, Item 9 owns the trigger list and Item 12's "marketplace refresh" step becomes the actual gate.
5. **Does the existing `public/images/characters/{id}.png` URL stay served indefinitely for backward compat, or get retired after migration?** If retired, route precedence/redirect logic is needed in Item 6 and a deprecation window appears in Item 12.
