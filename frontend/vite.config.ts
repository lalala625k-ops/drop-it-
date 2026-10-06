import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const backendTarget = process.env.PINBOARD_VITE_BACKEND_URL || 'http://127.0.0.1:8002';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
