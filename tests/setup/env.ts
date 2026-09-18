// Deliberately fake Stream credentials: every upsert fails, which both keeps
// the suite from touching the real Stream app and continuously asserts that a
// Stream outage cannot fail a sign-in.
process.env.NEW_FEED_API_KEY ??= "test_key";
process.env.NEW_CHAT_API_SECRET ??= "test_secret_value_for_local_testing_only";
process.env.chatApiKey ??= "test_key";
process.env.chatApiSecret ??= "test_secret_value_for_local_testing_only";
process.env.RESEND_API_KEY ??= "re_test_key";
process.env.POE_API_KEY ??= "test_poe_key";
process.env.jwtPrivateKey ??= "test-only-secret-not-used-in-production-0123456789";
process.env.PORT ??= "0";
process.env.LOG_LEVEL ??= "silent";
