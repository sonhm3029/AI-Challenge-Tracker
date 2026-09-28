process.env.DATABASE_URL ??= "postgres://tracker:tracker@localhost:5544/challenge_tracker_test";
process.env.ADMIN_AUTH_SECRET ??= "test-secret";
process.env.ADMIN_PASSWORD ??= "test-password";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.PLAYWRIGHT_ENABLED ??= "false";
process.env.LLM_FALLBACK_ENABLED ??= "false";
