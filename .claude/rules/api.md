---
paths:
  - "src/routes/**/*.ts"
  - "src/http/**/*.ts"
  - "src/domain/errors.ts"
  - "src/domain/user.types.ts"
  - "src/models/sparkler.ts"
  - "tests/contract/**/*.ts"
  - "tests/signup.ts"
---

# API and authentication

- Mount routers in `src/routes/index.ts` under `/api`. Before adding or removing an endpoint, check the `SparklerMobile` and `sparkler_web` clients' `src/lib/api/` callsites.
- Wrap handlers with `handler(...)` or, behind `auth`, `authedHandler(...)` from `src/http/handler.ts`. Throw an `AppError` subclass or let errors propagate through Express 5. Keep error bodies as `{ error: string, code, requestId, details? }` and log through `req.log`.
- Validate request values before using them in Mongo filters; require strings where strings are expected. An object such as `{ "$ne": null }` can become a Mongo query operator.
- `auth` and `politeAuth` read `x-auth-token` and set `req.user` to the verified JWT payload; use `req.user.id`, not `_id`. Put `requireAdmin` after `auth`; it must verify admin status from the database, not trust a token claim.
- Quick sign-in must verify the Firebase ID token with Identity Toolkit and use only the verified, verified-email identity for account lookup. Never trust the request body's `email`. Invalid credentials are 401; verification-service outages remain upstream failures. Do not create or sign in to an account unless verification succeeds.
- `FIREBASE_API_KEY` must match the clients' Firebase project, be configured in each server environment, and be restricted to Identity Toolkit in Google Cloud.
- Profile updates must whitelist writable fields; never accept `custom` or permission flags from the request. Since `custom` is an unschematized Mongo object, update individual keys with dotted paths such as `"custom.username"`.
- `custom.studentStatus` (`student` or `alumni`) and `custom.graduationYear` (a four-digit string, optional) are separate from `custom.year`, which installed clients parse as a number and would erase if it held anything else. Both are validated in the route, since `pickProfile` keeps any string.
- `GET /api/places/search?q=` proxies place search behind `PlaceSearchProvider` (Photon today, no key), so swapping providers needs no client release. A provider outage is a 200 with `available: false`, since the clients still accept a typed place.
- `/api/issues` holds user reports for the IT team's future app. `reportedBy` always comes from the token. Reporters get `toReporterView`, which drops internal notes, handler and priority; staff routes go through `requireIssueStaff`, the one place to admit an IT role. Every staff change writes a timeline entry. Account deletion scrubs the reporter's name and keeps the issue. Until that app exists, new issues email admins.
- Points live in `domain/points.ts`, the one table of values and daily caps. `POST /api/points/claims` awards them only after a verifier in `pointVerifiers.ts` confirms the action with Stream; anything unverifiable earns nothing. `PointEvent` is the private ledger, whose unique index on user, action and target means each thing earns once, and undoing an action never takes points back. `Sparkler.points` sits outside `custom`, so a profile edit can't write it. Anonymous posts earn nothing, since a public total rising right after one could point at its author.
- Profile location is a whitelisted `{ name, coords?, precision? }` value. Validate coordinate ranges, return it from the public directory, and keep legacy string locations readable.
- Quick sign-in and profile `PATCH` return the app JWT as a bare `text/html` body and in `x-auth-token`; use `legacyText` and `withAuthToken`, not `res.json`. Preserve token refresh behavior and the contract tests when changing token issuance or response format.
- The app JWT currently has no expiry; clients reuse it across launches. Do not introduce an expiry until clients can re-authenticate when it lapses.
- `POST /api/pushTokens/send-to-all` is admin-only. Stream sends most pushes itself (`scripts/configure-stream-push.ts`), so check Stream before adding a push route. Clients announce a sparkle through `POST /api/pushTokens/sparkle`, which reads the text and audience from Stream, not the request.
- Every push passes `reachableRecipients` (`src/services/pushAudience.ts`), which drops anyone blocked either way or muting the sender (Stream Chat `muteUser`), and sends to nobody if Stream can't answer. It also drops anyone who turned that kind of push off (`PushPreference`), because `queryUsers` doesn't return Stream's own push preferences. Do not add a send path that skips it.
- `PushToken` has one row per device: unique on `pushToken`, not on `userId`. `scripts/migrate-push-tokens.ts` moves an existing database over.
