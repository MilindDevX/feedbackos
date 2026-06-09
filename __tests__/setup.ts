// Stub env vars required by modules imported during tests
process.env.DATABASE_URL = 'postgresql://localhost:5432/feedbackos_test?schema=public'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.OPENROUTER_API_KEY = 'sk-test-key'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NEXTAUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long!'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
// NODE_ENV is managed by Jest automatically; do not assign here
