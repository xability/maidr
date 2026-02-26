import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Post-build plugin that strips `type="module"` from inlined scripts
 * so the single-file HTML works when opened via the file:// protocol.
 */
function stripModuleType() {
  return {
    name: 'strip-module-type',
    closeBundle() {
      const outPath = path.resolve(__dirname, '../react/index.html');
      if (fs.existsSync(outPath)) {
        let html = fs.readFileSync(outPath, 'utf-8');
        html = html.replace(/<script type="module" crossorigin>/g, '<script>');
        fs.writeFileSync(outPath, html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), stripModuleType()],
  root: __dirname,
  base: './',
  build: {
    outDir: '../react',
    emptyOutDir: true,
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
    'process.env': {},
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
