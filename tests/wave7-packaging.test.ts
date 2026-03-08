import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig } from '../src/config.js';
import register from '../src/index.js';

// ---------- PM5-R1: manifest + package discoverability ----------

test('wave7: openclaw.plugin.json exists and has required fields', () => {
  const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
  assert.equal(manifest.id, 'bonfires-plugin');
  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.version, 'string');
  assert.equal(typeof manifest.entry, 'string');
  assert.ok(manifest.configSchema);
  assert.equal(manifest.configSchema.type, 'object');
  assert.equal(manifest.configSchema.additionalProperties, false);
});

test('wave7: openclaw.plugin.json configSchema requires agents', () => {
  const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
  assert.ok(manifest.configSchema.required.includes('agents'));
});

test('wave7: openclaw.plugin.json configSchema lists all config fields', () => {
  const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
  const props = Object.keys(manifest.configSchema.properties);
  for (const field of ['baseUrl', 'apiKeyEnv', 'bonfireId', 'agents', 'search', 'processing', 'network', 'strictHostedMode', 'ingestion', 'stateDir']) {
    assert.ok(props.includes(field), `missing config field: ${field}`);
  }
});

test('wave7: openclaw.plugin.json nested objects set additionalProperties false', () => {
  const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
  const nested = ['search', 'processing', 'network', 'ingestion'];
  for (const key of nested) {
    assert.equal(manifest.configSchema.properties[key].additionalProperties, false, `${key} missing additionalProperties:false`);
  }
});

test('wave7: package.json has openclaw.extensions array', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.openclaw);
  assert.ok(Array.isArray(pkg.openclaw.extensions));
  assert.ok(pkg.openclaw.extensions.length > 0);
  assert.equal(typeof pkg.openclaw.extensions[0], 'string');
});

// ---------- PM5-R2: env-friendly config fallbacks ----------

test('wave7: config baseUrl falls back to env BONFIRES_BASE_URL', () => {
  const orig = process.env.BONFIRES_BASE_URL;
  try {
    process.env.BONFIRES_BASE_URL = 'https://custom.api.bonfires.ai/';
    const out = parseConfig({ agents: { a: 'b' } });
    assert.equal(out.baseUrl, 'https://custom.api.bonfires.ai/');
  } finally {
    if (orig !== undefined) process.env.BONFIRES_BASE_URL = orig;
    else delete process.env.BONFIRES_BASE_URL;
  }
});

test('wave7: config value takes precedence over BONFIRES_BASE_URL env', () => {
  const orig = process.env.BONFIRES_BASE_URL;
  try {
    process.env.BONFIRES_BASE_URL = 'https://env.api.bonfires.ai/';
    const out = parseConfig({ agents: { a: 'b' }, baseUrl: 'https://explicit.api.bonfires.ai/' });
    assert.equal(out.baseUrl, 'https://explicit.api.bonfires.ai/');
  } finally {
    if (orig !== undefined) process.env.BONFIRES_BASE_URL = orig;
    else delete process.env.BONFIRES_BASE_URL;
  }
});

test('wave7: config apiKeyEnv falls back to env BONFIRES_API_KEY_ENV', () => {
  const orig = process.env.BONFIRES_API_KEY_ENV;
  try {
    process.env.BONFIRES_API_KEY_ENV = 'MY_CUSTOM_KEY';
    const out = parseConfig({ agents: { a: 'b' } });
    assert.equal(out.apiKeyEnv, 'MY_CUSTOM_KEY');
  } finally {
    if (orig !== undefined) process.env.BONFIRES_API_KEY_ENV = orig;
    else delete process.env.BONFIRES_API_KEY_ENV;
  }
});

test('wave7: config apiKeyEnv explicit value overrides env fallback', () => {
  const orig = process.env.BONFIRES_API_KEY_ENV;
  try {
    process.env.BONFIRES_API_KEY_ENV = 'ENV_KEY';
    const out = parseConfig({ agents: { a: 'b' }, apiKeyEnv: 'EXPLICIT_KEY' });
    assert.equal(out.apiKeyEnv, 'EXPLICIT_KEY');
  } finally {
    if (orig !== undefined) process.env.BONFIRES_API_KEY_ENV = orig;
    else delete process.env.BONFIRES_API_KEY_ENV;
  }
});

test('wave7: config bonfireId falls back to BONFIRE_ID env', () => {
  const orig = process.env.BONFIRE_ID;
  try {
    process.env.BONFIRE_ID = 'env-bonfire-123';
    const out = parseConfig({ agents: { a: 'b' } });
    assert.equal(out.bonfireId, 'env-bonfire-123');
  } finally {
    if (orig !== undefined) process.env.BONFIRE_ID = orig;
    else delete process.env.BONFIRE_ID;
  }
});

test('wave7: config bonfireId explicit value overrides env', () => {
  const orig = process.env.BONFIRE_ID;
  try {
    process.env.BONFIRE_ID = 'env-value';
    const out = parseConfig({ agents: { a: 'b' }, bonfireId: 'explicit-value' });
    assert.equal(out.bonfireId, 'explicit-value');
  } finally {
    if (orig !== undefined) process.env.BONFIRE_ID = orig;
    else delete process.env.BONFIRE_ID;
  }
});

test('wave7: config defaults when no env vars set', () => {
  const origBase = process.env.BONFIRES_BASE_URL;
  const origKey = process.env.BONFIRES_API_KEY_ENV;
  const origId = process.env.BONFIRE_ID;
  try {
    delete process.env.BONFIRES_BASE_URL;
    delete process.env.BONFIRES_API_KEY_ENV;
    delete process.env.BONFIRE_ID;
    const out = parseConfig({ agents: { a: 'b' } });
    assert.equal(out.baseUrl, 'https://tnt-v2.api.bonfires.ai/');
    assert.equal(out.apiKeyEnv, 'DELVE_API_KEY');
    assert.equal(out.bonfireId, '');
  } finally {
    if (origBase !== undefined) process.env.BONFIRES_BASE_URL = origBase;
    else delete process.env.BONFIRES_BASE_URL;
    if (origKey !== undefined) process.env.BONFIRES_API_KEY_ENV = origKey;
    else delete process.env.BONFIRES_API_KEY_ENV;
    if (origId !== undefined) process.env.BONFIRE_ID = origId;
    else delete process.env.BONFIRE_ID;
  }
});

// ---------- PM5-R4: state persistence policy ----------

test('wave7: config stateDir defaults to .bonfires-state', () => {
  const out = parseConfig({ agents: { a: 'b' } });
  assert.equal(out.stateDir, '.bonfires-state');
});

test('wave7: config stateDir is configurable', () => {
  const out = parseConfig({ agents: { a: 'b' }, stateDir: '/tmp/my-state' });
  assert.equal(out.stateDir, '/tmp/my-state');
});

test('wave7: empty stateDir normalizes to .bonfires-state', () => {
  const out = parseConfig({ agents: { a: 'b' }, stateDir: '' });
  assert.equal(out.stateDir, '.bonfires-state');
});

test('wave7: whitespace stateDir normalizes to .bonfires-state', () => {
  const out = parseConfig({ agents: { a: 'b' }, stateDir: '   ' });
  assert.equal(out.stateDir, '.bonfires-state');
});

test('wave7: ingestion ledgerPath defaults use stateDir', () => {
  const out = parseConfig({ agents: { a: 'b' } });
  assert.ok(out.ingestion.ledgerPath.startsWith('.bonfires-state/'));
  assert.ok(out.ingestion.summaryPath.startsWith('.bonfires-state/'));
});

test('wave7: ingestion paths use custom stateDir when overridden', () => {
  const out = parseConfig({ agents: { a: 'b' }, stateDir: 'custom-dir' });
  assert.ok(out.ingestion.ledgerPath.startsWith('custom-dir/'));
  assert.ok(out.ingestion.summaryPath.startsWith('custom-dir/'));
});

test('wave7: explicit ingestion paths override stateDir-based defaults', () => {
  const out = parseConfig({
    agents: { a: 'b' },
    stateDir: 'custom-dir',
    ingestion: {
      ledgerPath: 'my/ledger.json',
      summaryPath: 'my/summary.json',
    },
  });
  assert.equal(out.ingestion.ledgerPath, 'my/ledger.json');
  assert.equal(out.ingestion.summaryPath, 'my/summary.json');
});

// ---------- PM5-R5: lifecycle-managed loops ----------

test('wave7: register returns dispose handle that stops background loops', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-lifecycle-'));
  try {
    const events: any[] = [];
    const api = {
      pluginConfig: { agents: { agent_primary: 'a1' }, apiKeyEnv: 'NO_SUCH_ENV' },
      resolvePath: (p: string) => join(dir, p),
      logger: { warn: () => {} },
      on: (name: string, fn: any) => events.push([name, fn]),
      registerTool: () => {},
    };
    const handle = register(api);
    assert.ok(handle);
    assert.equal(typeof handle.dispose, 'function');
    handle.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave7: register dispose is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-lifecycle-'));
  try {
    const api = {
      pluginConfig: { agents: { agent_primary: 'a1' }, apiKeyEnv: 'NO_SUCH_ENV' },
      resolvePath: (p: string) => join(dir, p),
      logger: { warn: () => {} },
      on: () => {},
      registerTool: () => {},
    };
    const handle = register(api);
    handle.dispose();
    handle.dispose(); // second call should not throw
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
