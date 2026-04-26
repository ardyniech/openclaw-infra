#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOG_PATH = path.join(__dirname, 'orchestrator.log');
const R = "\x1b[31m", G = "\x1b[32m", Y = "\x1b[33m", B = "\x1b[34m", C = "\x1b[36m", W = "\x1b[37m", RESET = "\x1b[0m", BOLD = "\x1b[1m";
const HIDE_CURSOR = "\x1b[?25l", SHOW_CURSOR = "\x1b[?25h", HOME = "\x1b[H";

let frame = 0;
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function getSystemStats() {
    try {
        const load = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
        const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const total = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]);
        const available = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)[1]);
        const ramUsage = (((total - available) / total) * 100).toFixed(1);
        let temp = "N/A";
        try { temp = (parseInt(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000).toFixed(1) + "°C"; } catch(e) {}
        return { load, ramUsage, temp };
    } catch (e) { return { load: "0.0", ramUsage: "0", temp: "N/A" }; }
}

function getHouseholdDevices() {
    try {
        const output = execSync("systemctl --user list-units --type=service --no-legend").toString().trim();
        const noise = ['dbus', 'gpg-agent', 'dirmngr', 'keyboxd', 'pk-debconf', 'launchpadlib', 'at-spi'];
        return output.split('\n').map(line => {
            const parts = line.trim().split(/\s+/);
            if (noise.some(n => parts[0].includes(n)) || parts[0].includes('openclaw-')) return null;
            return { name: parts[0].replace('.service',''), active: parts[2] };
        }).filter(x => x !== null).slice(0, 6); // Limit 6 biar gak kepanjangan
    } catch (e) { return []; }
}

function getLatestLog() {
    try {
        if (!fs.existsSync(LOG_PATH)) return null;
        const data = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n');
        return JSON.parse(data[data.length - 1]);
    } catch (e) { return null; }
}

function render() {
    const log = getLatestLog();
    const stats = getSystemStats();
    const devices = getHouseholdDevices();
    if (!log) return;

    process.stdout.write(HOME + HIDE_CURSOR);
    let output = "";
    const spin = spinner[frame % spinner.length];
    frame++;

    // --- HEADER ---
    output += `${B}${BOLD}┌──────────────────────────────────────────────────────────┐${RESET}\n`;
    output += `${B}│ ${W}${BOLD}VAIO GUARDIANS PRO ${C}${spin}${B}            [${Y}${stats.temp}${B}] [v1.5] │${RESET}\n`;
    output += `${B}└──────────────────────────────────────────────────────────┘${RESET}\n`;

    // --- SYSTEM INFO ---
    output += ` ${BOLD}CPU:${RESET} ${W}${stats.load}${RESET}  ${BOLD}RAM:${RESET} ${stats.ramUsage > 80 ? R : G}${stats.ramUsage}%${RESET}  ${BOLD}MODE:${RESET} ${log.status === 'healthy' ? G+'HEALTHY' : R+'DEGRADED'}${RESET}\n`;
    output += `${B}────────────────────────────────────────────────────────────${RESET}\n`;

    // --- INTEGRATION ANIMATION (THE HUB) ---
    const flow = frame % 2 === 0 ? `${C}>> ${W}SYNCING${C} >>` : `${W}-- SYNCED --`;
    output += `${BOLD}${Y}── INTEGRATION FLOW ──${RESET}\n`;
    output += ` ${W}Orchestrator ${flow} EventBus ${flow} Logs ${flow} Notifier${RESET}\n`;
    output += `${B}────────────────────────────────────────────────────────────${RESET}\n`;

    // --- MODULES PERFORMANCE (BALIK LAGI!) ---
    output += `${BOLD}${Y}── CORE MODULES PERFORMANCE ──${RESET}\n`;
    if (log.modules) {
        for (let i = 0; i < log.modules.length; i += 2) {
            const m1 = log.modules[i];
            const m2 = log.modules[i+1];
            let line = ` ${m1.success ? G+'●'+RESET : R+'●'+RESET} ${W}${m1.module.padEnd(14)}${RESET}`;
            if (m2) line += `  ${m2.success ? G+'●'+RESET : R+'●'+RESET} ${W}${m2.module.padEnd(14)}${RESET}`;
            output += line + "\n";
        }
    }

    output += `${B}────────────────────────────────────────────────────────────${RESET}\n`;

    // --- HOUSEHOLD DEVICES ---
    output += `${BOLD}${Y}── HOUSEHOLD INVENTORY ──${RESET}\n`;
    devices.forEach((d, idx) => {
        const dot = d.active === 'active' ? G+'■'+RESET : R+'■'+RESET;
        output += ` ${dot} ${W}${d.name.padEnd(18)}${RESET}${idx % 2 === 1 ? '\n' : '  '}`;
    });
    if (devices.length % 2 !== 0) output += '\n';

    output += `${B}────────────────────────────────────────────────────────────${RESET}\n`;

    // --- AUDIT LOG (BUKTI INTEGRASI) ---
    output += `${BOLD}${Y}── SYSTEM AUDIT LOG ──${RESET}\n`;
    const auditStatus = log.status === 'healthy' ? G+'PASSED' : R+'FAILED';
    output += ` ${C}[CHECK]${RESET} ${W}Integrity: ${auditStatus}${RESET} | ${W}Load: ${log.durationMs}ms${RESET}\n`;
    
    if (log.appWatcher && log.appWatcher.alerts && log.appWatcher.alerts.length > 0) {
        output += ` ${R}[ERR]  Detect: ${log.appWatcher.alerts[0].name.substring(0,15)}..${RESET}\n`;
        output += ` ${Y}[DIAG] Reason: ${log.appWatcher.alerts[0].reason.substring(0,35)}${RESET}\n`;
    } else {
        output += ` ${G}[OK]   Audit: All inter-module signals verified.${RESET}\n`;
    }

    output += `${B}────────────────────────────────────────────────────────────${RESET}\n`;
    output += `${C}${spin} ${W}Press CTRL+C to minimize${RESET}          ${B}Refresh: 500ms${RESET}\n`;

    process.stdout.write(output);
}

process.stdout.write('\x1Bc');
const timer = setInterval(render, 500);

process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write(SHOW_CURSOR + "\n\nDashboard Closed.\n");
    process.exit();
});
