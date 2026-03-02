/**
 * gate:all — Orchestrates all required verification gates.
 *
 * Tiers:
 *   Tier 1: Static hygiene (lint)
 *   Tier 2: Behavioral correctness (tests + coverage)
 *   Tier 3: Adversarial/negative-path (quality heuristics + mutation-lite)
 *   Tier 4: Traceability integrity
 *
 * Additional cross-cutting gates: diff-aware escalation, anti-gaming.
 *
 * Hard-fail semantics: any gate failure => exit 1.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const GATES = [
  // Tier 1 — Static hygiene
  { tier: 1, name: 'lint',                  cmd: 'npm run lint' },
  // Tier 2 — Behavioral correctness (generates coverage data)
  { tier: 2, name: 'test:coverage',         cmd: 'npm run test:coverage' },
  { tier: 2, name: 'gate:coverage',         cmd: 'tsx scripts/gates/coverage-check.ts' },
  { tier: 2, name: 'gate:changed-lines',    cmd: 'tsx scripts/gates/changed-lines-coverage-check.ts' },
  // Tier 3 — Adversarial / negative-path
  { tier: 3, name: 'gate:quality',          cmd: 'tsx scripts/gates/quality-check.ts' },
  { tier: 3, name: 'gate:mutation-lite',    cmd: 'tsx scripts/gates/mutation-lite-check.ts' },
  // Tier 4 — Traceability integrity
  { tier: 4, name: 'gate:traceability',     cmd: 'tsx scripts/gates/traceability-check.ts' },
  // Cross-cutting
  { tier: 0, name: 'gate:diff-escalation',  cmd: 'tsx scripts/gates/diff-aware-escalation-check.ts' },
  { tier: 0, name: 'gate:anti-gaming',      cmd: 'tsx scripts/gates/anti-gaming-check.ts' },
];

function run() {
  const results = [];
  let failed = false;

  for (const gate of GATES) {
    const start = Date.now();
    let status = 'PASS';
    let output = '';
    try {
      output = execSync(gate.cmd, { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (err) {
      status = 'FAIL';
      output = err.stdout || err.stderr || err.message || '';
      failed = true;
    }
    const elapsed = Date.now() - start;
    results.push({ tier: gate.tier, name: gate.name, status, elapsed, output: output.trim() });
    const icon = status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} [Tier ${gate.tier || 'X'}] ${gate.name}: ${status} (${elapsed}ms)`);
  }

  // Write gate report artifact
  const wave = detectWave();
  const reportPath = `.ai/log/plan/verification-gates-report-${wave}.json`;
  mkdirSync('.ai/log/plan', { recursive: true });
  writeFileSync(reportPath, JSON.stringify({
    wave,
    timestamp: new Date().toISOString(),
    gates: results,
    verdict: failed ? 'FAIL' : 'PASS',
  }, null, 2));
  console.log(`\nGate report written to ${reportPath}`);

  if (failed) {
    const failedGates = results.filter(r => r.status === 'FAIL').map(r => r.name);
    console.error(`\ngate:all VERDICT: FAIL — failed gates: ${failedGates.join(', ')}`);
    process.exit(1);
  }

  console.log('\ngate:all VERDICT: PASS — all gates passed');
}

function detectWave() {
  try {
    const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf8' }).trim();
    const m = branch.match(/wave[_-]?(\d+)/i);
    if (m) return `wave${m[1]}`;
  } catch {}
  return 'current';
}

run();
