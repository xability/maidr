import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Guards the `define` config against leaving `process.env.NODE_ENV` in a
 * browser bundle.
 *
 * React's development guard reads `process.env.NODE_ENV`, and `process` does
 * not exist in a browser. The build relied on `define: { 'process.env': {} }`
 * to rewrite it, which worked only because rollup substituted the prefix and
 * left `({}).NODE_ENV` behind. Rolldown -- which vite 8 bundles instead --
 * substitutes a key only when it matches the whole member expression, so that
 * one entry silently stopped covering `process.env.NODE_ENV`. The bundle then
 * threw "process is not defined" on load and MAIDR never attached to a chart.
 *
 * Nothing in the unit suite noticed: the tests import source, not the bundle.
 * It took the e2e run, where every spec failed with "Expected MAIDR plot to be
 * focused, but found body". This asserts the config directly so the next
 * bundler swap fails here instead of there.
 *
 * The value is asserted too, not just the key. While the prefix entry was the
 * only one here the flag resolved to `undefined`, which is falsy for React's
 * purposes -- so the published bundles shipped its development build without
 * anything failing. Both halves of that need pinning: the key so the bundle
 * loads at all, the value so it loads the right React.
 *
 * `scripts/build.js` is plain ESM JavaScript and `allowJs` is false, so it
 * cannot be imported from a ts-jest test directly. Each case runs in a real
 * node subprocess with `--input-type=module`, as in buildOutputFilenames.test.
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

describe('the build script\'s define config', () => {
  it('should rewrite process.env.NODE_ENV by its full member expression', () => {
    const result = runModule(`
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const keys = builds.map(b => Object.keys(createViteConfig(b).define ?? {}));
      console.log('MISSING:' + keys.filter(k => !k.includes('process.env.NODE_ENV')).length);
      console.log('TOTAL:' + keys.length);
    `);

    expect(result.status).toBe(0);
    // Every bundle, not just the core one: any of them can pull in a dependency
    // that reads the flag, and they are built from the same factory.
    expect(result.stdout).toContain('MISSING:0');
    expect(result.stdout).not.toContain('TOTAL:0');
  });

  it('should keep the prefix entry too, for other process.env reads', () => {
    const result = runModule(`
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const keys = builds.map(b => Object.keys(createViteConfig(b).define ?? {}));
      console.log('MISSING:' + keys.filter(k => !k.includes('process.env')).length);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MISSING:0');
  });

  it('should substitute a value that is not itself a process reference', () => {
    const result = runModule(`
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const values = builds
        .map(b => createViteConfig(b).define['process.env.NODE_ENV'])
        .map(v => String(v));
      console.log('BAD:' + values.filter(v => v.includes('process')).length);
      console.log('SAMPLE:' + values[0]);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('BAD:0');
  });

  // Pinned by value, not just by shape: these bundles are the published ones,
  // and the flag decides which React build they carry. `undefined` -- what the
  // `process.env` prefix entry used to leave behind -- silently shipped the
  // development build, so a regression here is invisible until someone weighs
  // the tarball or reads the console.
  it('should substitute production, so the published bundles carry React\'s production build', () => {
    const result = runModule(`
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const values = builds
        .map(b => createViteConfig(b).define['process.env.NODE_ENV']);
      console.log('NOT_PRODUCTION:' + values.filter(v => v !== JSON.stringify('production')).length);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NOT_PRODUCTION:0');
  });
});

describe('the root vite config\'s define', () => {
  // Nothing builds through this file today: `createViteConfig` passes
  // `configFile: false`, the example builds and dev servers each pass
  // `--config examples/*/vite.config.ts`, and no script invokes vite bare. So
  // this case guards a latent trap rather than a live path -- the day someone
  // points a build at the root config, it should already be correct instead of
  // reintroducing a bug that took an e2e run to find. Checked here rather than
  // left to a comment because an unused config is exactly the kind that drifts.
  //
  // Asserted against the source text rather than the module: node cannot
  // import a .ts file in a subprocess the way it imports scripts/build.js, and
  // pulling vite.config.ts through ts-jest would execute its plugin imports
  // for a one-line check.
  it('should rewrite process.env.NODE_ENV by its full member expression', () => {
    const source = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');

    expect(source).toContain('\'process.env.NODE_ENV\'');
  });

  it('should substitute production there too, matching the published builds', () => {
    const source = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');

    expect(source).toMatch(/'process\.env\.NODE_ENV':\s*JSON\.stringify\('production'\)/);
  });
});
