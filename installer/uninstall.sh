#!/usr/bin/env bash
# OpenClaw Autonomous — Uninstaller
set -euo pipefail

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
INSTALL_DIR="${HOME}/openclaw-autonomous"
SYMLINK="${HOME}/.openclaw/autonomous"
AGENT_DIR="${HOME}/.openclaw/agents/deina"

echo "Stopping services..."
systemctl --user stop openclaw-autonomous.timer 2>/dev/null || true
systemctl --user stop openclaw-eventwatcher.service 2>/dev/null || true

echo "Disabling systemd units..."
systemctl --user disable openclaw-autonomous.timer 2>/dev/null || true
systemctl --user disable openclaw-eventwatcher.service 2>/dev/null || true

echo "Removing systemd unit files..."
rm -f "${SYSTEMD_USER_DIR}/openclaw-autonomous.timer"
rm -f "${SYSTEMD_USER_DIR}/openclaw-autonomous.service"
rm -f "${SYSTEMD_USER_DIR}/openclaw-eventwatcher.service"
systemctl --user daemon-reload

echo "Removing symlink..."
rm -f "${SYMLINK}"

read -p "Delete installation directory ${INSTALL_DIR}? (y/N) " -n1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "${INSTALL_DIR}"
  echo "Deleted ${INSTALL_DIR}"
fi

read -p "Remove agent definition ${AGENT_DIR}? (y/N) " -n1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "${AGENT_DIR}"
  echo "Deleted ${AGENT_DIR}"
fi

echo "Uninstall complete. Note: ~/.openclaw/workspace and ~/openclaw-backup/ preserved."
