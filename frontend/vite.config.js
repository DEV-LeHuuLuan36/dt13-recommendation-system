import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env tu frontend/.env[.local]
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number.parseInt(env.VITE_DEV_PORT, 10) || 5173;
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // Giu nguyen cookie phien thuc.
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});