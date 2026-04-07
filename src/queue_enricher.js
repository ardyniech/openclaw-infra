#!/usr/bin/env node
/**
 * Queue Enricher — Automatically add preventive tasks based on predictions
 * Consumes predictions.json and capacity.json, writes to queue.md
 */

const fs = require('fs');
const path = require('path');

const PRED_FILE = path.join(__dirname, 'predictions.json');
const CAP_FILE = path.join(__dirname, 'capacity.json');
const QUEUE_FILE = path.join('/home/ardy/.openclaw/workspace', 'queue.md');

function loadJSON(file, fallback = {}) {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {}
  }
  return fallback;
}

function addTask(queueLines, task, priority = false) {
  const marker = priority ? '[!]' : '[ ]';
  const taskLine = `- ${marker} ${task}`;
  // Insert under Pending section if exists
  let inserted = false;
  for (let i = 0; i < queueLines.length; i++) {
    if (queueLines[i].includes('## Pending')) {
      // Insert right after header
      queueLines.splice(i + 1, 0, taskLine);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    // Append at end with new section fallback
    queueLines.push('## Pending');
    queueLines.push(taskLine);
  }
  return queueLines;
}

function main() {
  try {
    const pred = loadJSON(PRED_FILE);
    const cap = loadJSON(CAP_FILE);
    if (!fs.existsSync(QUEUE_FILE)) {
      console.log(JSON.stringify({ ok: false, reason: 'queue_file_missing' }));
      process.exit(1);
    }

    let lines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n');
    let enqueuedCount = 0;

    // From predictions
    if (pred.predictions && pred.predictions.length) {
      for (const p of pred.predictions) {
        if (p.type === 'disk_critical' && p.probability >= 80) {
          lines = addTask(lines, 'sudo apt clean && sudo journalctl --vacuum-time=1d && sudo rm -rf ~/.cache/thumbnails/*', true);
          enqueuedCount++;
        }
        if (p.type === 'cpu_saturation' && p.probability >= 80) {
          lines = addTask(lines, 'sudo pkill -f heavy_workload || true && sudo cpupower frequency-set -g powersave 2>/dev/null', true);
          enqueuedCount++;
        }
      }
    }

    // From capacity forecast
    if (cap.forecast && cap.forecast.days_until_disk_full !== null && cap.forecast.days_until_disk_full <= 7) {
      lines = addTask(lines, 'sudo find /var/log -type f -size +20M -exec truncate -s 0 {} \\; && sudo apt-get autoremove -y');
      enqueuedCount++;
    }

    // Write back
    fs.writeFileSync(QUEUE_FILE, lines.join('\n') + '\n');

    console.log(JSON.stringify({ ok: true, enqueued: enqueuedCount }));

  } catch (err) {
    console.error('Queue enricher error:', err);
    process.exit(1);
  }
}

main();