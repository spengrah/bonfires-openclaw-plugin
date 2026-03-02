/**
 * G6 — Mutation-lite verification for critical paths.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PROBES = [
  {
    file: 'src/config.ts',
    find: "if (!out.agents.lyle || !out.agents.reviewer) throw new Error('agents.lyle and agents.reviewer are required');",
    replace: "// mutation: validation removed",
    description: 'Remove required-agents validation in parseConfig',
  },
  {
    file: 'src/hooks.ts',
    find: "const raw=String(event?.prompt ?? '').trim(); if(!raw) return;",
    replace: "const raw='always_search';",
    description: 'Remove empty-prompt guard in handleBeforeAgentStart',
  },
  {
    file: 'src/bonfires-client.ts',
    find: "if (!res.ok) throw new Error(`Bonfires ${path} failed: HTTP ${res.status}`);",
    replace: "if (!res.ok) return body; // mutation: suppress error",
    description: 'Suppress non-OK error handling in hosted fetchJson',
  },
  {
    file: 'src/bonfires-client.ts',
    find: "for (const m of req.messages) {",
    replace: "for (const m of req.messages.slice(-1)) { // mutation: drop earlier messages",
    description: 'Drop messages in hosted capture loop',
  },
];

function run() {
  const failures: string[] = [];
  let probesRun = 0;

  for (const probe of PROBES) {
    let original: string;
    try {
      original = readFileSync(probe.file, 'utf8');
    } catch {
      continue;
    }

    if (!original.includes(probe.find)) {
      console.log(`mutation-lite: skipping probe "${probe.description}" (target not found)`);
      continue;
    }

    probesRun++;
    const mutated = original.replace(probe.find, probe.replace);
    writeFileSync(probe.file, mutated);

    try {
      execSync('node --import tsx --test tests/*.test.ts 2>&1', { encoding: 'utf8', timeout: 30000 });
      failures.push(`Probe "${probe.description}": tests PASSED under mutation (should have failed)`);
    } catch {
      // expected failure under mutation
    } finally {
      writeFileSync(probe.file, original);
    }
  }

  if (probesRun === 0) {
    console.error('mutation-lite-check FAIL: no applicable probes for current TS code paths');
    process.exit(1);
  }

  if (failures.length) {
    console.error('mutation-lite-check FAIL:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`mutation-lite-check: ${probesRun} probe(s) caught by tests — PASS`);
}

run();
