# All-Docker Root Cleanup Plan Critique — 2026-05-24

Scope: bounded critique of `docs/plans/all-docker-root-cleanup-2026-05-24.md` against the original context-builder export only; no broader codebase review.

## 1. Top 3 under-specified seams

1. **Approval/manifest mechanics are named but not operationalized.** The plan says approvals must include exact path, owner, timestamp, cleanup mode, retention window, and rollback expectation (`docs/plans/all-docker-root-cleanup-2026-05-24.md:173`), and says the manifest records similar fields (`:180`). It does not say where that record lives, who updates it, whether it is a repo doc vs. host-local file, or what retention-window value is acceptable.
2. **Compose path verification leaves parsing to the implementer.** The plan requires resolving every `docker compose ls --all --format json` config path with `readlink -f` and `findmnt -T` (`:106-109`) but gives no loop, jq-free fallback, or expected format handling. That is a likely maintenance-window guess point.
3. **Post-action health checks are too referential.** “Use the established deployment smoke endpoints” and “owner-provided smoke checks” (`:252-254`) are safe in spirit but not executable unless the implementer already knows those endpoints/runbooks.

## 2. Specificity balance

- The plan appropriately preserves the export’s safety framing and path classes. However, it slightly over-specifies tactical shell one-liners in the preflight section (`:68-158`) while leaving more important decision artifacts under-specified: approval records, manifest location, pass/fail thresholds, and health-check commands.
- Useful export framing was dropped from the implementation-order section: phase-level expected reclaim totals (`prompt-exports/oracle-plan-2026-05-24-113939-docker-cleanup-plan-22c1.md:528`, `:556`, `:572`). The plan still has per-path estimates in the table, but phase totals help decide whether to pursue low-risk small cleanup first or large-pressure relief first.
- The export explicitly names “quarantine, archive-to-SDA, or direct permanent deletion” as a Phase 0 decision (`prompt-exports/...docker-cleanup-plan-22c1.md:500`). The plan mentions permanent deletion elsewhere (`docs/plans/...:64`, `:263`) but Phase 0 only says “cleanup mode is chosen” (`:187`), making the decision menu less visible.

## 3. Contradictions or missing dependencies

- **Quarantine-vs-reclaim contradiction:** same-filesystem quarantine is recommended (`:178`), but Phase 2 requires `df -h /` improvement after the cleanup mode is applied (`:201`). A same-filesystem move will not recover root space until deletion or archive-off-root plus source removal.
- **Sudo blind-spot gating is ambiguous:** the plan says no candidate deletion should proceed if the owner requires zero blind spots (`:158`), while Phase 1 can be done when checks “passed or documented a blocking exception” (`:194`). The plan should define whether unresolved root cron is a global blocker or an owner-accepted risk for non-`/var/lib/docker` candidates.
- Missing dependency: if archive-to-SDA is selected, the plan needs available SDA capacity and permissions checked before copying large trees; currently `/data/sda/root-cleanup-archives/20260524/` is proposed (`:179`) without a capacity/ownership gate.

## 4. Risk of over-planning

The biggest simplification opportunity is the long command-heavy preflight (`:68-158`). Keep the required checks, but consider moving exact command snippets to an appendix/runbook and keeping the main plan focused on gates, expected outputs, and abort criteria. The phase scaffolding (`:184-241`) is helpful but could be compressed where phases only restate table rows.

## 5. Questions that would change implementation order

- Is the next maintenance goal **urgent root-space recovery** or **lowest-risk cleanup first**? Urgency may move the 27G pre-SDA tree or 10.5G source checkouts ahead of 834M WAGDIE-only cleanup.
- Is same-filesystem quarantine acceptable if it does not improve `/`, or must actions reclaim space immediately?
- Is sudo access/root-cron inspection mandatory before any candidate deletion, or only before touching `/var/lib/docker`?
- Who can approve homelab/wiki/source checkout retention, and can one owner approve multiple phases?
