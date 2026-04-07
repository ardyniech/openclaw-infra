#!/usr/bin/env node
/**
 * Capacity Planner — Forecast resource growth and compute health score
 * Outputs predictions to capacity.json and adds tasks to queue if needed
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HEALTH_DIR = '/home/ardy/.openclaw/workspace/logs/health';
const CAPACITY_FILE = path.join(__dirname, 'capacity.json');
const QUEUE_FILE = path.join('/home/ardy/.openclaw/workspace', 'queue.md');
const PRED_FILE = path.join(__dirname, 'predictions.json');
const STATE_FILE = path.join(__dirname, 'capacity_state.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function readLatestHealth() {
  const latest = path.join(HEALTH_DIR, 'health_latest.json');
  if (!fs.existsSync(latest)) return null;
  return JSON.parse(fs.readFileSync(latest, 'utf8'));
}

function readHistoricalDisk(days = 7) {
  const files = fs.readdirSync(HEALTH_DIR).filter(f => f.startsWith('health_') && f.endsWith('.json'));
  const points = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(HEALTH_DIR, file), 'utf8'));
      const ts = data.timestamp * 1000;
      if (ts < cutoff) continue;
      if (data.metrics && data.metrics.disk_percent) {
        points.push({ ts, disk: data.metrics.disk_percent });
      }
    } catch (e) {}
  }
  points.sort((a,b) => a.ts - b.ts);
  return points;
}

function computeGrowthRate(points) {
  if (points.length < 2) return 0;
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  points.forEach((p, i) => {
    sumX += i;
    sumY += p.disk;
    sumXY += i * p.disk;
    sumX2 += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope; // % per 5-minute sample
}

function computeHealthScore(metrics) {
  const weights = { cpu: 0.3, ram: 0.3, disk: 0.4 };
  const cpu = Math.max(0, 100 - metrics.cpu_percent);
  const ram = Math.max(0, 100 - metrics.ram_percent);
  const disk = Math.max(0, 100 - metrics.disk_percent);
  return Math.round(cpu * weights.cpu + ram * weights.ram + disk * weights.disk);
}

function daysUntilFull(current, growthPerDay) {
  if (growthPerDay <= 0) return null;
  const remaining = 100 - current;
  return Math.ceil(remaining / growthPerDay);
}

function addTaskToQueue(task, priority = false) {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return false;
    const lines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n');
    let pendingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('## Pending')) {
        pendingIdx = i;
        break;
      }
    }
    if (pendingIdx === -1) return false;
    const marker = priority ? '[!]' : '[ ]';
    lines.splice(pendingIdx + 1, 0, `- ${marker} ${task}`);
    fs.writeFileSync(QUEUE_FILE, lines.join('\n') + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

function shouldRun(intervalHours) {
  if (!fs.existsSync(STATE_FILE)) return true;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const age = (Date.now() - (state.lastRun || 0)) / (1000 * 60 * 60);
    return age >= intervalHours;
  } catch (e) {
    return true;
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastRun: Date.now() }));
}

function main() {
  try {
    const config = loadConfig();
    if (!config.capacity.enabled) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: 'disabled' }));
      process.exit(0);
    }
    if (!shouldRun(config.capacity.updateIntervalHours)) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: 'interval_not_met' }));
      process.exit(0);
    }

    const latest = readLatestHealth();
    if (!latest) {
      console.log(JSON.stringify({ ok: false, reason: 'no_health_data' }));
      process.exit(1);
    }

    const metrics = latest.metrics;
    const historical = readHistoricalDisk();
    const growthRate = computeGrowthRate(historical);
    const growthPerDay = growthRate * (24 * 60 / 5); // 5-min samples
    const healthScore = computeHealthScore(metrics);
    const daysToFull = daysUntilFull(metrics.disk_percent, growthPerDay);

    const capacity = {
      timestamp: new Date().toISOString(),
      current: {
        cpu: metrics.cpu_percent,
        ram: metrics.ram_percent,
        disk: metrics.disk_percent,
        health_score: healthScore
      },
      forecast: {
        disk_growth_percent_per_day: parseFloat(growthPerDay.toFixed(2)),
        days_until_disk_full: daysToFull
      }
    };

    fs.writeFileSync(CAPACITY_FILE, JSON.stringify(capacity, null, 2));

    // Auto-enqueue tasks
    let enqueued = [];
    if (daysToFull !== null && daysToFull <= 3) {
      if (addTaskToQueue('sudo apt clean && sudo journalctl --vacuum-time=1d && sudo rm -rf ~/.cache/thumbnails/*', true)) {
        enqueued.push('urgent_disk_cleanup');
      }
    }
    if (metrics.disk_percent > 85) {
      if (addTaskToQueue('sudo find /var/log -type f -size +20M -exec truncate -s 0 {} \\; && sudo apt-get autoremove -y')) {
        enqueued.push('truncate_logs');
      }
    }
    if (healthScore < 50) {
      if (addTaskToQueue('echo "Health score low: check metrics"')) {
        enqueued.push('health_alert');
      }
    }

    // Merge into predictions
    try {
      const pred = JSON.parse(fs.readFileSync(PRED_FILE, 'utf8'));
      pred.capacity = capacity;
      fs.writeFileSync(PRED_FILE, JSON.stringify(pred, null, 2));
    } catch (e) {}

    saveState();

    console.log(JSON.stringify({ ok: true, healthScore, enqueued, daysToFull, growthPerDay: capacity.forecast.disk_growth_percent_per_day }));
  } catch (err) {
    console.error('Capacity planner error:', err);
    process.exit(1);
  }
}

main();