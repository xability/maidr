import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from '@jest/globals';
import { readZip, runtimeFiles } from '../../scripts/repin-dotpad-sdk.mjs';

/**
 * Guards the archive reader behind `npm run repin:dotpad`.
 *
 * The vendor publishes each SDK release only as a zip, and the script reads
 * that zip itself rather than shelling out to `unzip`, so a repin works the
 * same on every machine that runs the build. What is pinned here is that the
 * reader understands the two methods a zip written by ordinary tools uses,
 * refuses anything that is not an archive (jsDelivr's 404 page, say), and that
 * the file selection carries the module and the braille engine and nothing
 * outside `lib/`.
 *
 * An `esm-test` because the script is plain ESM that the CommonJS project
 * cannot load.
 */

const encoder = new TextEncoder();

/** A crc32 the same way zip does it, so the reader's size check has real entries. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Writes a zip with the given entries, stored or deflated. */
function zip(entries: Record<string, string>, method: 0 | 8): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const stored = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const local = new Uint8Array(30 + nameBytes.length + stored.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc32(data), true);
    localView.setUint32(18, stored.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(stored, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc32(data), true);
    centralView.setUint32(20, stored.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054B50, true);
  eocdView.setUint16(8, centrals.length, true);
  eocdView.setUint16(10, centrals.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const release = {
  'DotPadSDK-9.9.9.js': 'export default class DotPadSDK {}',
  'DotPadSDK-9.9.9.d.ts': 'export default class DotPadSDK {}',
  'lib/liblouis.js': 'var liblouis = {};',
  'lib/liblouis.wasm': '\0asm',
  'lib/liblouis.data': 'unicode.dis\r\n',
  'lib/LICENSES/liblouis-LGPL-2.1.txt': 'GNU LESSER GENERAL PUBLIC LICENSE',
  'README.md': 'not a runtime file',
};

describe('readZip', () => {
  const methods: [string, 0 | 8][] = [['stored', 0], ['deflated', 8]];
  it.each(methods)('should read %s entries by name', (_label, method) => {
    const archive = readZip(zip(release, method));
    expect([...archive.keys()].sort()).toEqual(Object.keys(release).sort());
    expect(new TextDecoder().decode(archive.get('lib/liblouis.data'))).toBe('unicode.dis\r\n');
  });

  it('should refuse bytes that are not an archive', () => {
    expect(() => readZip(encoder.encode('<html>Couldn\'t find the requested file</html>')))
      .toThrow(/not a zip archive/i);
  });

  it('should refuse an entry whose bytes do not match its declared size', () => {
    const bytes = zip({ 'a.txt': 'hello' }, 0);
    // The reader trusts the central directory, whose one entry starts right
    // after the local record (30 + name + data); its uncompressed size sits
    // 24 bytes in. Lie about it.
    const central = 30 + 'a.txt'.length + 'hello'.length;
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(central, true)).toBe(0x02014B50);
    view.setUint32(central + 24, 99, true);
    expect(() => readZip(bytes)).toThrow('a.txt: expected 99 bytes, got 5');
  });
});

describe('runtimeFiles', () => {
  it('should select the module and everything under lib/, in a stable order', () => {
    const archive = readZip(zip(release, 8));
    expect(runtimeFiles(archive, '9.9.9')).toEqual([
      'DotPadSDK-9.9.9.js',
      'lib/LICENSES/liblouis-LGPL-2.1.txt',
      'lib/liblouis.data',
      'lib/liblouis.js',
      'lib/liblouis.wasm',
    ]);
  });

  it('should refuse an archive for another version', () => {
    const archive = readZip(zip(release, 8));
    expect(() => runtimeFiles(archive, '1.0.0')).toThrow('DotPadSDK-1.0.0.js');
  });

  it('should refuse an archive without the braille engine', () => {
    const { 'lib/liblouis.data': _data, ...withoutTables } = release;
    const archive = readZip(zip(withoutTables, 8));
    expect(() => runtimeFiles(archive, '9.9.9')).toThrow('lib/liblouis.data');
  });
});
