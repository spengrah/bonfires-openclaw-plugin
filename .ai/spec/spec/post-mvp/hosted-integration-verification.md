# Spec: Hosted Integration Verification

## Goal
Provide deterministic validation that hosted Bonfires integration is healthy and contract-compliant.

## Requirements
1. Preflight suite includes:
   - `GET /healthz`
   - auth+bonfire access check (`POST /generate_summaries` with `bonfire_id`)
2. Adapter contract verification for:
   - `/delve` normalization
   - `/stack/add` capture mapping
   - `/stack/process` call/response handling
3. Integration verification artifacts are written under `.ai/log/plan/`.
4. Verification must redact secrets from outputs.

## Acceptance
- Preflight returns HTTP 200 for both checks in configured environment.
- Contract tests pass against recorded/fixture responses and live smoke probes.
- Verification report artifact includes timestamp + pass/fail per probe.
