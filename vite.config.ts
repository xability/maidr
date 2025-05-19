import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'maidr',
      formats: ['es'],
      fileName: () => `maidr.js`,
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@command': path.resolve(__dirname, 'src/command'),
      '@model': path.resolve(__dirname, 'src/model'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@service': path.resolve(__dirname, 'src/service'),
      '@type': path.resolve(__dirname, 'src/type'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@util': path.resolve(__dirname, 'src/util'),
    },
  },
});