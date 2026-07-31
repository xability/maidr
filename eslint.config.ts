import antfu from '@antfu/eslint-config';

const config: ReturnType<typeof antfu> = antfu({
  type: 'lib',
  ignores: [
    'README.md',
    'E2E_TESTING.md',
    'E2E.md',
    '.github/',
    '.claude/',
    '.claude/**',
    'docs/',
    'CLAUDE.md',
    '_site/',
    '_site/**',
    'dist/',
    'coverage/',
    'node_modules/',
    'playwright-report/',
    'test-results/',
    'examples/',
    'e2e_tests/specs/debug-review.spec.ts',
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
}).append({
  // A key dispatched straight at the keyboard skips BasePage's
  // synchronisation, so its announcement can land during the NEXT action and
  // satisfy that action's wait early — the assertion then reads the region
  // before its own announcement arrives. Layer switches are the usual case.
  //
  // `base-page.ts` is deliberately out of scope: it is where the wrapping
  // lives. Use `pressKey` for a keypress that announces nothing, and
  // `pressKeyAwaitingAnnouncement` for one that does.
  files: ['e2e_tests/page-objects/plots/**/*.ts'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.property.name=\'press\'][callee.object.property.name=\'keyboard\']',
      message: 'Do not press keys directly in a plot page object. Use this.pressKey() for a silent key, or this.pressKeyAwaitingAnnouncement() when MAIDR announces the result.',
    }],
  },
});

export default config;
