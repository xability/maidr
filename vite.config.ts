import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mathStylesheet } from './scripts/vite-plugin-math-stylesheet.js';
import { woff2OnlyFonts } from './scripts/vite-plugin-woff2-only.js';

export default defineConfig({
  // These two must stay in step with scripts/build.js, which is what
  // `npm run build` runs — otherwise a build driven from this config emits a
  // maidr.css and maidr-math.css that differ from the published ones.
  plugins: [react(), woff2OnlyFonts(), mathStylesheet()],
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
    // See the note in scripts/build.js: the .map is still written, but without
    // a `sourceMappingURL` comment devtools will not load it on its own — it is
    // there for tooling pointed at it deliberately. The comment has to go
    // because package.json no longer publishes the maps, and a bundle naming a
    // map it does not ship resolves to a 404 for every CDN consumer.
    sourcemap: 'hidden',
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
    // Spelled out as a whole member expression because rolldown, which vite 8
    // bundles instead of rollup, substitutes a `define` key only on an exact
    // match. Left to the `process.env` prefix alone it survives into the output
    // and throws "process is not defined" on load.
    //
    // `production` is the flag React reads to pick its build, and these values
    // are kept identical to the ones in `createViteConfig` in scripts/build.js.
    // That function is what actually builds the published bundles -- it passes
    // `configFile: false`, so this file is not merged into them, and no npm
    // script invokes vite without naming its own config either. Keeping the two
    // in step is therefore about not leaving a trap for whoever first points a
    // build at this file, not about the bundles on disk today.
    'process.env.NODE_ENV': JSON.stringify('production'),
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
