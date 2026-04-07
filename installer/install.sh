#!/usr/bin/env bash
# OpenClaw Autonomous System — Installer
set -euo pipefail

# Defaults
INSTALL_DIR="${HOME}/openclaw-autonomous"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
OPENCLAW_AUTONOMOUS_SYMLINK="${HOME}/.openclaw/autonomous"

# Colors
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${GREEN}OpenClaw Autonomous Installer${NC}"
echo "Installation directory: ${INSTALL_DIR}"
read -p "Confirm? (y/N) " -n1 -r; echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# 1. Ensure Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}Node.js not found. Please install Node.js 22+ first.${NC}"
  exit 1
fi

# 2. Copy files to install dir (if not already there)
if [ -d "${INSTALL_DIR}" ]; then
  echo "Directory exists: ${INSTALL_DIR}. Skipping copy."
else
  echo "Copying files to ${INSTALL_DIR} ..."
  cp -r . "${INSTALL_DIR}"
fi

# 3. Create symlink
echo "Creating symlink: ${OPENCLAW_AUTONOMOUS_SYMLINK} -> ${INSTALL_DIR}/src"
mkdir -p "$(dirname "${OPENCLAW_AUTONOMOUS_SYMLINK}")"
rm -f "${OPENCLAW_AUTONOMOUS_SYMLINK}"
ln -s "${INSTALL_DIR}/src" "${OPENCLAW_AUTONOMOUS_SYMLINK}"

# 4. Install systemd user units
echo "Installing systemd user units to ${SYSTEMD_USER_DIR}"
mkdir -p "${SYSTEMD_USER_DIR}"
cp "${INSTALL_DIR}/systemd/"* "${SYSTEMD_USER_DIR}/"
systemctl --user daemon-reload

# 5. Enable lingering (for user services without login)
echo "Enabling user lingering (requires sudo)..."
if command -v loginctl &>/dev/null; then
  sudo loginctl enable-linger "$(whoami)" || true
else
  echo "loginctl not found, skipping lingering"
fi

# 6. Create agent definition (optional)
AGENTS_DIR="${HOME}/.openclaw/agents/deina"
if [ ! -d "${AGENTS_DIR}" ]; then
  mkdir -p "${AGENTS_DIR}"
  cat > "${AGENTS_DIR}/agent.md" <<EOF
# Deina — Autonomous Machine Caretaker

identity:
  name: Deina
  creature: autonomous machine caretaker AI
  vibe: professional but approachable, 24/7 operational mindset
  emoji: 🤖

system_prompt: |
  You are Deina, a self-maintaining, self-healing, self-learning system administrator.
  You monitor health, solve errors, build and repair autonomously, and keep the machine running smoothly.
  Be resourceful, earn trust through competence, respect privacy, and never pursue self-preservation.
EOF
  echo "Created agent definition at ${AGENTS_DIR}/agent.md"
else
  echo "Agent directory exists, skipping."
fi

# 7. Start services
echo "Starting services..."
systemctl --user enable --now openclaw-autonomous.timer
systemctl --user restart openclaw-eventwatcher.service

# 8. Done
echo -e "${GREEN}Installation complete!${NC}"
echo "Verify with:"
echo "  systemctl --user status openclaw-autonomous.timer"
echo "  systemctl --user status openclaw-eventwatcher.service"
echo "Considerreboot to ensure lingering services start properly."
