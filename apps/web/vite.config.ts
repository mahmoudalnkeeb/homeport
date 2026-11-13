import { resolve } from 'node:path';

import preact from '@preact/preset-vite';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';

const repoRoot = resolve(import.meta.dirname, '..', '..');

export default defineConfig(({ mode }) => {
  const { PORT = '3000' } = loadEnv(mode, repoRoot, '');
  return {
    plugins: [preact()],
    resolve: { conditions: ['source', ...defaultClientConditions] },
    server: {
      port: 5173,
      proxy: { '/api': `http://127.0.0.1:${PORT}` },
    },
    build: {
      chunkSizeWarningLimit: 1600,
    },
  };
});
