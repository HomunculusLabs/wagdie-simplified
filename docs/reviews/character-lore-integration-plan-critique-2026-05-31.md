# Character Lore Integration Plan Critique — 2026-05-31

Bounded design critique only; this accepts the checkpoint decisions: in-sheet lore placement, server wrapper/client shell loading, and owner-only no-lore submission CTA.

## 1. Top 3 under-specified seams

1. **Effective token lore resolver determinism.** Item 1 names matching by `tokenId` and `character-${tokenId}`, but does not define primary-character selection, appearance sort order, `firstAppearance` fallback, or dedupe ordering for locations/seasons/sources. The export had useful implementation framing here: prefer real token-linked records, then `character-${tokenId}`, then stable sort; order appearances by `timelineOrder`, then title. Without that, tests around multiple matched ids will guess. Relevant contracts: `lib/lore/types.ts:92`, `lib/lore/types.ts:121`.
2. **Server wrapper/client shell prop contract.** Items 2–3 say to split `app/characters/[tokenId]/page.tsx` and pass `initialLore`, `initialLoreError`, and `showLoreNav`, but they do not define the exact serializable DTO, invalid token handling before lore lookup, or route dynamic/no-store mechanism. Current client behavior parses params and owns loading/not-found (`app/characters/[tokenId]/page.tsx:24`, `app/characters/[tokenId]/page.tsx:36`, `app/characters/[tokenId]/page.tsx:125`); the server wrapper needs an explicit “skip lore but pass raw/numeric token id” rule for invalid params.
3. **CTA permission semantics.** The plan says owner/admin-only, while Item 6 says `showLoreNav && isOwner && !isEditMode`. Today `isOwner` is actually admin-inclusive via `canEditCharacterForAddress(character, address, userIsAdmin)` (`app/characters/[tokenId]/page.tsx:55`), but `CharacterStorySection` receives `isOwner` and does not use it for the CTA (`components/characters/detail/CharacterStorySection.tsx:8`, `components/characters/detail/CharacterStorySection.tsx:31`). Rename or document the boolean as `canSubmitCommunityStory`/`canEdit` to avoid excluding admins or using wallet-holder semantics by mistake.

## 2. Specificity balance

- **Over-specified:** Item 2 lists every hook/import the moved client shell should preserve. The implementation agent should own exact imports and file placement; the plan only needs behavioral invariants and tests.
- **Over-specified:** Item 7’s optional `lib/lore/navigation.ts` cleanup is reasonable, but it should stay explicitly skippable. Do not make public lore component refactors a dependency of character-page integration.
- **Dropped useful framing from the export:** resolver determinism, appearance/source/location/season ordering, and “lore loading must not block playable page” were sharper in the export. The API/client-hook details were intentionally superseded by the server-wrapper checkpoint and should remain dropped.

## 3. Contradictions or missing dependencies

- Item 3 depends on a server-readable `showLoreNav`; current flag is module-level `NEXT_PUBLIC_SHOW_LORE_NAV` in the client page (`app/characters/[tokenId]/page.tsx:24`). The plan should state that the wrapper uses the same env-derived flag and passes it through.
- Item 3 says invalid route token ids should let existing client behavior resolve, but also says the wrapper calls `getEffectiveTokenCharacterLore(tokenId)`. Missing dependency: token parsing must happen before resolver invocation, with invalid ids skipping lore.
- Item 6 can be implemented before the lore section and is not truly dependent on Item 5, except for validating no-lore behavior.

## 4. Risk of over-planning

Cut or compress the long preservation checklist in Item 8 into focused acceptance tests plus a short manual smoke list. Also trim the Background prior-plan citations once the implementer has the current seams; they are useful rationale but not build-critical. Keep Item 7 as “only if duplication appears,” not an expected phase.

## 5. Questions that would change implementation order

1. Should invalid `/characters/[tokenId]` params be handled by the new server wrapper, or must the current client not-found/loading behavior remain byte-for-byte similar?
2. Is “owner-only CTA” meant to include admins through `canEditCharacterForAddress`? If yes, rename the prop before wiring tests.
3. Should `EffectiveTokenCharacterLore` expose full lore records to the client, or a smaller UI DTO? Answer this before building `CharacterLoreAppearancesSection` tests.
