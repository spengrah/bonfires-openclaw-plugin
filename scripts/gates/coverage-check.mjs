/**
 * G4 — Coverage policy enforcement.
 *   1. Global line coverage floor: >= 70%
 *   2. Critical-path branch coverage: >= 90%
 *
 * Reads c8 JSON report from coverage/coverage-summary.json.
 */
import { readFileSync, existsSync } from 'node:fs';

const GLOBAL_LINE_FLOOR = 70;
const CRITICAL_BRANCH_FLOOR = 90;

const CRITICAL_MODULES = [
  ['src/hooks.ts', 'src/hooks.js'],
  ['src/config.ts', 'src/config.js'],
  ['src/capture-ledger.ts', 'src/capture-ledger.js'],
  ['src/tools/bonfires-search.ts', 'src/tools/bonfires-search.js'],
];

const REPORT_PATH = 'coverage/coverage-summary.json';

function run() {
  if (!existsSync(REPORT_PATH)) {
    console.error(`coverage-check FAIL: ${REPORT_PATH} not found. Run npm run test:coverage first.`);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
  const failures = [];

  // Global line coverage
  const total = report.total;
  if (!total) {
    console.error('coverage-check FAIL: no "total" entry in coverage report');
    process.exit(1);
  }
  const globalLine = total.lines?.pct ?? 0;
  if (globalLine < GLOBAL_LINE_FLOOR) {
    failures.push(`Global line coverage ${globalLine.toFixed(1)}% < ${GLOBAL_LINE_FLOOR}% floor`);
  }

  // Critical module branch coverage
  for (const modVariants of CRITICAL_MODULES) {
    const [canonical, ...alts] = modVariants;
    const candidates = [canonical, ...alts];
    const key = Object.keys(report).find(k => k !== 'total' && candidates.some(m => k.endsWith(m)));
    if (!key) {
      failures.push(`${canonical}: not found in coverage report (0% branch coverage)`);
      continue;
    }
    const branch = report[key].branches?.pct ?? 0;
    if (branch < CRITICAL_BRANCH_FLOOR) {
      failures.push(`${canonical}: branch coverage ${branch.toFixed(1)}% < ${CRITICAL_BRANCH_FLOOR}%`);
    }
  }

  if (failures.length) {
    console.error('coverage-check FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`coverage-check: global line ${globalLine.toFixed(1)}% — PASS`);
}

run();
