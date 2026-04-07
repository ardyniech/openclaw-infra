#!/usr/bin/env bash
# OpenClaw Autonomous — Upgrade script
set -euo pipefail

INSTALL_DIR="${HOME}/openclaw-autonomous"

if [ ! -d "${INSTALL_DIR}" ]; then
  echo "Installation not found at ${INSTALL_DIR}. Abort."
  exit 1
fi

echo "Backing up current state..."
"${INSTALL_DIR}/scripts/backup-and-migrate.sh" || true

echo "Stopping services..."
systemctl --user stop openclaw-autonomous.timer 2>/dev/null || true
systemctl --user stop openclaw-eventwatcher.service 2>/dev/null || true

echo "Updating code via git pull..."
cd "${INSTALL_DIR}"
git fetch --all
git reset --hard origin/main

echo "Reloading systemd daemon..."
systemctl --user daemon-reload

echo "Starting services..."
systemctl --user start openclaw-eventwatcher.service
systemctl --user start openclaw-autonomous.timer

echo "Upgrade complete. Verify:"
echo "  systemctl --user status openclaw-autonomous.timer"
echo "  systemctl --user status openclaw-eventwatcher.service"
