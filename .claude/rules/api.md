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
- Quick sign-in and profile `PATCH` return the app JWT as a bare `text/html` body and in `x-auth-token`; use `legacyText` and `withAuthToken`, not `res.json`. Preserve token refresh behavior and the contract tests when changing token issuance or response format.
- The app JWT currently has no expiry; clients reuse it across launches. Do not introduce an expiry until clients can re-authenticate when it lapses.
- `POST /api/pushTokens/send-to-all` currently allows any signed-in user to push to every device. Account for this existing authorization behavior when changing the endpoint.
