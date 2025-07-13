import type { PlaywrightTestConfig } from '@playwright/test';
import path from 'node:path';

/**
 * Get the project root directory path
 * @returns Absolute path to the project root
 */
function getProjectRoot(): string {
  // This path should point to the root of maidr-ts project
  // where the examples directory is located
  // __dirname will be the root folder now
  return __dirname;
}

/**
 * Configuration for Playwright tests
 * Includes settings for test execution, browser configuration, and reporting
 */
const config: PlaywrightTestConfig = {
  // Set the test directory to match your project structure
  testDir: path.join(__dirname, 'test/e2e/specs'),

  // Test file pattern - include both spec.ts patterns
  testMatch: '**/*.spec.ts',

  // Set timeout values
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

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
      use: { browserName: 'chromium' },
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
