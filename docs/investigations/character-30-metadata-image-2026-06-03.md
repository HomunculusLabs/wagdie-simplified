# Investigation: Character 30 Metadata Image Served Incorrectly

## Summary
Character 30 metadata is served with the wrong image because the NFT metadata API blindly overrides the static metadata `image` with local hosted `/images/characters/30.png?v=metadata-20260509` whenever `public/images/characters/30.png` exists. The local/prod PNG is byte-identical to the deployed hosted asset but differs from the valid IPFS CID image referenced by `public/metadata/characters/30.json`, so the deeper data issue is an incorrect local hosted PNG for token 30.

## Symptoms
- User reports character 30 metadata is being served incorrectly.
- User specifically pointed to `https://fateofwagdie.com/images/characters/30.png`.
- The character should have a different image than the one currently being served.

## Background / Prior Research

### 2026-06-03 - Live production URL check
- `https://fateofwagdie.com/images/characters/30.png` returns `200 OK`, `image/png`, 2,580 bytes, PNG 400x400, `cache-control: public, max-age=14400`, `last-modified: Mon, 18 May 2026 20:15:55 GMT`, and no redirects.
- `https://fateofwagdie.com/api/characters/metadata/30` returns `200 OK` JSON with `name: Royal Guard of Beelzus`, `sheet.tokenIdInt: 30`, and `image: https://fateofwagdie.com/images/characters/30.png?v=metadata-20260509`.
- `https://fateofwagdie.com/metadata/characters/30.json` returns `200 OK` JSON with the same character name/token but `image: https://crimson-static-barnacle-945.mypinata.cloud/ipfs/QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t`.
- The Pinata/IPFS image URL from static JSON returned `403` during the probe.
- `https://fateofwagdie.com/api/characters/30` returns a character record whose `metadata.image` is the same Pinata/IPFS URL from the static JSON.
- Initial conclusion: production has an image-source inconsistency. The API metadata endpoint rewrites `image` to local hosted `/images/characters/30.png`, while the public static JSON and character record metadata still reference the old inaccessible Pinata/IPFS URL.

### 2026-06-03 - Git/import archaeology
- `public/images/characters/30.png` was added in bulk image commit `577a88b4` / duplicate `95473c3d` (`latest`, Nov 28/29 2025); current `30.png` is unique by SHA-256 among `public/images/characters`.
- `public/metadata/characters/30.json` was added in commit `b5b5bb29` / duplicate `75351262` (`fix: serve character assets from local metadata snapshot`, Apr 16 2026). It preserves `image` as the Pinata/IPFS URL at `public/metadata/characters/30.json:3`.
- GCS dump commit `3f3da46e` added `data/gcs-bucket-dump/*`, but the probe found no exact token 30 row in the dump manifest, no `data/gcs-bucket-dump/images/30.png`, and no `data/gcs-bucket-dump/extracted-metadata/30.json`; likely not a token-30 GCS import issue.
- Metadata API route was added by commit `e0bae716` (`feat: add character metadata api route`, May 8 2026), initially reading static JSON as-is.
- Commit `7d4874fb` (`fix: prefer hosted nft images`, May 9 2026) changed the metadata API to override `metadata.image` with `/images/characters/${tokenId}.png?v=metadata-20260509` whenever a local PNG exists. Relevant current refs from probe: `app/api/characters/metadata/[tokenId]/route.ts:30-38` and `app/api/characters/metadata/[tokenId]/route.ts:69-74`.
- Commit `b069f7ee` (`chore: commit remaining workspace changes`, May 19 2026) simplified deletion of `animation_url` but did not change hosted-image override behavior.
- Local manifest says token 30 has `metadata_file: public/metadata/characters/30.json`, `image_file: public/images/characters/30.png`, `image_exists: true`, `image_downloaded: false`, and `image_source_url: null` at `public/metadata/characters/manifest.json:279-284`.
- Initial conclusion: if `/images/characters/30.png` is the wrong image, the production metadata API serves it because of a route-level hosted-image override, not because `30.json` itself points there.

## Investigator Findings
<!-- Pair investigator appends structured findings here. -->

### 2026-06-03 - Route/static/image verification

**1) NFT metadata route overrides token 30 image when local PNG exists.**
- Current route sets `CHARACTER_IMAGES_DIR` to `public/images/characters` (`app/api/characters/metadata/[tokenId]/route.ts:10-11`).
- `getHostedCharacterImageUrl()` checks `public/images/characters/{tokenId}.png` with `access(imagePath)` and, on success, returns `${appOrigin}/images/characters/${tokenId}.png?v=metadata-20260509` (`app/api/characters/metadata/[tokenId]/route.ts:30-38`). This is the hardcoded version query.
- The GET handler reads `public/metadata/characters/{tokenId}.json`, computes `hostedImageUrl`, then spreads `{ image: hostedImageUrl }` over the parsed metadata when present (`app/api/characters/metadata/[tokenId]/route.ts:58-74`). Therefore `/api/characters/metadata/30` can override the static `image` field solely because `public/images/characters/30.png` exists.
- Live recheck confirmed the route behavior: `https://fateofwagdie.com/api/characters/metadata/30` returns `image: https://fateofwagdie.com/images/characters/30.png?v=metadata-20260509`, while `https://fateofwagdie.com/metadata/characters/30.json` returns the Pinata/IPFS image.

**2) Static token 30 metadata and manifest still disagree with the API metadata response.**
- Static metadata identifies token 30 as `Royal Guard of Beelzus` and points `image` to `https://crimson-static-barnacle-945.mypinata.cloud/ipfs/QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t` (`public/metadata/characters/30.json:2-3`). It also embeds `sheet.tokenIdInt: 30` and `tokenId: "30"` (`public/metadata/characters/30.json:19`, `public/metadata/characters/30.json:27`).
- Manifest entry for token 30 maps metadata to `public/metadata/characters/30.json` and image to `public/images/characters/30.png`, with `image_exists: true`, `image_downloaded: false`, `image_source_url: null`, and no error (`public/metadata/characters/manifest.json:279-285`).
- `assets:collect` is wired to `scripts/collect-character-assets.ts` (`package.json:21`). That script writes manifest entries as already-present without downloading when `hadLocalImage && !refreshCurrentImage`, explicitly setting `image_downloaded: false` and `image_source_url: null` (`scripts/collect-character-assets.ts:481-501`). So token 30's manifest means the local PNG was already present for that run; it does not identify the original source of the PNG.

**3) Local hosted PNG does not match the static metadata CID image.**
- Local file evidence: `public/images/characters/30.png` is PNG 400x400, 2,580 bytes, 8-bit colormap/non-interlaced, SHA-256 `36381cce84ef4e1a1e946f7c7445e7f8bd02c237524aff42cb70408baab4f651`, MD5 `68298491e0c4d67be4c1c14c31b5ed4a`. Production `/images/characters/30.png` returns the same 2,580-byte SHA-256.
- The Pinata subdomain URL in `30.json` still returns 403, but alternate gateways for CID `QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t` (`ipfs.io`, `gateway.pinata.cloud`, `dweb.link`) return HTTP 200 `image/png`, 400x400, 8,706 bytes, SHA-256 `c0287811f50aeed87ca1637bf254e0df5ea6df613717059b387fdff14c3fbfcc`.
- Recursive local PNG hash scan found no file with the CID image SHA-256; it found only `public/images/characters/30.png` for the hosted/prod SHA-256. The CID string itself appears only in `public/metadata/characters/30.json:3` plus this investigation doc.
- Conclusion from bytes: the expected/static metadata IPFS image and hosted/local `/images/characters/30.png` are different images, despite both being 400x400 PNGs.

**4) `/api/characters/30` display/image policy differs from NFT metadata API.**
- `/api/characters/[tokenId]` delegates to `handleCharacterGet(tokenId)` (`app/api/characters/[tokenId]/route.ts:14-19`), which calls `getCharacter(tokenId)` and returns that character with no-store headers (`lib/api/handlers/character-update.ts:37-51`).
- Repository `findById` fetches the DB row, normalizes it, and hydrates it through runtime assets (`lib/repositories/character/character-query-repository.ts:430-445`).
- Hydration loads static metadata from the manifest (`lib/services/assets/character-local-assets.ts:28`, `lib/services/assets/character-local-assets.ts:169-212`), merges static metadata with only dynamic remote keys (`lib/services/assets/character-local-assets.ts:31-40`, `lib/services/assets/character-local-assets.ts:100-123`), then sets `image_url` using `getCharacterImageUrl(...)` (`lib/services/assets/character-local-assets.ts:252-270`).
- Runtime image selection prefers infected/seared dynamic images first, then local static asset when known, then fallback (`lib/utils/image.ts:198-221`). `hasLocalCharacterImage(30)` returns true because the missing-image set is empty and token 30 is in range (`lib/data/local-character-asset-status.ts:1-11`).
- Live recheck confirmed the split: `https://fateofwagdie.com/api/characters/30` returns `metadata.image` as the Pinata/IPFS URL from static `30.json`, but returns top-level `image_url: /images/characters/30.png`. In contrast, `/api/characters/metadata/30` mutates the NFT metadata `image` field itself to the hosted PNG URL.

**5) GCS/import scripts and middleware/proxy are unlikely to be the immediate source.**
- The committed GCS dump manifest is for bucket `seared-wagdie-images`, has PNG images only and no JSON metadata (`data/gcs-bucket-dump/manifest.json:1-6`). Repo search found no exact `data/gcs-bucket-dump/images/30.png`, no extracted `30.json`, and no exact token 30 row; matches were similarly named tokens such as `1030`, `1930`, etc.
- `import:gcs` is wired separately (`package.json:17`). The import script can probe `https://storage.googleapis.com/{bucket}/{tokenId}.{ext}` for DB rows (`scripts/import-gcs-images.ts:20-35`, `scripts/import-gcs-images.ts:69-119`), download to `public/images/characters/{tokenId}.{ext}` (`scripts/import-gcs-images.ts:145-157`), and update DB image/metadata (`scripts/import-gcs-images.ts:285-333`). That means a live GCS object for token 30 could theoretically be imported, but the committed dump provides no evidence that this happened for exact token 30.
- The asset collector can also scrape OpenSea cached `seadn.io` candidates (`scripts/collect-character-assets.ts:265-300`), but for token 30 the manifest's already-present branch (`scripts/collect-character-assets.ts:481-501`) means no candidate/source URL was used during that manifest generation.
- Middleware only proxies `/api/*` when `WAGDIE_API_BASE_URL` is configured (`middleware.ts:9-63`), and its matcher excludes `/images` static paths (`middleware.ts:107-121`). It may affect local-dev API calls, but it is not responsible for production `/images/characters/30.png` bytes or for the metadata route's code-level override.

**Conclusion:** The wrong NFT metadata image is served because `/api/characters/metadata/30` intentionally prefers the existing hosted local PNG and overwrites the static metadata `image` field with `/images/characters/30.png?v=metadata-20260509`. The underlying mismatch is that `public/images/characters/30.png` is not the same image as the IPFS CID referenced by `public/metadata/characters/30.json`; the static JSON still points to the CID image, while runtime/display policy and the NFT metadata route prefer the local static asset when present.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** Character 30's metadata route, static metadata JSON, static image asset, image import data, or production cache may map token 30 to the wrong image.
**Findings:** Live checks showed production metadata APIs and static JSON disagree: `/api/characters/metadata/30` returns the hosted local PNG, while `/metadata/characters/30.json` and `/api/characters/30` metadata still reference the Pinata/IPFS CID.
**Evidence:** User-provided URL: `https://fateofwagdie.com/images/characters/30.png`; live production checks in `## Background / Prior Research`.
**Conclusion:** Confirmed image-source mismatch and route-level override as primary hypothesis.

### Phase 2 - Context Builder Assessment
**Hypothesis:** Workspace code/data would identify whether the hosted-image behavior is route-level, display-level, import-script-level, or cache/proxy-level.
**Findings:** Context builder selected the metadata API route, static token 30 metadata, manifest slices, character API hydration path, image utility policy, asset scripts, GCS manifests, middleware, and prior image-source investigations.
**Evidence:** `app/api/characters/metadata/[tokenId]/route.ts` implements a hosted-image override; `public/metadata/characters/30.json` preserves the CID image; `public/metadata/characters/manifest.json` marks token 30 local image as already existing.
**Conclusion:** Confirmed main route/data paths to verify with pair investigator.

### Phase 3 - Pair Investigator Verification
**Hypothesis:** The local hosted PNG is different from the static metadata CID image, and metadata serving behavior follows from route/display policy rather than GCS or middleware.
**Findings:** Pair verified route line refs, token 30 static metadata/manifest line refs, byte-level mismatch between local/prod PNG and IPFS CID image, `/api/characters/30` vs `/api/characters/metadata/30` behavior split, and unlikely GCS/middleware causes.
**Evidence:** Investigator findings above; independent local verification found repo/prod `/images/characters/30.png` are 2,580 bytes with SHA-256 `36381cce84ef4e1a1e946f7c7445e7f8bd02c237524aff42cb70408baab4f651`, while the CID image from `https://ipfs.io/ipfs/QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t` is 8,706 bytes with SHA-256 `c0287811f50aeed87ca1637bf254e0df5ea6df613717059b387fdff14c3fbfcc`.
**Conclusion:** Confirmed the hosted local asset is not the static metadata image.

### Phase 4 - Oracle Synthesis
**Hypothesis:** Remaining alternatives were static JSON directly causing the bad hosted URL, `/api/characters/30` sharing NFT metadata behavior, manifest download from token metadata, committed GCS source, middleware/proxy, or cache-only failure.
**Findings:** Oracle agreed these alternatives are eliminated or unsupported by selected evidence. The immediate root cause is metadata-route hosted-image override; the deeper issue is wrong local token 30 PNG relative to canonical/static metadata.
**Evidence:** `app/api/characters/metadata/[tokenId]/route.ts:30-38`, `app/api/characters/metadata/[tokenId]/route.ts:58-74`, `public/metadata/characters/30.json:2-3`, `public/metadata/characters/manifest.json:279-285`, verified hashes above.
**Conclusion:** Root cause identified with code/data/hash evidence.

### Follow-up - Seared Image Regression Hypothesis
**Hypothesis:** Token 30 may have had a seared image previously, and the regression is that metadata/display now falls back to the local static PNG instead of DB-backed seared image fields.
**Findings:** This is plausible architecturally but not present in current production token 30 data. Production `https://fateofwagdie.com/api/characters/30` currently returns `image_url: /images/characters/30.png`, `metadata.image` as the Pinata/IPFS CID, and no `metadata.isSeared`, `metadata.searImage`, `metadata.searing_materialization`, or `metadata.searedConcord`. Public production searing endpoints also currently return no searing events/concords for token 30 (`/api/characters/30/searing`, `/api/characters/30/concords`, `/api/characters/30/events`).
**Evidence:** Normal app image policy does prefer seared images over local static images when seared DB/read-model metadata exists (`lib/utils/image.ts:163-181`, `lib/utils/image.ts:204-221`). Searing materialization is supposed to write `isSeared`, `searImage`, `searing_materialization.seared_image_url`, and `image_url` back to `wagdie_characters` (`lib/repositories/character-materialization-repository.ts:98-122`, `lib/repositories/character-materialization-repository.ts:159-176`). However, `/api/characters/metadata/[tokenId]` ignores those DB fields because it reads static JSON/local PNG only (`app/api/characters/metadata/[tokenId]/route.ts:58-74`). Git archaeology points to `7d4874fb` (`fix: prefer hosted nft images`, 2026-05-09) as the likely regression for NFT metadata specifically: it introduced the local hosted image override, and that route does not consult seared DB/read-model fields.
**Conclusion:** If token 30 was previously seared, there are two related problems: (1) current production DB/read-model/event state no longer shows token 30 as seared, and (2) even if those DB seared fields were restored, `/api/characters/metadata/30` would still not use them until the route is changed to read DB-backed metadata/image data or a seared-aware source.

## Root Cause
The immediate root cause is the NFT metadata route's hosted-image override. `GET /api/characters/metadata/30` reads `public/metadata/characters/30.json`, but `getHostedCharacterImageUrl()` checks for `public/images/characters/30.png` and returns `https://fateofwagdie.com/images/characters/30.png?v=metadata-20260509` when the file exists (`app/api/characters/metadata/[tokenId]/route.ts:30-38`). The route then spreads that hosted URL over the parsed static metadata's `image` field (`app/api/characters/metadata/[tokenId]/route.ts:58-74`).

The deeper data issue is that `public/images/characters/30.png` is not the same image as the token 30 static metadata image. Static metadata still points to the Pinata/IPFS CID (`public/metadata/characters/30.json:2-3`), and alternate IPFS gateways return a different valid 400x400 PNG. The deployed hosted PNG and repo PNG match each other exactly, but their hash differs from the CID image hash.

The manifest explains why the hosted override applies but not where the local file came from: token 30 maps to `public/images/characters/30.png` with `image_exists: true`, `image_downloaded: false`, and `image_source_url: null` (`public/metadata/characters/manifest.json:279-285`). That matches the asset collector's already-present branch, which records no source URL when a local image already existed and no refresh was performed (`scripts/collect-character-assets.ts:481-501`).

## Eliminated Hypotheses
- **Static `30.json` directly serves the bad hosted URL:** eliminated. It still contains the Pinata/IPFS image; the hosted URL is introduced by `app/api/characters/metadata/[tokenId]/route.ts`.
- **`/api/characters/30` and `/api/characters/metadata/30` behave the same:** eliminated. `/api/characters/30` preserves `metadata.image` as the CID URL but hydrates top-level `image_url` to local static art through `character-local-assets` and `lib/utils/image.ts`.
- **Token 30 was downloaded from its static metadata during the manifest run:** unsupported/eliminated for that run. The manifest has `image_downloaded:false` and `image_source_url:null`, matching the already-present local-file path in `scripts/collect-character-assets.ts`.
- **Committed GCS dump is the immediate source:** unlikely. The selected GCS dump is for `seared-wagdie-images`, contains PNGs only, and has no exact token 30 evidence.
- **Middleware/proxy causes production image bytes:** eliminated for `/images/characters/30.png`; middleware excludes `/images` and only proxies `/api/*` under configured scenarios.
- **Cache alone explains the wrong image:** not primary. Production and repository `30.png` hashes match, so the served bytes reflect the deployed local file; cache invalidation is still needed after replacement.

## Recommendations
1. **Canonical data-source fix:** decide whether `wagdie_characters.metadata.image` / `wagdie_characters.image_url` should be the source of truth for character images. If yes, update token 30 in the database with the correct image URL and change `/api/characters/metadata/[tokenId]` to read that DB-backed source instead of blindly overriding from local file existence.
2. **Asset-backed fix:** if hosted local PNGs remain the NFT metadata source of truth, replace `public/images/characters/30.png` with the canonical token 30 image from the static metadata CID. Verify the new local hash matches `c0287811f50aeed87ca1637bf254e0df5ea6df613717059b387fdff14c3fbfcc` or the agreed canonical source.
3. Bump the hardcoded metadata image version query in `app/api/characters/metadata/[tokenId]/route.ts` from `metadata-20260509` to a new value when the asset/source changes, then redeploy and purge/invalidate CDN as needed.
4. Refresh marketplace/OpenSea metadata for token 30 after deployment so consumers stop caching the old hosted PNG.
5. If the product intent is to keep static metadata images rather than hosted local images, change the metadata route to stop overriding solely on filesystem existence; consult verified manifest/provenance status or use a curated allowlist/exception instead.
6. Avoid declaring the current local PNG canonical unless a separate product/source-of-truth decision confirms it; current evidence and user report both indicate it is the wrong image.

## Database Source-of-Truth Note
The repository already has a DB path for normal character reads: `CharacterQueryRepository.findById()` selects from `CHARACTERS_TABLE`, which defaults to `wagdie_characters`, and returns hydrated rows (`lib/repositories/character/character-query-repository.ts:429-445`; `lib/db/tables.ts:11-14`). However, hydration then merges local static metadata from `public/metadata/characters/manifest.json` and computes top-level `image_url` through local/static image policy (`lib/services/assets/character-local-assets.ts:169-212`, `lib/services/assets/character-local-assets.ts:252-270`). Separately, the NFT metadata route `/api/characters/metadata/[tokenId]` does not query `wagdie_characters` at all; it reads static JSON and overrides `image` from local file existence (`app/api/characters/metadata/[tokenId]/route.ts:58-74`).

Therefore, simply fixing the DB row may not fix the externally served NFT metadata unless the metadata route is changed to consult DB-backed `metadata.image`/`image_url`, or the local/static asset override is removed/provenance-aware.

## Preventive Measures
- Extend the asset manifest to record local image hash, source URL, source hash, and whether local bytes match `metadata.image`.
- During asset collection, compare existing local images against reachable metadata image candidates and flag mismatches instead of silently treating already-present files as valid.
- Make hosted-image override policy explicit and provenance-aware rather than based only on file existence.
- Add regression coverage for a token 30-style mismatch: static metadata image differs from local PNG, and the intended API behavior is asserted.
- Document the distinction between static metadata `image`, hosted local PNG, `/api/characters/{id}` top-level `image_url`, NFT metadata API returned `image`, and marketplace cached media.
- Treat image replacement as a cache-sensitive operation: update query versions, purge CDN, and refresh marketplace metadata.
