import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Guards the bundles against the text Quarto's dashboard filter matches.
 *
 * The filter lifts any cell output matching `bslib-` -- a Lua pattern, which
 * matches the first four letters alone -- out of its card, and py-maidr writes
 * maidr.js into a cell when it bundles the script. The host guard needs a
 * namespace that starts with those letters, and the minifier folds most ways
 * of building it from parts back into the literal, so `scripts/build.js`
 * reads every bundle it wrote. These cases pin that check.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so each case runs
 * in a node subprocess, as in esmRequireShim.test.
 */

const ROOT = resolve(__dirname, '../..');
const SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/dashboardPattern.js')).href;

function runModule<T>(source: string): T {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
  return JSON.parse(stdout.trim()) as T;
}

/** The text the filter matches, as the check spells it. */
const TEXT = runModule<string>(`
  import { DASHBOARD_PATTERN_TEXT } from '${SCRIPT}';
  console.log(JSON.stringify(DASHBOARD_PATTERN_TEXT));
`);

describe('post-build dashboard pattern check', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'maidr-dashboard-'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  function find(): string[] {
    return runModule(`
      import { findDashboardPatternBundles } from '${SCRIPT}';
      console.log(JSON.stringify(findDashboardPatternBundles(${JSON.stringify(dist)})));
    `);
  }

  function assertError(): string {
    return runModule(`
      import { assertNoDashboardPattern } from '${SCRIPT}';
      try {
        assertNoDashboardPattern(${JSON.stringify(dist)});
        console.log(JSON.stringify(''));
      } catch (error) {
        console.log(JSON.stringify(error.message));
      }
    `);
  }

  it('should flag the script bundle and an ESM chunk that spell it', () => {
    writeFileSync(join(dist, 'maidr.js'), `var n = window.${TEXT}b;\n`);
    mkdirSync(join(dist, 'chunks'));
    writeFileSync(join(dist, 'chunks', 'host.mjs'), `// the ${TEXT}b card\nexport {};\n`);

    expect(find()).toEqual(['chunks/host.mjs', 'maidr.js']);
  });

  it('should pass bundles that build the name at runtime, and ignore maps and types', () => {
    writeFileSync(join(dist, 'maidr.js'), 'var n = window[["bs", "lib"].join("")];\n');
    writeFileSync(join(dist, 'maidr.js.map'), `{"sources": ["${TEXT}b"]}\n`);
    writeFileSync(join(dist, 'react.d.mts'), `// ${TEXT}b\n`);

    expect(find()).toEqual([]);
    expect(assertError()).toBe('');
  });

  it('should fail the build naming each bundle', () => {
    writeFileSync(join(dist, 'locale-de.js'), `"${TEXT}"`);

    expect(assertError()).toContain('  locale-de.js');
  });

  it('should be run on both of the build\'s paths', () => {
    // In-process (one bundle, or --jobs=1) and after the parallel merge.
    const build = readFileSync(resolve(ROOT, 'scripts/build.js'), 'utf8');

    expect(build.match(/assertNoDashboardPattern\(/g)).toHaveLength(2);
  });
});
