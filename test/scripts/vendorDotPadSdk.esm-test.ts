import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_OUT_DIR,
  DIST_MANIFEST_NAME,
  fileUrl,
  MANIFEST_PATH,
  mismatch,
  outputManifest,
  publishManifest,
  readManifest,
} from '../../scripts/dotPadSdk';

/**
 * Guards the record that `npm run vendor:dotpad` and the DotPad session share.
 *
 * `src/service/dotPadSdk.json` is the one place the SDK's origin is written
 * down: the session imports it for the URL it loads the SDK from, and the
 * vendoring script reads it for the same URL and the digest of every file. So
 * a host that vendors the SDK serves byte-for-byte what MAIDR would have
 * fetched, and a change to the pin is a change to both at once. What is
 * pinned here is the shape that makes that true.
 *
 * An `esm-test` because `scripts/dotPadSdk.js` is plain ESM, imported directly
 * by node from `scripts/vendor-dotpad-sdk.mjs`, and the CommonJS project cannot
 * load it. Jest runs from `rootDir`, so `cwd` is the repository root.
 */

const ROOT = process.cwd();
const SHA256 = /^[0-9a-f]{64}$/;
const MD5 = /^[0-9a-f]{32}$/;
const COMMIT = /^[0-9a-f]{40}$/;

describe('dotPad SDK manifest', () => {
  const manifest = readManifest();

  it('should live where the session imports it from', () => {
    expect(MANIFEST_PATH).toBe(resolve(ROOT, 'src/service/dotPadSdk.json'));
    expect(readFileSync(resolve(ROOT, 'src/service/dotPadSession.ts'), 'utf8'))
      .toContain('./dotPadSdk.json');
  });

  it('should pin the repository it loads from by full commit', () => {
    expect(manifest.commit).toMatch(COMMIT);
    const repository = manifest.repository.replace(/^https:\/\/github\.com\//, '');
    expect(repository).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(manifest.baseUrl).toBe(
      `https://cdn.jsdelivr.net/gh/${repository}@${manifest.commit}/Web/${manifest.version}/`,
    );
  });

  it('should record the vendor archive the mirrored files were verified against', () => {
    // The vendor publishes a release only as a zip, so the files are served
    // from a mirror; the manifest says which archive at which vendor commit
    // they were checked against, so the provenance can be re-verified.
    expect(manifest.upstream.repository).toBe('https://github.com/dotincorp/dotpad-sdk-guide');
    expect(manifest.upstream.commit).toMatch(COMMIT);
    expect(manifest.upstream.archive).toBe(`Web/${manifest.version}/download/web-sdk-${manifest.version}.zip`);
    expect(manifest.upstream.sha256).toMatch(SHA256);
  });

  it('should name the module after the pinned version', () => {
    expect(manifest.module).toBe(`DotPadSDK-${manifest.version}.js`);
  });

  it('should pin a mirror commit that kept the engine\'s carriage returns', () => {
    // These files carry CRLFs, and under the mirror's `* text=auto` git strips
    // them on commit -- which is how 3.0.2's `liblouis.data` lost 7,685 bytes
    // and every braille table with them. The mirror marks a release's files
    // `-text`; a commit made without that serves short files.
    expect(manifest.files['lib/liblouis-tables.data']?.bytes).toBe(9_503_140);
    expect(manifest.files['lib/ttb-engine.mjs']?.bytes).toBe(90_607);
  });

  it('should list the module and the braille engine under the asset directory', () => {
    expect(Object.keys(manifest.files)).toContain(manifest.module);
    expect(manifest.assetDir.endsWith('/')).toBe(true);
    for (const name of ['ttb-engine.mjs', 'ttb-engine.wasm', 'liblouis.wasm', 'liblouis-tables.data']) {
      expect(Object.keys(manifest.files)).toContain(`${manifest.assetDir}${name}`);
    }
  });

  it('should carry what the vendor asks redistributors to keep beside the engine', () => {
    // liblouis is LGPL-2.1-or-later, and from 3.0.4 a side module the engine
    // loads at runtime, so it stays replaceable on its own. Its licence text
    // and the MorphoBr notice (Apache-2.0) ship beside the runtime files.
    expect(Object.keys(manifest.files)).toContain('lib/LIBLOUIS-COPYING.LESSER');
    expect(Object.keys(manifest.files)).toContain('lib/MORPHOBR-NOTICE.txt');
  });

  it('should give every file a size and both digests', () => {
    for (const [file, entry] of Object.entries(manifest.files)) {
      expect(file.startsWith('/')).toBe(false);
      expect(entry.bytes).toBeGreaterThan(0);
      expect(entry.sha256).toMatch(SHA256);
      expect(entry.md5).toMatch(MD5);
    }
  });

  it('should resolve a file against the pinned base', () => {
    expect(fileUrl(manifest, 'lib/ttb-engine.wasm'))
      .toBe(`${manifest.baseUrl}lib/ttb-engine.wasm`);
  });
});

describe('vendored file verification', () => {
  const bytes = new TextEncoder().encode('hello');
  const expected = {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    md5: createHash('md5').update(bytes).digest('hex'),
  };

  it('should accept the bytes the manifest describes', () => {
    expect(mismatch(bytes, expected)).toBeNull();
  });

  it('should name a short file by its size, the corruption that motivated the pin', () => {
    expect(mismatch(bytes.slice(0, 3), expected)).toBe('expected 5 bytes, got 3');
  });

  it('should name a same-size file by its digest', () => {
    const other = new TextEncoder().encode('hellp');
    expect(mismatch(other, expected)).toMatch(/^expected sha256 /);
  });

  it('should hold the md5 the R binding will check against', () => {
    // `tools::md5sum` is the digest base R has, so r-maidr verifies its copy
    // by MD5. A manifest whose MD5 is wrong would pass here on SHA-256 and
    // fail there, which is why both are checked.
    const wrongMd5 = { ...expected, md5: '0'.repeat(32) };
    expect(mismatch(bytes, wrongMd5)).toMatch(/^expected md5 /);
  });
});

describe('vendored output', () => {
  it('should record the manifest and the day it was fetched', () => {
    const manifest = readManifest();
    const record = outputManifest(manifest, new Date('2026-09-15T12:34:56Z'));
    expect(record).toEqual({ ...manifest, retrieved: '2026-09-15' });
  });

  it('should default to a directory the npm package excludes', () => {
    const { files } = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] };
    expect(files).toContain(`!${DEFAULT_OUT_DIR}`);
  });
});

describe('published manifest', () => {
  // The bindings and the skill copy their pins from the npm package, so the
  // build must publish the manifest where `files: ["dist"]` ships it.
  it('should copy the manifest into dist under the name the bindings fetch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maidr-dotpad-'));
    try {
      const written = publishManifest(dir);
      expect(written).toBe(join(dir, DIST_MANIFEST_NAME));
      expect(readFileSync(written, 'utf8')).toBe(readFileSync(MANIFEST_PATH, 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should be written by the build, not excluded from the package', () => {
    expect(DIST_MANIFEST_NAME).toBe('dotpad-sdk.json');
    expect(readFileSync(resolve(ROOT, 'scripts/build.js'), 'utf8')).toContain('publishManifest(');
    const { files } = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] };
    expect(files.some(pattern => pattern.startsWith('!') && pattern.includes(DIST_MANIFEST_NAME))).toBe(false);
  });
});
