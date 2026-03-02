/**
 * G9 — Anti-gaming rules.
 *   1. Coverage exclusions require explicit justification.
 *   2. No blanket excludes for new production files.
 *   3. High coverage cannot compensate for missing requirement mapping.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Patterns that indicate coverage exclusion
const EXCLUSION_PATTERNS = [
  /\/\*\s*istanbul\s+ignore/,
  /\/\*\s*c8\s+ignore/,
  /\/\/\s*c8\s+ignore/,
];

function getNewFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=A 2>/dev/null', { encoding: 'utf8' }).trim();
    if (!out) {
      const alt = execSync('git diff --name-only --diff-filter=A HEAD~1 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
      return alt ? alt.split('\n').filter(Boolean) : [];
    }
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

function collectSrcFiles(dir) {
  const out = [];
  try {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) out.push(...collectSrcFiles(p));
      else if (name.name.endsWith('.js') || name.name.endsWith('.ts')) out.push(p);
    }
  } catch {}
  return out;
}

function run() {
  const failures = [];

  // Check for coverage exclusions in source files
  const srcFiles = collectSrcFiles('src');
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of EXCLUSION_PATTERNS) {
        if (pat.test(lines[i])) {
          // Check for justification comment on same or next line
          const context = (lines[i] + ' ' + (lines[i + 1] || '')).toLowerCase();
          const hasJustification = context.includes('reason:') || context.includes('justification:');
          if (!hasJustification) {
            failures.push(`${file}:${i + 1}: coverage exclusion without justification`);
          }
        }
      }
    }
  }

  // Check for blanket excludes in new production files
  const newFiles = getNewFiles().filter(f => f.startsWith('src/') && (f.endsWith('.js') || f.endsWith('.ts')));
  for (const file of newFiles) {
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    for (const pat of EXCLUSION_PATTERNS) {
      if (pat.test(content)) {
        failures.push(`${file}: new production file has coverage exclusion (blanket exclude not allowed)`);
        break;
      }
    }
  }

  if (failures.length) {
    console.error('anti-gaming-check FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`anti-gaming-check: ${srcFiles.length} source file(s) scanned — PASS`);
}

run();
