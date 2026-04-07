#!/usr/bin/env node
/**
 * Notifier - Send Telegram messages via Bot API (direct HTTP), plus local log.
 * Respects cooldown; critical bypass.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const OPENCLAW_CONFIG = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const STATE_FILE = path.join(__dirname, 'notifier_state.json');
const LOG_FILE = path.join(__dirname, '..', 'workspace', 'logs', 'notifications.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAutonomousConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { notifications: { telegram: { enabled: false, userId: null } } };
  }
}

function loadUserProfile() {
  const profilePath = path.join(process.env.HOME, '.openclaw', 'workspace', 'memory', 'USER_PROFILE.json');
  try {
    const raw = fs.readFileSync(profilePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function loadOpenClawConfig() {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { channels: { telegram: { botToken: null } } };
  }
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {}
  }
  return { lastSent: 0, cooldownMs: 300000, criticalCooldownMs: 60000 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function canSendNow(state, priority = 'normal') {
  const now = Date.now();
  const cooldown = priority === 'critical' ? (state.criticalCooldownMs || 60000) : (state.cooldownMs || 300000);
  return (now - (state.lastSent || 0)) >= cooldown;
}

function isQuietHours() {
  const profile = loadUserProfile();
  const quiet = profile.notification_quiet_hours;
  if (!quiet || !quiet.start || !quiet.end) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = quiet.start.split(':').map(Number);
  const [eh, em] = quiet.end.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  // Handle overnight ranges (e.g., 23:00-06:00)
  if (end < start) {
    // Spans midnight
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

function formatMessage(type, payload) {
  switch (type) {
    case 'orchestrator':
      return `🤖 Autonomous Cycle\nStatus: ${payload.status}\nDuration: ${payload.durationMs}ms`;
    case 'tuner':
      return `⚙️ Tuner\n${payload.message || 'Update'}\nFailed: ${payload.failed ? payload.actions.length : 0}`;
    case 'predictor':
      const preds = payload.predictions || [];
      return `🔮 Predictions (${preds.length})\n${preds.map(p => `• ${p.type} (${p.probability}%)`).join('\n')}`;
    case 'event':
      return `🚨 EventWatcher\n${payload.message}\nHealed: ${payload.healed}`;
    case 'logger':
      return `📊 Report\n${payload.report}`;
    case 'queue':
      return `📥 Queue\nTotal: ${payload.total}, ✅ ${payload.completed}, ❌ ${payload.failed}`;
    case 'capacity':
      return `📈 Capacity\nHealth: ${payload.healthScore}, Forecast: ${JSON.stringify(payload.forecast)}`;
    default:
      return JSON.stringify(payload);
  }
}

function sendTelegramHTTPS(text) {
  return new Promise((resolve) => {
    const autCfg = loadAutonomousConfig();
    const ocCfg = loadOpenClawConfig();
    const userId = autCfg.notifications?.telegram?.userId;
    const botToken = ocCfg.channels?.telegram?.botToken;
    if (!userId || !botToken) {
      console.error('[Notifier] Missing userId or botToken');
      resolve(false);
      return;
    }

    const data = JSON.stringify({
      chat_id: userId,
      text: text,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error('[Notifier] Telegram API error:', res.statusCode, body);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Notifier] Telegram request error:', e.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[Notifier] Telegram request timed out');
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

async function notify(type, payload, priority = 'normal') {
  const state = loadState();
  const message = formatMessage(type, payload);

  // Always log locally
  ensureLogDir();
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${type}: ${JSON.stringify(payload)}\n`);

  // Cooldown check
  if (!canSendNow(state, priority)) {
    console.log('[Notifier] Cooldown, skip Telegram for', type);
    return false;
  }

  // Quiet hours check (non-critical only)
  if (priority !== 'critical' && isQuietHours()) {
    console.log('[Notifier] Quiet hours, skip Telegram for', type);
    return false;
  }

  const sent = await sendTelegramHTTPS(message);
  if (sent) {
    state.lastSent = Date.now();
    saveState(state);
    console.log('[Notifier] Telegram sent:', message.split('\n')[0]);
  }
  return sent;
}

// Args: <type> <json_payload> [priority]
const type = process.argv[2] || 'unknown';
let payload = {};
if (process.argv[3]) {
  try { payload = JSON.parse(process.argv[3]); } catch (e) { payload = { message: process.argv[3] }; }
}
const priority = process.argv[4] || 'normal';

notify(type, payload, priority).then(() => process.exit(0));
