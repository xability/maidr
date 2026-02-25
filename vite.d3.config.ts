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
      entry: path.resolve(__dirname, 'src/d3/index.ts'),
      name: 'maidrD3',
      formats: ['es', 'umd'],
      fileName: format => format === 'es' ? 'd3.mjs' : 'd3.js',
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
});
