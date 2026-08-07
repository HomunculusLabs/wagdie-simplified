# Investigations

> Lifecycle: Historical index
> Last validated: 2026-05-11
> Canonical sources: current code, production data, chain state, and linked external facts where applicable

Investigations are point-in-time debugging or research records. They may name likely root causes or fixes, but current behavior must be verified against code, data, and runtime state before acting.

## Status policy

- Keep investigation reports as historical evidence.
- If an investigation leads to a repeatable procedure, move that procedure into `docs/runbooks/` or `docs/operations/` and leave this record as background.
- If an investigation identifies durable architecture, promote only the verified facts into evergreen docs.

## Inventory

| File | Classification | Summary / status note |
| --- | --- | --- |
| `eliza-character-sheets-2026-05-11.md` | Historical investigation / evergreen input | Researches WAGDIE AI persona DTOs and Eliza-compatible character records; likely input for Eliza architecture/development docs. |
| `wallet-signature-loop-2026-05-11.md` | Historical investigation | Finds repeated SIWE prompts tied to client auth state and session hydration. Verify current auth hook behavior before citing. |
| `my-characters-filter-2026-04-30.md` | Historical investigation | Diagnoses wallet character filtering via cached Supabase ownership/staking fields rather than live chain checks. |
| `orb-of-leorn-front-rendering-2026-05-02.md` | Historical investigation | Analyzes searing front-layer rendering for WAGDIE #5873 and distinguishes composition from UI/display cache issues. |
| `staking-unstaking-2026-05-06.md` | Historical investigation | Identifies staking/unstaking confusion between DB location IDs and on-chain location IDs plus sync staleness. |
| `wagdie-4040-unstake-2026-05-07.md` | Historical investigation | Token-specific unstake investigation for WAGDIE 4040; points to stale DB/cache fields versus chain state. |
| `searing-image-generation-2026-05-08.md` | Historical investigation | Transaction/event succeeded but off-chain searing materialization/storage/display failed or lagged. |
| `lore-infrastructure-2026-06-10.md` | Historical investigation / promoted findings | Lore lifecycle/source-of-truth findings were promoted to `docs/architecture/lore-submission-lifecycle.md`, `docs/architecture/lore-source-of-truth.md`, and `docs/runbooks/lore-operations.md`; verify current code before acting on remaining recommendations. |
