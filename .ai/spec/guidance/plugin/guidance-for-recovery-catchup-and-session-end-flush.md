# Guidance: Recovery + Session-end Flush

- Share one ledger implementation across primary and recovery flows.
- Recovery should be conservative: only push uncaptured ranges.
- Keep close detection deterministic (hook-first, inactivity fallback).
