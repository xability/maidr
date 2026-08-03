import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Guards what the npm package ships, and the two settings that keep it
 * consistent.
 *
 * Sourcemaps were 77% of the published package — 32 `.map` files, each
 * embedding the full source of React, MUI and KaTeX again. `files` excludes
 * them, and the build emits `sourcemap: 'hidden'` so no bundle names a map it
 * no longer ships.
 *
 * Both halves are load-bearing and neither is self-evident from reading the
 * line, which is why they are pinned here:
 *
 * - npm's `files` is order-sensitive. A negation only excludes what an earlier
 *   pattern included, so `['!dist/**\/*.map', 'dist']` publishes every map
 *   again. `jsonc/sort-array-values` wants exactly that order, and is turned
 *   off for package.json in eslint.config.ts to stop an autofix from doing it.
 * - Dropping the files while leaving the `sourceMappingURL` comment would point
 *   every CDN consumer at a 404 — jsDelivr serves the maps today.
 *
 * `scripts/build.js` is plain ESM JavaScript and `allowJs` is false, so it runs
 * in a node subprocess, the same approach `buildOutputFilenames.test.ts` takes.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const MAP_PATTERN = '!dist/**/*.map';

interface PackageJson {
  files: string[];
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/** Resolve every bundle's build config the way the build itself does. */
function sourcemapSettings(): unknown[] {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      console.log(JSON.stringify(builds.map(b => createViteConfig(b).build.sourcemap)));
    `],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
  return JSON.parse(stdout.trim()) as unknown[];
}

describe('published package contents', () => {
  it('should exclude sourcemaps from the files npm publishes', () => {
    const { files } = readPackageJson();

    expect(files).toContain(MAP_PATTERN);
  });

  it('should keep the exclusion after the pattern it narrows', () => {
    const { files } = readPackageJson();

    // Sorting this array ascending inverts these two and silently republishes
    // every map, which is why the sort rule is off for package.json.
    expect(files.indexOf(MAP_PATTERN)).toBeGreaterThan(files.indexOf('dist'));
  });

  it('should still publish dist itself', () => {
    const { files } = readPackageJson();

    expect(files).toContain('dist');
  });
});

describe('build sourcemap setting', () => {
  it('should emit hidden sourcemaps for every bundle', () => {
    const settings = sourcemapSettings();

    expect(settings.length).toBeGreaterThan(0);
    expect(new Set(settings)).toEqual(new Set(['hidden']));
  });

  // Asserted on the file's text rather than by importing it, for the same
  // reason playwrightRootConfig.test.ts does: vite.config.ts imports
  // `@vitejs/plugin-react`, which is ESM-only, and ts-jest transpiles this
  // project to CommonJS. Comments are stripped first — the ones around this
  // setting discuss sourcemaps at length and would pass the assertion on their
  // own.
  it('should match the standalone vite config', () => {
    const source = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toMatch(/sourcemap:\s*'hidden'/);
    expect(code).not.toMatch(/sourcemap:\s*(?:true|false)/);
  });
});
