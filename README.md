# OpenClaw Autonomous System

A portable, production‑ready package that adds full autonomous capabilities to any OpenClaw installation.

- Predictive maintenance & self‑tuning
- Task queue & auto‑enrichment
- Capacity planning & health scoring
- Telegram notifications (optional)
- Backup, migration, and GitHub sync out of the box

## Repository Structure

```
.
├── src/                    # Core modules (Node.js)
│   ├── predictor.js
│   ├── tuner.js
│   ├── capacity_planner.js
│   ├── profile_learner.js
│   ├── queue_enricher.js
│   ├── queue_processor.js
│   ├── event_watcher.js
│   ├── logger.js
│   ├── notifier.js
│   ├── orchestrator.js
│   └── config.json
├── systemd/                # systemd user units
│   ├── openclaw-autonomous.timer
│   ├── openclaw-autonomous.service
│   └── openclaw-eventwatcher.service
├── scripts/                # Maintenance & sync
│   ├── backup-and-migrate.sh
│   ├── restore-from-backup.sh
│   └── github-sync.sh
├── docs/
│   ├── FEATURES.md        # Feature inventory (auto‑updated)
│   ├── MIGRATION.md       # Step‑by‑step migration guide
│   └── ARCHITECTURE.md    # System design
├── installer/
│   ├── install.sh
│   ├── uninstall.sh
│   └── upgrade.sh
├── VERSION
├── LICENSE
└── CHANGELOG.md
```

## Quick Install

From a fresh machine with OpenClaw already installed:

```bash
# 1. Clone this repository
git clone https://github.com/ardyniech/openclaw-autonomous.git ~/openclaw-autonomous
cd ~/openclaw-autonomous

# 2. Run installer
./installer/install.sh
```

The installer will:

- Copy files to `~/openclaw-autonomous`
- Create symlink `~/.openclaw/autonomous` → `~/openclaw-autonomous/src`
- Install systemd user units to `~/.config/systemd/user/`
- Enable lingering (so services start without login)
- Create agent definition for Deina
- Start the autonomous timer and event watcher

After install, verify:

```bash
systemctl --user status openclaw-autonomous.timer
systemctl --user status openclaw-eventwatcher.service
```

## How It Works

- **Orchestrator** runs every 5 minutes via systemd timer, sequentially executing:
  predictor → tuner → logger → capacity → profile → enricher → queue
- **EventWatcher** runs continuously, polls latest health JSON every 10 seconds, triggers immediate self‑heal on CRITICAL alerts.
- **Queue Processor** executes tasks from `~/.openclaw/workspace/queue.md` (manual or system enqueued).
- **Notifications** are sent to Telegram (if configured) respecting quiet hours from USER_PROFILE.

## User Workspace

Runtime data lives under `~/.openclaw/workspace/`:

- `logs/` – health, reports, autonomous logs
- `queue.md` – task queue (batch processing)
- `memory/` – daily notes and USER_PROFILE.json

## Backup & Migration

- Daily backups (tarballs) are created by `scripts/backup-and-migrate.sh` (cron) into `~/openclaw-backup/`.
- To migrate to a new machine, copy the latest tarball and run `scripts/restore-from-backup.sh`.
- The install script can also be used on a new machine to bootstrap the autonomous engine.

## GitHub Sync

To keep this repository up to date across machines:

```bash
cd ~/openclaw-autonomous
git remote add origin git@github.com:yourname/yourrepo.git
git push -u origin main

# Optional: daily auto-sync (cron)
(crontab -l; echo "0 3 * * * ${HOME}/openclaw-autonomous/scripts/github-sync.sh") | crontab -
```

## Upgrading

```bash
cd ~/openclaw-autonomous
./installer/upgrade.sh
```

The upgrade script performs a backup, pulls latest from Git, reloads systemd and restarts services.

## Uninstall

```bash
cd ~/openclaw-autonomous
./installer/uninstall.sh
```

Note: this preserves `~/.openclaw/workspace` and `~/openclaw-backup/` in case you want to keep logs and backups.

## Configuration

- Autonomous modules config: `~/openclaw-autonomous/src/config.json`
- OpenClaw core config: `~/.openclaw/openclaw.json`
- Telegram notifications require `botToken` in core config and `userId` in autonomous config.

## Development

Modules are plain Node.js scripts. To add a new module, edit `src/` and integrate it into `orchestrator.js`.

## License

MIT

---

Built for Deina — your autonomous machine caretaker.
