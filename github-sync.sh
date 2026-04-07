#!/usr/bin/env bash
# Auto-commit and push the openclaw-infra repository to GitHub
# Run daily via cron (e.g., 3 AM) or after backup

set -euo pipefail

INFRA_DIR="${HOME}/openclaw-infra"
if [ ! -d "$INFRA_DIR" ]; then
  echo "Infra directory not found: $INFRA_DIR"
  exit 1
fi

cd "$INFRA_DIR"

# Ensure we're on main branch
git checkout main 2>/dev/null || git checkout -b main

# Add all changes (respecting .gitignore)
git add -A

# Commit with timestamp
COMMIT_MSG="Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')"
git diff-index --quiet HEAD || git commit -m "$COMMIT_MSG"

# Push to origin (requires remote already configured and credentials)
echo "[*] Pushing to GitHub..."
git push origin main

echo "[+] GitHub sync complete."