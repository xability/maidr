/**
 * Playwright configuration for E2E testing
 *
 * Configures test execution, browser settings, and reporting options
 * Uses file protocol to access local files without a separate server
 */
import type { PlaywrightTestConfig } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// The package is ESM ("type": "module"), so CommonJS `__dirname` does not
// exist here; derive it from the module URL instead.
const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the project root directory path
 * @returns Absolute path to the project root
 */
function getProjectRoot(): string {
  // This path should point to the root of maidr-ts project
  // where the examples directory is located
  const rootPath = path.resolve(configDir, '../..');

  return rootPath;
}

/**
 * Configuration for Playwright tests
 * Includes settings for test execution, browser configuration, and reporting
 */
const config: PlaywrightTestConfig = {
  // Set the test directory to match your project structure
  testDir: path.join(configDir, '..', 'specs'),

  // Test file pattern - include both spec.ts patterns
  testMatch: '**/*.spec.ts',

  // Set timeout values
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  // The page objects read MAIDR's live regions immediately after dispatching a
  // key. Under parallel load WebKit — the slowest of the three — occasionally
  // reads before the announcement lands, and a different test flakes each run.
  // Retries absorb that without hiding it: Playwright still marks a test that
  // needed one as "flaky" in the report. A test that fails every attempt is a
  // real failure and still fails the run.
  //
  // This is a mitigation, not the cure. The cure is for those getters to wait
  // for the region to update rather than snapshotting it once — see
  // `isModeActive` in base-page.ts for the shape that fix takes.
  retries: process.env.CI ? 2 : 0,

  // Test reporters
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Use file protocol with absolute path to project root
    baseURL: `file://${getProjectRoot()}/`,

    // Browser settings
    viewport: null,

    // Capture traces and screenshots on failure
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Configure browsers to test in
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: {
      // adding a 50 ms slowMo to combat chromium latency unable to keep up with playwright's speed of execution
        slowMo: 50,
      } },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
};

export default config;
