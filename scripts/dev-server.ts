/* Local API server for development. `npm run dev:api` serves /api on :3000 using .env.local;
   `npm run dev` serves the React app on :5173 and forwards /api here. */
import http from 'node:http';
import { dispatchApi } from '../server/api-dispatch';
import { closeDb } from '../server/db';

if (process.env.LOCAL_TEST_MODE !== '1') {
  try {
    process.loadEnvFile('.env.local');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

const port = Number(process.env.PORT ?? 3000);

const server = http.createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/')) {
    void dispatchApi(req, res).catch((error: unknown) => {
      console.error('Local API request failed:', error);
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"error":{"code":"INTERNAL_ERROR","message":"The request could not be completed."}}');
    });
    return;
  }
  res.statusCode = 404;
  res.end('Not found');
});

server.on('error', (error) => {
  console.error('Local API server failed:', error);
  process.exitCode = 1;
});

server.listen(port, () => console.log(`e-Kapon API: http://127.0.0.1:${port}/api/v1/health`));

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close((error) => {
    if (error) {
      console.error('Could not close the local API server cleanly:', error);
      process.exitCode = 1;
    }
    void closeDb().catch((closeError: unknown) => {
      console.error('Could not close the local database connection cleanly:', closeError);
      process.exitCode = 1;
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
