import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runIngestionOnce } from '../src/ingestion.js';
import { classifyRouteByPath, isPdfExtension, isDuplicateResponse } from '../src/ingestion-core.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'bonfires-pm14-'));
}

// --- PM14-R2: Deterministic extension-based routing ---

test('pm14: isPdfExtension returns true for .pdf (case-insensitive)', () => {
  assert.equal(isPdfExtension('doc.pdf'), true);
  assert.equal(isPdfExtension('doc.PDF'), true);
  assert.equal(isPdfExtension('doc.Pdf'), true);
  assert.equal(isPdfExtension('/path/to/report.pdf'), true);
});

test('pm14: isPdfExtension returns false for non-PDF', () => {
  assert.equal(isPdfExtension('doc.md'), false);
  assert.equal(isPdfExtension('doc.txt'), false);
  assert.equal(isPdfExtension('doc.pdf.bak'), false);
  assert.equal(isPdfExtension('pdf'), false);
});

test('pm14: classifyRouteByPath routes .pdf to pdf and others to text', () => {
  assert.equal(classifyRouteByPath('report.pdf'), 'pdf');
  assert.equal(classifyRouteByPath('report.PDF'), 'pdf');
  assert.equal(classifyRouteByPath('notes.md'), 'text');
  assert.equal(classifyRouteByPath('data.json'), 'text');
  assert.equal(classifyRouteByPath('readme.txt'), 'text');
});

// --- PM14-R5: Duplicate response semantics ---

test('pm14: isDuplicateResponse detects duplicate message (case-insensitive, tolerant)', () => {
  assert.equal(isDuplicateResponse({ success: true, message: 'duplicate' }), true);
  assert.equal(isDuplicateResponse({ success: true, message: 'Duplicate' }), true);
  assert.equal(isDuplicateResponse({ success: true, message: 'DUPLICATE' }), true);
  // Tolerant: "duplicate content" variant
  assert.equal(isDuplicateResponse({ success: true, message: 'duplicate content' }), true);
  assert.equal(isDuplicateResponse({ success: true, message: 'Duplicate Content' }), true);
  // Non-matches
  assert.equal(isDuplicateResponse({ success: true, message: 'created' }), false);
  assert.equal(isDuplicateResponse({ success: true, message: 'duplicate key error' }), false);
  assert.equal(isDuplicateResponse({ success: true }), false);
  assert.equal(isDuplicateResponse({}), false);
});

// --- PM14-R2 + PM14-R4: PDF routing in runIngestionOnce ---

test('pm14: profile with .pdf extension routes PDFs to ingestPdf', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'report.pdf'), Buffer.from('%PDF-1.4 fake'));
    writeFileSync(join(dir, 'docs', 'notes.md'), 'markdown content');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const textCalls: any[] = [];
    const pdfCalls: any[] = [];
    const client = {
      ingestContent: async (req: any) => { textCalls.push(req); return { accepted: 1 }; },
      ingestPdf: async (req: any) => { pdfCalls.push(req); return { success: true, documentId: 'doc-1', message: 'created' }; },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf', '.md'] },
      },
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.ingested, 2);
    assert.equal(result.errors, 0);
    assert.equal(pdfCalls.length, 1, 'PDF should route to ingestPdf');
    assert.equal(textCalls.length, 1, 'MD should route to ingestContent');
    assert.ok(Buffer.isBuffer(pdfCalls[0].content), 'PDF content should be Buffer');
    assert.ok(pdfCalls[0].sourcePath.includes('report.pdf'));
    assert.ok(textCalls[0].sourcePath.includes('notes.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pm14: PDF with uppercase extension routes correctly', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'SCAN.PDF'), Buffer.from('%PDF-1.4 upper'));

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const pdfCalls: any[] = [];
    const client = {
      ingestContent: async () => ({ accepted: 1 }),
      ingestPdf: async (req: any) => { pdfCalls.push(req); return { success: true, message: 'created' }; },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.PDF'] },
      },
    });

    assert.equal(pdfCalls.length, 1);
    assert.equal(result.ingested, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM14-R5: Duplicate PDF response treated as success/no-op ---

test('pm14: duplicate PDF response counts as skipped, not error', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'dup.pdf'), Buffer.from('%PDF-1.4 dup'));

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const client = {
      ingestPdf: async () => ({ success: true, documentId: 'dup-id', message: 'duplicate' }),
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf'] },
      },
    });

    assert.equal(result.ingested, 0, 'duplicate should not count as ingested');
    assert.equal(result.skipped, 1, 'duplicate should count as skipped');
    assert.equal(result.errors, 0, 'duplicate should not be an error');

    // Ledger should NOT be updated for duplicates (Bonfires is source of truth)
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    assert.equal(ledger.entries['docs:dup.pdf'], undefined, 'duplicate should not update ledger');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM14-R4: Fail-open and per-file fault isolation ---

test('pm14: PDF ingest failure does not abort other files', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'fail.pdf'), Buffer.from('%PDF fail'));
    writeFileSync(join(dir, 'docs', 'ok.md'), 'good content');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const textCalls: any[] = [];
    const client = {
      ingestContent: async (req: any) => { textCalls.push(req); return { accepted: 1 }; },
      ingestPdf: async () => { throw new Error('remote PDF error'); },
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf', '.md'] },
      },
    });

    assert.equal(result.errors, 1, 'PDF failure should count as error');
    assert.equal(result.ingested, 1, 'MD should still succeed');
    assert.equal(textCalls.length, 1, 'text ingest should still run');
    assert.ok(result.errorDetails[0].error.includes('remote PDF error'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pm14: missing ingestPdf on client records error for PDF files', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'doc.pdf'), Buffer.from('%PDF'));

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const client = {
      ingestContent: async () => ({ accepted: 1 }),
      // No ingestPdf method
    };

    const result = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf'] },
      },
    });

    assert.equal(result.errors, 1);
    assert.match(result.errorDetails[0].error, /ingestPdf is not available/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM14-R1: No new config keys; existing behavior preserved ---

test('pm14: non-PDF ingestion behavior unchanged (text path still works)', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'memory'), { recursive: true });
    writeFileSync(join(dir, 'memory', 'note.md'), 'unchanged behavior');

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const calls: any[] = [];
    const client = {
      ingestContent: async (req: any) => { calls.push(req); return { accepted: 1 }; },
    };

    const result = await runIngestionOnce({ rootDir: dir, ledgerPath, summaryPath, client });
    assert.equal(result.ingested, 1);
    assert.equal(calls.length, 1);
    assert.ok(typeof calls[0].content === 'string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PM14-R7: Observability (hash in ledger for successful PDF) ---

test('pm14: successful PDF ingest updates ledger with hash', async () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'report.pdf'), Buffer.from('%PDF success'));

    const ledgerPath = join(dir, 'ledger.json');
    const summaryPath = join(dir, 'summary.json');

    const client = {
      ingestPdf: async () => ({ success: true, documentId: 'doc-1', message: 'created' }),
    };

    await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf'] },
      },
    });

    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const entry = ledger.entries['docs:report.pdf'];
    assert.ok(entry, 'ledger should have entry for ingested PDF');
    assert.ok(entry.hash.startsWith('sha256:'));
    assert.ok(entry.pushedAt);

    // Second run with same content should skip (hash match)
    const result2 = await runIngestionOnce({
      rootDir: dir,
      ledgerPath,
      summaryPath,
      client,
      profiles: {
        docs: { rootDir: join(dir, 'docs'), includeGlobs: ['**/*'], excludeGlobs: [], extensions: ['.pdf'] },
      },
    });
    assert.equal(result2.skipped, 1);
    assert.equal(result2.ingested, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
