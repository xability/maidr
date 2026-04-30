/**
 * Programmatic build runner for MAIDR library.
 *
 * Consolidates all Vite build configurations into a single file.
 * Builds run sequentially due to vite-plugin-dts limitations.
 *
 * Usage: node scripts/build.js
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Common path aliases
const baseAliases = {
  '@command': path.resolve(rootDir, 'src/command'),
  '@model': path.resolve(rootDir, 'src/model'),
  '@state': path.resolve(rootDir, 'src/state'),
  '@service': path.resolve(rootDir, 'src/service'),
  '@type': path.resolve(rootDir, 'src/type'),
  '@ui': path.resolve(rootDir, 'src/ui'),
  '@util': path.resolve(rootDir, 'src/util'),
};

const adapterAliases = {
  ...baseAliases,
  '@adapters': path.resolve(rootDir, 'src/adapters'),
};

function onWarn(warning, warn) {
  if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') {
    return;
  }
  warn(warning);
}

/**
 * Build configurations
 */
const builds = [
  {
    name: 'core',
    entry: 'src/index.tsx',
    libName: 'maidr',
    formats: ['es', 'umd'],
    fileName: () => 'maidr.js',
    emptyOutDir: true,
    external: [],
    useReact: true,
    useDts: false,
    aliases: baseAliases,
  },
  {
    name: 'react',
    entry: 'src/react-entry.ts',
    formats: ['es'],
    fileName: () => 'react.mjs',
    emptyOutDir: false,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    useReact: true,
    useDts: true,
    aliases: baseAliases,
  },
  {
    name: 'recharts',
    entry: 'src/recharts-entry.ts',
    formats: ['es'],
    fileName: () => 'recharts.mjs',
    emptyOutDir: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'recharts'],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'google-charts',
    entry: 'src/google-charts-entry.ts',
    libName: 'maidrGoogleCharts',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'google-charts.mjs' : 'google-charts.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'd3',
    entry: 'src/adapters/d3/index.ts',
    libName: 'maidrD3',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'd3.mjs' : 'd3.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'vegalite',
    entry: 'src/vegalite-entry.ts',
    libName: 'maidrVegaLite',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'vegalite.mjs' : 'vegalite.js',
    emptyOutDir: false,
    external: [],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
];

function createViteConfig(config) {
  const plugins = [];
  if (config.useReact)
    plugins.push(react());
  if (config.useDts) {
    plugins.push(dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
      insertTypesEntry: false,
    }));
  }

  return {
    configFile: false,
    root: rootDir,
    plugins,
    build: {
      lib: {
        entry: path.resolve(rootDir, config.entry),
        name: config.libName,
        formats: config.formats,
        fileName: config.fileName,
      },
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir: config.emptyOutDir,
      rollupOptions: { external: config.external, onwarn: onWarn },
    },
    define: { 'process.env': {} },
    resolve: { alias: config.aliases },
  };
}

async function main() {
  const startTime = Date.now();
  console.log('Building MAIDR library...\n');

  for (let i = 0; i < builds.length; i++) {
    const config = builds[i];
    const step = `[${i + 1}/${builds.length}]`;
    console.log(`${step} Building ${config.name}...`);

    const t = Date.now();
    await build(createViteConfig(config));
    console.log(`${step} Done (${((Date.now() - t) / 1000).toFixed(1)}s)\n`);
  }

  console.log(`All builds complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
