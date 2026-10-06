import { build } from 'vite';
import react from '@vitejs/plugin-react';

// The development config starts a local backend and probes ports. Production
// builds need neither side effect, so use Vite's Node API with a clean build
// config. This also makes packaging deterministic in restricted environments.
await build({
  root: process.cwd(),
  configFile: false,
  plugins: [react()],
  logLevel: 'info',
});
