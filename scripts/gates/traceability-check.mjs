/**
 * G3 — Requirement-level verification mapping.
 * Every active requirement touched by changed files must map to at least one
 * concrete verification check in traceability-map.json.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Map source files to the requirements they implement
const FILE_TO_REQS = {
  'src/hooks.js':               ['R1', 'R3', 'R4'],
  'src/hooks.ts':               ['R1', 'R3', 'R4'],
  'src/tools/bonfires-search.js': ['R2'],
  'src/tools/bonfires-search.ts': ['R2'],
  'src/capture-ledger.js':      ['R3', 'R4'],
  'src/capture-ledger.ts':      ['R3', 'R4'],
  'src/config.js':              ['R5'],
  'src/config.ts':              ['R5'],
  'src/bonfires-client.js':     ['R6'],
  'src/bonfires-client.ts':     ['R6'],
  'src/index.js':               ['R1', 'R2', 'R3', 'R4', 'R5'],
  'src/index.ts':               ['R1', 'R2', 'R3', 'R4', 'R5'],
};

function getChangedFiles() {
  try {
    // Prefer staged files (pre-commit context), fall back to diff against main
    let out = execSync('git diff --cached --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!out) {
      out = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only main 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    }
    return out ? out.split('\n').filter(Boolean) : [];
  } catch { return []; }
}

function run() {
  const changed = getChangedFiles();
  const touchedReqs = new Set();
  for (const f of changed) {
    const reqs = FILE_TO_REQS[f];
    if (reqs) reqs.forEach(r => touchedReqs.add(r));
  }

  if (touchedReqs.size === 0) {
    console.log('traceability-check: no requirements touched — PASS');
    return;
  }

  const trace = JSON.parse(readFileSync('.ai/spec/spec/quality/traceability-map.json', 'utf8'));
  const mapped = new Set((trace.requirements || []).map(r => r.id));
  const unmapped = [];
  for (const req of touchedReqs) {
    if (!mapped.has(req)) unmapped.push(req);
    else {
      // Verify it has at least one verification entry
      const entry = trace.requirements.find(r => r.id === req);
      if (!entry.verification || entry.verification.length === 0) unmapped.push(req);
    }
  }

  if (unmapped.length) {
    console.error(`traceability-check FAIL: unmapped touched requirements: ${unmapped.join(', ')}`);
    process.exit(1);
  }
  console.log(`traceability-check: ${touchedReqs.size} touched requirement(s) verified — PASS`);
}

run();
