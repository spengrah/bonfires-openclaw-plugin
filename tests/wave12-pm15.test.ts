import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLink, classifyByContentType, isDuplicateResponse } from '../src/ingestion-core.js';
import { isAllowedScheme, isPrivateHost, validateFetchUrl } from '../src/transport-safety.js';
import { extractReadableText } from '../src/html-extract.js';
import { ingestLink } from '../src/tools/bonfires-ingest-link.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- PM15-R3: Link classification + route selection ---

test('pm15: classifyLink routes .pdf URL to pdf', () => {
  assert.equal(classifyLink('https://example.com/doc.pdf'), 'pdf');
  assert.equal(classifyLink('https://example.com/doc.PDF'), 'pdf');
});

test('pm15: classifyLink routes text file URLs to text', () => {
  assert.equal(classifyLink('https://example.com/readme.md'), 'text');
  assert.equal(classifyLink('https://example.com/data.json'), 'text');
  assert.equal(classifyLink('https://example.com/config.yaml'), 'text');
  assert.equal(classifyLink('https://example.com/data.csv'), 'text');
  assert.equal(classifyLink('https://example.com/readme.txt'), 'text');
});

test('pm15: classifyLink routes .html URL to html', () => {
  assert.equal(classifyLink('https://example.com/page.html'), 'html');
  assert.equal(classifyLink('https://example.com/page.htm'), 'html');
});

test('pm15: classifyLink falls back to content-type when no extension', () => {
  assert.equal(classifyLink('https://example.com/api/doc', 'application/pdf'), 'pdf');
  assert.equal(classifyLink('https://example.com/page', 'text/html'), 'html');
  assert.equal(classifyLink('https://example.com/api/data', 'application/json'), 'text');
  assert.equal(classifyLink('https://example.com/file', 'text/plain'), 'text');
});

test('pm15: classifyLink returns null for unsupported types', () => {
  assert.equal(classifyLink('https://example.com/image.png', 'image/png'), null);
  assert.equal(classifyLink('https://example.com/file'), null);
});

test('pm15: classifyByContentType handles charset parameters', () => {
  assert.equal(classifyByContentType('text/html; charset=utf-8'), 'html');
  assert.equal(classifyByContentType('application/pdf; charset=binary'), 'pdf');
  assert.equal(classifyByContentType('text/plain; charset=utf-8'), 'text');
});

// --- PM15-R5: Transport safety guards ---

test('pm15: isAllowedScheme accepts http and https only', () => {
  assert.equal(isAllowedScheme('https://example.com'), true);
  assert.equal(isAllowedScheme('http://example.com'), true);
  assert.equal(isAllowedScheme('ftp://example.com'), false);
  assert.equal(isAllowedScheme('file:///etc/passwd'), false);
  assert.equal(isAllowedScheme('data:text/html,<h1>hi</h1>'), false);
  assert.equal(isAllowedScheme('javascript:alert(1)'), false);
  assert.equal(isAllowedScheme('not-a-url'), false);
});

test('pm15: isPrivateHost blocks localhost and loopback', () => {
  assert.equal(isPrivateHost('localhost'), true);
  assert.equal(isPrivateHost('127.0.0.1'), true);
  assert.equal(isPrivateHost('::1'), true);
  assert.equal(isPrivateHost('[::1]'), true);
  assert.equal(isPrivateHost('0.0.0.0'), true);
});

test('pm15: isPrivateHost blocks private RFC1918 ranges', () => {
  assert.equal(isPrivateHost('10.0.0.1'), true);
  assert.equal(isPrivateHost('10.255.255.255'), true);
  assert.equal(isPrivateHost('172.16.0.1'), true);
  assert.equal(isPrivateHost('172.31.255.255'), true);
  assert.equal(isPrivateHost('192.168.0.1'), true);
  assert.equal(isPrivateHost('192.168.255.255'), true);
});

test('pm15: isPrivateHost blocks link-local and metadata endpoints', () => {
  assert.equal(isPrivateHost('169.254.169.254'), true);
  assert.equal(isPrivateHost('169.254.0.1'), true);
});

test('pm15: isPrivateHost allows public hosts', () => {
  assert.equal(isPrivateHost('example.com'), false);
  assert.equal(isPrivateHost('8.8.8.8'), false);
  assert.equal(isPrivateHost('github.com'), false);
});

test('pm15: validateFetchUrl rejects non-http schemes', () => {
  assert.ok(validateFetchUrl('ftp://example.com'));
  assert.ok(validateFetchUrl('file:///etc/passwd'));
});

test('pm15: validateFetchUrl rejects private hosts', () => {
  assert.ok(validateFetchUrl('http://localhost/path'));
  assert.ok(validateFetchUrl('https://127.0.0.1/path'));
  assert.ok(validateFetchUrl('https://10.0.0.1/internal'));
  assert.ok(validateFetchUrl('https://169.254.169.254/latest/meta-data'));
});

test('pm15: validateFetchUrl accepts public https URLs', () => {
  assert.equal(validateFetchUrl('https://example.com/page'), null);
  assert.equal(validateFetchUrl('https://docs.github.com/article.md'), null);
});

// --- PM15-R4: HTML extraction ---

test('pm15: extractReadableText strips script and style elements', () => {
  const html = '<html><head><style>body{color:red}</style></head><body><script>alert(1)</script><p>Hello world</p></body></html>';
  const text = extractReadableText(html);
  assert.ok(!text.includes('alert'));
  assert.ok(!text.includes('color:red'));
  assert.ok(text.includes('Hello world'));
});

test('pm15: extractReadableText strips nav/header/footer/aside', () => {
  const html = '<nav>Menu</nav><main><p>Content</p></main><footer>Footer</footer>';
  const text = extractReadableText(html);
  assert.ok(!text.includes('Menu'));
  assert.ok(!text.includes('Footer'));
  assert.ok(text.includes('Content'));
});

test('pm15: extractReadableText decodes HTML entities', () => {
  const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>';
  const text = extractReadableText(html);
  assert.ok(text.includes('A & B < C > D "E" \'F\''));
});

test('pm15: extractReadableText preserves paragraph structure', () => {
  const html = '<p>First paragraph</p><p>Second paragraph</p>';
  const text = extractReadableText(html);
  assert.ok(text.includes('First paragraph'));
  assert.ok(text.includes('Second paragraph'));
  // Paragraphs should be separated by newlines
  const lines = text.split('\n').filter(l => l.trim());
  assert.ok(lines.length >= 2);
});

test('pm15: extractReadableText handles empty/whitespace-only HTML', () => {
  assert.equal(extractReadableText('<html><body>   </body></html>'), '');
  assert.equal(extractReadableText(''), '');
});

test('pm15: extractReadableText normalizes excessive whitespace', () => {
  const html = '<p>Too    many     spaces</p>\n\n\n\n\n<p>Next</p>';
  const text = extractReadableText(html);
  assert.ok(!text.includes('    '));
  assert.ok(text.includes('Too many spaces'));
});

// --- PM15-R2 + PM15-R5: ingestLink with validation ---

test('pm15: ingestLink rejects non-http URL', async () => {
  const client = new MockBonfiresClient();
  const result = await ingestLink('ftp://example.com/file.pdf', client);
  assert.equal(result.success, false);
  assert.equal(result.classification, 'blocked');
  assert.ok(result.error?.includes('only http/https'));
});

test('pm15: ingestLink rejects localhost URL', async () => {
  const client = new MockBonfiresClient();
  const result = await ingestLink('http://localhost:8080/secret', client);
  assert.equal(result.success, false);
  assert.equal(result.classification, 'blocked');
  assert.ok(result.error?.includes('private/localhost'));
});

test('pm15: ingestLink rejects private IP URL', async () => {
  const client = new MockBonfiresClient();
  const result = await ingestLink('https://10.0.0.1/internal/doc.pdf', client);
  assert.equal(result.success, false);
  assert.equal(result.classification, 'blocked');
  assert.ok(result.error?.includes('private/localhost'));
});

test('pm15: ingestLink rejects metadata endpoint URL', async () => {
  const client = new MockBonfiresClient();
  const result = await ingestLink('http://169.254.169.254/latest/meta-data', client);
  assert.equal(result.success, false);
  assert.equal(result.classification, 'blocked');
});

// --- PM15-R6: Provenance metadata ---

test('pm15: ingestLink result includes url, classification, route, success, duplicate', async () => {
  const client = new MockBonfiresClient();
  // This will fail at fetch (no real server), but tests the result shape
  const result = await ingestLink('https://example.com/doc.pdf', client);
  assert.ok('url' in result);
  assert.ok('classification' in result);
  assert.ok('route' in result);
  assert.ok('success' in result);
  assert.ok('duplicate' in result);
});

// --- PM15-R7: Idempotency (duplicate handling) ---

test('pm15: isDuplicateResponse works for PM15 context', () => {
  assert.equal(isDuplicateResponse({ success: true, message: 'duplicate' }), true);
  assert.equal(isDuplicateResponse({ success: true, message: 'created' }), false);
});

// --- PM15-R1: Explicit confirmation model ---

test('pm15: bonfires_ingest_link tool registers with explicit description', async () => {
  const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assert.ok(indexSrc.includes('bonfires_ingest_link'), 'tool should be registered');
  assert.ok(indexSrc.includes('confirm'), 'tool description should mention confirmation');
});

// --- Plugin registration includes new tool ---

test('pm15: plugin registers bonfires_ingest_link tool', () => {
  const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  // Count registerTool calls - should be 3 (search, stack_search, ingest_link)
  const toolRegCalls = (indexSrc.match(/api\.registerTool/g) || []).length;
  assert.equal(toolRegCalls, 3, 'should register 3 tools');
});
