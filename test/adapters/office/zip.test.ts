import { describe, expect, it, jest } from '@jest/globals';
import { bytesSource, openZip, slicedSource, ZipError } from '../../../src/adapters/office/zip';
import { zipFiles } from './zipFixture';

describe('openZip', () => {
  it('should list a package\'s files and read them, deflated or stored', async () => {
    for (const deflate of [true, false]) {
      const bytes = await zipFiles({ '[Content_Types].xml': '<Types/>', 'ppt/slides/slide1.xml': '<p:sld/>' }, { deflate });

      const zip = await openZip(bytesSource(bytes));

      expect(zip.names).toEqual(['[Content_Types].xml', 'ppt/slides/slide1.xml']);
      expect(await zip.text('ppt/slides/slide1.xml')).toBe('<p:sld/>');
    }
  });

  it('should find a file whatever the case of its name or a leading slash, as part names are compared', async () => {
    const zip = await openZip(bytesSource(await zipFiles({ 'ppt/charts/chart1.xml': '<c/>' })));

    expect(zip.has('/PPT/Charts/Chart1.xml')).toBe(true);
    expect(await zip.text('/ppt/CHARTS/chart1.xml')).toBe('<c/>');
  });

  it('should answer undefined for a file the archive does not hold', async () => {
    const zip = await openZip(bytesSource(await zipFiles({ 'a.xml': '<a/>' })));

    expect(zip.has('b.xml')).toBe(false);
    expect(await zip.text('b.xml')).toBeUndefined();
  });

  it('should find the directory behind a trailing comment', async () => {
    const bytes = await zipFiles({ 'a.xml': '<a/>' }, { comment: 'written by a test' });

    const zip = await openZip(bytesSource(bytes));

    expect(await zip.text('a.xml')).toBe('<a/>');
  });

  it('should find the directory through ZIP64 records', async () => {
    const bytes = await zipFiles({ 'a.xml': '<a/>', 'b.xml': '<b/>' }, { zip64: true });

    const zip = await openZip(bytesSource(bytes));

    expect(zip.names).toEqual(['a.xml', 'b.xml']);
    expect(await zip.text('b.xml')).toBe('<b/>');
  });

  it('should read text written as UTF-8', async () => {
    const zip = await openZip(bytesSource(await zipFiles({ 'a.xml': '<t>Umsatz € — 売上</t>' })));

    expect(await zip.text('a.xml')).toBe('<t>Umsatz € — 売上</t>');
  });

  it('should refuse a file that is not a zip archive', async () => {
    const text = new TextEncoder().encode('<?xml version="1.0"?><notAZip/>'.padEnd(100, ' '));

    await expect(openZip(bytesSource(text))).rejects.toBeInstanceOf(ZipError);
    await expect(openZip(bytesSource(new Uint8Array(4)))).rejects.toThrow('too short');
  });

  it('should refuse a directory that claims more than the file holds', async () => {
    const bytes = await zipFiles({ 'a.xml': '<a/>' });
    const damaged = bytes.slice();
    // The directory's size, in the end record, past the end of the file.
    new DataView(damaged.buffer).setUint32(damaged.length - 22 + 12, 0x00FFFFFF, true);

    await expect(openZip(bytesSource(damaged))).rejects.toThrow('damaged');
  });

  it('should refuse a file whose data inflates past the size its entry claims', async () => {
    const bytes = await zipFiles({ 'big.xml': 'x'.repeat(10_000) });
    const damaged = bytes.slice();
    const view = new DataView(damaged.buffer);
    // The uncompressed size, in the central directory entry that follows the
    // local header and data.
    const directory = view.getUint32(damaged.length - 22 + 16, true);
    view.setUint32(directory + 24, 10, true);

    const zip = await openZip(bytesSource(damaged));

    await expect(zip.text('big.xml')).rejects.toThrow('larger than it claims');
  });
});

describe('slicedSource', () => {
  it('should fetch only the slices a read needs, each once', async () => {
    const bytes = await zipFiles({
      'a.xml': '<a/>',
      'padding.bin': new Uint8Array(40_000).map((_, i) => (i * 7919) % 251),
      'z.xml': '<z/>',
    }, { deflate: false });
    const sliceSize = 4096;
    const fetch = jest.fn(async (index: number) => bytes.subarray(index * sliceSize, (index + 1) * sliceSize));
    const source = slicedSource(bytes.length, sliceSize, fetch);

    const zip = await openZip(source);
    const text = await zip.text('a.xml');
    await zip.text('a.xml');

    expect(text).toBe('<a/>');
    const fetched = fetch.mock.calls.map(([index]) => index);
    expect(new Set(fetched).size).toBe(fetched.length);
    // The directory at the end, and the first slice for a.xml: not the ten
    // slices of padding between them.
    expect(fetched.length).toBeLessThanOrEqual(3);
  });

  it('should join a read across slices', async () => {
    const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
    const source = slicedSource(bytes.length, 30, async index => bytes.subarray(index * 30, (index + 1) * 30));

    const read = await source.read(25, 40);

    expect(Array.from(read)).toEqual(Array.from({ length: 40 }, (_, i) => i + 25));
    expect((await source.read(95, 50)).length).toBe(5);
  });
});
