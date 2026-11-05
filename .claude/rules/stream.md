---
paths:
  - "src/services/stream.ts"
  - "src/services/users.ts"
  - "src/services/authToken.ts"
  - "src/domain/stream.types.ts"
  - "scripts/revoke-stream-tokens.ts"
---

# Stream integration and credentials

- `@stream-io/node-sdk` is created lazily by `streamClient()` in `src/services/stream.ts`. Mongo is the source of truth; Stream sync failures are logged and must not fail the user request.
- `toStreamUser()` is the sole definition of user data sent to Stream. Stream embeds each user's `custom` data in activities, comments, reactions, and member lists, so never put credentials or other private data there.
- `feedToken` is minted per issue and may appear only as a claim in its owner's app JWT. Never persist it to Mongo, write it to Stream, or expose it as a standalone response field. Use `toDirectoryUser()` for unauthenticated directory responses; never return a raw Sparkler document.
- `issueAuthToken()` is the single JWT builder and must whitelist claims. Both clients use the token for Stream Feeds and Chat.
- Feed tokens are permanent because clients cache their JWT and do not check `exp`. Do not make them expire until clients re-authenticate on expiry. Use `scripts/revoke-stream-tokens.ts` to revoke existing tokens.
- A follower's id is `follow.source_feed.id`, because `timeline:<id>` follows `user:<id>`. `blocked_user_ids` from `queryUsers` holds who that user blocked; checked against `getBlockedUsers` on the real app.
