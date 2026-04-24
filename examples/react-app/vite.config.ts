import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Post-build plugin that strips `type="module"` and `crossorigin` from
 * inlined scripts so the single-file HTML works when opened via the
 * file:// protocol. Uses attribute-level replacement so it handles any
 * attribute order or extra attributes Vite may add in the future.
 */
function stripModuleType() {
  return {
    name: 'strip-module-type',
    closeBundle() {
      const outPath = path.resolve(__dirname, '../react/index.html');
      if (fs.existsSync(outPath)) {
        let html = fs.readFileSync(outPath, 'utf-8');
        html = html.replace(/<script\b[^>]*type="module"[^>]*>/g, (match) =>
          match.replace(/\s*type="module"/, '').replace(/\s*crossorigin/, ''),
        );
        fs.writeFileSync(outPath, html);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    stripModuleType(),
  ],
  root: __dirname,
  base: './',
  build: {
    outDir: '../react',
    emptyOutDir: true,
    // Inline all assets so the output is a single self-contained HTML file
    // that works when opened via file:// with no external dependencies.
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return;
        }
        warn(warning);
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      'maidr/react': path.resolve(__dirname, '../../src/react-entry.ts'),
      '@command': path.resolve(__dirname, '../../src/command'),
      '@model': path.resolve(__dirname, '../../src/model'),
      '@state': path.resolve(__dirname, '../../src/state'),
      '@service': path.resolve(__dirname, '../../src/service'),
      '@type': path.resolve(__dirname, '../../src/type'),
      '@ui': path.resolve(__dirname, '../../src/ui'),
      '@util': path.resolve(__dirname, '../../src/util'),
    },
  },
});
