import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '.ai/spec';
const required = [
  '.ai/spec/spec/requirements-index.md',
  '.ai/spec/spec/quality/verification-checklist.md',
  '.ai/spec/spec/quality/coupling-map.md',
  '.ai/spec/spec/quality/traceability-map.json',
  '.ai/spec/spec/quality/spec-for-mvp-verification-matrix.md',
  '.ai/spec/spec/retrieval/before-agent-start.md',
  '.ai/spec/spec/retrieval/bonfires-search-tool.md',
  '.ai/spec/spec/capture/agent-end-capture-legacy.md',
  '.ai/spec/spec/capture/immediate-stack-capture.md',
  '.ai/spec/spec/capture/message-sanitization.md',
  '.ai/spec/spec/capture/agent-display-names.md',
  '.ai/spec/spec/processing/recovery-and-session-end.md',
  '.ai/spec/spec/processing/stack-processing-heartbeat.md',
  '.ai/spec/spec/config/plugin-config-and-agent-mapping.md',
  '.ai/spec/spec/config/plugin-packaging.md',
  '.ai/spec/spec/client/bonfires-client-interface.md',
  '.ai/spec/spec/client/hosted-api-wiring.md',
  '.ai/spec/spec/ingestion/ingestion-cron-and-hash-ledger.md',
  '.ai/spec/spec/ingestion/ingestion-profiles-and-agent-mapping.md',
];

const missing = required.filter((p) => {
  try { return !statSync(p).isFile(); } catch { return true; }
});
if (missing.length) {
  console.error('Missing required spec files:\n' + missing.map((m) => `- ${m}`).join('\n'));
  process.exit(1);
}

function collectMd(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectMd(p));
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

const mdFiles = collectMd(root);
let issues = 0;
for (const p of mdFiles) {
  const t = readFileSync(p, 'utf8');
  if (!t.trim()) { console.error(`Empty markdown file: ${p}`); issues++; }
  if (t.includes('TODO') || t.includes('TBD')) { console.error(`Unresolved placeholder in ${p}`); issues++; }
}

if (issues) process.exit(1);
console.log(`spec-lint OK (${mdFiles.length} markdown files checked)`);
