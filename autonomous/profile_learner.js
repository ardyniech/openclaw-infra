#!/usr/bin/env node
/**
 * Profile Learner — Extract user preferences from chat history and health patterns
 * Output: ~/.openclaw/workspace/memory/USER_PROFILE.json
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join('/home/ardy/.openclaw/workspace/memory');
const PROFILE_PATH = path.join('/home/ardy/.openclaw/workspace/memory/USER_PROFILE.json');

function loadMemoryFiles() {
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
  const contents = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
      contents.push(raw);
    } catch (e) {}
  }
  return contents.join('\n');
}

function analyzeChat(text) {
  const profile = {
    formality: 'casual', // casual | formal
    averageMessageLength: 0,
    emojiUsage: 0,
    frustrationKeywords: 0,
    preferredTimeOfDay: 'afternoon', // morning | afternoon | evening | night
    tone: 'friendly'
  };

  // Rough heuristics
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return profile;

  let totalLen = 0;
  let emojiCount = 0;
  const frustrationWords = ['lemot', 'gak jadi', 'error', 'gagal', 'busy', 'stuck', 'males', 'anjir', 'wtf'];
  let frustrationCount = 0;

  for (const line of lines) {
    totalLen += line.length;
    emojiCount += (line.match(/([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2762}-\u{2763}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/gu) || []).length;
    const lower = line.toLowerCase();
    frustrationWords.forEach(w => {
      if (lower.includes(w)) frustrationCount++;
    });
  }

  profile.averageMessageLength = totalLen / lines.length;
  profile.emojiUsage = emojiCount / lines.length;
  profile.frustrationKeywords = frustrationCount;

  // Formality: if many formal phrases and no slang, mark formal
  const formalMarkers = ['would you', 'could you', 'please', 'thank you', 'kindly'];
  const slangMarkers = ['bro', 'ga', 'gak', 'aja', 'wkwk', 'haha', 'lol', 'xD', 'boi'];
  let formal = 0, slang = 0;
  for (const line of lines) {
    const lower = line.toLowerCase();
    formalMarkers.forEach(m => { if (lower.includes(m)) formal++; });
    slangMarkers.forEach(m => { if (lower.includes(m)) slang++; });
  }
  profile.formality = formal > slang ? 'formal' : 'casual';
  profile.tone = emojiCount > 2 ? 'friendly' : (formal > slang ? 'professional' : 'casual');

  // Preferred time of day (by hour distribution)
  const hours = [];
  for (const line of lines) {
    const match = line.match(/^\s*\[?(\d{1,2}):(\d{2})/);
    if (match) hours.push(parseInt(match[1]));
  }
  if (hours.length > 0) {
    const avgHour = hours.reduce((a,b)=>a+b,0) / hours.length;
    if (avgHour < 6) profile.preferredTimeOfDay = 'night';
    else if (avgHour < 12) profile.preferredTimeOfDay = 'morning';
    else if (avgHour < 18) profile.preferredTimeOfDay = 'afternoon';
    else profile.preferredTimeOfDay = 'evening';
  }

  return profile;
}

function analyzeHealthPatterns() {
  const healthDir = '/home/ardy/.openclaw/workspace/logs/health';
  if (!fs.existsSync(healthDir)) return {};
  const files = fs.readdirSync(healthDir).filter(f => f.startsWith('health_') && f.endsWith('.json')).slice(-50);
  const cpuVals = [], ramVals = [], diskVals = [];
  let okCount = 0, warningCount = 0, criticalCount = 0;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(healthDir, file), 'utf8'));
      if (data.metrics) {
        if (data.metrics.cpu_percent) cpuVals.push(data.metrics.cpu_percent);
        if (data.metrics.ram_percent) ramVals.push(data.metrics.ram_percent);
        if (data.metrics.disk_percent) diskVals.push(data.metrics.disk_percent);
      }
      if (data.status === 'OK') okCount++;
      else if (data.status === 'WARNING') warningCount++;
      else if (data.status === 'CRITICAL') criticalCount++;
    } catch (e) {}
  }
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  return {
    avg_cpu: avg(cpuVals).toFixed(1),
    avg_ram: avg(ramVals).toFixed(1),
    avg_disk: avg(diskVals).toFixed(1),
    health_distribution: { ok: okCount, warning: warningCount, critical: criticalCount },
    sample_count: files.length
  };
}

function shouldRun() {
  if (!fs.existsSync(PROFILE_PATH)) return true;
  const stats = fs.statSync(PROFILE_PATH);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  return ageHours > 24; // run once per day
}

function main() {
  try {
    if (!shouldRun()) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: 'daily_limit' }));
      process.exit(0);
    }
    const chatText = loadMemoryFiles();
    const chatProfile = analyzeChat(chatText);
    const healthStats = analyzeHealthPatterns();

    // Merge into final profile
    const profile = {
      lastUpdated: new Date().toISOString(),
      chat_learning: chatProfile,
      system_learning: healthStats,
      // Derived preferences
      notification_quiet_hours: determineQuietHours(chatProfile),
      token_saving_mode: true // always
    };

    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
    console.log(JSON.stringify({ ok: true, profile: PROFILE_PATH }));
  } catch (err) {
    console.error('Profile learner error:', err);
    process.exit(1);
  }
}

function determineQuietHours(profile) {
  const map = {
    'night': { start: '23:00', end: '06:00' },
    'morning': { start: '06:00', end: '09:00' },
    'afternoon': { start: '13:00', end: '15:00' },
    'evening': { start: '21:00', end: '23:00' }
  };
  return map[profile.preferredTimeOfDay] || map['afternoon'];
}

main();