#!/usr/bin/env node
/**
 * Queue Processor - Batch execution of user tasks from queue.md
 * Reduces token usage by batching and auto-notifying on completion.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QUEUE_PATH = path.join(process.env.HOME, '.openclaw', 'workspace', 'queue.md');
const LOG_DIR = path.join(__dirname, '..', 'workspace', 'logs', 'queue');
const NOTIFIER = path.join(__dirname, 'notifier.js');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  return raw.split('\n');
}

function writeQueue(lines) {
  fs.writeFileSync(QUEUE_PATH, lines.join('\n'));
}

function parseTasks(lines) {
  const tasks = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('- [!]')) {
      // Already done? skip unless we want to reprocess? Only pending [ ]
      if (trimmed.startsWith('- [ ]')) {
        const command = trimmed.substring(6).trim();
        tasks.push({ idx, line, command });
      }
    }
  });
  return tasks;
}

function runTask(command) {
  try {
    const out = execSync(command, { encoding: 'utf8', timeout: 5 * 60 * 1000 }); // 5 min timeout
    return { success: true, output: out.trim().substring(0, 500) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function main() {
  try {
    ensureLogDir();
    console.log('[Queue] Using queue file:', QUEUE_PATH);
    const lines = readQueue();
    const tasks = parseTasks(lines);
    if (tasks.length === 0) {
      console.log('[Queue] No pending tasks');
      process.exit(0);
    }

    console.log(`[Queue] Processing ${tasks.length} task(s)`);
    const results = [];
    tasks.forEach(task => {
      console.log(`[Queue] Executing: ${task.command}`);
      const res = runTask(task.command);
      results.push({ command: task.command, ...res });

      // Update line to mark done or failed
      const mark = res.success ? 'x' : '!';
      const newLine = `- [${mark}] ${task.command}`;
      lines[task.idx] = newLine;

      // Optionally log detailed output to separate file
      if (res.success || res.error) {
        const logFile = path.join(LOG_DIR, `task-${Date.now()}.json`);
        fs.writeFileSync(logFile, JSON.stringify(res, null, 2));
      }
    });

    writeQueue(lines);

    // Send notification summary
    const completed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    try {
      execSync(`node ${NOTIFIER} queue '${JSON.stringify({ total: tasks.length, completed, failed, results: results.slice(0, 5) })}'`, { stdio: 'ignore' });
    } catch (e) {}

    console.log(`[Queue] Finished: ${completed} success, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('[Queue] Fatal error:', err);
    process.exit(1);
  }
}

main();