#!/usr/bin/env bash
# Restore OpenClaw autonomous setup from a backup tarball

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup-tar.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

echo "[*] Restoring from $BACKUP_FILE..."

# Extract to home (preserves paths)
tar -xzf "$BACKUP_FILE" -C "$HOME"

# Recreate sudoers snippet if present
if [ -f "$HOME/etc/sudoers.d/openclaw" ]; then
  echo "[*] Installing sudoers snippet (requires sudo)..."
  sudo cp "$HOME/etc/sudoers.d/openclaw" /etc/sudoers.d/openclaw
  sudo chmod 440 /etc/sudoers.d/openclaw
fi

# Reinstall systemd user units
echo "[*] Reloading systemd user daemon..."
systemctl --user daemon-reload || true

# Re-enable linger (for user services without login)
echo "[*] Enabling user lingering..."
sudo loginctl enable-linger "$(whoami)" || true

# Restart services
echo "[*] Starting OpenClaw gateway..."
systemctl --user restart openclaw-gateway.service || true

echo "[*] Starting autonomous timer and event watcher..."
systemctl --user enable --now openclaw-autonomous.timer || true
systemctl --user restart openclaw-eventwatcher.service || true

# Optional: reinstall npm global package (if needed)
# npm i -g openclaw

echo "[+] Restore complete."
echo "[+] Check status:"
echo "    systemctl --user status openclaw-gateway.service"
echo "    systemctl --user status openclaw-autonomous.timer"
echo "    systemctl --user status openclaw-eventwatcher.service"