/**
 * G6 — Mutation-lite verification for critical paths.
 * Introduces a targeted fault in a critical module, runs tests,
 * and verifies the tests catch the fault (i.e., they fail).
 * Reverts the mutation regardless of outcome.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Each probe: { file, find, replace, description }
const PROBES = [
  {
    file: 'src/config.js',
    find: "if (!out.agents.lyle || !out.agents.reviewer) throw new Error('agents.lyle and agents.reviewer are required');",
    replace: "// mutation: validation removed",
    description: 'Remove required-agents validation in parseConfig',
  },
  {
    file: 'src/hooks.js',
    find: "const raw=String(event?.prompt ?? '').trim(); if(!raw) return;",
    replace: "const raw='always_search';",
    description: 'Remove empty-prompt guard in handleBeforeAgentStart',
  },
];

function run() {
  const failures = [];
  let probesRun = 0;

  for (const probe of PROBES) {
    let original;
    try {
      original = readFileSync(probe.file, 'utf8');
    } catch {
      // File doesn't exist — skip this probe
      continue;
    }

    if (!original.includes(probe.find)) {
      // Probe target not found — code may have changed; skip
      console.log(`mutation-lite: skipping probe "${probe.description}" (target not found)`);
      continue;
    }

    probesRun++;
    const mutated = original.replace(probe.find, probe.replace);
    writeFileSync(probe.file, mutated);

    try {
      // Run tests — we EXPECT them to fail
      execSync('node --test tests/*.test.mjs 2>&1', { encoding: 'utf8', timeout: 30000 });
      // If we get here, tests passed under mutation — that's a failure
      failures.push(`Probe "${probe.description}": tests PASSED under mutation (should have failed)`);
    } catch {
      // Tests failed under mutation — good
    } finally {
      // Always revert
      writeFileSync(probe.file, original);
    }
  }

  if (probesRun === 0) {
    console.log('mutation-lite-check: no applicable probes — PASS (informational)');
    return;
  }

  if (failures.length) {
    console.error('mutation-lite-check FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`mutation-lite-check: ${probesRun} probe(s) caught by tests — PASS`);
}

run();
