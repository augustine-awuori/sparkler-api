# Sparkler API

## Commands

```bash
npm run dev          # Starts the server with .env
npm run build        # Clears dist/ and compiles TypeScript
npm run typecheck    # Type-checks src/, tests/, and scripts/
npm test             # Contract baseline and unit tests
npm run test:signup  # Builds, then tests the built server with Node
```

`npm test` uses an in-memory MongoDB and mocked Stream credentials; it makes no external service calls. Update `tests/contract/baseline.test.ts` when intentionally changing the client-visible API contract. Keep `npm run test:signup`: it exercises compiled output and catches module-loading issues that unit tests may miss. There is no linter or formatter.

## Project conventions

- TypeScript is strict and uses ESM (`NodeNext`); relative imports use `.js` extensions.
- `src/routes/index.ts` mounts API routers. Routes generally call models directly; shared integrations live in `src/services/`.
- `src/config/index.ts` is the only module that reads `process.env`. The entrypoint calls `loadConfig()` once; other modules use `config()`. Development loads `.env` through `npm run dev`; keep `.env.example` in sync with configuration.
- Development uses local MongoDB at `mongodb://127.0.0.1:27017/sparkler-api`; production and test environments use the required `db` setting.
- Never read environment variables at module load time or add literal credential fallbacks. Preserve the existing environment variable names.

See [`.claude/rules/`](./.claude/rules/) for guidance scoped to API/auth, Stream, and mail code.

What to build next, and why, is in `sparkler_mobile/docs/roadmap/campus-connection.md`.
