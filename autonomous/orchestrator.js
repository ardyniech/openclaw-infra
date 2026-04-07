#!/usr/bin/env node
/**
 * Autonomous Orchestrator
 * Runs predictive, tuning, and logging modules in sequence
 */

const { execSync } = require('child_process');
const path = require('path');
const NOTIFIER = path.join(__dirname, 'notifier.js');

const DIR = __dirname;
const PREDICTOR = path.join(DIR, 'predictor.js');
const TUNER = path.join(DIR, 'tuner.js');
const LOGGER = path.join(DIR, 'logger.js');
const QUEUE_PROCESSOR = path.join(DIR, 'queue_processor.js');
const PROFILE_LEARNER = path.join(DIR, 'profile_learner.js');
const CAPACITY_PLANNER = path.join(DIR, 'capacity_planner.js');
const QUEUE_ENRICHER = path.join(DIR, 'queue_enricher.js');

function runModule(script) {
  try {
    const out = execSync(`node ${script}`, { encoding: 'utf8' });
    return { success: true, output: out.trim() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function main() {
  const results = [];
  console.log(`[Orchestrator] Starting autonomous cycle at ${new Date().toISOString()}`);

  // 1. Predictive
  const pred = runModule(PREDICTOR);
  results.push({ module: 'predictor', ...pred });
  console.log(`[Predictor] ${pred.success ? 'OK' : 'FAIL'}`);

  // 2. Tuner (reads predictions)
  const tune = runModule(TUNER);
  results.push({ module: 'tuner', ...tune });
  console.log(`[Tuner] ${tune.success ? 'OK' : 'FAIL'}`);

  // 3. Logger (doc gen)
  const log = runModule(LOGGER);
  results.push({ module: 'logger', ...log });
  console.log(`[Logger] ${log.success ? 'OK' : 'FAIL'}`);

  // 4. Capacity Planner (forecast & health score)
  const cap = runModule(CAPACITY_PLANNER);
  results.push({ module: 'capacity', ...cap });
  console.log(`[Capacity] ${cap.success ? 'OK' : 'FAIL'}`);

  // 5. Profile Learner (personalization)
  const profile = runModule(PROFILE_LEARNER);
  results.push({ module: 'profile', ...profile });
  console.log(`[Profile] ${profile.success ? 'OK' : 'FAIL'}`);

  // 6. Queue Enricher (auto-add tasks from predictions/capacity)
  const enrich = runModule(QUEUE_ENRICHER);
  results.push({ module: 'queue_enricher', ...enrich });
  console.log(`[Enricher] ${enrich.success ? 'OK' : 'FAIL'}`);

  // 7. Queue Processor (execute batch tasks)
  const queue = runModule(QUEUE_PROCESSOR);
  results.push({ module: 'queue', ...queue });
  console.log(`[Queue] ${queue.success ? 'OK' : 'FAIL'}`);

  // Summary
  const allOk = results.every(r => r.success);
  const summary = {
    timestamp: new Date().toISOString(),
    modules: results,
    status: allOk ? 'healthy' : 'degraded'
  };

  // Log to central autonomous log
  const logPath = path.join(DIR, 'orchestrator.log');
  require('fs').appendFileSync(logPath, JSON.stringify(summary) + '\n');

  // Send notification on completion (success/failure)
  try {
    const durationMs = Date.now() - new Date(summary.timestamp).getTime();
    execSync(`node ${NOTIFIER} orchestrator '${JSON.stringify({ status: summary.status, durationMs, module: 'autonomous' })}'`, { stdio: 'ignore' });
  } catch (e) {
    // ignore notification failures
  }

  console.log(`[Orchestrator] Cycle complete: ${summary.status}`);
  process.exit(allOk ? 0 : 1);
}

main();