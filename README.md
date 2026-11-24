# Sparkler API

The backend for [Sparkler](https://www.sparkler.co.ke), the campus feed for students. It serves the mobile app, the web app and the team's error dashboard.

**Sparkler's mission, team, store links, and every screen on mobile and web are in the [mobile app's README](https://github.com/augustine-awuori/sparkler_mobile#readme).**

## What it does, and what it doesn't

Posts, timelines, likes, follows and messages live in [Stream](https://getstream.io), and the apps talk to Stream directly. Sign-in and media live in Firebase. This API holds everything else:

- the account record behind each person, and the JWT the apps use with this API
- the student directory, schools, and the verified-student mark
- push notifications through Expo, and email through Resend
- points, moderation, support reports, and error events from both apps

## The Sparkler repos

| Repo | What it is |
| --- | --- |
| [`sparkler_mobile`](https://github.com/augustine-awuori/sparkler_mobile) | The Android and iOS app (Expo) |
| [`sparkler-web-v3`](https://github.com/augustine-awuori/sparkler-web-v3) | The web app |
| [`sparkler-api`](https://github.com/augustine-awuori/sparkler-api) (this one) | The backend |
| [`sparkler-errors`](https://github.com/augustine-awuori/sparkler-errors) | The team's error and report dashboard, which reads `/api/errors` and `/api/issues` |

## Routes

Everything is under `/api`. [`src/routes/index.ts`](src/routes/index.ts) mounts each group.

| Path | What it's for | Used by |
| --- | --- | --- |
| `/api/sparklers` | Signing in with a Firebase ID token, the student directory, profile updates, verified and admin badges, and deleting an account | Both apps, dashboard |
| `/api/schools` | The list of schools to pick from | Both apps |
| `/api/studentVerification` | The verified-student mark, by university email | Both apps |
| `/api/points` | The points rules, your points, and claiming them | Both apps |
| `/api/pushTokens` | Device push tokens, notification preferences, and sending pushes | Both apps |
| `/api/places` | Place search for a sparkle's location | Both apps |
| `/api/moderation` | The review queue of reported sparkles and replies, and admins' decisions | Both apps (admins) |
| `/api/issues` | Reports from Help & support, their status and notes | Both apps, dashboard |
| `/api/errors` | Error events from both apps, and the groups, stats and developer accounts the dashboard shows | Both apps, dashboard |
| `/api/mails` | Announcements to everyone by email, admins only | Admins |
| `/api/communities`, `/api/events` | Not used by either app since Communities and Events were removed in November 2026 | None |

Installed mobile builds lag behind, so a change to a request or response must stay backward-compatible until both apps have shipped the matching change. [`tests/contract/baseline.test.ts`](tests/contract/baseline.test.ts) records what clients see. Update it only when you mean to change the contract.

## Built with

Express 5, MongoDB through Mongoose, TypeScript (ESM), Zod, Pino, the Stream Node SDK, `expo-server-sdk` and Resend. It's tested with Vitest, Supertest and an in-memory MongoDB.

## Getting started

You need [Node.js](https://nodejs.org) LTS and npm.

```sh
git clone https://github.com/augustine-awuori/sparkler-api.git
cd sparkler-api
npm install
cp .env.example .env    # then fill it in
npm run dev             # http://localhost:3000
```

[`.env.example`](.env.example) explains each value: the MongoDB connection string, the JWT signing key, the Firebase web API key, the Stream credentials, the Resend key, and the errors dashboard's address. Every environment, development included, connects to the MongoDB that `db` names. Point it at a database you're allowed to write to.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the server with `.env`, restarting on changes |
| `npm run build` | Clears `dist/` and compiles |
| `npm start` | Runs the compiled server |
| `npm test` | Contract and unit tests. They use an in-memory MongoDB and mocked Stream credentials, so they make no outside calls. |
| `npm run typecheck` | Type-checks `src/`, `tests/` and `scripts/` |
| `npm run test:signup` | Builds, then tests sign-up against the compiled server. It catches module-loading problems that the unit tests miss. |

One-off maintenance scripts, such as migrations and Stream setup, are in [`scripts/`](scripts/).

## Deploying

Production runs on Railway at `https://campus-hub-api-production.up.railway.app/api`. Set the values from `.env.example` in Railway's environment variables. When a change touches the API and a client, deploy the API first.

## Working on it

- `src/config/index.ts` is the only file that reads `process.env`. Other modules call `config()`.
- Relative imports end in `.js`, because the project is ESM with `NodeNext` resolution.
- Shared integrations, such as Stream, mail and push, live in `src/services/`.

The full guide for contributors and coding agents is [CLAUDE.md](CLAUDE.md). Rules for auth, Stream and mail code are in [`.claude/rules/`](.claude/rules/).
