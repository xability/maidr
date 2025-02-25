import { defineConfig } from 'cypress';

const config: ReturnType<typeof defineConfig> = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
  },
});

export default config;
