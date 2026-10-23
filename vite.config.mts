import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The regular app uses :5173; the local test copy uses :5175 and its local API on :3000.
export default defineConfig(({ mode }) => {
  const localTest = mode === 'local-test';
  const apiPort = Number(process.env.VITE_API_PROXY_PORT ?? 3000);
  return {
    plugins: [react()],
    server: { port: localTest ? 5175 : 5173, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
    build: { outDir: 'dist', sourcemap: false },
  };
});
