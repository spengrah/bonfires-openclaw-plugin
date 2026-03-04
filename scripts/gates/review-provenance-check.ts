/**
 * gate:review-provenance — Validate review artifact structural integrity.
 *
 * Not part of gate:all (which runs on every commit). This gate runs during
 * the review->GO transition to verify that review artifacts contain substantive
 * analysis, not rubber-stamp boilerplate.
 *
 * Usage: tsx scripts/gates/review-provenance-check.ts <review-dir> [wave]
 *   review-dir: path to .ai/log/review/
 *   wave: optional wave filter (e.g., "w8") — only check files matching this suffix
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const reviewDir = process.argv[2] || '.ai/log/review';
const waveFilter = process.argv[3] || null;

interface LensCheck {
  lens: string;
  requiredPatterns: RegExp[];
  patternLabels: string[];
}

const LENS_CHECKS: LensCheck[] = [
  {
    lens: 'correctness',
    requiredPatterns: [
      // Confidence: any numeric percentage or high/medium/low, possibly wrapped in markdown
      /confidence[:\s*]*\d+|confidence[:\s*]*\*{0,2}(high|medium|low)/i,
      // Substantive correctness analysis — any of these signals
      /edge[- ]case|boundary|off[- ]by[- ]one|invariant|pre[- ]?condition|post[- ]?condition|fallback\s+(chain|preced)|logic\s+(error|bug)|conditional|branch\s+coverage/i,
      // Spec/acceptance reference
      /spec\s+(conform|compliance|criteria|requirement)|acceptance\s+criter|PM\d+-R\d+|requirement\s+\w+\s+(met|pass|fail|satisfied)/i,
    ],
    patternLabels: [
      'confidence score',
      'substantive correctness analysis (edge cases, invariants, or logic verification)',
      'spec/acceptance criteria reference',
    ],
  },
  {
    lens: 'security',
    requiredPatterns: [
      /confidence[:\s*]*\d+|confidence[:\s*]*\*{0,2}(high|medium|low)/i,
      /trust\s+boundar|attack\s+(vector|surface)|injection|privilege\s+escalat|secret\s+(expos|handl|leak)|OWASP|input\s+validat/i,
    ],
    patternLabels: [
      'confidence score',
      'security analysis (trust boundaries, attack vectors, or input validation)',
    ],
  },
  {
    lens: 'verification.quality|vq',
    requiredPatterns: [
      /confidence[:\s*]*\d+|confidence[:\s*]*\*{0,2}(high|medium|low)/i,
      /vacuous[- ]?pass|vacuous\s+gate|trivial(ly)?\s+pass|pass(es|ed)?\s+without\s+exercis/i,
      /anti[- ]gaming|gaming\s+compliance|\.only|\.skip|exclud|lint[- ]?disable|test\s+tautolog/i,
    ],
    patternLabels: [
      'confidence score',
      'vacuous-pass analysis',
      'anti-gaming check',
    ],
  },
];

// General checks applied to all reviews
const GENERAL_CHECKS = [
  {
    pattern: /proof\s+of\s+review|artifacts?\s+inspected|commands?\s+run/i,
    label: 'proof of review section',
  },
  {
    // Proof must cite at least one specific file path (src/, scripts/, tests/, etc.)
    pattern: /src\/[\w.-]+|scripts\/[\w.-]+|tests\/[\w.-]+|\.ai\/[\w/.-]+\.\w+|[\w-]+\.(ts|js|md|json)\b/i,
    label: 'review references specific files',
  },
  {
    pattern: /diff\s+acknowledg|reviewed?\s+(the\s+)?(complete\s+|full\s+)?diff/i,
    label: 'diff acknowledgement',
  },
];

function detectLens(filename: string): LensCheck | null {
  for (const check of LENS_CHECKS) {
    const lensPatterns = check.lens.split('|');
    for (const lp of lensPatterns) {
      if (filename.includes(lp.replace('.', '-'))) return check;
    }
  }
  return null;
}

function run() {
  let files: string[];
  try {
    files = readdirSync(reviewDir).filter(f => f.startsWith('review-') && f.endsWith('.md'));
  } catch {
    console.error(`Cannot read review directory: ${reviewDir}`);
    process.exit(1);
  }

  if (waveFilter) {
    files = files.filter(f => f.includes(waveFilter));
  }

  if (files.length === 0) {
    console.log('No review files found to validate.');
    process.exit(0);
  }

  let failed = false;

  for (const file of files) {
    const path = join(reviewDir, file);
    const content = readFileSync(path, 'utf8');
    const failures: string[] = [];

    // General checks
    for (const check of GENERAL_CHECKS) {
      if (!check.pattern.test(content)) {
        failures.push(`missing: ${check.label}`);
      }
    }

    // Lens-specific checks
    const lensCheck = detectLens(file);
    if (lensCheck) {
      for (let i = 0; i < lensCheck.requiredPatterns.length; i++) {
        if (!lensCheck.requiredPatterns[i].test(content)) {
          failures.push(`missing: ${lensCheck.patternLabels[i]}`);
        }
      }
    }

    if (failures.length > 0) {
      console.log(`  \u2717 ${file}:`);
      for (const f of failures) {
        console.log(`      - ${f}`);
      }
      failed = true;
    } else {
      console.log(`  \u2713 ${file}: structural checks passed`);
    }
  }

  if (failed) {
    console.error('\ngate:review-provenance VERDICT: FAIL \u2014 review artifacts lack required structural markers');
    process.exit(1);
  }

  console.log('\ngate:review-provenance VERDICT: PASS');
}

run();
