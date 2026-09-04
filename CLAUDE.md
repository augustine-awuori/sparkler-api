# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                      # .npmrc sets legacy-peer-deps=true
npm start                        # node index.js — does NOT load .env (see below)
node --env-file=.env index.js    # run with local env vars loaded
npx nodemon --env-file=.env index.js   # watch mode (nodemon is a dependency, but no script wires it up)
npm run test:signup              # end-to-end auth tests on a throwaway in-memory MongoDB
```

`npm test` is still the default stub and exits 1. [tests/signup.mjs](tests/signup.mjs) is the only test: it covers the sign-up paths and the credential-exposure invariants below, using fake Stream credentials so it makes no outward calls (which also asserts that a Stream outage cannot fail a sign-in). The first run downloads a ~200MB MongoDB binary to `~/.cache/mongodb-binaries`.

There is no test runner, linter, or formatter. `npm test` is the default stub and exits 1.

## Environment

`dotenv` is **not** a dependency and nothing calls `process.loadEnvFile`. `.env` only takes effect if the process is started with `node --env-file=.env`, or if the host (deployment platform) injects the vars. Env var names are inconsistently cased — match them exactly:

| Var | Used by |
| --- | --- |
| `db` | Mongo connection string ([startup/db.js](startup/db.js)) |
| `jwtPrivateKey` | JWT signing/verification ([models/sparkler.js](models/sparkler.js), [middlewares/auth.js](middlewares/auth.js)) |
| `chatApiKey` / `chatApiSecret` | Stream **Chat** v2 ([routes/chatToken.js](routes/chatToken.js)) |
| `NEW_FEED_API_KEY` / `NEW_CHAT_API_SECRET` | Stream **Feeds** v3 (`@stream-io/node-sdk`) |
| `RESEND_API_KEY` | Transactional email ([services/mail.js](services/mail.js)) |
| `POE_API_KEY` | Poe-hosted "GraoAI" model via the OpenAI SDK ([routes/grao.js](routes/grao.js)) |
| `PORT` | defaults to 3000 |

All of these are read through `requireEnv()`, so a missing one throws at boot rather than producing a client with `undefined` credentials. [.env.example](.env.example) lists them; keep it in sync.

Chat and Feeds currently point at the **same** Stream app, so `chatApiKey`/`chatApiSecret` and `NEW_FEED_API_KEY`/`NEW_CHAT_API_SECRET` hold the same values. The `NEW_`-prefixed names are what the code reads — do not rename them back to `feedApiKey`/`feedSecretKey`.

## Architecture

ESM-only (`"type": "module"`), so every relative import must include the `.js` extension.

[index.js](index.js) wires four startup modules in order and exports the `http.Server`:

- [startup/logging.js](startup/logging.js) — winston file transports + `unhandledRejection` rethrow.
- [startup/db.js](startup/db.js) — `mongoose.connect`; on a missing/failed connection it logs and returns, so the server still boots and every route then fails at query time.
- [startup/prod.js](startup/prod.js) — helmet + compression (applied in all environments).
- [startup/routes.js](startup/routes.js) — the single place routers are mounted, all under `/api/<name>`. Adding a resource means: model in `models/`, router in `routes/`, one import + one `app.use` here.

Layering is `routes/ → models/` directly; `services/` and `utils/` exist only for cross-cutting concerns (mail, username generation, Expo push). Most business logic lives inline in the route handlers.

### Auth

Three middlewares, composed as arrays (`[auth, admin]`):

- [middlewares/auth.js](middlewares/auth.js) — requires an `x-auth-token` header, verifies the JWT and sets `req.user` to the **payload** (`{ id, name, image, custom }`), not a DB document.
- [middlewares/politeAuth.js](middlewares/politeAuth.js) — same, but a missing token passes through with `req.user` undefined.
- [middlewares/admin.js](middlewares/admin.js) — re-fetches the Sparkler and checks `custom.isAdmin`.

Because `req.user` is a token payload, use `req.user.id` (some older handlers use `req.user._id`, which is undefined — e.g. [routes/chatToken.js](routes/chatToken.js)).

Login is passwordless: `POST /api/sparklers/auth-code` mails a 4-digit code (bcrypt-hashed onto the user), and `/auth-code/verify` exchanges it for a JWT returned both in the body and the `x-auth-token` response header. There are also `/auth-google`, `/quick`, and an anonymous `/guest` path. Clients are expected to replace their stored token whenever a response carries a new `x-auth-token`.

### The `Sparkler` model is the user model

[models/sparkler.js](models/sparkler.js). Everything mutable and app-specific lives in the freeform `custom` object (`username`, `verified`, `isAdmin`, `invalid`, `feedToken`, `expoPushToken`) — it is `type: Object` with no schema, so writes to it are unvalidated and `findByIdAndUpdate` with a partial `custom` **replaces** the whole object. The registered model name is `Sparkler`, but [models/community.js](models/community.js) and [models/issue.js](models/issue.js) declare `ref: "User"` — an unregistered name, so `populate("creator")` on a Community (used by the join handler) throws `MissingSchemaError`. Use `ref: "Sparkler"` in new schemas.

### Credentials must never reach Stream or a response body

Stream returns a user's `custom` object on **every** user record it embeds — in activities, comments, reactions and member lists — so anything placed there is readable by every other signed-in user. A prior version stored `feedToken` in `custom`, which leaked every account's Stream token to every other account.

The invariant now: **`feedToken` is minted on demand, scoped to the caller, and never persisted to Mongo or written to Stream.**

- `toStreamUser(doc)` in [services/users.js](services/users.js) is the single definition of what Stream may see. Every `upsertUsers` call goes through it. Do not build a `custom` object by hand, and never spread a raw `sparkler.custom` into a Stream payload.
- `toPublicUser(doc)` is the equivalent for API responses — it drops the bcrypt `authCode` hash. Never `res.send` a raw Sparkler document.
- Clients get a feed token from `GET /api/sparklers/feed-token` (auth required), which mints a 24h token for `req.user.id` only.
- Secrets come from `requireEnv()` in [utils/requireEnv.js](utils/requireEnv.js), which throws at boot on a missing var. Never add a `||` literal fallback — that is how a Stream app secret ended up committed in source.

### Stream integration

Two separate Stream SDKs with separate credentials coexist: the older `stream-chat` (chat tokens) and `@stream-io/node-sdk` (feeds, guests, membership levels). Mongo is the source of truth; Stream is kept in sync by `client.upsertUsers(...)` after user writes. Admin-only `PATCH /api/sparklers/sync` batch-replays all users into Stream, and `PATCH /api/sparklers/verify` bulk-verifies by email. Stream failures are generally caught and logged rather than failing the request.

### Validation

Joi validators are exported alongside the schema from the model file (`export const validateX`) and applied via `validate(validateX)` from [middlewares/validate.js](middlewares/validate.js), which 400s with `error.details[0].message`. Most routes skip this and validate inline.

## Conventions

- Errors are returned as `{ error: "..." }` (a string, occasionally an object). Success payloads are the bare document or `{ message }`.
- Handlers are wrapped in their own `try/catch` that `console.error`s and returns 500. The global [middlewares/error.js](middlewares/error.js) has a 3-arg signature, so Express never invokes it as an error handler — do not rely on `next(err)`.
- Mongoose `models/` files export the model (and validator) as named exports; routers are default exports.

## Known landmines

- [utils/communities.js](utils/communities.js) imports `../routes/expoPushNotifications.js` and `../models/user.js`, neither of which exists. It is currently unimported; importing it will crash the process at load.
- [routes/communities.js](routes/communities.js) `DELETE /:communityId` references an undefined `userId`, and `GET /levels` is mounted after `GET /:communityId`, so it is unreachable.
- [startup/logging.js](startup/logging.js) calls `new winston.Logger(...)`, removed in winston 3.
- [middlewares/error.js](middlewares/error.js) takes 3 args, so Express treats it as ordinary middleware and never invokes it as an error handler.
- [routes/reports.js](routes/reports.js) `isAuthorised` reads `user.isAdmin` / `user.isSchOfficial`, but those live under `custom` — so the check is always falsy and the route always 403s.
- `custom.username` has no unique index (`custom` is an unschema'd `Object`), so duplicate usernames are possible despite `findUniqueUsername`.
