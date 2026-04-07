#!/usr/bin/env bash
# Full backup and migration script for OpenClaw autonomous setup
# Creates a timestamped tarball containing all necessary files for migration

set -euo pipefail

BACKUP_DIR="$HOME/openclaw-backup"
INFRA_DIR="$HOME/openclaw-infra"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/openclaw-migration-${TIMESTAMP}.tar.gz"

# Ensure backup dir exists
mkdir -p "$BACKUP_DIR"

echo "[*] Collecting files for backup..."

# 1. OpenClaw config and data
tar -czf "$BACKUP_FILE" \
  -C "$HOME" \
  .openclaw \
  .config/systemd/user \
  nullclaw \
  openclaw-backup \
  2>/dev/null || true

# 2. Crontab
crontab -l > "$BACKUP_DIR/crontab-${TIMESTAMP}.txt" 2>/dev/null || echo "# No crontab" > "$BACKUP_DIR/crontab-${TIMESTAMP}.txt"
tar -rzf "$BACKUP_FILE" -C "$BACKUP_DIR" "crontab-${TIMESTAMP}.txt" && rm "$BACKUP_DIR/crontab-${TIMESTAMP}.txt"

# 3. Sudoers snippet (if exists)
if [ -f /etc/sudoers.d/openclaw ]; then
  sudo cp /etc/sudoers.d/openclaw "$BACKUP_DIR/sudoers-openclaw-${TIMESTAMP}.txt"
  tar -rzf "$BACKUP_FILE" -C "$BACKUP_DIR" "sudoers-openclaw-${TIMESTAMP}.txt" && rm "$BACKUP_DIR/sudoers-openclaw-${TIMESTAMP}.txt"
fi

# 4. Include migration scripts themselves (from infra dir)
if [ -d "$INFRA_DIR" ]; then
  tar -rzf "$BACKUP_FILE" -C "$INFRA_DIR" . || true
fi

echo "[+] Backup created: $BACKUP_FILE"
echo "[+] Size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "[+] To restore on new machine:"
echo "    scp $BACKUP_FILE user@newhost:~/"
echo "    tar -xzf ~/openclaw-migration-${TIMESTAMP}.tar.gz -C ~"
echo "    Then run: restore-from-backup.sh"