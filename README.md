# OpenClaw Autonomous Infrastructure

This repository contains the complete setup for a self-maintaining OpenClaw system, including:

- configuration files
- systemd user units & timers
- autonomous modules (Node.js)
- migration & backup scripts
- documentation

## Structure

```
.
├── backup-and-migrate.sh     # Create full backup tarball
├── restore-from-backup.sh    # Restore from backup on new machine
├── github-sync.sh            # Auto-commit & push to GitHub (requires remote)
├── docs/
│   ├── FEATURES.md          # Feature inventory (auto-updated)
│   └── MIGRATION.md         # Step-by-step migration guide
├── autonomous/              # Node modules (predictor, tuner, logger, etc.)
├── systemd-user/            # systemd service & timer units
├── config/                  # config.json, sudoers snippet, crontab
└── scripts/                 # health_cycle.sh, log_rotate.sh, backup_config.sh, etc.
```

## Setup (First Time)

1. Clone to `~/openclaw-infra`
2. Run `./backup-and-migrate.sh` after installing OpenClaw to bootstrap backup dir
3. Enable systemd units:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now openclaw-autonomous.timer
   systemctl --user enable --now openclaw-eventwatcher.service
   ```
4. Configure daily backup in crontab (already in `scripts/backup_config.sh` can be used)

## Backup & Migration

- Daily full backups are stored in `~/openclaw-backup/` by `backup_config.sh` (cron)
- For major upgrades/moves, use `./backup-and-migrate.sh` to create a migration tarball
- Restore on new machine: extract tarball then run `restore-from-backup.sh`

## GitHub Sync

1. Create a private repository on GitHub.
2. Add it as remote:
   ```bash
   cd ~/openclaw-infra
   git remote add origin git@github.com:yourname/yourrepo.git
   git push -u origin main
   ```
3. Enable daily auto-sync by adding to crontab:
   ```bash
   0 3 * * * /home/ardy/openclaw-infra/github-sync.sh
   ```

**Important:** Sensitive data (tokens, keys) are excluded via `.gitignore`. Use environment variables or encrypted files for production secrets.

## Maintenance

- FEATURES.md is updated automatically as the system evolves.
- Check services with `systemctl --user status openclaw-*`
- Logs: `~/.openclaw/workspace/logs/`

---

Built by Deina, your autonomous machine caretaker.