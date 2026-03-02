/**
 * G4.2 — Changed-lines coverage: >= 90%.
 * Maps changed lines from git diff to c8 detailed coverage JSON
 * and checks that at least 90% of changed source lines are covered.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CHANGED_LINES_FLOOR = 90;
const COVERAGE_DIR = 'coverage';
const DETAIL_REPORT = `${COVERAGE_DIR}/coverage-final.json`;

function getChangedLines() {
  // Returns { 'src/hooks.js': Set<lineNumber>, ... }
  const result = {};
  let diff;
  try {
    diff = execSync('git diff --cached -U0 2>/dev/null', { encoding: 'utf8' });
    if (!diff.trim()) {
      diff = execSync('git diff -U0 HEAD~1 2>/dev/null || git diff -U0 main 2>/dev/null || echo ""', { encoding: 'utf8' });
    }
  } catch { return result; }

  let currentFile = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
    } else if (line.startsWith('@@ ') && currentFile) {
      // Parse @@ -a,b +c,d @@ — we want +c,d (new file lines)
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (m) {
        const start = parseInt(m[1], 10);
        const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
        if (!result[currentFile]) result[currentFile] = new Set();
        for (let i = start; i < start + count; i++) result[currentFile].add(i);
      }
    }
  }
  return result;
}

function run() {
  if (!existsSync(DETAIL_REPORT)) {
    console.error(`changed-lines-coverage-check FAIL: ${DETAIL_REPORT} not found. Run npm run test:coverage first.`);
    process.exit(1);
  }

  const changedLines = getChangedLines();
  const srcFiles = Object.keys(changedLines).filter(f => f.startsWith('src/') && (f.endsWith('.js') || f.endsWith('.ts')));
  if (srcFiles.length === 0) {
    console.log('changed-lines-coverage-check: no changed source lines — PASS');
    return;
  }

  const coverage = JSON.parse(readFileSync(DETAIL_REPORT, 'utf8'));
  let totalChanged = 0;
  let totalCovered = 0;

  for (const file of srcFiles) {
    const absPath = resolve(file);
    // c8/istanbul keys are absolute paths
    const covKey = Object.keys(coverage).find(k => k.endsWith(file) || k === absPath);
    const lines = changedLines[file];
    totalChanged += lines.size;

    if (!covKey) continue; // no coverage data for this file — lines count as uncovered

    const statementMap = coverage[covKey].statementMap || {};
    const s = coverage[covKey].s || {};
    const coveredLines = new Set<number>();
    for (const [stId, loc] of Object.entries(statementMap) as Array<[string, any]>) {
      if (s[stId] > 0) {
        for (let l = loc.start.line; l <= loc.end.line; l++) coveredLines.add(l);
      }
    }

    for (const ln of lines) {
      if (coveredLines.has(ln)) totalCovered++;
    }
  }

  if (totalChanged === 0) {
    console.log('changed-lines-coverage-check: no changed source lines — PASS');
    return;
  }

  const pct = (totalCovered / totalChanged) * 100;
  if (pct < CHANGED_LINES_FLOOR) {
    console.error(`changed-lines-coverage-check FAIL: ${pct.toFixed(1)}% of changed lines covered (need >= ${CHANGED_LINES_FLOOR}%)`);
    process.exit(1);
  }

  console.log(`changed-lines-coverage-check: ${pct.toFixed(1)}% of ${totalChanged} changed line(s) covered — PASS`);
}

run();
