import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Guards the build config against two formats resolving to the same output
 * filename.
 *
 * Vite writes lib outputs one format at a time and overwrites silently, so a
 * `fileName` callback that ignores its `format` argument costs a whole format's
 * build with nothing but a repeated filename in the log to show for it. That is
 * how the core bundle came to emit an ES output that the UMD output replaced on
 * every build. `assertUniqueOutputFilenames` turns that into a hard failure;
 * these tests keep the guard honest and keep this repo's own `builds` array
 * continuously checked.
 *
 * `scripts/build.js` is plain ESM JavaScript and `allowJs` is false, so it
 * cannot be imported from a ts-jest test directly. Each case runs in a real
 * node subprocess with `--input-type=module` instead, which also exercises the
 * module exactly as the build does.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run ESM source in a node subprocess, capturing output either way. */
function runModule(source: string): RunResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', source],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
    };
  }
}

/**
 * Check one inline entry and report the outcome on stdout, so a genuine crash
 * (non-zero exit, empty stdout) stays distinguishable from a rejection.
 */
function checkEntry(entryLiteral: string): RunResult {
  return runModule(`
    import { assertUniqueOutputFilenames } from '${BUILD_SCRIPT}';
    try {
      assertUniqueOutputFilenames([${entryLiteral}]);
      console.log('ACCEPTED');
    } catch (error) {
      console.log('REJECTED:' + error.message);
    }
  `);
}

describe('importing the build script', () => {
  // The guard that makes every other case here possible: main() is wired to
  // run only when build.js is the entry point, so importing it for its exports
  // must not start a multi-minute build.
  it('should not start a build', () => {
    const result = runModule(`
      import { builds } from '${BUILD_SCRIPT}';
      console.log('IMPORTED:' + builds.length);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/IMPORTED:\d+/);
    expect(result.stdout).not.toContain('Building MAIDR library');
    expect(result.stdout).not.toContain('vite');
  });
});

describe('the real builds array', () => {
  it('should map every format to a distinct filename', () => {
    const result = runModule(`
      import { assertUniqueOutputFilenames, builds } from '${BUILD_SCRIPT}';
      assertUniqueOutputFilenames(builds);
      console.log('OK:' + builds.length);
    `);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK:');
  });

  it('should actually have entries to check', () => {
    const result = runModule(`
      import { builds } from '${BUILD_SCRIPT}';
      console.log('COUNT:' + builds.length);
    `);
    const count = Number(result.stdout.match(/COUNT:(\d+)/)?.[1]);

    // Guards against the previous case passing vacuously on an empty array.
    expect(count).toBeGreaterThan(0);
  });

  it('should declare a fileName callback for every multi-format entry', () => {
    const result = runModule(`
      import { builds } from '${BUILD_SCRIPT}';
      const bad = builds
        .filter(b => (b.formats ?? []).length > 1 && typeof b.fileName !== 'function')
        .map(b => b.name);
      console.log('BAD:' + JSON.stringify(bad));
    `);

    expect(result.stdout).toContain('BAD:[]');
  });
});

describe('assertUniqueOutputFilenames', () => {
  it('should reject a fileName that ignores its format argument', () => {
    const result = checkEntry(`{
      name: 'core',
      entry: 'src/index.tsx',
      formats: ['es', 'umd'],
      fileName: () => 'maidr.js',
    }`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('REJECTED:');
    // The message has to name the bundle and the filename, or the next person
    // hitting this learns nothing from it.
    expect(result.stdout).toContain('"core"');
    expect(result.stdout).toContain('"maidr.js"');
    expect(result.stdout).toContain('"es"');
    expect(result.stdout).toContain('"umd"');
  });

  it('should accept the per-format naming the adapters use', () => {
    const result = checkEntry(`{
      name: 'anychart',
      entry: 'src/anychart-entry.ts',
      formats: ['es', 'umd'],
      fileName: format => format === 'es' ? 'anychart.mjs' : 'anychart.js',
    }`);

    expect(result.stdout).toContain('ACCEPTED');
  });

  it('should accept a single-format entry whose fileName ignores its argument', () => {
    const result = checkEntry(`{
      name: 'react',
      entry: 'src/react-entry.ts',
      formats: ['es'],
      fileName: () => 'react.mjs',
    }`);

    expect(result.stdout).toContain('ACCEPTED');
  });

  it('should catch a collision among three formats', () => {
    const result = checkEntry(`{
      name: 'triple',
      entry: 'src/index.tsx',
      formats: ['es', 'cjs', 'umd'],
      fileName: format => format === 'es' ? 'triple.mjs' : 'triple.js',
    }`);

    expect(result.stdout).toContain('REJECTED:');
    expect(result.stdout).toContain('"triple"');
    expect(result.stdout).toContain('"triple.js"');
  });

  it('should surface a throwing fileName instead of swallowing it', () => {
    const result = checkEntry(`{
      name: 'explosive',
      entry: 'src/index.tsx',
      formats: ['es', 'umd'],
      fileName: () => { throw new Error('kaboom'); },
    }`);

    expect(result.stdout).toContain('REJECTED:');
    expect(result.stdout).toContain('"explosive"');
    expect(result.stdout).toContain('kaboom');
  });

  it('should check an entry that omits formats against vite\'s default', () => {
    // Vite defaults lib builds to ['es', 'umd'] when a name is set, so an
    // omitted `formats` must not become a hole in the check.
    const result = checkEntry(`{
      name: 'defaulted',
      entry: 'src/index.tsx',
      fileName: () => 'defaulted.js',
    }`);

    expect(result.stdout).toContain('REJECTED:');
    expect(result.stdout).toContain('"defaulted"');
  });

  it('should ignore a string fileName, which vite disambiguates by extension', () => {
    const result = checkEntry(`{
      name: 'stringly',
      entry: 'src/index.tsx',
      formats: ['es', 'umd'],
      fileName: 'stringly',
    }`);

    expect(result.stdout).toContain('ACCEPTED');
  });
});
