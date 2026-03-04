# Bonfires Plugin — In-Instance Dogfood Test Plan

## Purpose
Validate the plugin end-to-end in the **current OpenClaw instance** (no clean instance required), with controlled risk and a clear rollback path.

## Success criteria (high-level)
1. Plugin installs/loads cleanly via OpenClaw plugin tooling.
2. Core runtime behaviors work in this instance:
   - retrieval/context injection
   - `bonfires_search` tool behavior
   - capture on `agent_end`
   - session-end flush/recovery behavior
   - stack-processing heartbeat loop
   - ingestion hash-ledger idempotency
3. No regressions to gateway stability and no persistent config drift after test.
4. Rollback can restore pre-test state in <10 minutes.

---

## Scope
### In scope
- Installation and enablement through `openclaw plugins` commands.
- Config testing with env-var-backed settings.
- Functional behavior tests with observable artifacts.
- Data capture and go/no-go assessment.
- Safe disable/uninstall rollback.

### Out of scope
- Cross-machine clean-room install.
- Production traffic load/performance benchmarking.
- Long-horizon soak testing beyond one dogfood session.

---

## Phase 0 — Safety prep and baseline snapshot

## 0.1 Snapshot current state
```bash
cd /home/lyle/.openclaw/workspace/projects/bonfires-plugin
mkdir -p .ai/log/dogfood
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p .ai/log/dogfood/$TS

cp ~/.openclaw/openclaw.json .ai/log/dogfood/$TS/openclaw.pretest.json
openclaw plugins list > .ai/log/dogfood/$TS/plugins.list.pre.txt
openclaw plugins doctor > .ai/log/dogfood/$TS/plugins.doctor.pre.txt || true
openclaw status > .ai/log/dogfood/$TS/openclaw.status.pre.txt
```

## 0.2 Baseline repo quality (source-level confidence)
```bash
npm run gate:all > .ai/log/dogfood/$TS/gate-all.pre.txt
```
Expected: PASS.

---

## Phase 1 — Install/enable in this instance

## 1.1 Install via local link (real plugin path)
```bash
openclaw plugins install -l /home/lyle/.openclaw/workspace/projects/bonfires-plugin
openclaw plugins list > .ai/log/dogfood/$TS/plugins.list.post-install.txt
openclaw plugins info bonfires-plugin > .ai/log/dogfood/$TS/plugins.info.bonfires.txt
openclaw plugins doctor > .ai/log/dogfood/$TS/plugins.doctor.post-install.txt
```
Expected:
- plugin appears in list
- `plugins doctor` has no blocking manifest/schema errors

## 1.2 Ensure plugin entry is enabled in config
If needed:
```bash
openclaw plugins enable bonfires-plugin
```

---

## Phase 2 — Configure with env-backed values

## 2.1 Set env vars in `~/.openclaw/.env` (or host env)
```bash
BONFIRES_BASE_URL=...
BONFIRES_API_KEY_ENV=DELVE_API_KEY
BONFIRE_ID=...
DELVE_API_KEY=...
```

## 2.2 Minimal plugin config (prefer non-secret values only)
Use `plugins.entries.bonfires-plugin.config` in `~/.openclaw/openclaw.json`:
- `agents` mapping
- optional behavior knobs (`search`, `capture`, `network`, `ingestion`)
- omit sensitive values where env fallback exists

## 2.3 Reload/restart and verify health
```bash
openclaw gateway restart
openclaw status > .ai/log/dogfood/$TS/openclaw.status.post-config.txt
openclaw plugins doctor > .ai/log/dogfood/$TS/plugins.doctor.post-config.txt
```

---

## Phase 3 — Functional test matrix

For each test, record: timestamp, command/action, expected, observed, pass/fail.
Store notes in `.ai/log/dogfood/$TS/test-results.md`.

## T1. Manifest/load health
Checks:
```bash
openclaw plugins list
openclaw plugins info bonfires-plugin
openclaw plugins doctor
```
Pass if plugin is loaded and doctor shows no blocking errors.

## T2. Hosted verification script (fixture)
```bash
npm run verify:hosted > .ai/log/dogfood/$TS/verify-hosted.fixture.txt
```
Pass if command exits 0 and writes:
- `.ai/log/plan/hosted-integration-verification-current.json`

## T3. Hosted verification (live preflight)
```bash
npm run verify:hosted -- --live > .ai/log/dogfood/$TS/verify-hosted.live.txt
```
Pass if `/healthz` + `/generate_summaries` probes pass (or clearly report env/API blockers).

## T4. Retrieval/tool behavior
Interactive check in chat:
1. Send a prompt that should trigger retrieval context.
2. Ask the model to use `bonfires_search` explicitly.

Pass if response/tool behavior is coherent and no plugin errors are emitted.

## T5. Capture + session lifecycle
Interactive check:
1. Run 2–3 turns in one session.
2. End/reset session.

Pass signals:
- capture ledger updates (state file timestamp/index moves)
- no duplicate flood behavior

## T6. Heartbeat/recovery loop
Wait for one stack heartbeat cycle window (20m + jitter).
Pass signals:
- heartbeat state file updates with last attempt/success metadata
- no repeated failure loop

## T7. Ingestion idempotency
```bash
npm run ingest:bonfires > .ai/log/dogfood/$TS/ingest.run1.txt
npm run ingest:bonfires > .ai/log/dogfood/$TS/ingest.run2.txt
```
Pass if run2 shows mostly skipped unchanged items and ledger persists.

Artifacts to inspect:
- ingestion hash ledger
- ingestion summary current json

## T8. Regression safety
```bash
openclaw status > .ai/log/dogfood/$TS/openclaw.status.post-tests.txt
npm run gate:all > .ai/log/dogfood/$TS/gate-all.post.txt
```
Pass if gateway healthy + gates remain PASS.

---

## Phase 4 — Data collection package
Create a single evidence bundle:
- command outputs from `.ai/log/dogfood/$TS/`
- key runtime artifacts copied into `.ai/log/dogfood/$TS/artifacts/`
- final scorecard file: `.ai/log/dogfood/$TS/assessment.md`

Recommended assessment template:
1. Install/Load: PASS/FAIL
2. Config/env fallback: PASS/FAIL
3. Retrieval/tool: PASS/FAIL
4. Capture/session lifecycle: PASS/FAIL
5. Heartbeat/recovery: PASS/FAIL
6. Ingestion/idempotency: PASS/FAIL
7. Regression check: PASS/FAIL
8. Overall verdict: GO / CONDITIONAL_GO / NO_GO
9. Blocking issues + repro links

---

## Rollback plan (same instance)

## Fast rollback (keep plugin installed, disable only)
```bash
openclaw plugins disable bonfires-plugin
openclaw gateway restart
openclaw status
```

## Full rollback (remove plugin)
```bash
openclaw plugins uninstall bonfires-plugin
openclaw gateway restart
openclaw plugins list
```

## Config rollback
```bash
cp .ai/log/dogfood/$TS/openclaw.pretest.json ~/.openclaw/openclaw.json
openclaw gateway restart
openclaw status
```

Pass if gateway returns to pre-test health and plugin is disabled/removed as intended.

---

## Operator notes
1. `gate:all` is source-repo quality verification; it does **not** replace runtime plugin doctor/smoke testing.
2. If live hosted checks are flaky, treat as environment blockers (credentials/network/API availability), not immediate code regressions.
3. Keep all sensitive values in env, not in committed docs/config examples.
