import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const database = new PGlite('./.local-test-db', { extensions: { pgcrypto } });
await database.waitReady;
const server = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 5433, maxConnections: 4 });
await server.start();
console.log('Local Module C database listening on 127.0.0.1:5433');

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.stop();
    await database.close();
  } catch (error) {
    console.error('Could not stop the local test database cleanly:', error);
    process.exitCode = 1;
  }
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
