import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
      insertTypesEntry: false,
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/google-charts-entry.ts'),
      name: 'maidrGoogleCharts',
      formats: ['es', 'umd'],
      fileName: format => format === 'es' ? 'google-charts.mjs' : 'google-charts.js',
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
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
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@type': path.resolve(__dirname, 'src/type'),
    },
  },
});
