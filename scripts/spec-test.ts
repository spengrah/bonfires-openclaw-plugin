import { readFileSync } from 'node:fs';

const idx = readFileSync('.ai/spec/spec/plugin/requirements-index.md','utf8');
const postIdx = readFileSync('.ai/spec/spec/post-mvp/requirements-index.md','utf8');
const checklist = readFileSync('.ai/spec/spec/plugin/verification-checklist.md','utf8');
const trace = JSON.parse(readFileSync('.ai/spec/spec/quality/traceability-map.json','utf8'));

for (const id of ['R1','R2','R3','R4','R5','R6']) {
  if (!idx.includes(`## ${id} —`) && !idx.includes(`## ${id} `)) {
    console.error(`Missing requirement section: ${id}`);
    process.exit(1);
  }
}

if (!checklist.includes('Recovery trigger confirmed')) {
  console.error('Checklist missing recovery-trigger gate');
  process.exit(1);
}

const reqIds = new Set((trace.requirements || []).map((r) => r.id));
for (const id of ['R1','R2','R3','R4','R5','R6']) {
  if (!reqIds.has(id)) {
    console.error(`Traceability map missing ${id}`);
    process.exit(1);
  }
}

for (const id of ['PM1','PM2','PM3','PM4']) {
  if (!postIdx.includes(`## ${id} —`) && !postIdx.includes(`## ${id} `)) {
    console.error(`Missing post-MVP requirement section: ${id}`);
    process.exit(1);
  }
}

const pmReqIds = new Set((trace.post_mvp_requirements || []).map((r) => r.id));
for (const id of ['PM1','PM2','PM3','PM4']) {
  if (!pmReqIds.has(id)) {
    console.error(`Traceability map missing ${id}`);
    process.exit(1);
  }
}

console.log('spec-test OK');
