import antfu from '@antfu/eslint-config';

const config: ReturnType<typeof antfu> = antfu({
  type: 'lib',
  ignores: [
    'README.md',
    'E2E_TESTING.md',
    '.github/',
    '.claude/',
    '.claude/**',
    'docs/',
    '_site/',
    '_site/**',
    'CLAUDE.md',
  ],
  rules: {
    'style/brace-style': ['error', '1tbs'],
    'unused-imports/no-unused-vars': ['error', {
      vars: 'all',
      varsIgnorePattern: '^_',
      args: 'after-used',
      argsIgnorePattern: '^_',
      // Special exception for catch parameters
      ignoreRestSiblings: true,
      caughtErrors: 'none',
      caughtErrorsIgnorePattern: '^_',
    }],
  },
  stylistic: {
    semi: true,
  },
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },
});

export default config;
