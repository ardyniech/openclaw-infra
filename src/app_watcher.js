#!/usr/bin/env node
const { execSync } = require('child_process');

// 1. Kamus Diagnosa Gejala (Pattern Matching)
const SYMPTOM_MAP = [
  { key: "ModuleNotFoundError", human: "Ada komponen (library) Python yang lupa di-install. Dia gak bisa jalan tanpa itu." },
  { key: "ImportError", human: "Salah satu bagian kodenya gagal dipanggil. Mungkin versinya gak cocok." },
  { key: "address already in use", human: "Pintu (Port) aplikasinya lagi dipake orang lain. Rebutan lahan mereka." },
  { key: "ConnectionRefusedError", human: "Dia mau nyapa database atau API, tapi dicuekin/ditolak." },
  { key: "No such file or directory", human: "Dia nyari file penting tapi gak ketemu. Kayaknya file itu gak sengaja kehapus atau salah naruh." },
  { key: "Permission denied", human: "Dia dilarang masuk ke folder itu. Sistem gak kasih izin akses." },
  { key: "Out of memory", human: "Server VAIO kamu megap-megap kehabisan napas (RAM penuh)." },
  { key: "other hermes processes running", human: "Konflik sesama Hermes. Ada 'saudaranya' yang masih nyangkut di background." },
  { key: "SyntaxError", human: "Ada salah ketik di baris kodenya. Dia bingung bacanya." },
  { key: "Token expired", human: "Kunci akses (Token) aplikasinya udah basi, perlu diganti baru." }
];

// 2. Kamus Diagnosa Kode Keluar (Exit Code)
const EXIT_CODE_MAP = {
  "127": "Aplikasi utamanya ilang. Dia nyari perintahnya tapi gak ada (Command not found).",
  "203": "Jalur (Path) menuju aplikasinya salah. Dia gak tau harus lewat mana.",
  "137": "Aplikasi ini dipaksa mati (Killed) sama sistem, kemungkinan karena makan RAM terlalu banyak.",
  "1": "Aplikasi ini mutusin buat berenti sendiri gara-gara ada error internal di kodenya."
};

function diagnose(serviceName) {
  let diagnosis = "Gak tau pasti kenapa, tapi dia tiba-tiba mogok.";
  
  try {
    // Ambil Status dan Log sekaligus
    const statusOut = execSync(`systemctl --user status ${serviceName} --no-pager`).toString();
    const logs = execSync(`journalctl --user -u ${serviceName} -n 15 --no-pager`).toString();
    
    // Diagnosa lewat Exit Code
    const exitMatch = statusOut.match(/status=(\d+)/);
    if (exitMatch && EXIT_CODE_MAP[exitMatch[1]]) {
      diagnosis = EXIT_CODE_MAP[exitMatch[1]];
    }

    // Diagnosa lewat Gejala di Log (Prioritas Utama)
    for (let symptom of SYMPTOM_MAP) {
      if (logs.toLowerCase().includes(symptom.key.toLowerCase())) {
        diagnosis = symptom.human;
        break; 
      }
    }
  } catch (e) {}
  
  return diagnosis;
}

function autoDiscover() {
  const SYSTEM_NOISE = ['gpg-agent', 'dirmngr', 'keyboxd', 'dbus', 'pk-debconf', 'launchpadlib'];
  try {
    const rawUnits = execSync('systemctl --user list-units --type=service --state=failed --no-legend --plain').toString();
    if (!rawUnits.trim()) return [];

    return rawUnits.trim().split('\n').map(line => {
      let cleanLine = line.replace('●', '').trim();
      const serviceName = cleanLine.split(/\s+/)[0];

      if (!serviceName || !serviceName.endsWith('.service') || SYSTEM_NOISE.some(n => serviceName.includes(n)) || serviceName.includes('openclaw-')) return null;

      return {
        name: serviceName,
        status: 'failed',
        reason: diagnose(serviceName)
      };
    }).filter(x => x !== null);
  } catch (e) { return []; }
}

const results = autoDiscover();
if (results.length > 0) {
  console.log(JSON.stringify({ ok: false, found: results.length, alerts: results }));
  process.exit(1);
} else {
  console.log(JSON.stringify({ ok: true, found: 0 }));
  process.exit(0);
}
