/**
 * Root Playwright config.
 *
 * Holds no settings of its own — it re-exports `e2e_tests/config/test-config.ts`,
 * which is the single source of truth and the one the npm scripts pass with
 * `--config`. Edit that file, not this one.
 *
 * This exists so the paths that look for a config at the repository root find
 * the same one: a bare `npx playwright test`, and editor integrations such as
 * the Playwright VS Code extension. Without it those collect nothing, silently.
 *
 * The file this replaces was a full second copy of the settings, which is how
 * it came to point at a `testDir` that never existed and to set `trace: 'on'`
 * against the suite's `retain-on-failure` (see #687). A re-export cannot drift
 * that way, because there is nothing here to drift.
 */
export { default } from './e2e_tests/config/test-config';
