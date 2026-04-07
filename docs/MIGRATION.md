# Migration Guide — OpenClaw Autonomous Setup

## Overview

This guide moves your entire autonomous OpenClaw installation from one machine to another (e.g., hardware upgrade). All configuration, services, scripts, and data are bundled into a single backup tarball.

## On the Source Machine (old)

1. Create a fresh backup:
   ```bash
   cd ~/openclaw-infra
   ./backup-and-migrate.sh
   ```
   Output: `~/openclaw-backup/openclaw-migration-<timestamp>.tar.gz`

2. Transfer the tarball to the new machine (scp, rsync, USB, etc.):
   ```bash
   scp ~/openclaw-backup/openclaw-migration-*.tar.gz user@newhost:~/ 
   ```

## On the Target Machine (new)

Prerequisites:

- Same user home (`/home/ardy`) and sudo access
- Node.js 22+ and npm installed (for Node modules)
- Systemd user manager active (most distros have it by default)
- Install OpenClaw globally (if not already):
  ```bash
  sudo npm i -g openclaw
  ```

Restore:

```bash
# Place the tarball in your home
tar -xzf openclaw-migration-*.tar.gz -C ~
# This will extract: .openclaw/, .config/systemd/user/, etc.

# Run the restore helper (optional but recommended)
~/openclaw-infra/restore-from-backup.sh ~/openclaw-migration-*.tar.gz
```

The restore script will:
- Copy files into place
- Reinstall sudoers snippet (requires sudo)
- Reload systemd user daemon
- Enable lingering (`loginctl enable-linger $USER`)
- Restart openclaw-gateway and autonomous services

## Verification

Check services:

```bash
systemctl --user status openclaw-gateway.service
systemctl --user status openclaw-autonomous.timer
systemctl --user status openclaw-eventwatcher.service
```

Check logs:

```bash
tail -f ~/.openclaw/workspace/logs/health/health_latest.json
tail -f ~/.openclaw/workspace/logs/autonomous/orchestrator.log
tail -f ~/logs/notifications.log
```

Queue file: `~/workspace/queue.md`

Reports: `~/logs/reports/`

## Notes

- Sensitive tokens in `openclaw.json` are included; treat the tarball as secret.
- If the new machine has different architecture or paths, adjust paths in scripts accordingly.
- For a clean start, you may want to prune old logs (`log_rotate.sh` handles it automatically).

## Support

Read `FEATURES.md` for an up-to-date inventory of components.