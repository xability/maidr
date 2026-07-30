import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { woff2OnlyFonts } from './scripts/vite-plugin-woff2-only.js';

export default defineConfig({
  // woff2OnlyFonts must stay in step with scripts/build.js, which is what
  // `npm run build` runs — otherwise a build driven from this config emits a
  // maidr.css that differs from the published one.
  plugins: [react(), woff2OnlyFonts()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'maidr',
      // UMD only: src/index.tsx is a pure side-effect entry with no exports, so
      // an ES build has no consumer value. Adding 'es' back here would also make
      // both formats resolve to the same fileName and silently overwrite.
      formats: ['umd'],
      fileName: () => `maidr.js`,
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') {
          return;
        }
        warn(warning);
      },
    },
  },
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@adapters': path.resolve(__dirname, 'src/adapters'),
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
