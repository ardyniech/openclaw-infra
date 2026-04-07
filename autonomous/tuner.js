#!/usr/bin/env node
/**
 * Self-Tuning Module
 * Automatically adjusts resource limits based on usage patterns and predictions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const NOTIFIER = path.join(__dirname, 'notifier.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PRED_FILE = path.join(__dirname, 'predictions.json');
const LAST_TUNE = path.join(__dirname, 'last_tune.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadPredictions() {
  if (!fs.existsSync(PRED_FILE)) return null;
  const raw = fs.readFileSync(PRED_FILE, 'utf8');
  return JSON.parse(raw);
}

function adjustNice(processPattern, niceValue) {
  try {
    const pids = execSync(`pgrep -f '${processPattern}'`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (pids.length === 0) return { success: false, reason: 'no_pids' };
    pids.forEach(pid => {
      try {
        execSync(`sudo renice -n ${niceValue} -p ${pid}`, { stdio: 'ignore' });
      } catch (e) {}
    });
    return { success: true, affected: pids.length };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

function adjustIonice(processPattern, ioniceClass) {
  try {
    const pids = execSync(`pgrep -f '${processPattern}'`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (pids.length === 0) return { success: false, reason: 'no_pids' };
    pids.forEach(pid => {
      try {
        execSync(`sudo ionice -c${ioniceClass} -p ${pid}`, { stdio: 'ignore' });
      } catch (e) {}
    });
    return { success: true, affected: pids.length };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

function adjustSystemdUnit(unitName, cpuQuotaPercent, memoryMaxMB) {
  try {
    // Check if user unit exists (exact match)
    const unitCheck = execSync(`systemctl --user list-unit-files --type=service --no-legend | awk '{print $1}' | grep -Fx '${unitName}.service'`, { encoding: 'utf8' }).trim();
    if (!unitCheck) return { success: false, reason: 'unit_not_found' };

    // For user units, overrides go in ~/.config/systemd/user/
    const userOverrideDir = path.join('/home/ardy/.config/systemd/user', `${unitName}.d`);
    const userOverrideFile = path.join(userOverrideDir, 'autonomous.conf');
    fs.mkdirSync(userOverrideDir, { recursive: true });
    const content = `[Service]\nCPUQuota=${cpuQuotaPercent}%\nMemoryMax=${memoryMaxMB}M\n`;
    fs.writeFileSync(userOverrideFile, content);
    execSync(`systemctl --user daemon-reload`);
    execSync(`systemctl --user restart ${unitName}`);
    return { success: true };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

function main() {
  try {
    const config = loadConfig();
    if (!config.tuner.enabled) {
      console.log(JSON.stringify({ enabled: false }));
      process.exit(0);
    }

    const predictions = loadPredictions();
    const decisions = [];
    const actions = [];

    // Interval check
    const now = Date.now();
    if (fs.existsSync(LAST_TUNE)) {
      const last = JSON.parse(fs.readFileSync(LAST_TUNE, 'utf8'));
      const hoursSince = (now - (last.timestamp || 0)) / (1000 * 60 * 60);
      if (hoursSince < config.tuner.adjustmentIntervalHours) {
        console.log(JSON.stringify({ skipped: true, reason: 'interval_not_met', hoursSince }));
        process.exit(0);
      }
    }

    // Default tuning values
    let mlTrainingNice = 19;
    let cpuQuota = 50;
    let memoryMax = 512;
    let gatewayIonice = 4;

    if (predictions && predictions.predictions && predictions.predictions.length > 0) {
      const hasCpuStress = predictions.predictions.some(p => p.type === 'cpu_saturation');
      const hasMemPressure = predictions.predictions.some(p => p.type === 'memory_pressure');
      const hasDiskCritical = predictions.predictions.some(p => p.type === 'disk_critical');

      if (hasCpuStress) {
        mlTrainingNice = 19;
        cpuQuota = 40;
        memoryMax = 384;
        gatewayIonice = 6;
        decisions.push('High CPU predicted: throttling ML jobs and gateway resources');
      } else if (hasMemPressure) {
        mlTrainingNice = 19;
        memoryMax = 256;
        decisions.push('Memory pressure predicted: reducing memory limits');
      } else if (hasDiskCritical) {
        decisions.push('Disk pressure predicted: no CPU tuning (disk-bound)');
      } else {
        decisions.push('Normal operation: moderate resource allocation');
      }
    } else {
      decisions.push('No active predictions: using default allocations');
    }

    // Apply actions
    const mlPatterns = ['sample_ml_agent.py', 'torch', 'transformers'];
    mlPatterns.forEach(pat => {
      const res = adjustNice(pat, mlTrainingNice);
      actions.push({ action: 'renice', pattern: pat, value: mlTrainingNice, ...res });
    });

    const ioniceRes = adjustIonice('openclaw-gateway', gatewayIonice);
    actions.push({ action: 'ionice', target: 'openclaw-gateway', value: gatewayIonice, ...ioniceRes });

    const unitRes = adjustSystemdUnit('openclaw-gateway', cpuQuota, memoryMax);
    actions.push({ action: 'systemd', unit: 'openclaw-gateway', cpuQuota, memoryMax, ...unitRes });

    // Record this run
    const record = {
      timestamp: now,
      predictions: predictions ? predictions.predictions.map(p => p.type) : [],
      decisions,
      actions
    };
    fs.writeFileSync(LAST_TUNE, JSON.stringify(record, null, 2));

    // Notify if any action failed
    const failures = actions.filter(a => !a.success);
    if (failures.length > 0) {
      try {
        execSync(`node ${NOTIFIER} tuner '${JSON.stringify({ message: 'Tuner actions failed', actions, failed: true })}'`, { stdio: 'ignore' });
      } catch (e) {}
    }

    console.log(JSON.stringify(record));
  } catch (err) {
    console.error('Tuner error:', err);
    process.exit(1);
  }
}

main();