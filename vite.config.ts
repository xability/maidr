import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const config: ReturnType<typeof defineConfig> = defineConfig(({ mode, command }) => {
  const isProd = mode === 'production';
  // Use 'examples' as root in dev for HMR with example HTML files
  return {
    plugins: [react()],
    root: command === 'serve' ? 'examples' : '.',
    resolve: {
      alias: {
        '@command': resolve(__dirname, 'src/command'),
        '@model': resolve(__dirname, 'src/model'),
        '@state': resolve(__dirname, 'src/state'),
        '@service': resolve(__dirname, 'src/service'),
        '@type': resolve(__dirname, 'src/type'),
        '@ui': resolve(__dirname, 'src/ui'),
        '@util': resolve(__dirname, 'src/util'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: !isProd, // Source maps in dev only
      minify: isProd,
      rollupOptions: {
        input: [
          resolve(__dirname, 'src/index.ts'),
        ],
        output: {
          entryFileNames: 'maidr.js',
          chunkFileNames: 'maidr.[name].js',
          assetFileNames: 'maidr.[name][extname]',
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      open: '/index.html',
    },
  };
});

export default config;
