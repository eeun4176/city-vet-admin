import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const ports = { database: 5433, api: 3000, vite: 5175 };
const children = [];
let stopping = false;
let shutdownPromise;

function isListening(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function assertPortsAvailable() {
  for (const [name, port] of Object.entries(ports)) {
    if (await isListening(port)) {
      throw new Error(`The local ${name} port ${port} is already in use. Stop its existing process before running dev:test.`);
    }
  }
}

function startChild(name, args, env = process.env) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  children.push({ name, child });
  child.once('error', (error) => {
    console.error(`${name} could not be started:`, error);
    void stopChildren(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped unexpectedly (${signal ?? `exit ${code}`}).`);
      void stopChildren(code && code !== 0 ? code : 1);
    }
  });
  return child;
}

async function waitForPort(name, port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} exited before port ${port} became available.`);
    }
    if (await isListening(port)) return;
    await delay(100);
  }
  throw new Error(`${name} did not start listening on port ${port} within 30 seconds.`);
}

function stopChildren(exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  shutdownPromise = (async () => {
    for (const { child } of [...children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          resolve();
        }, 5_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    process.exitCode = exitCode;
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void stopChildren(130));
process.once('SIGTERM', () => void stopChildren(143));

try {
  await assertPortsAvailable();
  console.log('Preparing the isolated local test database...');
  const setup = spawn(process.execPath, ['scripts/prepare-local-db.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  const setupExit = await new Promise((resolve, reject) => {
    setup.once('error', reject);
    setup.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (setupExit.code !== 0) {
    throw new Error(`Local database preparation failed (${setupExit.signal ?? `exit ${setupExit.code}`}).`);
  }

  const database = startChild('Local test database', ['scripts/local-db-server.mjs']);
  await waitForPort('Local test database', ports.database, database);

  const apiEnv = {
    ...process.env,
    LOCAL_TEST_MODE: '1',
    LOCAL_TEST_DB_PORT: String(ports.database),
    PORT: String(ports.api),
    NODE_ENV: 'test',
  };
  const api = startChild('Local test API', ['--import', 'tsx', 'scripts/dev-server-local-test.mjs'], apiEnv);
  await waitForPort('Local test API', ports.api, api);

  const viteEnv = { ...process.env, VITE_API_PROXY_PORT: String(ports.api), NODE_ENV: 'development' };
  delete viteEnv.DATABASE_URL;
  delete viteEnv.JWT_SECRET;
  delete viteEnv.TEST_DATABASE_URL;
  const vite = startChild('Vite local test UI', ['node_modules/vite/bin/vite.js', '--mode', 'local-test', '--host', '127.0.0.1'], viteEnv);
  await waitForPort('Vite local test UI', ports.vite, vite);
  console.log(`Local test stack ready: http://127.0.0.1:${ports.vite}/`);
  console.log('API: http://127.0.0.1:3000/api/v1/health · Database: 127.0.0.1:5433');
  await new Promise(() => {});
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stopChildren(1);
}
