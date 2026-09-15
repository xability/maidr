import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_OUT_DIR,
  fileUrl,
  MANIFEST_PATH,
  mismatch,
  outputManifest,
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

  it('should pin the vendor repository by full commit', () => {
    expect(manifest.commit).toMatch(COMMIT);
    expect(manifest.baseUrl).toBe(
      `https://cdn.jsdelivr.net/gh/dotincorp/dotpad-sdk-guide@${manifest.commit}/Web/${manifest.version}/`,
    );
    expect(manifest.repository).toBe('https://github.com/dotincorp/dotpad-sdk-guide');
  });

  it('should pin a commit at or after the liblouis.data fix', () => {
    // 781f230 restored the 7,685 carriage returns that `* text=auto` had
    // stripped from `liblouis.data`, and marked `*.data binary` so it stays
    // restored. Any earlier commit serves a file that fails every braille
    // table at once, and the line silently drops to grade 1.
    expect(manifest.files['lib/liblouis.data']?.bytes).toBe(13_751_594);
  });

  it('should list the module and the braille engine under the asset directory', () => {
    expect(Object.keys(manifest.files)).toContain(manifest.module);
    expect(manifest.assetDir.endsWith('/')).toBe(true);
    for (const name of ['liblouis.js', 'liblouis.wasm', 'liblouis.data']) {
      expect(Object.keys(manifest.files)).toContain(`${manifest.assetDir}${name}`);
    }
  });

  it('should carry what the vendor asks redistributors to keep beside the engine', () => {
    // liblouis is LGPL-2.1-or-later. The vendor's README asks anyone who
    // redistributes the SDK to keep the licence text and the wrapper sources
    // (the LGPL's relinking requirement) alongside the runtime files.
    expect(Object.keys(manifest.files)).toContain('lib/LICENSES/liblouis-LGPL-2.1.txt');
    expect(Object.keys(manifest.files)).toContain('lib/liblouis-web/liblouis_web.c');
    expect(Object.keys(manifest.files)).toContain('lib/liblouis-web/build_liblouis_web.sh');
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
    expect(fileUrl(manifest, 'lib/liblouis.data'))
      .toBe(`${manifest.baseUrl}lib/liblouis.data`);
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
