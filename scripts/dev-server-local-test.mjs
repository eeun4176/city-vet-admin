process.env.LOCAL_TEST_MODE = '1';
process.env.LOCAL_TEST_DB_PORT = '5433';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5433/postgres';
process.env.JWT_SECRET = 'local-test-only-secret-not-for-deployment';
process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5175';
await import('./dev-server.ts');
