import eslint from '@eslint/js';
import importSortPlugin from 'eslint-plugin-simple-import-sort';
import tsEslint from 'typescript-eslint';

const config: ReturnType<typeof tsEslint.config> = tsEslint.config(
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  {
    plugins: {
      "simple-import-sort": importSortPlugin,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
);

export default config;
