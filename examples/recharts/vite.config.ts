import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.resolve(__dirname, '../..');

export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@adapters': path.resolve(root, 'src/adapters'),
      '@command': path.resolve(root, 'src/command'),
      '@model': path.resolve(root, 'src/model'),
      '@state': path.resolve(root, 'src/state'),
      '@service': path.resolve(root, 'src/service'),
      '@type': path.resolve(root, 'src/type'),
      '@ui': path.resolve(root, 'src/ui'),
      '@util': path.resolve(root, 'src/util'),
    },
  },
  define: {
    'process.env': {},
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3300,
    open: true,
  },
});
