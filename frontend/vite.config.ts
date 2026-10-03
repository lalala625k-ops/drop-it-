import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
const backendPort = 8002;

function backendAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: backendPort });
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export default defineConfig({
  plugins: [react(), {
    name: 'start-local-backend',
    configureServer(server) {
      void backendAvailable().then((available) => {
        if (available) return;
        const backend = spawn('python', ['-m', 'uvicorn', 'backend.main:app',
          '--host', '127.0.0.1', '--port', String(backendPort)], {
          cwd: backendDirectory, windowsHide: true, stdio: 'ignore',
        });
        backend.once('error', (error) => server.config.logger.warn(`后端启动失败：${error.message}`));
        backend.once('exit', (code) => {
          if (code) server.config.logger.warn(`后端已退出（代码 ${code}）`);
        });
        server.httpServer?.once('close', () => backend.kill());
      });
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
