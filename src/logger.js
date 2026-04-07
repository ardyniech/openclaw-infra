#!/usr/bin/env node
/**
 * Decision Logger & Documentation Generator
 * Logs autonomous decisions and generates runbooks
 */

const fs = require('fs');
const path = require('path');
// Using native JS; no external deps
const NOTIFIER = path.join(__dirname, 'notifier.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DECISION_LOG = path.join('/home/ardy/.openclaw/workspace/logs', 'decisions.log');
const REPORT_DIR = path.join('/home/ardy/.openclaw/workspace/logs/reports');
const LAST_TUNE = path.join(__dirname, 'last_tune.json');
const PRED_FILE = path.join(__dirname, 'predictions.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function appendLog(entry) {
  if (!fs.existsSync(DECISION_LOG)) {
    fs.writeFileSync(DECISION_LOG, '');
  }
  const line = JSON.stringify(entry);
  fs.appendFileSync(DECISION_LOG, line + '\n');
}

function generateReport() {
  const config = loadConfig();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // yyyy-MM-dd
  const reportPath = path.join(REPORT_DIR, `report-${dateStr}.md`);

  // Gather data
  let decisions = [];
  if (fs.existsSync(DECISION_LOG)) {
    const lines = fs.readFileSync(DECISION_LOG, 'utf8').split('\n').filter(l => l.trim());
    decisions = lines.map(l => JSON.parse(l)).slice(-100); // last 100 decisions
  }

  const lastTune = fs.existsSync(LAST_TUNE) ? JSON.parse(fs.readFileSync(LAST_TUNE, 'utf8')) : null;
  const predictions = fs.existsSync(PRED_FILE) ? JSON.parse(fs.readFileSync(PRED_FILE, 'utf8')) : null;

  // Build markdown report
  const md = [];
  md.push(`# OpenClaw Autonomy Report — ${dateStr}`);
  md.push('');
  md.push(`## Summary`);
  md.push(`- Decisions logged: ${decisions.length}`);
  md.push(`- Last tuning run: ${lastTune ? new Date(lastTune.timestamp).toISOString() : 'none'}`);
  md.push(`- Active predictions: ${predictions ? predictions.predictions.length : 0}`);
  md.push('');

  if (lastTune && lastTune.actions) {
    md.push(`## Recent Tuning Actions`);
    lastTune.actions.forEach(a => {
      md.push(`- **${a.action}** ${a.target}: ${a.success ? 'success' : 'failed'} (value: ${a.value || a.cpuQuota || a.memoryMax})`);
    });
    md.push('');
  }

  if (predictions && predictions.predictions.length) {
    md.push(`## Active Predictions`);
    predictions.predictions.forEach(p => {
      md.push(`- **${p.type}** (${p.probability}%): ${p.message}`);
      md.push(`  > Suggestion: ${p.suggestedAction}`);
    });
    md.push('');
  }

  md.push(`## Decision Log (recent)`);
  decisions.slice(-10).reverse().forEach(d => {
    md.push(`- [${new Date(d.timestamp).toISOString()}] ${d.decision || d.message || d.type || 'unknown'}`);
  });

  // Write report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`Report generated: ${reportPath}`);
  return reportPath;
}

function main() {
  try {
    const config = loadConfig();
    if (!config.logger.enabled) {
      console.log(JSON.stringify({ enabled: false }));
      process.exit(0);
    }

    // Today's log rotation? Could be added

    // Generate report if it doesn't exist for today or force
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // yyyy-MM-dd
    const reportPath = path.join(REPORT_DIR, `report-${dateStr}.md`);
    let generated = false;
    if (!fs.existsSync(reportPath)) {
      generateReport();
      generated = true;
    }

    // Notify on new report
    if (generated) {
      try {
        if (config.notifications && config.notifications.telegram && config.notifications.telegram.enabled) {
          execSync(`node ${NOTIFIER} logger '${JSON.stringify({ report: reportPath })}'`, { stdio: 'ignore' });
        }
      } catch (e) {}
    }

    // Also log a heartbeat
    appendLog({
      timestamp: now.toISOString(),
      source: 'logger',
      type: 'heartbeat',
      message: 'Autonomous logger running'
    });

    console.log(JSON.stringify({ ok: true, report: reportPath }));
  } catch (err) {
    console.error('Logger error:', err);
    process.exit(1);
  }
}

main();