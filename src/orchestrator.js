#!/usr/bin/env node
/**
 * VAIO GUARDIANS - Autonomous Orchestrator
 * Versi Full - Anti-Potong
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DIR = __dirname;

// Daftar urutan kerja sistem otonom
const MODULES = [
  { name: 'predictor', script: 'predictor.js' },
  { name: 'tuner', script: 'tuner.js' },
  { name: 'logger', script: 'logger.js' },
  { name: 'capacity', script: 'capacity_planner.js' },
  { name: 'profile', script: 'profile_learner.js' },
  { name: 'app_watcher', script: 'app_watcher.js' },
  { name: 'queue_enricher', script: 'queue_enricher.js' },
  { name: 'queue', script: 'queue_processor.js' }
];

function main() {
  const startTime = Date.now();
  const results = [];
  
  console.log(`[Orchestrator] Starting cycle at ${new Date().toISOString()}`);

  // Jalankan setiap modul satu per satu
  for (const m of MODULES) {
    let success = true;
    let output = '';
    
    try {
      // Jalankan script dan tangkap outputnya
      output = execSync(`node ${path.join(DIR, m.script)}`, { encoding: 'utf8' }).trim();
    } catch (e) {
      success = false;
      // Tetap tangkap stdout meskipun exit code-nya 1 (penting untuk app_watcher)
      output = e.stdout ? e.stdout.toString().trim() : e.message;
    }
    
    results.push({ 
      module: m.name, 
      success: success, 
      output: output 
    });
    
    console.log(`[${m.name.toUpperCase()}] ${success ? 'OK' : 'FAIL'}`);
  }

  // Tentukan status akhir siklus
  const allOk = results.every(r => r.success);
  const durationMs = Date.now() - startTime;
  
  // Ambil data spesifik dari App Watcher untuk laporan
  let appWatcherData = null;
  const watcherRes = results.find(r => r.module === 'app_watcher');
  if (watcherRes && watcherRes.output) {
    try { 
      appWatcherData = JSON.parse(watcherRes.output); 
    } catch(e) {
      // Jika output bukan JSON, biarkan null
    }
  }

  // Bungkus semua data ke dalam satu payload besar
  const payload = {
    timestamp: new Date().toISOString(),
    status: allOk ? 'healthy' : 'degraded',
    durationMs: durationMs,
    modules: results, // Data ini wajib ada untuk Dashboard CLI
    appWatcher: appWatcherData,
    failedModules: results.filter(r => !r.success).map(r => r.module)
  };

  // 1. Simpan ke orchestrator.log (untuk riwayat dan Dashboard)
  const logPath = path.join(DIR, 'orchestrator.log');
  fs.appendFileSync(logPath, JSON.stringify(payload) + '\n');

  // 2. Kirim notifikasi ke Telegram melalui notifier.js
  try {
    const NOTIFIER = path.join(DIR, 'notifier.js');
    // Menggunakan stdio: 'inherit' agar kita bisa lihat error notifier di console
    execSync(`node ${NOTIFIER} orchestrator '${JSON.stringify(payload)}'`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`[Orchestrator] Gagal mengirim notifikasi: ${e.message}`);
  }

  console.log(`[Orchestrator] Cycle complete: ${payload.status} (${durationMs}ms)`);
  
  // Keluar dengan kode 0 jika semua OK, 1 jika ada yang FAIL
  process.exit(allOk ? 0 : 1);
}

// Jalankan fungsi utama
main();
