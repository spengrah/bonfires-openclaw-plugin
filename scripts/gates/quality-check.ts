/**
 * G5 — Gate strength heuristics.
 * For each touched critical module, verify tests include:
 *   1. at least one happy-path test
 *   2. at least one negative-path test
 *   3. at least one edge-case assertion
 *
 * Wave 4 enhancement: emit module-level evidence (console + JSON artifact)
 * so CI logs can show exactly how each touched module satisfied checks.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CRITICAL_MODULES = [
  'src/hooks.js', 'src/hooks.ts',
  'src/config.js', 'src/config.ts',
  'src/capture-ledger.js', 'src/capture-ledger.ts',
  'src/bonfires-client.js', 'src/bonfires-client.ts',
  'src/index.js', 'src/index.ts',
  'src/tools/bonfires-search.js', 'src/tools/bonfires-search.ts',
];

const NEGATIVE_PATTERNS = [
  /error/i, /fail/i, /reject/i, /throw/i, /invalid/i,
  /empty/i, /missing/i, /skip/i, /should\s+not/i,
];
const EDGE_PATTERNS = [
  /clamp/i, /limit/i, /max/i, /min/i, /boundary/i,
  /edge/i, /overflow/i, /throttle/i, /empty/i, /zero/i,
];

const EVIDENCE_PATH = '.ai/log/plan/quality-gate-evidence-current.json';

type TestFile = { name: string; content: string };

type ModuleEvidence = {
  module: string;
  touched: boolean;
  relevant_test_files: string[];
  matched_tests: {
    happy: string[];
    negative: string[];
    edge: string[];
  };
  checks: {
    happy: boolean;
    negative: boolean;
    edge: boolean;
  };
};

function getChangedFiles() {
  try {
    let out = execSync('git diff --cached --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!out) {
      out = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only main 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    }
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function loadTestFiles(): TestFile[] {
  try {
    return readdirSync('tests')
      .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.mjs') || f.endsWith('.test.js'))
      .map((f) => ({ name: f, content: readFileSync(join('tests', f), 'utf8') }));
  } catch {
    return [];
  }
}

function extractTestNames(content: string) {
  const names: string[] = [];
  const re = /test\(\s*['"`](.*?)['"`]/g;
  let m;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

function isNegative(name: string) {
  return NEGATIVE_PATTERNS.some((p) => p.test(name));
}

function isEdge(name: string) {
  return EDGE_PATTERNS.some((p) => p.test(name));
}

function writeEvidence(payload: any) {
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, JSON.stringify(payload, null, 2));
}

function run() {
  const changed = getChangedFiles();
  const touchedCritical = changed.filter((f) => CRITICAL_MODULES.includes(f));

  if (touchedCritical.length === 0) {
    const payload = {
      timestamp: new Date().toISOString(),
      status: 'PASS',
      reason: 'no critical modules touched',
      changed_files: changed,
      touched_critical: [],
      modules: [],
    };
    writeEvidence(payload);
    console.log('quality-check: no critical modules touched — PASS');
    return;
  }

  const testFiles = loadTestFiles();
  const failures: string[] = [];
  const modulesEvidence: ModuleEvidence[] = [];

  for (const mod of touchedCritical) {
    const basename = mod.split('/').pop()!.replace(/\.(js|ts)$/, '');
    const relevantTests = testFiles.filter((t) => t.content.includes(basename));

    const evidence: ModuleEvidence = {
      module: mod,
      touched: true,
      relevant_test_files: relevantTests.map((t) => t.name),
      matched_tests: { happy: [], negative: [], edge: [] },
      checks: { happy: false, negative: false, edge: false },
    };

    if (relevantTests.length === 0) {
      failures.push(`${mod}: no tests found importing this module`);
      modulesEvidence.push(evidence);
      continue;
    }

    for (const testFile of relevantTests) {
      for (const testName of extractTestNames(testFile.content)) {
        if (!isNegative(testName)) evidence.matched_tests.happy.push(testName);
        if (isNegative(testName)) evidence.matched_tests.negative.push(testName);
        if (isEdge(testName)) evidence.matched_tests.edge.push(testName);
      }
    }

    evidence.checks.happy = evidence.matched_tests.happy.length > 0;
    evidence.checks.negative = evidence.matched_tests.negative.length > 0;
    evidence.checks.edge = evidence.matched_tests.edge.length > 0;

    if (!evidence.checks.happy) failures.push(`${mod}: missing happy-path test`);
    if (!evidence.checks.negative) failures.push(`${mod}: missing negative-path test`);
    if (!evidence.checks.edge) failures.push(`${mod}: missing edge-case test`);

    modulesEvidence.push(evidence);
  }

  const payload = {
    timestamp: new Date().toISOString(),
    status: failures.length ? 'FAIL' : 'PASS',
    changed_files: changed,
    touched_critical: touchedCritical,
    modules: modulesEvidence,
    failures,
  };
  writeEvidence(payload);

  for (const m of modulesEvidence) {
    console.log(`[quality-check] module=${m.module}`);
    console.log(`  test_files=${m.relevant_test_files.join(', ') || '(none)'}`);
    console.log(`  checks happy=${m.checks.happy} negative=${m.checks.negative} edge=${m.checks.edge}`);
  }

  if (failures.length) {
    console.error('quality-check FAIL:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`quality-check: ${touchedCritical.length} critical module(s) verified — PASS`);
}

run();
