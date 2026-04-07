#!/usr/bin/env node
/**
 * Predictive Maintenance Module
 * Analyzes historical logs to predict potential failures
 */

const fs = require('fs');
const path = require('path');
// No external dependencies
const NOTIFIER = path.join(__dirname, 'notifier.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HEALTH_DIR = path.join('/home/ardy/.openclaw/workspace/logs/health');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function readHealthFiles(days = 7) {
  if (!fs.existsSync(HEALTH_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(HEALTH_DIR).filter(f => f.endsWith('.json') && f.startsWith('health_'));
  const entries = [];
  for (const file of files) {
    const filepath = path.join(HEALTH_DIR, file);
    try {
      const raw = fs.readFileSync(filepath, 'utf8');
      const data = JSON.parse(raw);
      const ts = data.timestamp * 1000; // unix seconds
      if (ts > cutoff) {
        entries.push({ ts, data });
      }
    } catch (e) {
      // skip bad files
    }
  }
  // sort by timestamp
  entries.sort((a, b) => a.ts - b.ts);
  return entries;
}

function analyzeHealth(entries) {
  const metrics = {
    diskUsage: [],
    cpuLoad: [],
    memoryUsage: [],
    alerts: 0
  };
  for (const { data } of entries) {
    if (data.metrics) {
      if (data.metrics.disk_percent) metrics.diskUsage.push(data.metrics.disk_percent);
      if (data.metrics.cpu_percent) metrics.cpuLoad.push(data.metrics.cpu_percent);
      if (data.metrics.ram_percent) metrics.memoryUsage.push(data.metrics.ram_percent);
    }
    if (data.alerts) metrics.alerts += data.alerts.length;
  }
  return metrics;
}

function predict(metrics, thresholds) {
  const predictions = [];
  // Check trend: last 3 entries average vs overall average
  const recentDisk = metrics.diskUsage.slice(-3);
  const recentCpu = metrics.cpuLoad.slice(-3);
  const recentMem = metrics.memoryUsage.slice(-3);

  if (recentDisk.length >= 3) {
    const avg = recentDisk.reduce((a,b)=>a+b,0)/recentDisk.length;
    if (avg > thresholds.diskUsage) {
      predictions.push({
        type: 'disk_critical',
        probability: Math.min(100, Math.round(avg)),
        message: `Disk usage trending high: ${avg.toFixed(1)}% (threshold ${thresholds.diskUsage}%)`,
        suggestedAction: 'Consider expanding storage or cleaning logs/cache'
      });
    }
  }

  if (recentCpu.length >= 3) {
    const avg = recentCpu.reduce((a,b)=>a+b,0)/recentCpu.length;
    if (avg > thresholds.cpuLoad) {
      predictions.push({
        type: 'cpu_saturation',
        probability: Math.min(100, Math.round(avg)),
        message: `CPU load trending high: ${avg.toFixed(1)}%`,
        suggestedAction: 'Check for runaway processes or adjust ML training schedule'
      });
    }
  }

  if (recentMem.length >= 3) {
    const avg = recentMem.reduce((a,b)=>a+b,0)/recentMem.length;
    if (avg > thresholds.memoryUsage) {
      predictions.push({
        type: 'memory_pressure',
        probability: Math.min(100, Math.round(avg)),
        message: `Memory usage trending high: ${avg.toFixed(1)}%`,
        suggestedAction: 'Consider increasing swap or optimizing services'
      });
    }
  }

  return predictions;
}

function main() {
  try {
    const config = loadConfig();
    if (!config.predictive.enabled) {
      console.log(JSON.stringify({ enabled: false }));
      process.exit(0);
    }

    const entries = readHealthFiles(config.predictive.windowDays);
    const metrics = analyzeHealth(entries);
    const predictions = predict(metrics, config.predictive.thresholds);

    const output = {
      timestamp: new Date().toISOString(),
      predictions,
      metadata: {
        dataPoints: {
          disk: metrics.diskUsage.length,
          cpu: metrics.cpuLoad.length,
          memory: metrics.memoryUsage.length
        }
      }
    };

    // Notify high-risk predictions
    if (predictions.length > 0) {
      const highRisk = predictions.filter(p => p.probability >= 80);
      if (highRisk.length > 0) {
        try {
          execSync(`node ${NOTIFIER} predictor '${JSON.stringify({ predictions: highRisk })}'`, { stdio: 'ignore' });
        } catch (e) {}
      }
    }

    // Write predictions to a file for other modules
    const predFile = path.join(__dirname, 'predictions.json');
    fs.writeFileSync(predFile, JSON.stringify(output, null, 2));

    console.log(JSON.stringify(output));
  } catch (err) {
    console.error('Predictor error:', err);
    process.exit(1);
  }
}

main();