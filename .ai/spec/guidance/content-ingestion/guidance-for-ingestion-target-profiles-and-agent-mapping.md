# Guidance: Ingestion Target Profiles and Agent Mapping

Reviewers should verify:

1. **Portability quality**
   - No baked-in assumptions about repo/workspace structure in ingestion source selection.
   - Profile config can represent common real-world layouts across users.

2. **Configuration clarity**
   - Agent→profile mapping behavior is explicit and deterministic.
   - Missing mapping/default failures are clear and actionable.

3. **Backward-compatibility quality**
   - Legacy config migration path is deterministic and low-risk.
   - Deprecation signaling is present without breaking existing deployments.

4. **Safety quality**
   - Excludes and extension filtering reduce accidental ingestion of irrelevant/sensitive files.
   - No regression in hash-ledger idempotency and replay behavior.

5. **Operability quality**
   - Summary/reporting clearly attributes ingest activity by profile/agent.
   - Troubleshooting docs include concrete examples and failure modes.
