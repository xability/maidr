/**
 * Writes zip files for the Office adapter's tests: a presentation made of
 * hand-written parts, stored or deflated, laid out as any zip tool lays them
 * out -- local headers and data first, then the central directory.
 */

import { CompressionStream, ReadableStream } from 'node:stream/web';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Raw deflate with Node's own streams, which a jsdom test has too. */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(new CompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(next.value);
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Options for {@link zipFiles}. */
export interface ZipOptions {
  /** Deflate every file, as Office does. Default `true`. */
  readonly deflate?: boolean;
  /** A comment after the directory, which a reader has to search past. */
  readonly comment?: string;
  /**
   * Point to the directory through ZIP64 records, as some writers do even for
   * a small file, saturating the end record's fields.
   */
  readonly zip64?: boolean;
}

/**
 * A zip file holding `files`, in the order given.
 *
 * @param files - Each file's name and contents; text is written as UTF-8.
 * @param options - How to write it.
 * @returns The zip file's bytes.
 */
export async function zipFiles(files: Record<string, string | Uint8Array>, options: ZipOptions = {}): Promise<Uint8Array> {
  const deflate = options.deflate ?? true;
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const data = typeof contents === 'string' ? encoder.encode(contents) : contents;
    const stored = deflate ? await deflateRaw(data) : data;
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034B50, true);
    header.setUint16(4, 20, true);
    header.setUint16(8, deflate ? 8 : 0, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, stored.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const entry = new Uint8Array(46 + nameBytes.length);
    const fields = new DataView(entry.buffer);
    fields.setUint32(0, 0x02014B50, true);
    fields.setUint16(4, 20, true);
    fields.setUint16(6, 20, true);
    fields.setUint16(10, deflate ? 8 : 0, true);
    fields.setUint32(16, crc, true);
    fields.setUint32(20, stored.length, true);
    fields.setUint32(24, data.length, true);
    fields.setUint16(28, nameBytes.length, true);
    fields.setUint32(42, offset, true);
    entry.set(nameBytes, 46);

    locals.push(local, stored);
    directory.push(entry);
    offset += local.length + stored.length;
  }
  const comment = encoder.encode(options.comment ?? '');
  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  const zip64: Uint8Array[] = [];
  if (options.zip64 === true) {
    const record = new Uint8Array(56);
    const fields = new DataView(record.buffer);
    fields.setUint32(0, 0x06064B50, true);
    fields.setUint32(4, 44, true);
    fields.setUint32(24, directory.length, true);
    fields.setUint32(32, directory.length, true);
    fields.setUint32(40, directorySize, true);
    fields.setUint32(48, offset, true);
    const locator = new Uint8Array(20);
    const pointer = new DataView(locator.buffer);
    pointer.setUint32(0, 0x07064B50, true);
    pointer.setUint32(8, offset + directorySize, true);
    pointer.setUint32(16, 1, true);
    zip64.push(record, locator);
  }
  const end = new Uint8Array(22 + comment.length);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054B50, true);
  tail.setUint16(8, options.zip64 === true ? 0xFFFF : directory.length, true);
  tail.setUint16(10, options.zip64 === true ? 0xFFFF : directory.length, true);
  tail.setUint32(12, options.zip64 === true ? 0xFFFFFFFF : directorySize, true);
  tail.setUint32(16, options.zip64 === true ? 0xFFFFFFFF : offset, true);
  tail.setUint16(20, comment.length, true);
  end.set(comment, 22);

  const parts = [...locals, ...directory, ...zip64, end];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
