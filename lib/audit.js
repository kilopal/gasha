// SANITIZED: enforced policy - block postinstall by default
const fs = require('fs');
const path = require('path');

const SUSPICIOUS_PATTERNS = [
  {pattern: /eval\(/, score: 5, reason: 'use of eval' },
  {pattern: /child_process/, score: 7, reason: 'child_process usage' },
  {pattern: /execSync/, score: 6, reason: 'execSync usage' },
  {pattern: /postinstall/, score: 8, reason: 'lifecycle postinstall script' },
  {pattern: /process\.env/, score: 2, reason: 'process.env access' }
];

function scanDirectoryForPatterns(dir) {
  const findings = [];
  const files = [];
  function walk(d) {
    const items = fs.readdirSync(d);
    for (const it of items) {
      const p = path.join(d, it);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (it.endsWith('.js') || it.endsWith('.mjs') || it.endsWith('.cjs')) files.push(p);
      else if (it === 'package.json') files.push(p);
    }
  }
  walk(dir);
  let score = 0;
  for (const f of files) {
    const txt = fs.readFileSync(f,'utf8');
    for (const rule of SUSPICIOUS_PATTERNS) {
      if (rule.pattern.test(txt)) {
        findings.push({file: f, reason: rule.reason, pattern: rule.pattern.toString(), score: rule.score});
        score += rule.score;
      }
    }
  }
  return { findings, score };
}

module.exports = { scanDirectoryForPatterns };


async function aiSummarize(findings) {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key) return { ai: null, note: 'No OPENAI_API_KEY set' };
  const prompt = `You are a security assistant. Summarize the following findings and give a risk summary in one paragraph. Findings: ${JSON.stringify(findings)}`;
  try {
    // Use built-in fetch (available in Node.js 18+)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{role:'user', content: prompt}], max_tokens: 300 })
    });
    const js = await res.json();
    if (js && js.choices && js.choices[0] && js.choices[0].message) {
      return { ai: js.choices[0].message.content };
    } else return { ai: null, note: 'No AI response' };
  } catch (e) {
    return { ai: null, note: 'AI call failed: ' + e.message };
  }
}
module.exports.aiSummarize = aiSummarize;
