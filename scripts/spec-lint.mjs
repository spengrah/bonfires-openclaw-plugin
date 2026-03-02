import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '.ai/spec';
const required = [
  '.ai/spec/spec/plugin/requirements-index.md',
  '.ai/spec/spec/plugin/verification-checklist.md',
  '.ai/spec/spec/plugin/coupling-map.md',
  '.ai/spec/spec/plugin/spec-for-before-agent-start.md',
  '.ai/spec/spec/plugin/spec-for-bonfires-search-tool.md',
  '.ai/spec/spec/plugin/spec-for-agent-end-capture.md',
  '.ai/spec/spec/plugin/spec-for-recovery-catchup-and-session-end-flush.md',
  '.ai/spec/spec/plugin/spec-for-plugin-config-and-agent-mapping.md',
  '.ai/spec/spec/plugin/spec-for-bonfires-client-interface.md',
  '.ai/spec/spec/quality/spec-for-mvp-verification-matrix.md',
  '.ai/spec/spec/quality/traceability-map.json'
];

const missing = required.filter((p) => {
  try { return !statSync(p).isFile(); } catch { return true; }
});
if (missing.length) {
  console.error('Missing required spec files:\n' + missing.map((m)=>`- ${m}`).join('\n'));
  process.exit(1);
}

function collectMd(dir) {
  const out = [];
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
