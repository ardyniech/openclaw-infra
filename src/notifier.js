#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const type = process.argv[2];
const rawPayload = process.argv[3];
let data = {};
try { data = JSON.parse(rawPayload); } catch (e) { data = {}; }

const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Validasi Token
if (!config.telegram_token || config.telegram_token.includes('ISI_TOKEN')) {
  console.error("❌ Token Telegram belum diisi di config.json!");
  process.exit(1);
}

function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${config.telegram_token}/sendMessage`;
  const payload = JSON.stringify({
    chat_id: config.telegram_chat_id,
    text: message,
    parse_mode: 'Markdown'
  });
  
  try {
    // Tambahkan -f agar curl lapor error jika token/id salah
    execSync(`curl -s -f -X POST "${url}" -H "Content-Type: application/json" -d '${payload}'`);
    console.log("✅ Pesan terkirim ke Telegram.");
  } catch (e) {
    console.error("❌ Gagal kirim Telegram. Cek Token/ID atau Koneksi.");
  }
}

if (type === 'orchestrator') {
  const statusEmoji = data.status === 'healthy' ? '✅' : '⚠️';
  const duration = (data.durationMs / 1000).toFixed(1);
  
  let msg = `🏠 *DE VAIO SERVER STATUS*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `${statusEmoji} *Siklus*: ${data.status.toUpperCase()}\n`;
  msg += `⏱️ *Durasi*: ${duration}s\n\n`;

  msg += `🚨 *LAPORAN PERABOTAN*:\n`;
  if (data.appWatcher && data.appWatcher.alerts && data.appWatcher.alerts.length > 0) {
    data.appWatcher.alerts.forEach(alert => {
      msg += `• \`${alert.name}\`: _${alert.reason}_\n`;
    });
  } else {
    msg += `✅ Semua perabotan aman.\n`;
  }

  if (data.failedModules && data.failedModules.length > 0) {
    msg += `\n🛠️ *Modul Gagal*: \`${data.failedModules.join(', ')}\`\n`;
  }

  msg += `\n📅 _${new Date().toLocaleString('id-ID')}_`;
  sendTelegram(msg);
}
