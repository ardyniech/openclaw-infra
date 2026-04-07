#!/usr/bin/env node
/**
 * Notifier - Simple file-based logging for autonomous events.
 * Writes notifications to ~/.openclaw/workspace/logs/notifications.log
 * (Telegram integration can be added later)
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'workspace', 'logs', 'notifications.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function notify(type, data) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${type}: ${JSON.stringify(data)}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// Args: <type> <json_payload>
const type = process.argv[2] || 'unknown';
let payload = {};
if (process.argv[3]) {
  try {
    payload = JSON.parse(process.argv[3]);
  } catch (e) {
    payload = { message: process.argv[3] };
  }
}

notify(type, payload);
process.exit(0);