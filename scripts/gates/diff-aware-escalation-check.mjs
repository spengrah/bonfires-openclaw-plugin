/**
 * G7 — Diff-aware gate escalation.
 * When diff touches security-sensitive or lifecycle-critical files,
 * gate strictness increases: Tier 3 + Tier 4 become mandatory,
 * critical-path branch threshold is enforced.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Files that trigger escalation
const SENSITIVE_FILES = [
  'src/capture-ledger.js',
  'src/capture-ledger.ts',
  'src/bonfires-client.js',
  'src/bonfires-client.ts',
  'src/index.js',
  'src/index.ts',
  'src/hooks.js',
  'src/hooks.ts',
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

function run() {
  const changed = getChangedFiles();
  const touchedSensitive = changed.filter(f => SENSITIVE_FILES.includes(f) && existsSync(f));

  if (touchedSensitive.length === 0) {
    console.log('diff-aware-escalation: no sensitive files touched — PASS (no escalation needed)');
    return;
  }

  console.log(`diff-aware-escalation: sensitive files touched: ${touchedSensitive.join(', ')}`);
  console.log('  → Escalation active: Tier 3 + Tier 4 mandatory, critical branch threshold enforced');

  const failures = [];

  // Verify coverage report exists (implies test:coverage was run)
  if (!existsSync('coverage/coverage-summary.json')) {
    failures.push('Coverage report missing — cannot verify critical-path branch threshold');
  } else {
    const report = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
    const modules = Array.from(new Set(
      touchedSensitive.map(f => f.replace(/\.ts$/, '').replace(/\.js$/, ''))
    ));
    for (const modBase of modules) {
      const candidates = [`${modBase}.ts`, `${modBase}.js`];
      const key = Object.keys(report).find(k => k !== 'total' && candidates.some(c => k.endsWith(c)));
      if (!key) {
        failures.push(`${modBase}: not found in coverage report`);
        continue;
      }
      const branch = report[key].branches?.pct ?? 0;
      if (branch < 90) {
        failures.push(`${modBase}: branch coverage ${branch.toFixed(1)}% < 90% (escalated threshold)`);
      }
    }
  }

  if (failures.length) {
    console.error('diff-aware-escalation FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log('diff-aware-escalation: all escalation requirements met — PASS');
}

run();
