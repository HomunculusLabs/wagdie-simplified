# Investigation: Duplicate Docker Instances on Root Filesystem

## Summary
Broader all-Docker investigation found **no active duplicate Docker/Compose instances running from root-backed checkouts**. The Docker daemon root and all active Compose project config paths resolve to SDA-backed storage, but several root-backed backup/source trees are cleanup candidates after retention approval; `/var/lib/docker` remains unsafe/unknown because `cadvisor` still bind-mounts it and sudo-only contents were not inspectable.

## Symptoms
- User suspects duplicate Docker instances exist on the root drive.
- Recent deployment intentionally used `/data/sda/srv/compose/wagdie-simplified-dev` because root is nearly full.
- Need to confirm what is active, what is duplicated, and what removal would be safe.

## Background / Prior Research
- From prior deployment transcript: active dev app was rebuilt from `/data/sda/srv/compose/wagdie-simplified-dev` using `docker compose --env-file .env.local -f docker-compose.dev-app.yml up -d --build app`.
- From prior deployment transcript: `http://127.0.0.1:42070/location-rooms/11` returned `200`, root route returned `200`, and container `wagdie-lore-dev-app` was running.
- From prior deployment transcript: root filesystem was noted as nearly full, `/data/sda` had ~816G free, and deploy checkout was confirmed on `/data/sda`.

### Remote Docker inventory probe - 2026-05-24
A read-only explore probe inspected `saltysloane@192.168.50.7` (`celestine`) over SSH and did not modify anything.

Key evidence:
- Docker root is already on SDA: `DockerRootDir=/data/sda/var/lib/docker Driver=overlayfs CgroupDriver=systemd`.
- Filesystems: `/dev/nvme0n1p2` mounted at `/` is `916G`, `822G` used, `48G` free, `95%`; `/dev/sda1` mounted at `/data/sda` is `916G`, `54G` used, `816G` free, `7%`.
- `/srv/compose` is a symlink to `/data/sda/srv/compose`.
- Active production compose labels use `working_dir=/srv/compose/wagdie-simplified`, which resolves to `/data/sda/srv/compose/wagdie-simplified`.
- Active dev compose labels use both `/data/sda/srv/compose/wagdie-simplified-dev` and `/srv/compose/wagdie-simplified-dev`; these resolve to the same SDA checkout.
- Docker system usage: `Images 124 ACTIVE 108 SIZE 140.7GB RECLAIMABLE 26.76GB`; `Containers 116 ACTIVE 112 SIZE 1.776GB RECLAIMABLE 347.9MB`; `Local Volumes 40 ACTIVE 40 SIZE 3.326GB`.
- Main likely root-disk duplicate/backup checkout: `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified` (`535M`), with compose timestamp matching the active production compose file.
- Other backup-ish root paths: `/home/saltysloane/wagdie-backups` (`299M`), `/home/saltysloane/secret-rotation-backups/wagdie-simplified-20260513-185129`, `/tmp/wagdie-dev-recovery-20260524064817.tar.gz`, and `/tmp/wagdie-dev-worktree-backup-20260524064817`.
- Root disk pressure is mostly `/home` (`581G`), not active WAGDIE Docker root data.

## Investigator Findings
<!-- Pair investigator appends structured evidence here. -->

### Follow-up read-only SSH probe - 2026-05-24 11:14-11:17 America/New_York

Connected to `saltysloane@192.168.50.7` (`celestine`) and ran read-only Docker/filesystem/service-reference probes. SSH key auth succeeded, so no password material was handled in this report. No files, containers, volumes, or checkouts were removed. One broad recursive grep over the active compose tree was terminated after it began scanning too much data; narrower greps were then used.

#### Active compose and Docker state

Evidence that the active compose root is SDA-backed, with `/srv/compose` only an alias:

```text
$ hostname; date -Is; whoami
celestine
2026-05-24T11:14:28-04:00
saltysloane

$ readlink -f /srv/compose
/data/sda/srv/compose

$ findmnt -T /srv/compose -no TARGET,SOURCE,FSTYPE
/data/sda /dev/sda1 ext4

$ findmnt -T /srv/compose/wagdie-simplified -no TARGET,SOURCE,FSTYPE
/data/sda /dev/sda1 ext4

$ findmnt -T /srv/compose/wagdie-simplified-dev -no TARGET,SOURCE,FSTYPE
/data/sda /dev/sda1 ext4

$ findmnt -T /srv/compose.before-sda-cutover-20260519-095951 -no TARGET,SOURCE,FSTYPE
/ /dev/nvme0n1p2 ext4
```

Docker's data root is also SDA-backed:

```text
$ docker info --format 'DockerRootDir={{.DockerRootDir}} Driver={{.Driver}} CgroupDriver={{.CgroupDriver}}'
DockerRootDir=/data/sda/var/lib/docker Driver=overlayfs CgroupDriver=systemd
```

Filesystem pressure still exists on `/`, but Docker root data is not on `/`:

```text
$ df -h / /data/sda /srv/compose
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p2  916G  822G   48G  95% /
/dev/sda1       916G   54G  816G   7% /data/sda
/dev/sda1       916G   54G  816G   7% /data/sda
```

`docker compose ls` shows active WAGDIE projects using `/srv/compose/...` and `/data/sda/srv/compose/...`; because `/srv/compose` resolves to `/data/sda/srv/compose`, these are the same SDA-backed checkouts, not separate root checkouts:

```text
wagdie-simplified      running(15)  /srv/compose/wagdie-simplified/docker-compose.yml
wagdie-simplified-dev  running(6)   /data/sda/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml,/srv/compose/wagdie-simplified-dev/docker-compose.yml,/srv/compose/wagdie-simplified-dev/docker-compose.bots.override.yml,/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml
wagdie-wiki            running(2)   /srv/compose/wagdie-wiki/docker-compose.wiki.yml
```

Representative running WAGDIE container labels/mounts:

```text
/wagdie-lore-dev-app|project=wagdie-simplified-dev|service=app|working_dir=/data/sda/srv/compose/wagdie-simplified-dev|config_files=/data/sda/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml|mounts=
/wagdie-simplified-app-1|project=wagdie-simplified|service=app|working_dir=/srv/compose/wagdie-simplified|config_files=/srv/compose/wagdie-simplified/docker-compose.yml|mounts=
/wagdie-simplified-db-1|project=wagdie-simplified|service=db|working_dir=/srv/compose/wagdie-simplified|config_files=/srv/compose/wagdie-simplified/docker-compose.yml|mounts=/srv/compose/wagdie-simplified/volumes/db/init->/docker-entrypoint-initdb.d;/srv/compose/wagdie-simplified/volumes/db/data->/var/lib/postgresql/data;
/wagdie-simplified-dev-indexer-1|project=wagdie-simplified-dev|service=indexer|working_dir=/srv/compose/wagdie-simplified-dev|config_files=/srv/compose/wagdie-simplified-dev/docker-compose.yml,/srv/compose/wagdie-simplified-dev/docker-compose.bots.override.yml|mounts=/data/sda/var/lib/docker/volumes/wagdie-simplified-dev_indexer-data/_data->/app/data;
```

Candidate-path greps over Docker metadata produced no matches:

```text
$ docker inspect $(docker ps -q) ... | grep -E '/srv/compose.before-sda-cutover|/home/saltysloane/wagdie-backups|/tmp/wagdie-dev-' || true
# no output

$ docker inspect $(docker ps -aq) ... | grep -E '/srv/compose.before-sda-cutover|/home/saltysloane/wagdie-backups|/tmp/wagdie-dev-' || true
# no output

$ docker compose ls --all | grep -E '/srv/compose.before-sda-cutover|/home/saltysloane/wagdie-backups|/tmp/wagdie-dev-' || true
# no output

$ docker volume inspect $(docker volume ls -q) | grep -E '/srv/compose.before-sda-cutover|/home/saltysloane/wagdie-backups|/tmp/wagdie-dev-' || true
# no output
```

#### systemd, timers, cron, and script references

Accessible systemd unit-file greps found no references to the candidate cleanup paths in:

- `/etc/systemd/system`
- `/usr/lib/systemd/system`
- `/lib/systemd/system`
- `/home/saltysloane/.config/systemd`

`systemctl list-timers --all --no-pager` and `systemctl --user list-timers --all --no-pager` did not show WAGDIE/compose/backup/dev timer references to these candidate paths.

User crontab has an active WAGDIE dev sync job, but it is SDA-backed and not a candidate cleanup path:

```text
* * * * * flock -n /data/sda/srv/ops/wagdie-eliza-location-room-sync.lock /data/sda/srv/ops/wagdie-dev-sync-location-rooms.sh >> /data/sda/srv/ops/wagdie-eliza-location-room-sync.log 2>&1
```

Cron file greps in `/etc/crontab`, `/etc/cron.d`, `/etc/cron.daily`, `/etc/cron.hourly`, `/etc/cron.monthly`, and `/etc/cron.weekly` found no candidate-path references. Root spool cron could not be inspected without sudo password:

```text
$ sudo -n grep -RInE ... /var/spool/cron /var/spool/cron/crontabs
sudo: a password is required
```

Greps of common script locations `/usr/local/bin`, `/usr/local/sbin`, `/home/saltysloane/.local/bin` found no candidate-path references.

Greps inside active WAGDIE checkouts found only historical documentation references to `/home/saltysloane/wagdie-backups`, plus one Git worktree metadata pointer to `/tmp/wagdie-dev-recovery-check`:

```text
/data/sda/srv/compose/wagdie-simplified/docs/investigations/wagdie-4040-unstake-2026-05-07.md: ... backup was created at /home/saltysloane/wagdie-backups/token-data-before-copy-20260507-085601.sql ...
/data/sda/srv/compose/wagdie-simplified-dev/docs/investigations/wagdie-4040-unstake-2026-05-07.md: ... backup was created at /home/saltysloane/wagdie-backups/token-data-before-copy-20260507-085601.sql ...
/data/sda/srv/compose/wagdie-simplified-dev/.git/worktrees/wagdie-dev-recovery-check/gitdir:1:/tmp/wagdie-dev-recovery-check/.git
```

Process-argument grep for the candidate paths produced no matches:

```text
$ ps -eo pid,user,cmd | grep -E '/tmp/wagdie-dev-|/srv/compose.before-sda-cutover|/home/saltysloane/wagdie-backups' | grep -v grep || true
# no output
```

#### Candidate cleanup target sizes and location

Candidate paths and sizes observed:

```text
27G   /srv/compose.before-sda-cutover-20260519-095951
535M  /srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified
299M  /home/saltysloane/wagdie-backups
40K   /home/saltysloane/secret-rotation-backups/wagdie-simplified-20260513-185129
99M   /tmp/wagdie-dev-recovery-20260524064817.tar.gz
215M  /tmp/wagdie-dev-recovery-check
4.0K  /tmp/wagdie-dev-untracked-before.txt
4.0K  /tmp/wagdie-dev-untracked-missing-after-reset.txt
28K   /tmp/wagdie-dev-watch.html
220K  /tmp/wagdie-dev-worktree-backup-20260524064817
```

Mount locations matter for reclaimed root space:

```text
/srv/compose.before-sda-cutover-20260519-095951 -> / on /dev/nvme0n1p2 ext4
/home/saltysloane/wagdie-backups -> / on /dev/nvme0n1p2 ext4
/tmp -> /tmp tmpfs tmpfs
```

So deleting `/tmp/wagdie-dev-*` files would not reclaim ext4 root-disk space; it would reclaim tmpfs space. The root-disk cleanup candidates are the `/srv/...before-sda-cutover...` tree and `/home/saltysloane/...` backup trees.

Top-level contents of the old root-side compose backup are broader than WAGDIE app only:

```text
/srv/compose.before-sda-cutover-20260519-095951/homelab
/srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki
/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified
```

Root hotspots remain mostly outside active WAGDIE Docker data:

```text
$ du -xhd1 / 2>/dev/null | sort -h | tail
1.8G /opt
22G  /usr
28G  /srv
35G  /var
581G /home
682G /
```

#### Git worktree caveat for `/tmp/wagdie-dev-recovery-check`

`/tmp/wagdie-dev-recovery-check` is not referenced by Docker/systemd/cron, but it is currently registered as a Git worktree of the active dev checkout:

```text
$ cd /data/sda/srv/compose/wagdie-simplified-dev && git worktree list --porcelain
worktree /data/sda/srv/compose/wagdie-simplified-dev
HEAD d5b85f3d7869dafeef4bbe7e4aa399b732fc552e
branch refs/heads/dev

worktree /tmp/wagdie-dev-recovery-check
HEAD ec38a6d73b51c8cdfa2cd5c07c147e5b1c344b11
branch refs/heads/dev-pre-reset-20260524064817
```

Conclusion: do not remove `/tmp/wagdie-dev-recovery-check` with plain filesystem deletion unless/until the Git worktree is intentionally unregistered or preserved, e.g. by a later non-read-only maintenance step.

#### Conclusions

- Confirmed: active Docker root is `/data/sda/var/lib/docker`; active WAGDIE compose checkouts resolve to `/data/sda/srv/compose/...` even when labels use `/srv/compose/...`.
- Confirmed: no running or stopped Docker container labels/mounts, compose inventory, or Docker volume metadata referenced `/srv/compose.before-sda-cutover-20260519-095951`, `/home/saltysloane/wagdie-backups`, or `/tmp/wagdie-dev-*`.
- Confirmed: accessible systemd/timer/cron/script checks found no runtime references to `/srv/compose.before-sda-cutover-20260519-095951` or the listed `/tmp/wagdie-dev-*` cleanup artifacts. The only active cron WAGDIE job uses `/data/sda/srv/ops/...` and must not be touched.
- Must not touch: `/srv/compose` symlink, `/data/sda/srv/compose/wagdie-simplified`, `/data/sda/srv/compose/wagdie-simplified-dev`, `/data/sda/var/lib/docker`, active WAGDIE Docker volumes, and `/data/sda/srv/ops/wagdie-dev-sync-location-rooms.sh`/related lock/log paths.
- Safe from active-runtime references, pending backup-retention approval: `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified` (`535M` on `/`). The entire `/srv/compose.before-sda-cutover-20260519-095951` tree would reclaim about `27G` on `/`, but it also contains `homelab` and `wagdie-wiki` backups, so do not treat the whole tree as WAGDIE-only.
- Safe from active-runtime references, pending backup/security-retention approval: `/home/saltysloane/wagdie-backups` (`299M` on `/`) and `/home/saltysloane/secret-rotation-backups/wagdie-simplified-20260513-185129` (`40K` on `/`). These are backups, not active services; the secret-rotation backup contains env files and should be handled carefully.
- `/tmp/wagdie-dev-recovery-20260524064817.tar.gz`, `/tmp/wagdie-dev-worktree-backup-20260524064817`, `/tmp/wagdie-dev-untracked-before.txt`, `/tmp/wagdie-dev-untracked-missing-after-reset.txt`, and `/tmp/wagdie-dev-watch.html` are not referenced by Docker/systemd/cron and appear cleanup-safe from a service perspective, but they live on tmpfs, not the ext4 root filesystem.
- `/tmp/wagdie-dev-recovery-check` is not a service dependency, but it is a registered Git worktree for branch `dev-pre-reset-20260524064817`; remove only via an intentional Git worktree cleanup/preservation flow, not as an ordinary temp directory deletion.
- Estimated ext4 `/` reclaim if only clearly WAGDIE root-side backups are retired: about `834M` (`535M` old WAGDIE checkout + `299M` WAGDIE backups + negligible secret backup). Estimated ext4 `/` reclaim if the entire pre-cutover compose backup tree is retired after separate homelab/wiki retention approval: about `27G`.
- Remaining risk: root cron spool could not be inspected without sudo password, and broad greps were intentionally narrowed to avoid scanning large active data trees. However, Docker metadata, accessible service definitions, user cron, common script paths, process args, and active checkout references all point away from the candidate root backup paths.

### All-Docker follow-up probe - 2026-05-24

Connected to `saltysloane@192.168.50.7` (`celestine`) again and broadened the read-only SSH investigation from WAGDIE-only to all Docker/Compose state on the host. Commands used Docker inspection, mount/filesystem inspection, targeted `find`, `du`, `grep`, `ps`, `crontab`, and `systemctl` reads only; no containers, volumes, files, services, or crons were modified or removed.

#### Full Docker/Compose inventory summary

The Docker daemon and Compose inventory at approximately `2026-05-24T11:25-11:35-04:00` showed:

```text
$ docker system df
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          124       108       140.7GB   26.76GB (19%)
Containers      116       112       1.776GB   347.9MB (19%)
Local Volumes   40        40        3.335GB   0B (0%)
Build Cache     0         0         0B        0B

$ docker compose ls --all
NAME                       STATUS              CONFIG FILES
blacksand-clear-site       running(1)          /data/sda/srv/compose/blacksand-clear-site/docker-compose.yml
blacksand-clear-supabase   running(13)         /data/sda/srv/compose/blacksand-clear-supabase/docker-compose.yml
homelab                    running(62)         /srv/compose/homelab/docker-compose.yml
humandestiny               running(1)          /data/sda/humandestiny/compose.yml
llm-wiki-site              running(1)          /data/sda/srv/compose/llm-wiki-site/docker-compose.yml
wagdie-simplified          running(15)         /srv/compose/wagdie-simplified/docker-compose.yml
wagdie-simplified-dev      running(6)          /data/sda/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml,/srv/compose/wagdie-simplified-dev/docker-compose.yml,/srv/compose/wagdie-simplified-dev/docker-compose.bots.override.yml,/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml
wagdie-wiki                running(2)          /srv/compose/wagdie-wiki/docker-compose.wiki.yml
```

All active Compose config files resolve to SDA-backed paths, even when labels/config paths spell them as `/srv/compose/...`:

```text
blacksand-clear-site|...|real=/data/sda/srv/compose/blacksand-clear-site/docker-compose.yml|mount=/data/sda /dev/sda1 ext4
blacksand-clear-supabase|...|real=/data/sda/srv/compose/blacksand-clear-supabase/docker-compose.yml|mount=/data/sda /dev/sda1 ext4
homelab|...|real=/data/sda/srv/compose/homelab/docker-compose.yml|mount=/data/sda /dev/sda1 ext4
humandestiny|...|real=/data/sda/humandestiny/compose.yml|mount=/data/sda /dev/sda1 ext4
llm-wiki-site|...|real=/data/sda/srv/compose/llm-wiki-site/docker-compose.yml|mount=/data/sda /dev/sda1 ext4
wagdie-simplified|...|real=/data/sda/srv/compose/wagdie-simplified/docker-compose.yml|mount=/data/sda /dev/sda1 ext4
wagdie-simplified-dev|...|real=/data/sda/srv/compose/wagdie-simplified-dev/docker-compose.dev-app.yml|mount=/data/sda /dev/sda1 ext4
wagdie-wiki|...|real=/data/sda/srv/compose/wagdie-wiki/docker-compose.wiki.yml|mount=/data/sda /dev/sda1 ext4
```

The four stopped containers in `docker ps -a` were unlabeled one-off/exited containers (`admiring_golick`, `confident_wilbur`, `strange_matsumoto`, `optimistic_bhaskara`). Their reclaimable container writable data is part of Docker's active data root on SDA, not root-filesystem duplicate Compose state.

#### Docker storage root vs old root-backed Docker directory

Active Docker daemon storage is SDA-backed:

```text
$ docker info --format 'DockerRootDir={{.DockerRootDir}} Driver={{.Driver}} CgroupDriver={{.CgroupDriver}}'
DockerRootDir=/data/sda/var/lib/docker Driver=overlayfs CgroupDriver=systemd

$ cat /etc/docker/daemon.json
{
  "data-root": "/data/sda/var/lib/docker"
}

$ df -h / /data/sda /var/lib/docker /data/sda/var/lib/docker
/dev/nvme0n1p2  916G  822G   48G  95% /
/dev/sda1       916G   54G  816G   7% /data/sda
/dev/nvme0n1p2  916G  822G   48G  95% /var/lib/docker
/dev/sda1       916G   54G  816G   7% /data/sda/var/lib/docker
```

`/var/lib/docker` still exists on `/` and is not a mountpoint or symlink:

```text
/var/lib/docker mode=drwx--x--- owner=root:root size=4096 mtime=2026-05-19 10:08:43 -0400
/data/sda/var/lib/docker mode=drwx--x--- owner=root:root size=4096 mtime=2026-05-19 10:53:08 -0400
/var/lib/docker is not a mountpoint
/data/sda/var/lib/docker is not a mountpoint
sudo: a password is required
```

Because non-sudo access cannot read the contents, the apparent `4.0K` non-sudo `du` result for `/var/lib/docker` should not be trusted as a true size. It is not the daemon `DockerRootDir`, but it is still referenced by the running `cadvisor` container as a bind mount:

```text
/cadvisor|project=homelab|service=cadvisor|... /var/lib/docker->/var/lib/docker; ...
/var/lib/docker|type=bind|findmnt=/ /dev/nvme0n1p2 ext4|uses=1|sample=cadvisor:/var/lib/docker (homelab/cadvisor)
```

Conclusion: `/var/lib/docker` is likely old root-backed Docker storage from before the SDA data-root migration, but it is not cleanup-safe yet because a running service binds it and sudo inspection was unavailable.

#### Named volumes and container mounts

All named Docker volumes inspected had mountpoints under the active SDA Docker root, for example:

```text
homelab_prometheus_data|mountpoint=/data/sda/var/lib/docker/volumes/homelab_prometheus_data/_data
supabase_db_keyboard|mountpoint=/data/sda/var/lib/docker/volumes/supabase_db_keyboard/_data
wagdie-simplified-dev_elizaos-db-data|mountpoint=/data/sda/var/lib/docker/volumes/wagdie-simplified-dev_elizaos-db-data/_data
wagdie-simplified_elizaos-db-data|mountpoint=/data/sda/var/lib/docker/volumes/wagdie-simplified_elizaos-db-data/_data
```

Representative active bind mounts split into SDA-backed and root-backed groups:

```text
# SDA-backed active bind mounts via /srv/compose symlink or direct /data/sda
/srv/compose/homelab/config/bookstack -> /config
/srv/compose/homelab/config/caddy/data -> /data
/srv/compose/wagdie-simplified/volumes/db/data -> /var/lib/postgresql/data
/srv/compose/wagdie-wiki/volumes/wiki/files -> /wiki/data
/data/sda/srv/compose/blacksand-clear-supabase/volumes/db/data -> /var/lib/postgresql/data
/data/sda/humandestiny/site -> /usr/share/nginx/html

# Root-backed active bind mounts that are not duplicate checkouts
/srv/media/immich -> immich upload path
/srv/media/{movies,music,tv,books} and /srv/downloads -> Jellyfin/*arr/Calibre paths
/var/lib/docker -> cadvisor read-only Docker-root bind
/ -> node-exporter/cadvisor host rootfs bind
/etc/localtime and /etc/timezone -> time config binds
```

Observed active root-backed media/download mount sizes were small during this probe:

```text
24K   /srv/downloads
226M  /srv/media
226M  /srv/media/immich
4.0K  /srv/media/books
4.0K  /srv/media/movies
4.0K  /srv/media/music
4.0K  /srv/media/tv
```

`/srv/data` is a symlink to SDA, so the active Urbit bind is not root-backed:

```text
/srv/data -> /data/sda/srv/data
/srv/data/urbit real=/data/sda/srv/data/urbit mount=/data/sda /dev/sda1 ext4
```

#### Compose-like/checkouts discovered on root vs SDA

Targeted `find` over `/srv`, `/home/saltysloane`, `/opt`, `/var`, `/tmp`, `/data/sda/srv`, and `/data/sda/humandestiny` found these meaningful Compose/checkouts:

SDA-backed active paths:

- `/data/sda/srv/compose/blacksand-clear-site`
- `/data/sda/srv/compose/blacksand-clear-supabase`
- `/data/sda/srv/compose/homelab`
- `/data/sda/srv/compose/llm-wiki-site`
- `/data/sda/srv/compose/wagdie-simplified`
- `/data/sda/srv/compose/wagdie-simplified-dev`
- `/data/sda/srv/compose/wagdie-wiki`
- `/data/sda/humandestiny`
- `/home/saltysloane/projects/wagdie-simplified-dev`, but this is a symlink to `/srv/compose/wagdie-simplified-dev`, which resolves to `/data/sda/srv/compose/wagdie-simplified-dev`.

Root-backed compose-like or Dockerfile-bearing paths that are not in active `docker compose ls`:

- `/srv/compose.before-sda-cutover-20260519-095951/homelab`
- `/srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki`
- `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified`
- `/home/saltysloane/eliza`
- `/home/saltysloane/Desktop/Zonos`
- `/home/saltysloane/wagdie-backups/...`
- `/tmp/wagdie-dev-recovery-check`

Other Dockerfiles/Compose examples were found inside development caches or module caches, such as `.bun`, `.pyenv`, `go/pkg/mod`, and active homelab documentation caches. These are source/cache artifacts, not Docker daemon instances or active Compose projects based on the inspected Docker metadata.

#### Candidate reference checks

Focused checks for cleanup-candidate paths found no Docker metadata, Compose inventory, named-volume, process, accessible systemd, timer, cron, or common-script references to:

```text
/srv/compose.before-sda-cutover-20260519-095951
/home/saltysloane/eliza
/home/saltysloane/Desktop/Zonos
/home/saltysloane/wagdie-backups
/home/saltysloane/secret-rotation-backups
/tmp/wagdie-dev-recovery-check
```

Evidence:

```text
$ docker inspect $(docker ps -aq) --format '...' | grep -E '<candidate paths>'
# no output

$ docker compose ls --all | grep -E '<candidate paths>'
# no output

$ docker volume inspect $(docker volume ls -q) | grep -E '<candidate paths>'
# no output

$ ps -eo pid,user,cmd | grep -E '<candidate paths>' | grep -v grep
# no output

$ crontab -l
* * * * * flock -n /data/sda/srv/ops/wagdie-eliza-location-room-sync.lock /data/sda/srv/ops/wagdie-dev-sync-location-rooms.sh >> /data/sda/srv/ops/wagdie-eliza-location-room-sync.log 2>&1

$ grep -RInE '<candidate paths>' /etc/crontab /etc/cron.d /etc/cron.* /etc/systemd/system /usr/lib/systemd/system /lib/systemd/system /home/saltysloane/.config/systemd /usr/local/bin /usr/local/sbin /home/saltysloane/.local/bin /data/sda/srv/ops
# no output

$ sudo -n grep -RInE '<candidate paths>' /var/spool/cron /var/spool/cron/crontabs
sudo: a password is required
```

The main remaining blind spots are sudo-only root cron spool and sudo-only contents/sizing of `/var/lib/docker`.

#### Size/reclaim estimates

```text
# Root-backed cleanup candidates
27G   /srv/compose.before-sda-cutover-20260519-095951
26G   /srv/compose.before-sda-cutover-20260519-095951/homelab
947M  /srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki
535M  /srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified
6.1G  /home/saltysloane/Desktop/Zonos
4.4G  /home/saltysloane/eliza
299M  /home/saltysloane/wagdie-backups
44K   /home/saltysloane/secret-rotation-backups
unknown /var/lib/docker (sudo-only content; non-sudo cannot size it reliably)

# Low root reclaim or not ext4-root reclaim
0     /home/saltysloane/projects/wagdie-simplified-dev -> /data/sda/srv/compose/wagdie-simplified-dev
99M   /tmp/wagdie-dev-recovery-20260524064817.tar.gz (tmpfs)
215M  /tmp/wagdie-dev-recovery-check (tmpfs; registered Git worktree)
24K   /srv/downloads (active Docker bind)
226M  /srv/media (active Docker bind)
8K    /srv/data/urbit -> /data/sda/srv/data/urbit
30G   /data/sda/srv/compose (active SDA-backed compose tree; not root reclaim)
```

`du` reported permission-denied lines inside database/certificate/data directories in both active and backup compose trees, so the backup-tree figures are best treated as approximate lower-bound/visible estimates from the non-sudo user.

#### Cleanup classification table

| Classification | Path(s) | Evidence | Reclaim estimate | Recommendation |
|---|---:|---|---:|---|
| Must not touch | `/data/sda/var/lib/docker` | Active `DockerRootDir`; all named volume mountpoints under it | Not root reclaim | Do not remove or mutate. |
| Must not touch | `/srv/compose` -> `/data/sda/srv/compose` and active project dirs under it | Active `docker compose ls`; labels and config files resolve to SDA | Not root reclaim | Do not remove or mutate. |
| Must not touch | `/data/sda/humandestiny` | Active Compose project `humandestiny`; SDA-backed | Not root reclaim | Do not remove or mutate. |
| Must not touch | `/home/saltysloane/projects/wagdie-simplified-dev` | Symlink to active `/srv/compose/wagdie-simplified-dev` -> SDA | 0 on root | Do not treat as duplicate root checkout. |
| Must not touch | `/srv/media`, `/srv/downloads` | Active homelab bind mounts for Jellyfin/Immich/*arr/Calibre | ~226M + 24K on root | Not duplicate Docker instances; leave alone unless deliberately migrating media binds. |
| Unsafe/unknown | `/var/lib/docker` | Root-backed, not active `DockerRootDir`, but running `cadvisor` binds it; sudo-only contents | Unknown | Do not delete. First inspect with sudo and fix/redeploy cAdvisor to use the active data root if desired. |
| Safe from active runtime refs, retention-gated | `/srv/compose.before-sda-cutover-20260519-095951` | No inspected Docker/Compose/volume/process/systemd/cron/script refs; old pre-SDA-cutover tree | ~27G on `/` | Best broad root reclaim candidate, but retire only after homelab/wiki/WAGDIE retention approval. |
| Safe from active runtime refs, retention-gated | `/srv/compose.before-sda-cutover-20260519-095951/homelab` | Backup copy of active homelab compose tree; no refs | ~26G on `/` | Do not remove as WAGDIE-only; owner approval needed. |
| Safe from active runtime refs, retention-gated | `/srv/compose.before-sda-cutover-20260519-095951/wagdie-wiki` | Backup copy; no refs | ~947M on `/` | Runtime-safe from inspected refs; retention approval needed. |
| Safe from active runtime refs, retention-gated | `/srv/compose.before-sda-cutover-20260519-095951/wagdie-simplified` | Backup copy; no refs | ~535M on `/` | Runtime-safe from inspected refs; retention approval needed. |
| Safe from active runtime refs, retention-gated | `/home/saltysloane/eliza` | Root-backed compose checkout; not in Compose ls; no inspected refs | ~4.4G on `/` | Potential root reclaim, but likely source/work checkout; confirm owner/retention before removal. |
| Safe from active runtime refs, retention-gated | `/home/saltysloane/Desktop/Zonos` | Root-backed compose checkout; not in Compose ls; no inspected refs | ~6.1G on `/` | Potential root reclaim, but likely source/work checkout; confirm owner/retention before removal. |
| Safe from active runtime refs, retention-gated | `/home/saltysloane/wagdie-backups` | Backup tree; no inspected refs | ~299M on `/` | Runtime-safe; backup-retention approval needed. |
| Safe but sensitive/low-value | `/home/saltysloane/secret-rotation-backups` | No inspected refs; tiny; likely env/secret material | ~44K on `/` | Handle by secret-retention policy, not disk-pressure priority. |
| Low-value due tmpfs; Git-caveated | `/tmp/wagdie-dev-recovery-check` | No Docker refs, but registered Git worktree for active dev checkout | ~215M tmpfs | Not ext4-root reclaim; remove only through intentional Git worktree cleanup. |
| Low-value due tmpfs | `/tmp/wagdie-dev-recovery-20260524064817.tar.gz` and other `/tmp/wagdie-dev-*` artifacts | No inspected refs; `/tmp` is tmpfs | ~99M+ tmpfs | Does not address root ext4 pressure. |
| Low-value/not active instance | Dockerfiles/Compose files under `.bun`, `.pyenv`, `go/pkg/mod`, and docs caches | Source/cache artifacts found by filename search, not active Docker metadata | Unknown | Do not classify as duplicate Docker instances without separate cache/source cleanup review. |

#### All-Docker conclusion

The active Docker daemon and all active Compose projects are SDA-backed. The broadened investigation did **not** find active duplicate Docker/Compose instances running from root-backed checkouts. The meaningful root-backed Docker-related cleanup candidates are old backup/source trees, especially the pre-SDA-cutover compose snapshot (`~27G`) plus root-home source checkouts (`/home/saltysloane/eliza` and `/home/saltysloane/Desktop/Zonos`, combined `~10.5G`). The one root-backed Docker storage path, `/var/lib/docker`, is not the active daemon root but remains unsafe/unknown because `cadvisor` actively bind-mounts it and non-sudo inspection cannot determine its true contents/size.

## Investigation Log

### Phase 1 - Initial assessment
**Hypothesis:** There may be obsolete WAGDIE Docker resources and/or compose checkouts rooted on `/` in addition to the active SDA-backed dev deployment.
**Findings:** Report created; prior deployment context recorded.
**Evidence:** Prior session transcript supplied by user.
**Conclusion:** Needs remote filesystem and Docker inspection before any removal.

## Root Cause
The apparent duplicate Docker/Compose paths are caused by the SDA migration layout and leftover pre-migration/source trees:

- `/srv/compose` is a symlink to `/data/sda/srv/compose`, so active Compose projects that display `/srv/compose/...` are actually SDA-backed.
- Docker's daemon data root is `/data/sda/var/lib/docker`, so active images/layers/named volumes are not rooted on `/`.
- All active Compose projects discovered by `docker compose ls --all` resolve to SDA-backed config paths: `blacksand-clear-site`, `blacksand-clear-supabase`, `homelab`, `humandestiny`, `llm-wiki-site`, `wagdie-simplified`, `wagdie-simplified-dev`, and `wagdie-wiki`.
- The root-backed Docker-related paths are not active duplicate instances; they are backup/source trees (`/srv/compose.before-sda-cutover-20260519-095951`, `/home/saltysloane/eliza`, `/home/saltysloane/Desktop/Zonos`, `/home/saltysloane/wagdie-backups`) plus an old `/var/lib/docker` directory that still needs sudo/cAdvisor review.

## Recommendations
1. **Do not touch active Docker runtime storage:** `/data/sda/var/lib/docker`, active Docker volumes, or any active Compose project under `/data/sda/...` or `/srv/compose/...`.
2. **Do not treat `/srv/compose` as a root duplicate.** It is the active symlink alias for `/data/sda/srv/compose`.
3. **Best broad root reclaim candidate:** `/srv/compose.before-sda-cutover-20260519-095951` appears safe from inspected active runtime references and would reclaim about `27G`, but it contains `homelab`, `wagdie-wiki`, and `wagdie-simplified` backups; remove only after owner/backup-retention approval.
4. **Additional root-backed cleanup candidates after owner approval:** `/home/saltysloane/eliza` (`~4.4G`) and `/home/saltysloane/Desktop/Zonos` (`~6.1G`). They are not active Compose projects and had no inspected runtime references, but look like source/work checkouts rather than pure Docker garbage.
5. **Smaller retention-gated candidates:** `/home/saltysloane/wagdie-backups` (`~299M`) and `/home/saltysloane/secret-rotation-backups` (`~44K`, sensitive material).
6. **Do not delete `/var/lib/docker` yet.** It is not the active Docker data root, but running `homelab/cadvisor` bind-mounts it; inspect with sudo and adjust/redeploy cAdvisor before considering cleanup.
7. **Do not expect `/tmp/wagdie-dev-*` cleanup to help ext4 root pressure.** `/tmp` is tmpfs; `/tmp/wagdie-dev-recovery-check` is also a registered Git worktree and needs Git worktree cleanup if retired.
8. **Remaining verification before actual deletion:** inspect root cron spool with sudo and confirm backup retention/owner signoff for non-WAGDIE `homelab`, `wiki`, `eliza`, and `Zonos` paths.

## Preventive Measures
- Keep Docker daemon root and compose checkouts on `/data/sda`; periodically verify with `docker info --format '{{.DockerRootDir}}'`, `docker compose ls --all`, and `readlink -f /srv/compose`.
- Update cAdvisor/homelab monitoring to bind the active Docker data root if Docker-root monitoring is intended.
- Name backup directories with owner, purpose, and retention date, e.g. `compose.before-sda-cutover-YYYYMMDD-delete-after-YYYYMMDD`.
- Keep a small runbook for SDA cutovers/cleanup that records which paths are symlinks, which are active, and which are backups.
- Add a periodic disk report that separates `/`, `/data/sda`, and tmpfs usage so Docker-on-SDA cleanup is not mistaken for root-disk cleanup.
