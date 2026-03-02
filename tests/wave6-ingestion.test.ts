import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runIngestionOnce, startIngestionCron } from '../src/ingestion.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'bonfires-ingest-'));
}

test('wave6: ingestion skips unchanged content and persists ledger across runs', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', '2026-03-02.md'), 'alpha');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    const ingestCalls: string[] = [];
    const client = {
      ingestContent: async (req: any) => {
        ingestCalls.push(req.sourcePath);
        return { accepted: 1 };
      },
    };

    const first = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(first.ingested, 1);
    assert.equal(first.skipped, 0);
    assert.equal(first.errors, 0);
    assert.equal(ingestCalls.length, 1);

    const second = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(second.ingested, 0);
    assert.equal(second.skipped, 1);
    assert.equal(second.errors, 0);
    assert.equal(ingestCalls.length, 1);

    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    assert.equal(typeof ledger.entries['memory/2026-03-02.md'].hash, 'string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave6: changed content ingests exactly once per new hash and emits summary', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    const target = join(dir, 'memory', '2026-03-03.md');
    writeFileSync(target, 'v1');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    let calls = 0;
    const client = {
      ingestContent: async () => {
        calls += 1;
        return { accepted: 1 };
      },
    };

    await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    writeFileSync(target, 'v2');
    const afterChange = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });

    assert.equal(calls, 2);
    assert.equal(afterChange.ingested, 1);

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    assert.equal(typeof summary.timestamp, 'string');
    assert.equal(typeof summary.ingested, 'number');
    assert.equal(typeof summary.skipped, 'number');
    assert.equal(typeof summary.errors, 'number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave6: ingestContent error increments error count and records failure detail', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', 'fail-target.md'), 'boom');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    const client = {
      ingestContent: async () => { throw new Error('remote 500'); },
    };

    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.errors, 1);
    assert.equal(result.ingested, 0);
    assert.equal(result.errorDetails.length, 1);
    assert.match(result.errorDetails[0].error, /remote 500/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave6: missing ingestContent on client throws and records error', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', 'orphan.md'), 'data');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    const client = {}; // no ingestContent method

    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.errors, 1);
    assert.equal(result.ingested, 0);
    assert.match(result.errorDetails[0].error, /ingestContent is not available/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave6: startIngestionCron skips scheduling when disabled', () => {
  const ticks: number[] = [];
  const client = {
    ingestContent: async () => { ticks.push(1); return { accepted: 0 }; },
  };

  const stop = startIngestionCron({
    enabled: false,
    everyMinutes: 1,
    rootDir: '/nonexistent',
    ledgerPath: '/nonexistent/ledger.json',
    summaryPath: '/nonexistent/summary.json',
    client,
  });

  assert.equal(typeof stop, 'function');
  // Calling stop should be safe even when disabled
  stop();
  assert.equal(ticks.length, 0);
});

test('wave6: ingestion scans vault and projects directories', async () => {
  const dir = tmpDir();
  try {
    // vault/ markdown
    mkdirSync(join(dir, 'vault', 'notes'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'notes', 'entry.md'), 'vault-content');

    // projects/<name>/README.md + .ai/spec/
    mkdirSync(join(dir, 'projects', 'alpha', '.ai', 'spec'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'alpha', 'README.md'), 'readme-content');
    writeFileSync(join(dir, 'projects', 'alpha', '.ai', 'spec', 'design.md'), 'spec-content');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.scanned, 3);
    assert.equal(result.ingested, 3);
    assert.equal(result.errors, 0);
    assert.ok(paths.some(p => p.includes('vault/')));
    assert.ok(paths.some(p => p.includes('README.md')));
    assert.ok(paths.some(p => p.includes('spec/design.md')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wave6: ingestion skips non-markdown files', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', 'notes.md'), 'markdown');
    writeFileSync(join(dir, 'memory', 'data.json'), '{}');
    writeFileSync(join(dir, 'memory', 'readme.txt'), 'text');
    writeFileSync(join(dir, 'memory', 'image.png'), 'binary');

    const ledgerPath = join(dir, '.ai/log/plan/ingestion-hash-ledger.json');
    const summaryPath = join(dir, '.ai/log/plan/ingestion-cron-summary-current.json');

    const paths: string[] = [];
    const client = {
      ingestContent: async (req: any) => { paths.push(req.sourcePath); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.scanned, 1, 'only .md files should be scanned');
    assert.equal(result.ingested, 1);
    assert.ok(paths[0].endsWith('.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
