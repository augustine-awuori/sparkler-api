# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                # .npmrc sets legacy-peer-deps=true
npm run dev                # tsx watch, loads .env
npm run build              # wipes dist/, then tsc -p tsconfig.build.json
npm start                  # node dist/index.js — does NOT load .env (see below)
npm run typecheck          # tsc --noEmit over src/, tests/ and scripts/
npm test                   # vitest: contract baseline + unit tests
npm run test:signup        # builds, then runs tests/signup.ts against dist/ under plain Node
```

Both suites use a throwaway in-memory MongoDB (first run downloads a large mongod binary) and deliberately fake Stream credentials, so they make no outward calls — which also asserts that a Stream outage cannot fail a sign-in.

- [tests/contract/baseline.test.ts](tests/contract/baseline.test.ts) records the client-visible wire contract. An expectation that changes is edited in the same commit as the code, with a `CHANGED IN ...` comment, so behaviour changes are reviewable as a diff.
- [tests/signup.ts](tests/signup.ts) runs the **built** server with Node's native type stripping, not vitest. Keep it that way: it catches bugs that only appear in compiled output (e.g. a named import from a CommonJS package typechecks and passes under vitest but throws under Node — see `jsonwebtoken` in [src/http/toAppError.ts](src/http/toAppError.ts)).

There is no linter or formatter.

## Environment

`dotenv` is **not** a dependency. `.env` only takes effect via `--env-file=.env` (which `npm run dev` passes) or when the host injects the vars. Env var names are inconsistently cased — match them exactly:

| Var | Used for |
| --- | --- |
| `db` | Mongo connection string |
| `jwtPrivateKey` | JWT signing/verification |
| `NEW_FEED_API_KEY` / `NEW_CHAT_API_SECRET` | Stream (`@stream-io/node-sdk`): user sync and minting feed tokens |
| `RESEND_API_KEY` | Announcement email ([src/services/mail.ts](src/services/mail.ts)) |
| `PORT`, `LOG_LEVEL` | optional |

[src/config/index.ts](src/config/index.ts) is the **only** place that reads `process.env`. `loadConfig()` is called once from the entrypoint and throws on any missing var; everything else calls `config()`. Never read env at module top level (it makes every importer demand a full environment) and never add a `||` literal fallback — that is how a Stream app secret ended up committed in source. [.env.example](.env.example) lists the vars; keep it in sync.

The clients use one Stream app for both Feeds and Chat; this key pair is for that app. The `NEW_`-prefixed names are what the code reads — do not rename them back to `feedApiKey`/`feedSecretKey`.

## Architecture

TypeScript, strict, ESM (`"module": "NodeNext"`), so every relative import uses the `.js` extension even though the file is `.ts`.

- [src/index.ts](src/index.ts) — entrypoint: loads config, connects to Mongo (fatal on failure), listens, handles shutdown signals.
- [src/app.ts](src/app.ts) — `createApp()` builds the app without listening or connecting; tests mount it with supertest.
- [src/routes/index.ts](src/routes/index.ts) — the single place routers are mounted, all under `/api/<name>`. Adding a resource: model in `src/models/`, router in `src/routes/`, one import + one `app.use` there.
- `src/domain/` — framework-free errors and types. `src/http/` — handler wrappers, response writers, middlewares. `src/services/` — Stream clients, mail, user projections.

Layering is `routes → models` directly; most business logic lives inline in route handlers.

### What the clients call

The API serves exactly two clients, `SparklerMobile` (Expo) and `sparkler_web` (TanStack Start), both at `https://campus-hub-api-production.up.railway.app/api`. Everything else was removed; before adding or removing a route, grep both clients' `src/lib/api/`.

| Route | Auth | Used by |
| --- | --- | --- |
| `POST /sparklers/quick` | none | both: sign-in after Firebase auth |
| `GET /sparklers`, `GET /sparklers/:id` | none | directory (both), profile (mobile) |
| `PATCH /sparklers` / `PATCH /sparklers/:id` | `auth` | edit profile (mobile / web; `:id` must be the caller) |
| `DELETE /sparklers` | `auth` | delete account (mobile) |
| `GET /schools` | none | mobile |
| `POST /pushTokens`, `/send-to-many`, `/send-to-all` | `auth` | Expo push (register: mobile; send: both) |
| `PATCH /sparklers/verify`, `/sync` | `auth` + `requireAdmin` | ops, by hand |
| `POST /mails/preview`, `/all`, `/:email` | `auth` + `requireAdmin` | ops, by hand: app announcements |

### Errors and handlers

- Wrap every handler in `handler(...)` or, behind `auth`, `authedHandler(...)` from [src/http/handler.ts](src/http/handler.ts). `authedHandler` narrows `req.user` to non-optional.
- Throw an `AppError` subclass from [src/domain/errors.ts](src/domain/errors.ts), or just let an error propagate: Express 5 forwards rejections to [errorHandler](src/http/middlewares/errorHandler.ts), and [toAppError](src/http/toAppError.ts) maps it (CastError → 400, duplicate key → 409, JWT errors → 401, anything else → 500 with the message hidden).
- Error bodies are `{ error: string, code, requestId, details? }`. Clients read `body.error`; keep it a string.
- Log with `req.log` (pino, with a request id), not `console`.
- A promise you deliberately don't await must have a `.catch`: an unhandled rejection is fatal to the process ([src/index.ts](src/index.ts)).

### Auth

- [authenticate](src/http/middlewares/authenticate.ts) exports `auth` (token required) and `politeAuth` (a missing token passes through; a malformed one is still 401). Both read the `x-auth-token` header and set `req.user` to the verified **payload** `{ id, name, image, custom }` — not a DB document. Use `req.user.id`; there is no `_id`.
- [requireAdmin](src/http/middlewares/requireAdmin.ts) goes after `auth`. It re-reads the user and checks `custom.isAdmin`; it never trusts the token's claim.

Clients authenticate with Firebase, then exchange the identity at `POST /api/sparklers/quick`, which finds or creates the Sparkler by email. It and `PATCH /api/sparklers` return the JWT as a **bare, unquoted `text/html` body** *and* in the `x-auth-token` header (use `legacyText` + `withAuthToken` from [src/http/respond.ts](src/http/respond.ts); never `res.json` it). Clients replace their stored token whenever a response carries a new `x-auth-token`.

### The `Sparkler` model is the user model

[src/models/sparkler.ts](src/models/sparkler.ts). App-specific state lives in the `custom` object, typed as `SparklerCustom` in [src/domain/user.types.ts](src/domain/user.types.ts). In Mongo it is an unschema'd `Object`, so Mongoose validates nothing inside it and a `findByIdAndUpdate` with a partial `custom` **replaces** the whole object — update individual keys with dotted paths (`"custom.username"`). `custom` holds the permission flags (`isAdmin`, `verified`), so never write it from a request body: the PATCH routes write only `name`, `image`, `custom.username` and the `PROFILE_STRING_FIELDS` / `isProfilePrivate` whitelist in [src/domain/user.types.ts](src/domain/user.types.ts). Mobile sends its whole stored `custom` back on every edit, so that whitelist is what stops it from setting `isAdmin`.

Reference the user model as `ref: "Sparkler"`.

### Credentials must never reach Stream or a response body

Stream returns a user's `custom` object on **every** user record it embeds — in activities, comments, reactions and member lists — so anything placed there is readable by every other signed-in user. A prior version stored `feedToken` in `custom`, which leaked every account's Stream token to every other account.

The invariant: **`feedToken` is minted per issue, travels only inside its own user's JWT, and is never persisted to Mongo or written to Stream.**

- `toStreamUser(doc)` in [src/services/users.ts](src/services/users.ts) is the single definition of what Stream may see; every `upsertUsers` call goes through it. Its return type `StreamUserCustom` ([src/domain/stream.types.ts](src/domain/stream.types.ts)) maps the credential keys to `never`, so the compiler rejects a `custom` carrying one.
- `toDirectoryUser(doc)` is the equivalent for API responses. The directory is **unauthenticated**, so it carries no `email` and uses the same `never` guard. Never `res.send` a raw Sparkler document.
- `issueAuthToken(doc)` in [src/services/authToken.ts](src/services/authToken.ts) builds every JWT: a whitelisted `custom` (`username`, `verified`, `isAdmin`) plus a `feedToken` from `createFeedToken` in [src/services/stream.ts](src/services/stream.ts). Both clients connect Stream Feeds and Chat with that token.
- Feed tokens are **permanent** (`generatePermanentUserToken`; `generateUserToken` without a validity silently defaults to one hour). The clients cache their JWT and never check `exp`, so an expiring token would break feeds once it lapsed. To kill tokens, run [scripts/revoke-stream-tokens.ts](scripts/revoke-stream-tokens.ts). Add an expiry only once the clients re-authenticate on it.

### Stream integration

One SDK, `@stream-io/node-sdk`, built lazily by `streamClient()` in [src/services/stream.ts](src/services/stream.ts). The server only syncs users, deletes them, and mints tokens; the clients talk to Stream directly for everything else (feeds, chat, moderation flags, and push devices on web). Mongo is the source of truth; Stream is kept in sync by `upsertUsers` after user writes, and a Stream failure is logged rather than failing the request. Admin-only `PATCH /api/sparklers/sync` batch-replays all users into Stream, and `PATCH /api/sparklers/verify` bulk-verifies by email.

### Validation

Routes validate inline and throw `BadRequestError` (or answer 400) with a string `error`. Check that a body value is a string before it goes into a Mongo filter: an object such as `{ "$ne": null }` is read as a query operator (this once let `/quick` sign in as the first user in the database). `zod` is installed and mapped by `toAppError` should a route want schema validation.

### Mail

[src/routes/mails.ts](src/routes/mails.ts) sends admin announcements through Resend. [src/services/mailTemplate.ts](src/services/mailTemplate.ts) renders the branded, table-based, inline-styled HTML plus a plain-text part. `message` is plain text (a blank line starts a paragraph) and is HTML-escaped. `sendBulkMail` gives each recipient their **own** email via Resend's batch API. Never put a list of users in one `to`, which exposes every address to every recipient. Use `POST /mails/preview` to see an email before sending it.

[src/services/accountMail.ts](src/services/accountMail.ts) holds the automatic account emails, all in the same template:
- **Welcome:** sent when `/quick` creates an account.
- **Verified:** sent by `PATCH /verify`, only to users who were not already verified, so re-running a list mails nobody twice.
- **Account deleted:** sent by `DELETE /sparklers`.

They go out through `sendInBackground`, which never awaits or throws, so a Resend outage cannot fail or slow the request. To add an event, add a `...Mail(recipient)` builder there and call `sendInBackground` from the route. The contract baseline mocks `resend` and asserts on its `outbox`.

## Known landmines

- `POST /api/sparklers/quick` trusts the `email` in the body. There is no Firebase ID-token check, so anyone who knows a user's email can sign in as them. The fix is verifying the Firebase ID token server-side (the clients already hold one).
- `POST /api/pushTokens/send-to-all` lets any signed-in user push to every device.
- Announcement mail has no unsubscribe (`List-Unsubscribe`); Gmail and Yahoo require one-click unsubscribe for bulk senders past 5k/day.
- `custom.username` has no unique index (`custom` is unschema'd), so duplicate usernames are possible despite `findUniqueUsername`.
