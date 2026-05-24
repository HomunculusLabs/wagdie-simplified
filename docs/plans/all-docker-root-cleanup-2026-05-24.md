# All-Docker Root Cleanup: Plan

## Goal
Produce a safe, executable cleanup sequence for Docker-related paths on `celestine` that clearly separates active SDA-backed Docker/Compose state from root-backed backup/source trees and unsafe unknowns.

This is a plan-only document. The later maintenance workflow may run read-only verification and approved cleanup actions; this plan itself does not perform deletion, Docker mutation, SSH mutation, or filesystem cleanup.

## Background
- The all-Docker investigation is recorded in `docs/investigations/duplicate-docker-root-instances-2026-05-24.md`.
- Active Docker daemon storage is `/data/sda/var/lib/docker`; `docker info` and `/etc/docker/daemon.json` both identify that path as the Docker data root (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:277-291`).
- `/srv/compose` resolves to `/data/sda/srv/compose`; active Compose configs under `/srv/compose/...` are aliases for SDA-backed paths, not root-backed duplicates (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:251-268`).
- Active Compose projects discovered by `docker compose ls --all` are `blacksand-clear-site`, `blacksand-clear-supabase`, `homelab`, `humandestiny`, `llm-wiki-site`, `wagdie-simplified`, `wagdie-simplified-dev`, and `wagdie-wiki`; all config paths resolve to `/data/sda` (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:251-268`).
- Named Docker volumes inspected mount under `/data/sda/var/lib/docker/volumes/...`, including homelab, Supabase, and WAGDIE/Eliza volumes (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:321-329`).
- Active root-backed bind mounts exist but are not duplicate Docker instances: `/srv/media`, `/srv/downloads`, `/`, `/etc/localtime`, `/etc/timezone`, and `/var/lib/docker` for monitoring (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:333-351`).
- `/var/lib/docker` is root-backed and not the active Docker data root, but running `homelab/cadvisor` bind-mounts it; non-sudo inspection could not determine its contents/size, so it is unsafe/unknown (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:286-313`).
- Primary root-backed cleanup candidates with no inspected runtime references are `/srv/compose.before-sda-cutover-20260519-095951` (~27G), `/home/saltysloane/eliza` (~4.4G), `/home/saltysloane/Desktop/Zonos` (~6.1G), `/home/saltysloane/wagdie-backups` (~299M), and `/home/saltysloane/secret-rotation-backups` (~44K) (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:424-431`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:457-464`).
- The pre-SDA compose backup is not WAGDIE-only: it contains `homelab`, `wagdie-wiki`, and `wagdie-simplified`, with the homelab backup accounting for most of the size (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:369-375`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:424-427`).
- `/tmp/wagdie-dev-*` artifacts are on tmpfs and do not reclaim ext4 root space; `/tmp/wagdie-dev-recovery-check` is a registered Git worktree and should not be removed with plain `rm -rf` (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:204-219`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:466-467`).
- Remaining verification gaps before deletion: root cron spool and `/var/lib/docker` contents/size require sudo; backup-tree sizes are approximate lower bounds due to permission-denied paths (`docs/investigations/duplicate-docker-root-instances-2026-05-24.md:416-421`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:437-438`).
- Wiki cleanup must stay isolated from Supabase: `DOCKER-WIKI.md:65-74` warns not to run reset commands against the main Supabase stack, and `docker-compose.wiki.yml:14-16`, `docker-compose.wiki.yml:41-42` show Wiki data lives under `volumes/wiki/*`.
- Main Supabase destructive reset commands exist separately in `DOCKER-SUPABASE.md:99-103`; this cleanup plan must not use `docker-compose down -v`, `docker volume rm`, or `docker system prune` as a shortcut for root-disk cleanup.
- The main compose stack mixes repo-local bind mounts (`docker-compose.yml:24-25`, `docker-compose.yml:105-106`, `docker-compose.yml:138-140`) and named Docker volumes (`docker-compose.yml:151-152`, `docker-compose.yml:190-191`, `docker-compose.yml:260-346`, `docker-compose.yml:384-392`), so deletion decisions must distinguish active bind data from backup copies.

## Safety Rules
Hard prohibitions for this cleanup:

- Do not delete `/data/sda/var/lib/docker`.
- Do not delete active named Docker volumes.
- Do not delete `/srv/compose`; it is the active symlink to `/data/sda/srv/compose`.
- Do not delete active project directories under `/srv/compose` or `/data/sda/srv/compose`.
- Do not use `docker-compose down -v`, `docker compose down -v`, `docker volume rm`, `docker system prune`, or `docker builder prune` as root-disk cleanup shortcuts.
- Do not delete active repo-local bind directories such as `volumes/db/data`, `volumes/storage`, or `volumes/wiki/*` unless intentionally operating that specific stack with an approved stack-specific runbook.
- Do not delete `/var/lib/docker` until sudo inspection and cAdvisor bind/path review are complete.
- Do not delete `/tmp/wagdie-dev-recovery-check` with plain `rm -rf`; it is a registered Git worktree.

## Classification Table
| Path | Class | Evidence | Estimated reclaim | Required approval / verification | Allowed action |
|---|---|---|---:|---|---|
| `/data/sda/var/lib/docker` | Must not delete | Active `DockerRootDir`; named volumes mount under it | Not root reclaim | Verify with `docker info` and `/etc/docker/daemon.json` | None |
| `/srv/compose` -> `/data/sda/srv/compose` | Must not delete | Active symlink alias for Compose projects | Not root reclaim | Verify with `readlink -f /srv/compose` | None |
| Active dirs under `/data/sda/srv/compose/*` and `/srv/compose/*` | Must not delete | Active Compose projects resolve to SDA-backed dirs | Not root reclaim | Verify `docker compose ls --all` | None |
| `/data/sda/humandestiny` | Must not delete | Active Compose project | Not root reclaim | Verify `docker compose ls --all` | None |
| `/home/saltysloane/projects/wagdie-simplified-dev` | Must not delete | Symlink to active dev checkout | 0 on root | Verify with `readlink -f` | None |
| `/srv/media`, `/srv/downloads` | Must not delete | Active homelab bind mounts, not duplicate instances | ~226M + 24K on root | Verify active mounts/container refs | Leave unless separate migration plan exists |
| `/data/sda/srv/ops` | Must not delete | Active WAGDIE dev cron references | Not root reclaim | Verify user crontab | None |
| Active repo-local `volumes/*` under active stacks | Must not delete | Compose files use bind mounts for DB/storage/wiki data | Stack-dependent | Verify stack-specific intent | None for general cleanup |
| `/srv/compose.before-sda-cutover-20260519-095951` | Retention-gated cleanup candidate | No inspected runtime refs; old pre-SDA backup tree | ~27G on `/` | Owner approval for homelab/wiki/WAGDIE; sudo root cron check | Quarantine/archive first, delete after retention window |
| `/srv/compose.before-sda-cutover-20260519-095951/homelab` | Retention-gated cleanup candidate | Backup copy, not active; largest child | ~26G on `/` | Homelab owner approval | Quarantine/archive first |
| `/srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki` | Retention-gated cleanup candidate | Backup copy, not active | ~947M on `/` | Wiki/WAGDIE owner approval | Quarantine/archive first |
| `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified` | Retention-gated cleanup candidate | Backup copy, not active | ~535M on `/` | WAGDIE owner approval | Quarantine/archive first |
| `/home/saltysloane/eliza` | Retention-gated cleanup candidate | Root-backed source/Compose-like checkout; no inspected refs | ~4.4G on `/` | Owner approval; confirm no needed work | Quarantine/archive first |
| `/home/saltysloane/Desktop/Zonos` | Retention-gated cleanup candidate | Root-backed source/Compose-like checkout; no inspected refs | ~6.1G on `/` | Owner approval; confirm no needed work | Quarantine/archive first |
| `/home/saltysloane/wagdie-backups` | Retention-gated cleanup candidate | Backup tree; no inspected refs | ~299M on `/` | WAGDIE backup-retention approval | Quarantine/archive first |
| `/home/saltysloane/secret-rotation-backups` | Sensitive/retention-gated | No inspected refs; likely secret material | ~44K on `/` | Security/secret-retention approval | Secure archive or secure deletion policy only |
| `/var/lib/docker` | Unsafe/unknown | Not active Docker root, but cAdvisor bind-mounts it; sudo-only contents unknown | Unknown | sudo listing/sizing; cAdvisor config review | No deletion |
| root cron spool | Unsafe/unknown blind spot | Could not inspect without sudo | N/A | sudo grep of `/var/spool/cron*` | No deletion decisions until checked |
| `/tmp/wagdie-dev-*` except recovery worktree | Low-value/non-root reclaim | tmpfs artifacts; no inspected refs | ~99M+ tmpfs | Optional tmpfs cleanup approval | Does not address ext4 root pressure |
| `/tmp/wagdie-dev-recovery-check` | Low-value/non-root reclaim; Git-caveated | tmpfs and registered Git worktree | ~215M tmpfs | Git worktree review | Remove only through intentional `git worktree` flow |

## Approach
1. Treat the report’s conclusion as the baseline: there are no active duplicate Docker/Compose instances running from root-backed checkouts; the actionable cleanup is backup/source-tree retirement.
2. Before any deletion, rerun read-only preflight checks to confirm the host state has not drifted.
3. Resolve ownership and retention decisions for every non-active backup/source path.
4. Use quarantine or archive-to-SDA as the default first move; reserve permanent deletion for after verification and a retention window.
5. Verify service health and root-space recovery after each approved cleanup step.
6. Keep `/var/lib/docker` out of this cleanup until sudo inspection and cAdvisor review are done in a separate, explicit maintenance task.

## Read-Only Preflight Verification
Run these checks immediately before any maintenance window. They are read-only except where noted as sudo read-only.

### Confirm host, Docker root, and compose symlink
```bash
hostname
date -Is
whoami

docker info --format 'DockerRootDir={{.DockerRootDir}} Driver={{.Driver}} CgroupDriver={{.CgroupDriver}}'
cat /etc/docker/daemon.json
findmnt -T /data/sda/var/lib/docker -no TARGET,SOURCE,FSTYPE
findmnt -T /var/lib/docker -no TARGET,SOURCE,FSTYPE

readlink -f /srv/compose
findmnt -T /srv/compose -no TARGET,SOURCE,FSTYPE
```
Abort if Docker root is not `/data/sda/var/lib/docker` or if `/srv/compose` no longer resolves to `/data/sda/srv/compose`.

### Capture disk and candidate size baseline
```bash
df -h / /data/sda /tmp
du -xhd1 / 2>/dev/null | sort -h | tail -20
du -sh \
  /srv/compose.before-sda-cutover-20260519-095951 \
  /srv/compose.before-sda-cutover-20260519-095951/homelab \
  /srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki \
  /srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified \
  /home/saltysloane/eliza \
  /home/saltysloane/Desktop/Zonos \
  /home/saltysloane/wagdie-backups \
  /home/saltysloane/secret-rotation-backups \
  /tmp/wagdie-dev-* 2>/dev/null
```
Treat non-sudo `du` values as approximate lower bounds if permission errors appear.

### Capture active Compose inventory
```bash
docker compose ls --all
docker compose ls --all --format json
```
For every config path shown, resolve it with `readlink -f` and `findmnt -T`. Abort if any active Compose config file resolves inside a candidate deletion path. A jq-free fallback loop for the plain table output is acceptable during maintenance:

```bash
docker compose ls --all --format '{{.Name}} {{.ConfigFiles}}' | while read -r name configs; do
  printf 'PROJECT %s\n' "$name"
  printf '%s' "$configs" | tr ',' '\n' | while read -r cfg; do
    [ -z "$cfg" ] && continue
    real=$(readlink -f "$cfg" 2>/dev/null || true)
    mount=$(findmnt -T "$real" -no TARGET,SOURCE,FSTYPE 2>/dev/null || true)
    printf '  %s -> %s [%s]\n' "$cfg" "$real" "$mount"
  done
done
```

### Check Docker references to candidate paths
```bash
CANDIDATES='/srv/compose.before-sda-cutover-20260519-095951|/home/saltysloane/eliza|/home/saltysloane/Desktop/Zonos|/home/saltysloane/wagdie-backups|/home/saltysloane/secret-rotation-backups|/tmp/wagdie-dev-recovery-check'

docker inspect $(docker ps -aq) --format '{{.Name}}|project={{index .Config.Labels "com.docker.compose.project"}}|service={{index .Config.Labels "com.docker.compose.service"}}|working_dir={{index .Config.Labels "com.docker.compose.project.working_dir"}}|config_files={{index .Config.Labels "com.docker.compose.project.config_files"}}|mounts={{range .Mounts}}{{.Source}}->{{.Destination}};{{end}}' \
  | grep -E "$CANDIDATES" || true

docker volume inspect $(docker volume ls -q) | grep -E "$CANDIDATES" || true
```
Expected result: no output. Abort cleanup for any candidate path that appears.

### Check process, systemd, timer, cron, and script references
```bash
ps -eo pid,user,cmd | grep -E "$CANDIDATES" | grep -v grep || true

systemctl list-timers --all --no-pager
systemctl --user list-timers --all --no-pager
crontab -l || true

grep -RInE "$CANDIDATES" \
  /etc/crontab \
  /etc/cron.d \
  /etc/cron.daily \
  /etc/cron.hourly \
  /etc/cron.monthly \
  /etc/cron.weekly \
  /etc/systemd/system \
  /usr/lib/systemd/system \
  /lib/systemd/system \
  /home/saltysloane/.config/systemd \
  /usr/local/bin \
  /usr/local/sbin \
  /home/saltysloane/.local/bin \
  /data/sda/srv/ops 2>/dev/null || true
```
The known `/data/sda/srv/ops` user cron path is active and must not be touched.

### Close sudo-only blind spots
```bash
sudo grep -RInE "$CANDIDATES" /var/spool/cron /var/spool/cron/crontabs 2>/dev/null || true
sudo ls -la /var/lib/docker
sudo du -xsh /var/lib/docker
sudo find /var/lib/docker -maxdepth 2 -mindepth 1 -printf '%M %u:%g %s %TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort

docker inspect $(docker ps -q) --format '{{.Name}}|project={{index .Config.Labels "com.docker.compose.project"}}|service={{index .Config.Labels "com.docker.compose.service"}}|mounts={{range .Mounts}}{{.Source}}->{{.Destination}};{{end}}' \
  | grep -E 'cadvisor|/var/lib/docker' || true
```
If sudo is unavailable, do not delete `/var/lib/docker`, and treat root cron spool as an unresolved risk. For other candidate paths, unresolved root cron is a global risk gate: proceed only if the maintenance owner explicitly accepts that blind spot in the manifest; otherwise halt before deletion.

## Owner and Retention Approval Requirements
No deletion may occur until the owner/retention authority approves the exact path and cleanup mode.

| Path | Required approver | Reason |
|---|---|---|
| `/srv/compose.before-sda-cutover-20260519-095951/homelab` | Homelab owner | Largest backup; cross-owner data |
| `/srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki` | Wiki/WAGDIE owner | Wiki backup copy |
| `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified` | WAGDIE owner | WAGDIE backup copy |
| `/home/saltysloane/eliza` | Source/worktree owner | Looks like source/work checkout, not pure Docker garbage |
| `/home/saltysloane/Desktop/Zonos` | Source/worktree owner | Looks like source/work checkout, not pure Docker garbage |
| `/home/saltysloane/wagdie-backups` | WAGDIE backup owner | Backup retention decision |
| `/home/saltysloane/secret-rotation-backups` | Security/secret owner | Sensitive material; tiny disk value |

Approval record should include exact path, owner, timestamp, cleanup mode, retention window, and rollback expectation. Record approvals and cleanup manifests in a host-local file for the maintenance window, for example `/data/sda/root-cleanup-archives/20260524/MANIFEST.md`; if no archive-to-SDA is used, keep the same manifest under the chosen quarantine root and copy it back into this repo only if the team wants an auditable postmortem. Default retention window: 7 days for same-filesystem quarantine, 30 days for archive-to-SDA, unless the owner chooses a different window.

## Quarantine and Rollback Strategy
Prefer reversible cleanup before permanent deletion.

- **Decision menu:** Phase 0 must choose one mode per path: same-filesystem quarantine, archive-to-SDA then remove source, or direct permanent deletion. Direct permanent deletion should be rare and only for low-risk approved artifacts.
- **Quarantine option:** move approved paths to a dated quarantine directory on the same filesystem, such as `/root-cleanup-quarantine-20260524` or `/home/saltysloane/root-cleanup-quarantine-20260524`. Same-filesystem moves are fast and reversible, but they do **not** reclaim ext4 root space until the quarantined copy is deleted or moved off `/` after the retention window.
- **Archive-to-SDA option:** archive approved paths to `/data/sda/root-cleanup-archives/20260524/` when they may be needed later but should not remain on `/`. Before copying large trees, verify `/data/sda` free space, create the archive directory with appropriate ownership, and record archive checksums in the manifest.
- **Manifest:** for each path, record original path, quarantine/archive path, `du -sh`, `findmnt -T`, timestamp, owner approval, cleanup mode, retention/delete-after date, checksum if archived, and post-action service verification.
- **Rollback:** during quarantine retention, move the path back to its original location. After permanent deletion, rollback depends on archive integrity or external backup.
- **Secrets:** do not place secret-rotation backups in broad-access archives; use the approved secret-retention path or secure deletion policy.

## Safe Deletion Order
### Phase 0 — Planning gate
**Goal:** Lock the approved cleanup set before touching the host.
**Done when:** Owner approvals exist for each candidate path, cleanup mode is chosen from same-filesystem quarantine, archive-to-SDA, or direct permanent deletion, the manifest path is created, and a maintenance window is scheduled.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:473-476`; this plan.
**Dependencies:** None.
**Size:** Small.

### Phase 1 — Read-only preflight
**Goal:** Confirm the remote host still matches the investigation baseline.
**Done when:** Docker root, `/srv/compose`, Compose inventory, candidate reference checks, sudo root-cron check, and `/var/lib/docker` sudo inspection have passed, or an unresolved non-`/var/lib/docker` blind spot is explicitly accepted in the manifest by the maintenance owner.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:251-291`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:394-438`.
**Dependencies:** Phase 0 approvals and maintenance access.
**Size:** Medium.

### Phase 2 — Lowest-risk WAGDIE-only backups
**Goal:** Retire small, clearly WAGDIE-scoped backups first.
**Done when:** Approved cleanup mode has been applied to `/home/saltysloane/wagdie-backups` and `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified`, WAGDIE services remain healthy, and root-space impact is recorded. Expected reclaim is about 834M only after source deletion or archive-to-SDA plus source removal; same-filesystem quarantine alone should not improve `df -h /`.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:427`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:430`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:460`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:463`.
**Dependencies:** WAGDIE owner approval; Phase 1 pass.
**Size:** Small.

### Phase 3 — Sensitive low-size backup
**Goal:** Resolve secret-rotation backup retention without treating it as a disk-space priority.
**Done when:** `/home/saltysloane/secret-rotation-backups` is retained, securely archived, or securely deleted according to secret-retention policy.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:431`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:464`.
**Dependencies:** Security/secret owner approval.
**Size:** Small.

### Phase 4 — Cross-owner pre-SDA compose backup
**Goal:** Retire the large pre-SDA backup only after all child owners approve.
**Done when:** Approved children under `/srv/compose.before-sda-cutover-20260519-095951` are quarantined/archived/deleted, active `homelab`, `wagdie-wiki`, and WAGDIE services remain healthy, and the parent is removed only if empty or fully approved. Expected reclaim if the full tree is retired from `/` is about 27G.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:369-375`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:424-427`.
**Dependencies:** Homelab, Wiki/WAGDIE, and WAGDIE approvals; Phase 1 pass.
**Size:** Medium.

### Phase 5 — Root-home source/work checkouts
**Goal:** Retire non-active source/Compose-like checkouts after owner confirms they are disposable or archived.
**Done when:** `/home/saltysloane/eliza` and `/home/saltysloane/Desktop/Zonos` have Git/worktree status captured if applicable, owner approval recorded, cleanup mode applied, and post-action host health verified. Expected reclaim if both are removed from `/` is about 10.5G.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:372-373`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:428-429`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:461-462`.
**Dependencies:** Source/worktree owner approval; archive/quarantine decision.
**Size:** Medium.

### Phase 6 — Optional tmpfs cleanup
**Goal:** Remove irrelevant tmpfs artifacts only if desired, without claiming root ext4 recovery.
**Done when:** Non-worktree `/tmp/wagdie-dev-*` artifacts are removed or left intentionally; `/tmp/wagdie-dev-recovery-check` is handled only through a Git worktree cleanup flow if retired.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:204-219`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:466-467`.
**Dependencies:** Git worktree owner approval for recovery-check.
**Size:** Small.

### Phase 7 — Separate `/var/lib/docker` follow-up
**Goal:** Keep old root-backed Docker storage out of the deletion set until cAdvisor and sudo-only contents are understood.
**Done when:** A separate plan or maintenance task decides whether cAdvisor should bind `/data/sda/var/lib/docker`, confirms `/var/lib/docker` contents/size with sudo, and verifies no service still references it.
**Key files:** `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:286-313`, `docs/investigations/duplicate-docker-root-instances-2026-05-24.md:456`.
**Dependencies:** sudo access; homelab/cAdvisor owner approval.
**Size:** Medium.

## Post-Action Verification
After each approved quarantine/archive/deletion action in the later maintenance workflow, run:

```bash
df -h / /data/sda /tmp
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls --all
```

Then verify only the affected scope:

| Scope | Minimum check | Notes |
|---|---|---|
| WAGDIE production/dev | `docker ps` status for WAGDIE containers plus HTTP smoke against the known app ports from the deployment runbook (`42069` prod, `42070` dev when present) | Do not run database reset commands. |
| Wiki | `docker compose ls --all` shows `wagdie-wiki` running; owner-provided HTTP/UI check if available | Wiki is isolated under `volumes/wiki/*`; do not reset Supabase. |
| Homelab/media | `docker ps` status for affected homelab services; owner-provided service checks for media/download apps | `/srv/media` and `/srv/downloads` are active binds and not cleanup targets in this plan. |
| Source/work checkouts (`eliza`, `Zonos`) | `ps` candidate-reference check remains empty; owner confirms no workflow depended on the path | Prefer archive/quarantine if uncertainty remains. |

Record command output and pass/fail status in the maintenance manifest.

## Open Questions
These are approval gates or future-work decisions, not blockers to this written plan:

- Who is the explicit retention authority for `homelab` backups?
- Who is the explicit retention authority for `wagdie-wiki` backups?
- Who owns `/home/saltysloane/eliza` and `/home/saltysloane/Desktop/Zonos`, and should those be archived to SDA before removal?
- Should approved backups be quarantined on `/`, archived to `/data/sda`, or permanently deleted after a retention window?
- Should cAdvisor continue monitoring Docker internals, and if so should it bind `/data/sda/var/lib/docker` instead of `/var/lib/docker`?

## References
- `docs/investigations/duplicate-docker-root-instances-2026-05-24.md`
- `DOCKER-WIKI.md`
- `DOCKER-SUPABASE.md`
- `docker-compose.yml`
- `docker-compose.wiki.yml`
