#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

const allowEnv = process.env.FLANDERS_ALLOW_PUSH === '1';
const waiverPath = '.ai/log/plan/pre-push-waiver.json';
const statePath = '.ai/log/plan/flanders-state.json';

if (allowEnv || existsSync(waiverPath)) {
  console.log('[pre-push-state] override/waiver present; allowing push');
  process.exit(0);
}

let state;
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'));
} catch (e) {
  console.error('[pre-push-state] FAIL: cannot read flanders-state.json');
  process.exit(1);
}

if (state.next_action !== 'done') {
  console.error(`[pre-push-state] FAIL: next_action is '${state.next_action}', expected 'done'`);
  process.exit(1);
}

console.log('[pre-push-state] PASS: next_action=done');
