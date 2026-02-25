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
      entry: path.resolve(__dirname, 'src/integrations/google-charts/index.ts'),
      formats: ['es'],
      fileName: () => 'google-charts.mjs',
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
      '@type': path.resolve(__dirname, 'src/type'),
    },
  },
});
