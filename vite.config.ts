import { defineConfig } from 'vite';

export default defineConfig({
  base: '/TRAFFIC-PUZZLE/',
  server: { host: '0.0.0.0' },
  build: { target: 'es2022' }
});
