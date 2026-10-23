import { spawn } from 'node:child_process';
import net from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyLocalSchema } from './local-schema.mjs';

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

const database = new PGlite({ extensions: { pgcrypto } });
let socketServer;
let testProcess;
let exitCode = 1;
try {
  await database.waitReady;
  await applyLocalSchema(database);
  const port = await availablePort();
  socketServer = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port, maxConnections: 4 });
  await socketServer.start();
  const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOCAL_TEST_MODE: '1',
    JWT_SECRET: 'local-test-only-secret-not-for-deployment',
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
  };
  testProcess = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { env, stdio: 'inherit' });
  const result = await new Promise((resolve, reject) => {
    testProcess.once('error', reject);
    testProcess.once('exit', (code, signal) => resolve({ code, signal }));
  });
  exitCode = result.code ?? 1;
  if (result.signal) console.error(`Vitest exited after ${result.signal}.`);
} catch (error) {
  console.error('Local test setup failed:', error instanceof Error ? error.message : error);
} finally {
  if (socketServer) await socketServer.stop();
  await database.close();
}
process.exitCode = exitCode;
