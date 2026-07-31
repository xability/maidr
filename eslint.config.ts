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
  // Use `pressKey` for a keypress that announces nothing, and
  // `pressKeyAwaitingAnnouncement` for one that does.
  //
  // `base-page.ts` is in scope too, with a single inline disable on the one
  // sanctioned call site inside `pressKey`. Excluding the whole file would
  // leave the invariant resting on discipline exactly where a new helper is
  // most likely to be added; an explicit exception at the one line that is
  // allowed to press a key says the same thing and stays enforceable.
  files: ['e2e_tests/page-objects/**/*.ts'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.property.name=\'press\'][callee.object.property.name=\'keyboard\']',
      message: 'Do not press keys directly in a page object. Use this.pressKey() for a silent key, or this.pressKeyAwaitingAnnouncement() when MAIDR announces the result.',
    }],
  },
}, {
  // The same bypass one level up. `pressKeyCombination` routes through
  // `pressKey`, so the mark is cleared and nothing goes unwrapped — but it
  // does not *wait*, and a modified data-point move announces. `moveToTop` in
  // boxplotVertical-page.ts was the live case.
  //
  // Scoped to `plots/**` rather than all of `page-objects/**`: base-page's own
  // direct callers are the menu and dialog openers, which are asserted on
  // visibility rather than on an announcement, and `moveToDataPoint` is where
  // the wrapped combination lives.
  // Both selectors are repeated here on purpose: flat config replaces a rule's
  // options rather than merging them, so listing only the new one would switch
  // the keypress ban off for exactly the directory it was written for.
  files: ['e2e_tests/page-objects/plots/**/*.ts'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.property.name=\'press\'][callee.object.property.name=\'keyboard\']',
      message: 'Do not press keys directly in a page object. Use this.pressKey() for a silent key, or this.pressKeyAwaitingAnnouncement() when MAIDR announces the result.',
    }, {
      selector: 'CallExpression[callee.property.name=\'pressKeyCombination\']',
      message: 'Do not call pressKeyCombination() from a plot page object: it presses the key but does not wait for the announcement. Use this.moveToDataPoint(key, action, true) for a modified move.',
    }],
  },
});

export default config;
