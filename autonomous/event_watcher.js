#!/usr/bin/env node
/**
 * Event Watcher - Real-time anomaly handler
 * Watches latest health JSON for new critical alerts and triggers immediate response
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const NOTIFIER = path.join(__dirname, 'notifier.js');

const HEALTH_LATEST = '/home/ardy/.openclaw/workspace/logs/health/health_latest.json';
const STATE_FILE = path.join(__dirname, 'event_watcher_state.json');
const SELF_HEAL_SCRIPT = '/home/ardy/.openclaw/workspace/monitoring/self_heal.py';

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      return { lastTimestamp: 0, lastAlertHash: '' };
    }
  }
  return { lastTimestamp: 0, lastAlertHash: '' };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function hashObject(obj) {
  const str = JSON.stringify(obj);
  // Simple hash
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0; // to 32bit
  }
  return h;
}

function triggerHeal(healthData) {
  try {
    // Run self_heal.py with the health JSON as input
    const input = JSON.stringify(healthData);
    const result = execSync(`python3 ${SELF_HEAL_SCRIPT}`, { input, encoding: 'utf8' });
    console.log(`[Heal] Triggered at ${new Date().toISOString()} - result:`, result.trim().substring(0, 200));
    // Notify
    try {
      const alerts = healthData.alerts || [];
      execSync(`node ${NOTIFIER} event '${JSON.stringify({ message: 'Auto-heal triggered', alerts, healed: true })}'`, { stdio: 'ignore' });
    } catch (e) {}
    return true;
  } catch (e) {
    console.error(`[Heal] Failed:`, e.message);
    // Notify failure
    try {
      execSync(`node ${NOTIFIER} event '${JSON.stringify({ message: 'Auto-heal failed', error: e.message, healed: false })}'`, { stdio: 'ignore' });
    } catch (e2) {}
    return false;
  }
}

function main() {
  console.log(`[EventWatcher] Starting at ${new Date().toISOString()}`);
  let state = loadState();

  // Simple polling loop (no fs.watch to avoid race conditions)
  setInterval(() => {
    try {
      if (!fs.existsSync(HEALTH_LATEST)) return;
      const raw = fs.readFileSync(HEALTH_LATEST, 'utf8');
      const data = JSON.parse(raw);

      const ts = data.timestamp || 0;
      const alerts = data.alerts || [];
      const status = data.status || 'OK';

      // Create hash of alerts to detect changes
      const alertHash = hashObject(alerts);

      // If this health data is newer AND there are critical alerts
      if (ts > state.lastTimestamp && status === 'CRITICAL' && alerts.length > 0) {
        console.log(`[EventWatcher] New CRITICAL health at ${new Date(ts * 1000).toISOString()}:`, alerts);
        const healed = triggerHeal(data);
        if (healed) {
          state.lastTimestamp = ts;
          state.lastAlertHash = alertHash;
          saveState(state);
        }
      }
    } catch (e) {
      // ignore transient errors
    }
  }, 10000); // poll every 10 seconds
}

// Run forever
main();