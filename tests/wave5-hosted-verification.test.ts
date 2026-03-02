import test from 'node:test';
import assert from 'node:assert/strict';
import { redactEnvSummary, runHostedVerification } from '../scripts/hosted-integration-verify.js';
import { readFileSync, rmSync } from 'node:fs';

test('wave5: redactEnvSummary never exposes raw key', async () => {
  const out = redactEnvSummary('DELVE_API_KEY', 'supersecretvalue');
  assert.equal(out.env, 'DELVE_API_KEY');
  assert.equal(out.present, true);
  assert.equal(out.length, 16);
  assert.equal((out as any).value, undefined);
});

test('wave5: verify:hosted fixture mode writes report with required probes', async () => {
  await runHostedVerification([]);
  const report = JSON.parse(readFileSync('.ai/log/plan/hosted-integration-verification-current.json', 'utf8'));
  const probeNames = report.probes.map((p: any) => p.name);
  assert.equal(report.mode, 'fixture');
  assert.equal(probeNames.includes('contract:/delve normalization'), true);
  assert.equal(probeNames.includes('contract:/stack/add mapping'), true);
  assert.equal(probeNames.includes('contract:/stack/process response handling'), true);
  assert.equal(probeNames.includes('preflight:/healthz'), true);
  assert.equal(typeof report.config.apiKey.present, 'boolean');
  assert.equal(report.config.apiKey.value, undefined);
});

test.after(() => {
  rmSync('.ai/log/plan/hosted-integration-verification-current.json', { force: true });
});
