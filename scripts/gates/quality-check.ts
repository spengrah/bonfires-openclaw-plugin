/**
 * G5 — Gate strength heuristics.
 * For each touched critical module, verify tests include:
 *   1. at least one happy-path test
 *   2. at least one negative-path test
 *   3. at least one edge-case assertion
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CRITICAL_MODULES = [
  'src/hooks.js', 'src/hooks.ts',
  'src/config.js', 'src/config.ts',
  'src/capture-ledger.js', 'src/capture-ledger.ts',
  'src/bonfires-client.js', 'src/bonfires-client.ts',
  'src/tools/bonfires-search.js', 'src/tools/bonfires-search.ts',
];

// Patterns to detect test intent
const NEGATIVE_PATTERNS = [
  /error/i, /fail/i, /reject/i, /throw/i, /invalid/i,
  /empty/i, /missing/i, /skip/i, /should\s+not/i,
];
const EDGE_PATTERNS = [
  /clamp/i, /limit/i, /max/i, /min/i, /boundary/i,
  /edge/i, /overflow/i, /throttle/i, /empty/i, /zero/i,
];

function getChangedFiles() {
  try {
    let out = execSync('git diff --cached --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!out) {
      out = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only main 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    }
    return out ? out.split('\n').filter(Boolean) : [];
  } catch { return []; }
}

function loadTestFiles() {
  try {
    return readdirSync('tests')
      .filter(f => f.endsWith('.test.ts') || f.endsWith('.test.mjs') || f.endsWith('.test.js'))
      .map(f => ({ name: f, content: readFileSync(join('tests', f), 'utf8') }));
  } catch { return []; }
}

function extractTestBlocks(content) {
  // Extract test(...) block names
  const names = [];
  const re = /test\(\s*['"`](.*?)['"`]/g;
  let m;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

function run() {
  const changed = getChangedFiles();
  const touchedCritical = changed.filter(f => CRITICAL_MODULES.includes(f));

  if (touchedCritical.length === 0) {
    console.log('quality-check: no critical modules touched — PASS');
    return;
  }

  const testFiles = loadTestFiles();
  const allContent = testFiles.map(t => t.content).join('\n');
  const allTestNames = extractTestBlocks(allContent);

  const failures = [];

  for (const mod of touchedCritical) {
    const basename = mod.split('/').pop().replace(/\.(js|ts)$/, '');
    // Find tests that import from this module
    const relevantTests = testFiles.filter(t => t.content.includes(basename));
    if (relevantTests.length === 0) {
      failures.push(`${mod}: no tests found importing this module`);
      continue;
    }

    const names = relevantTests.flatMap(t => extractTestBlocks(t.content));
    const hasHappy = names.some(n => !NEGATIVE_PATTERNS.some(p => p.test(n)));
    const hasNeg = names.some(n => NEGATIVE_PATTERNS.some(p => p.test(n)));
    const hasEdge = names.some(n => EDGE_PATTERNS.some(p => p.test(n)));

    if (!hasHappy) failures.push(`${mod}: missing happy-path test`);
    if (!hasNeg)   failures.push(`${mod}: missing negative-path test`);
    if (!hasEdge)  failures.push(`${mod}: missing edge-case test`);
  }

  if (failures.length) {
    console.error('quality-check FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(`quality-check: ${touchedCritical.length} critical module(s) verified — PASS`);
}

run();
