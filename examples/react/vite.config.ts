import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  resolve: {
    alias: {
      '@command': path.resolve(__dirname, '../../src/command'),
      '@model': path.resolve(__dirname, '../../src/model'),
      '@state': path.resolve(__dirname, '../../src/state'),
      '@service': path.resolve(__dirname, '../../src/service'),
      '@type': path.resolve(__dirname, '../../src/type'),
      '@ui': path.resolve(__dirname, '../../src/ui'),
      '@util': path.resolve(__dirname, '../../src/util'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
