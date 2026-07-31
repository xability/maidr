import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guards the root Playwright config against gaining settings of its own.
 *
 * The root config used to be a full second copy of the settings, and drifted:
 * it pointed `testDir` at a path that never existed and set `trace: 'on'`
 * against the suite's `retain-on-failure`. Nothing caught it for months,
 * because every caller passed `--config` explicitly and so never loaded it
 * (see #687). It is now a re-export, which cannot drift — this keeps it one.
 *
 * Asserted on the file's text rather than by importing both configs and
 * comparing them, which would be the stronger check. That is not available
 * here: `test-config.ts` reads `import.meta.url`, and ts-jest transpiles to
 * CommonJS, where `import.meta` is a syntax error. The regression this needs
 * to catch is someone replacing the re-export with settings, and that is
 * visible in the text.
 */

const ROOT = resolve(__dirname, '../..');
const REAL_CONFIG = 'e2e_tests/config/test-config';

/** The root config's source, comments and all. */
function rootConfigSource(): string {
  return readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8');
}

/** The source with block and line comments removed. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the root playwright config', () => {
  it('should re-export the real config', () => {
    expect(withoutComments(rootConfigSource())).toMatch(
      new RegExp(`export\\s*\\{\\s*default\\s*\\}\\s*from\\s*['"]\\./${REAL_CONFIG}['"]`),
    );
  });

  // Each of these is a setting the deleted copy carried. Naming them
  // individually means a failure says which one came back.
  it.each(['testDir', 'testMatch', 'projects', 'timeout', 'reporter', 'use'])(
    'should not declare its own %s',
    (setting) => {
      expect(withoutComments(rootConfigSource())).not.toMatch(
        new RegExp(`\\b${setting}\\s*:`),
      );
    },
  );

  it('should stay small enough that settings could not hide in it', () => {
    const code = withoutComments(rootConfigSource())
      .split('\n')
      .filter(line => line.trim());

    expect(code).toHaveLength(1);
  });
});
