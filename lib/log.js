const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function merkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return null;
  let level = leaves.map(l => sha256(l));
  while (level.length > 1) {
    const next = [];
    for (let i=0;i<level.length;i+=2) {
      if (i+1 < level.length) next.push(sha256(level[i] + level[i+1]));
      else next.push(level[i]); // odd
    }
    level = next;
  }
  return level[0];
}

function appendLog(entry, logPath = './gasha-log.json') {
  let logData = { entries: [], merkleRoot: null };
  if (fs.existsSync(logPath)) {
    try { 
      const existing = JSON.parse(fs.readFileSync(logPath,'utf8'));
      logData = existing.entries ? existing : { entries: existing, merkleRoot: null };
    } catch(e){ 
      logData = { entries: [], merkleRoot: null };
    }
  }
  
  // Ensure entries is an array
  if (!Array.isArray(logData.entries)) {
    logData.entries = [];
  }
  
  logData.entries.push(entry);
  // compute merkle root over serialized entries
  const leaves = logData.entries.map(e => JSON.stringify(e));
  const root = merkleRoot(leaves);
  const out = { entries: logData.entries, merkleRoot: root };
  fs.writeFileSync(logPath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

function readLog(logPath = './gasha-log.json') {
  if (!fs.existsSync(logPath)) return null;
  try { return JSON.parse(fs.readFileSync(logPath,'utf8')); } catch(e){ return null; }
}

module.exports = { appendLog, readLog, merkleRoot };