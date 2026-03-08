# Spec: Ingestion Target Profiles and Agent Mapping

## Goal
Make ingestion source selection portable across heterogeneous user environments by replacing hardcoded directory assumptions with configurable profile-based target definitions and explicit agent-to-profile mapping.

## Requirements

### PM6-R1 — Profile-based source configuration
1. Ingestion config MUST support named profiles under `ingestion.profiles`.
2. Each profile MUST support:
   - `rootDir`
   - `includeGlobs` (one or more)
   - `excludeGlobs` (optional)
   - `extensions` (optional; default `['.md']`)
3. Paths/globs MUST be evaluated relative to profile `rootDir`.

### PM6-R2 — Agent to profile mapping
1. Config MUST support mapping local agent IDs to ingestion profiles (e.g., `ingestion.agentProfiles`).
2. If an agent has no explicit mapping, ingestion MUST use `ingestion.defaultProfile` when configured.
3. If neither agent mapping nor default profile exists, ingestion run MUST fail with explicit config error (not silently ingest from implicit hardcoded locations).

### PM6-R3 — Backward compatibility migration
1. Existing single-ingestion settings (`ingestion.rootDir`, legacy defaults) MUST remain readable for migration.
2. Runtime MUST normalize legacy config into an equivalent synthetic profile so existing installs do not break.
3. Deprecation notice SHOULD be emitted when legacy mode is used.

### PM6-R4 — Safety defaults
1. Default excludes SHOULD include `**/node_modules/**`, `**/.git/**`, `**/.openclaw/**` unless explicitly overridden.
2. Non-markdown content MUST be excluded unless `extensions` explicitly allows it.
3. Dedup/hash-ledger semantics MUST remain unchanged from PM4.

### PM6-R5 — Operability
1. Ingestion summaries MUST report per-profile and per-agent ingestion counts.
2. Errors MUST include profile name and source path for debugging.
3. README/operator docs MUST include examples for:
   - single-profile setup
   - multi-profile multi-agent setup

## Acceptance
- Users can configure ingestion targets without assuming `memory`, `vault`, `projects`, or `.ai` directories.
- Two agents can ingest from different roots/profiles in one plugin deployment.
- Existing installs using legacy ingestion config continue working with explicit migration behavior.
