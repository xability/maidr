import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from '@jest/globals';

/**
 * Tests for `cdnjs/maidr.json`, the payload that lists MAIDR on cdnjs.
 *
 * Nothing in this repository reads that file — cdnjs serves packages from its
 * own repository, so the copy that matters lives there and is updated by a
 * pull request. That is exactly why it needs pinning: a rename in `dist` or a
 * dropped field breaks the mirror silently, months after the change, in a
 * place no CI run of ours can see.
 *
 * So the checks here answer one question: is this file still true about *this*
 * repository? Every mirrored filename is compared against what
 * `scripts/build.js` really emits, and the metadata against `package.json`.
 * Whether cdnjs has been told about a change is a separate matter, and one no
 * test can settle; `cdnjs/README.md` covers it.
 *
 * `scripts/build.js` and the stylesheet plugin are plain ESM JavaScript and
 * `tsconfig.json` sets `allowJs: false`, so their facts are read out of a node
 * subprocess — the same approach as `test/scripts/buildOutputFilenames` and
 * `test/scripts/mathStylesheet`, and one that exercises the modules the way
 * the build itself loads them.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const MATH_PLUGIN = pathToFileURL(
  resolve(ROOT, 'scripts/vite-plugin-math-stylesheet.js'),
).href;

interface Manifest {
  name: string;
  description: string;
  keywords: string[];
  filename: string;
  homepage: string;
  repository: { type: string; url: string };
  license: string;
  autoupdate: {
    source: string;
    target: string;
    fileMap: { basePath: string; files: string[] }[];
  };
}

interface PackageJson {
  name: string;
  description: string;
  homepage: string;
  license: string;
  repository: { url: string };
  files: string[];
}

/** What the build emits, read from the build config itself. */
interface BuildOutputs {
  /** Filenames the `core` bundle writes — `maidr.js` today. */
  core: string[];
  /** The stylesheet every integration links by name. */
  coreStylesheet: string;
  /** The KaTeX stylesheet `maidr.js` fetches on demand. */
  mathStylesheet: string;
  /** Every filename any bundle writes, adapters included. */
  all: string[];
}

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'cdnjs/maidr.json'), 'utf8'),
) as Manifest;

const pkg = JSON.parse(
  readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
) as PackageJson;

/**
 * Ask the real build config which filenames it produces.
 *
 * `fileName` is invoked the way Vite invokes it — `(format, entryName)` — so a
 * callback that varies by format is resolved for each of the formats its
 * bundle declares, rather than being assumed to yield one name.
 */
function readBuildOutputs(): BuildOutputs {
  const source = `
    import { builds } from ${JSON.stringify(BUILD_SCRIPT)};
    import {
      CORE_STYLESHEET_FILENAME,
      MATH_STYLESHEET_FILENAME,
    } from ${JSON.stringify(MATH_PLUGIN)};

    const namesOf = build => (build.formats ?? ['es', 'umd']).map(format =>
      typeof build.fileName === 'function'
        ? build.fileName(format, build.name)
        : build.fileName);

    process.stdout.write(JSON.stringify({
      core: namesOf(builds.find(build => build.name === 'core')),
      coreStylesheet: CORE_STYLESHEET_FILENAME,
      mathStylesheet: MATH_STYLESHEET_FILENAME,
      all: builds.flatMap(namesOf),
    }));
  `;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return JSON.parse(stdout) as BuildOutputs;
}

const outputs = readBuildOutputs();
const mirrored = manifest.autoupdate.fileMap.flatMap(entry => entry.files);

describe('cdnjs manifest metadata', () => {
  it('should carry every field cdnjs requires', () => {
    for (const field of ['name', 'description', 'keywords', 'repository', 'autoupdate'] as const) {
      expect(manifest[field]).toBeDefined();
    }

    expect(manifest.keywords.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it('should describe the same package as package.json', () => {
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.description).toBe(pkg.description);
    expect(manifest.homepage).toBe(pkg.homepage);
  });

  // cdnjs redistributes the files, so a licence that disagrees with the one
  // in the published package is a licensing claim we did not make. The
  // GPL-3.0-or-later declaration is what unblocked this listing at all.
  it('should declare the licence the package is published under', () => {
    expect(manifest.license).toBe(pkg.license);
  });

  it('should point at this repository', () => {
    const withoutSuffix = (url: string): string => url.replace(/\.git$/, '');

    expect(withoutSuffix(manifest.repository.url)).toBe(withoutSuffix(pkg.repository.url));
    expect(manifest.repository.type).toBe('git');
  });
});

describe('cdnjs auto-update', () => {
  it('should follow the npm package this repository publishes', () => {
    expect(manifest.autoupdate.source).toBe('npm');
    expect(manifest.autoupdate.target).toBe(pkg.name);
  });

  // `basePath` is a path inside the npm tarball. `files` in package.json is
  // what npm puts there, so a basePath outside it mirrors nothing at all.
  it('should mirror from a directory the npm tarball contains', () => {
    for (const entry of manifest.autoupdate.fileMap) {
      const root = entry.basePath.split('/')[0];

      expect(pkg.files).toContain(root);
    }
  });
});

describe('cdnjs file map', () => {
  it('should only mirror files the build emits', () => {
    const emitted = [...outputs.core, outputs.coreStylesheet, outputs.mathStylesheet];

    expect(mirrored.length).toBeGreaterThan(0);
    for (const file of mirrored) {
      expect(emitted).toContain(file);
    }
  });

  // The stylesheet is linked at runtime by src/util/katex.ts, resolved against
  // the URL maidr.js was loaded from — so on a cdnjs-served page it resolves
  // to a cdnjs URL. Leave it unmirrored and that URL 404s, and LaTeX in AI
  // chat responses renders unstyled with nothing else to show for it.
  it('should mirror the maths stylesheet maidr.js fetches at runtime', () => {
    expect(mirrored).toContain(outputs.mathStylesheet);
  });

  // cdnjs asks that globs stay narrow (cdnjs/packages#186). `dist/*.js` here
  // would pull every adapter bundle and every sourcemap along with the library.
  it('should list each file by name rather than by glob', () => {
    for (const file of mirrored) {
      expect(file).not.toMatch(/[*?[\]]/);
    }
  });

  it('should not mirror sourcemaps or adapter bundles', () => {
    const adapters = outputs.all.filter(name => !outputs.core.includes(name));

    for (const file of mirrored) {
      expect(file).not.toMatch(/\.map$/);
      expect(adapters).not.toContain(file);
    }
  });

  // cdnjs generates the .min variants itself, so the default file it offers is
  // allowed to be one the build never writes — but only as the minified form
  // of something actually mirrored, or the URL cdnjs advertises is a 404.
  it('should default to a mirrored file, minified or not', () => {
    const unminified = manifest.filename.replace(/\.min(\.\w+)$/, '$1');

    expect(mirrored).toContain(unminified);
  });
});
