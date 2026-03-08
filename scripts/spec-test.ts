import { readFileSync } from 'node:fs';

const idx = readFileSync('.ai/spec/spec/requirements-index.md','utf8');
const checklist = readFileSync('.ai/spec/spec/quality/verification-checklist.md','utf8');
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

const reqIds = new Set((trace.requirements || []).map((r: any) => r.id));
for (const id of ['R1','R2','R3','R4','R5','R6']) {
  if (!reqIds.has(id)) {
    console.error(`Traceability map missing ${id}`);
    process.exit(1);
  }
}

for (const id of ['PM1','PM2','PM3','PM4','PM5','PM6','PM7','PM8','PM9','PM10','PM11','PM12','PM13']) {
  if (!idx.includes(`## ${id} —`) && !idx.includes(`## ${id} `) && !idx.includes(`### ${id} —`) && !idx.includes(`### ${id} `)) {
    console.error(`Missing requirement section: ${id}`);
    process.exit(1);
  }
}

const functionalReqs = new Set((trace.functionality_requirements || []).map((r: any) => r.id));
for (const id of ['PM1','PM2','PM3','PM4','PM5','PM6','PM7','PM8','PM9','PM10','PM11','PM12','PM13']) {
  if (!functionalReqs.has(id)) {
    console.error(`Traceability map missing ${id}`);
    process.exit(1);
  }
}

console.log('spec-test OK');
