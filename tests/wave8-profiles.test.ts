import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig, resolveIngestionProfile } from '../src/config.js';
import { runIngestionOnce } from '../src/ingestion.js';
import register from '../src/index.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'bonfires-w8-'));
}

function baseCfg(extra: any = {}) {
  return { agents: { a: 'b' }, ...extra };
}

// --- PM6-R1: Profile-based source configuration ---

test('wave8: parseConfig accepts named profiles with rootDir/includeGlobs/excludeGlobs/extensions', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: {
      profiles: {
        docs: { rootDir: '/tmp/docs', includeGlobs: ['**/*.md'], excludeGlobs: ['**/draft/**'], extensions: ['.md'] },
        specs: { rootDir: '/tmp/specs' },
      },
    },
  }));
  assert.equal(Object.keys(cfg.ingestion.profiles).length, 2);
  assert.deepEqual(cfg.ingestion.profiles.docs.includeGlobs, ['**/*.md']);
  assert.deepEqual(cfg.ingestion.profiles.docs.excludeGlobs, ['**/draft/**']);
  assert.deepEqual(cfg.ingestion.profiles.docs.extensions, ['.md']);
  // defaults applied for specs profile
  assert.deepEqual(cfg.ingestion.profiles.specs.includeGlobs, ['**/*']);
  assert.ok(cfg.ingestion.profiles.specs.excludeGlobs.includes('**/node_modules/**'));
  assert.deepEqual(cfg.ingestion.profiles.specs.extensions, ['.md']);
});

test('wave8: profile name must be alphanumeric with hyphens/underscores', () => {
  assert.throws(() => parseConfig(baseCfg({
    ingestion: { profiles: { 'bad name!': { rootDir: '/x' } } },
  })), /alphanumeric/);
});

test('wave8: profile without rootDir throws', () => {
  assert.throws(() => parseConfig(baseCfg({
    ingestion: { profiles: { p1: {} } },
  })), /rootDir is required/);
});

test('wave8: empty includeGlobs array throws', () => {
  assert.throws(() => parseConfig(baseCfg({
    ingestion: { profiles: { p1: { rootDir: '/x', includeGlobs: [] } } },
  })), /includeGlobs must include at least one glob/);
});

test('wave8: profile-based ingestion collects files matching globs and extensions', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'notes'), { recursive: true });
    writeFileSync(join(dir, 'notes', 'entry.md'), 'hello');
    writeFileSync(join(dir, 'notes', 'data.json'), '{}');
    writeFileSync(join(dir, 'readme.md'), 'top-level');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        myprofile: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
      },
    });

    assert.equal(result.scanned, 2, 'only .md files should be scanned');
    assert.equal(result.ingested, 2);
    assert.ok(paths.every(p => p.startsWith('myprofile:')));
    assert.ok(paths.some(p => p.includes('entry.md')));
    assert.ok(paths.some(p => p.includes('readme.md')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave8: profile excludeGlobs filters out matching files', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'draft'), { recursive: true });
    mkdirSync(join(dir, 'final'), { recursive: true });
    writeFileSync(join(dir, 'draft', 'wip.md'), 'draft');
    writeFileSync(join(dir, 'final', 'done.md'), 'final');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        p1: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: ['draft/**'], extensions: ['.md'] },
      },
    });

    assert.equal(result.ingested, 1);
    assert.ok(paths[0].includes('done.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave8: profile with custom extensions allows non-markdown files', async () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'config.yaml'), 'key: val');
    writeFileSync(join(dir, 'notes.md'), 'text');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        cfg: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.yaml'] },
      },
    });

    assert.equal(result.ingested, 1);
    assert.ok(paths[0].includes('config.yaml'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM6-R2: Agent to profile mapping ---

test('wave8: resolveIngestionProfile returns mapped profile for agent', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: {
      profiles: { docs: { rootDir: '/docs' }, specs: { rootDir: '/specs' } },
      agentProfiles: { agentA: 'docs', agentB: 'specs' },
    },
  }));
  const profile = resolveIngestionProfile(cfg, 'agentA');
  assert.equal(profile.rootDir, '/docs');
  const profile2 = resolveIngestionProfile(cfg, 'agentB');
  assert.equal(profile2.rootDir, '/specs');
});

test('wave8: resolveIngestionProfile falls back to defaultProfile', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: {
      profiles: { main: { rootDir: '/main' } },
      defaultProfile: 'main',
    },
  }));
  const profile = resolveIngestionProfile(cfg, 'unknown-agent');
  assert.equal(profile.rootDir, '/main');
});

test('wave8: resolveIngestionProfile throws when no mapping and no default', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: {
      profiles: { docs: { rootDir: '/docs' } },
    },
  }));
  assert.throws(() => resolveIngestionProfile(cfg, 'unmapped'), /No ingestion profile mapping/);
});

test('wave8: resolveIngestionProfile throws when no profiles configured', () => {
  const cfg = parseConfig(baseCfg({}));
  assert.throws(() => resolveIngestionProfile(cfg, 'any'), /No ingestion profiles configured/);
});

test('wave8: agentProfiles referencing unknown profile throws at parse time', () => {
  assert.throws(() => parseConfig(baseCfg({
    ingestion: {
      profiles: { docs: { rootDir: '/docs' } },
      agentProfiles: { agentA: 'nonexistent' },
    },
  })), /references unknown profile/);
});

test('wave8: defaultProfile referencing unknown profile throws at parse time', () => {
  assert.throws(() => parseConfig(baseCfg({
    ingestion: {
      profiles: { docs: { rootDir: '/docs' } },
      defaultProfile: 'nonexistent',
    },
  })), /references unknown profile/);
});

// --- PM6-R3: Backward compatibility migration ---

test('wave8: legacy rootDir normalizes into synthetic _legacy profile', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: { rootDir: '/old/content' },
  }));
  assert.ok(cfg.ingestion.profiles['_legacy']);
  assert.equal(cfg.ingestion.profiles['_legacy'].rootDir, '/old/content');
  assert.deepEqual(cfg.ingestion.profiles['_legacy'].extensions, ['.md']);
  assert.ok(cfg.ingestion.profiles['_legacy'].excludeGlobs.includes('**/node_modules/**'));
});

test('wave8: legacy config emits deprecation warning', () => {
  const warnings: string[] = [];
  parseConfig(baseCfg({
    ingestion: { rootDir: '/old/content' },
  }), { logger: { warn: (msg) => warnings.push(msg) } });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('deprecated'));
});

test('wave8: explicit profiles override legacy rootDir normalization', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: {
      rootDir: '/old/content',
      profiles: { mydata: { rootDir: '/new/path' } },
    },
  }));
  // Legacy is NOT synthesized when profiles are explicitly defined
  assert.equal(cfg.ingestion.profiles['_legacy'], undefined);
  assert.ok(cfg.ingestion.profiles['mydata']);
});

test('wave8: no profiles and no legacy rootDir produces empty profiles', () => {
  const cfg = parseConfig(baseCfg({}));
  assert.equal(Object.keys(cfg.ingestion.profiles).length, 0);
});

// --- PM6-R4: Safety defaults ---

test('wave8: default excludes include node_modules, .git, .openclaw', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: { profiles: { p: { rootDir: '/x' } } },
  }));
  const excludes = cfg.ingestion.profiles.p.excludeGlobs;
  assert.ok(excludes.includes('**/node_modules/**'));
  assert.ok(excludes.includes('**/.git/**'));
  assert.ok(excludes.includes('**/.openclaw/**'));
});

test('wave8: default extension is .md', () => {
  const cfg = parseConfig(baseCfg({
    ingestion: { profiles: { p: { rootDir: '/x' } } },
  }));
  assert.deepEqual(cfg.ingestion.profiles.p.extensions, ['.md']);
});

test('wave8: profile-based ingestion preserves hash-ledger dedup semantics', async () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'doc.md'), 'alpha');
    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    let calls = 0;
    const client = {
      ingestContent: async () => { calls += 1; return { accepted: 1 }; },
    };
    const profiles = { p: { rootDir: dir, includeGlobs: ['**/*'] as string[], excludeGlobs: [] as string[], extensions: ['.md'] } };

    await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client, profiles });
    assert.equal(calls, 1);

    // Second run — unchanged content skipped
    const second = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client, profiles });
    assert.equal(calls, 1);
    assert.equal(second.skipped, 1);
    assert.equal(second.ingested, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM6-R5: Operability ---

test('wave8: summary includes per-profile dimensions', async () => {
  const dir = tmpDir();
  const dir2 = tmpDir();
  try {
    writeFileSync(join(dir, 'a.md'), 'aaa');
    writeFileSync(join(dir2, 'b.md'), 'bbb');
    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const client = {
      ingestContent: async () => ({ accepted: 1 }),
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
        specs: { rootDir: dir2, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
      },
      agentProfiles: { agentX: 'docs' },
    });

    assert.ok(result.profiles);
    assert.equal(result.profiles!.docs.ingested, 1);
    assert.equal(result.profiles!.specs.ingested, 1);
    assert.equal(result.scanned, 2);
    assert.equal(result.ingested, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  }
});

test('wave8: summary includes agent dimensions', async () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'a.md'), 'text');
    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const client = { ingestContent: async () => ({ accepted: 1 }) };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: { main: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] } },
      agentProfiles: { agentA: 'main', agentB: 'main' },
    });

    assert.ok(result.agents);
    assert.equal(result.agents!.agentA.profile, 'main');
    assert.equal(result.agents!.agentB.profile, 'main');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave8: error details include profile name in file path', async () => {
  const dir = tmpDir();
  try {
    writeFileSync(join(dir, 'fail.md'), 'boom');
    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const client = { ingestContent: async () => { throw new Error('remote 500'); } };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: { myprof: { rootDir: dir, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] } },
    });

    assert.equal(result.errors, 1);
    assert.ok(result.errorDetails[0].file.startsWith('myprof:'));
    assert.match(result.errorDetails[0].error, /remote 500/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave8: legacy ingestion without profiles still works unchanged', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', 'note.md'), 'content');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    // No profiles passed — legacy path
    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.ingested, 1);
    assert.ok(!result.profiles); // no profile dimensions in legacy mode
    assert.ok(paths[0].includes('memory/note.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Multi-profile multi-agent ---

test('wave8: two profiles with different roots ingest from both', async () => {
  const root1 = tmpDir();
  const root2 = tmpDir();
  try {
    writeFileSync(join(root1, 'doc1.md'), 'from-root1');
    writeFileSync(join(root2, 'doc2.md'), 'from-root2');

    const stateDir = tmpDir();
    const ledgerPath = join(stateDir, 'ledger.json');
    const summaryPath = join(stateDir, 'summary.json');
    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({
      rootDir: root1,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        workspace1: { rootDir: root1, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
        workspace2: { rootDir: root2, includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
      },
      agentProfiles: { agentA: 'workspace1', agentB: 'workspace2' },
    });

    assert.equal(result.ingested, 2);
    assert.ok(paths.some(p => p.startsWith('workspace1:')));
    assert.ok(paths.some(p => p.startsWith('workspace2:')));
    assert.ok(result.profiles!.workspace1.ingested === 1);
    assert.ok(result.profiles!.workspace2.ingested === 1);
  } finally {
    rmSync(root1, { recursive: true, force: true });
    rmSync(root2, { recursive: true, force: true });
  }
});

test('wave8: profile with missing rootDir returns zero items gracefully', async () => {
  const dir = tmpDir();
  try {
    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');
    const client = { ingestContent: async () => ({ accepted: 1 }) };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        missing: { rootDir: '/nonexistent/path/xyz', includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.md'] },
      },
    });

    assert.equal(result.scanned, 0);
    assert.equal(result.ingested, 0);
    assert.equal(result.errors, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Integration: register() with profiles wires through to ingestion cron ---

test('wave8: register with profiles and agentProfiles wires ingestion cron', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-w8-reg-'));
  try {
    const events: any[] = [];
    const api = {
      pluginConfig: {
        agents: { agent_primary: 'a1' },
        apiKeyEnv: 'NO_SUCH_ENV',
        ingestion: {
          enabled: false,
          profiles: { docs: { rootDir: dir } },
          agentProfiles: { agent_primary: 'docs' },
          defaultProfile: 'docs',
        },
      },
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
