# Bounded Critique: Admin Game Master Agent Settings Plan

## 1. Top 3 under-specified seams

1. **Bootstrap/adoption identity semantics** — The plan says bootstrap should “adopt resolvable env id; otherwise find/create the deterministic official service agent” (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:74`), but does not define how an env id is resolved: official record id vs `externalId`, what happens if the record lacks/has a conflicting `externalId`, or whether adoption should backfill `wagdie:service:location-room-game-master`. The export explicitly noted that env-adopted agents may have `null` external id (`prompt-exports/oracle-plan-2026-05-22-141755-gm-agent-admin-74823-fe9b.md:262`), which the final plan largely compresses away.

2. **Service-agent knowledge sync contract** — The plan correctly chooses a parallel sync table (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:39`, `:46`) and says helpers upload/delete/retry sync (`:76`, `:129`), but it does not specify the adapter boundary from existing token-oriented `knowledgeSync.ts` into the service-agent table: repository interface, source pointer schema, whether delete removes embedded knowledge before or after upstream delete failure, and how retry handles changed content hashes. This is a likely implementation-guess seam.

3. **Runtime resolver injection and failure boundary** — Item 3 requires `gameMasterGenerator` to receive the effective id and `LocationRoomService` validation to accept DB setting or env fallback (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:92-96`), but it does not state where the async resolver lives in the tick flow, whether it is cached per tick/request, or how resolver errors map to existing narrative-disabled vs misconfigured behavior. The export was more explicit that validation may need to become async (`prompt-exports/oracle-plan-2026-05-22-141755-gm-agent-admin-74823-fe9b.md:401`).

## 2. Specificity balance

- **Over-specified:** The exact new component split (`GameMasterAgentAdminContainer`, `GameMasterAgentPersonaForm`, `GameMasterAgentKnowledgePanel`) in Item 5 (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:164-166`) is tactical; an implementation agent should own that decomposition after inspecting reusable editor boundaries.
- **Over-specified:** The migration column list is useful, but fields like validation/error timestamps and soft-delete marker (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:50-56`) may be premature unless the service API defines how they are written.
- **Dropped useful framing:** The export explicitly recommends `createOfficialServerClient()` over `getElizaClient()` for the service agent (`prompt-exports/oracle-plan-2026-05-22-141755-gm-agent-admin-74823-fe9b.md:346`). The plan only lists `lib/eliza/client.ts` and gateway files, leaving the official-client choice implicit.
- **Dropped useful framing:** The export names reusable knowledge helpers (`getKnowledgeDocuments`, `appendKnowledgeDocument`, etc.) while warning token-specific lookup/sync state should not be reused (`prompt-exports/oracle-plan-2026-05-22-141755-gm-agent-admin-74823-fe9b.md:225`). The plan says “knowledge helpers” generally, which is less actionable.

## 3. Contradictions or missing dependencies

- Item 3 depends only on Item 2, but if runtime resolution reads the DB setting, it also operationally depends on the Item 1 migration being applied.
- Item 4’s `GET` state includes knowledge summaries and sync statuses (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:125`), but Item 2 does not define the DTO shape or status merge rules when embedded `character.knowledge` and sync-table rows disagree.
- The plan asks to keep “existing file size/type constraints unless the UI explicitly advertises broader file types” (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:130`) while leaving the upload file-type decision open (`:205`). That decision affects API validation and tests, not just UI copy.

## 4. Risk of over-planning

- Cut or simplify the exhaustive test matrix in Item 6 (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:181-188`) into priority tiers: resolver/bootstrap/service tests first, route auth/error tests second, UI smoke tests last.
- Avoid locking in the UI component names until implementation; keep the required behaviors and reuse constraints.
- The schema section should specify only fields required by V1 behavior; defer validation telemetry fields unless the service writes them in V1.

## 5. Questions whose answers would change implementation order

1. Should env adoption preserve a legacy official agent exactly as-is, or normalize/backfill the deterministic service `externalId`? This changes bootstrap before persona editing.
2. Should V1 knowledge support `.json`/`.csv` at the API layer or only `.txt`/`.md`? This changes route validation before UI/tests.
3. Is runtime resolver lookup expected on every narrative tick, or should active GM settings be cached/invalidated? This changes whether service/repository work should precede runtime wiring tests.
