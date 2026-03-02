# Guidance: Config + Mapping

- Centralize config parsing/defaulting in one module with explicit TypeScript interface.
- Fail fast on missing required startup config, but keep runtime hook errors non-fatal.
- Keep `lyle` naming explicit to avoid drift from generic `main` aliases.
- Resolve API key via env var indirection (`apiKeyEnv`) and never persist secret values.
