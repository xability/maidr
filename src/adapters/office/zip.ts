/**
 * Reads the parts of a zip package: a PowerPoint presentation as Office.js
 * hands it over, or any other Open XML file.
 *
 * Only what reading a few XML parts needs: the central directory, and the
 * parts it lists, stored or deflated. The deflated ones are inflated by the
 * browser's own `DecompressionStream`, so there is no inflate code here and no
 * dependency. The bytes are read through a {@link ByteSource}, so a large
 * presentation is fetched a slice at a time and only the slices that hold the
 * directory and the parts asked for are fetched at all.
 *
 * @see https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */

/**
 * Where the bytes of a zip file come from: the whole file in memory, or a
 * file fetched in slices on demand.
 */
export interface ByteSource {
  /** The file's size, in bytes. */
  readonly size: number;
  /**
   * The `length` bytes from `offset`. A read past the end returns what there
   * is.
   */
  read: (offset: number, length: number) => Promise<Uint8Array>;
}

/** Why a zip file could not be read. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

/** One file of the archive, as its central directory lists it. */
interface Entry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

/** A zip archive whose central directory has been read. */
export interface ZipArchive {
  /** Every file's name, in the order the directory lists them. */
  readonly names: readonly string[];
  /** Whether the archive holds a file, its name compared without case. */
  has: (name: string) => boolean;
  /**
   * A file's contents, inflated, or `undefined` when the archive has no such
   * file. Rejects with a {@link ZipError} when the file cannot be read.
   */
  bytes: (name: string) => Promise<Uint8Array | undefined>;
  /** A file's contents as UTF-8 text; see {@link ZipArchive.bytes}. */
  text: (name: string) => Promise<string | undefined>;
}

const END_OF_DIRECTORY = 0x06054B50;
const ZIP64_LOCATOR = 0x07064B50;
const ZIP64_END_OF_DIRECTORY = 0x06064B50;
const DIRECTORY_ENTRY = 0x02014B50;
const LOCAL_HEADER = 0x04034B50;

/** The fixed part of the end of central directory record. */
const END_SIZE = 22;
/** The longest comment a zip file can end with. */
const MAX_COMMENT = 0xFFFF;
/** The fixed part of a local file header. */
const LOCAL_SIZE = 30;
/** The fixed part of a central directory entry. */
const ENTRY_SIZE = 46;

/** Stored, not compressed. */
const STORED = 0;
/** Deflated. */
const DEFLATED = 8;

/**
 * The largest file inflated, so a damaged or hostile archive cannot make the
 * pane hold gigabytes. A slide or a chart is a few hundred kilobytes at most.
 */
export const MAX_INFLATED_SIZE = 64 * 1024 * 1024;

/** The most files a directory is read with; a presentation has a few thousand. */
const MAX_ENTRIES = 200_000;

/** The largest central directory read. */
const MAX_DIRECTORY_SIZE = 64 * 1024 * 1024;

/**
 * A byte source over bytes already in memory.
 *
 * @param bytes - The whole file.
 * @returns The source.
 */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset: number, length: number): Promise<Uint8Array> =>
      bytes.subarray(Math.max(0, offset), Math.min(bytes.length, offset + length)),
  };
}

/**
 * A byte source over a file fetched in fixed-size slices, each fetched once,
 * when a read first needs it.
 *
 * @param size - The file's size, in bytes.
 * @param sliceSize - The size of every slice but the last.
 * @param slice - Fetches the slice at an index.
 * @returns The source.
 */
export function slicedSource(
  size: number,
  sliceSize: number,
  slice: (index: number) => Promise<Uint8Array>,
): ByteSource {
  const fetched = new Map<number, Promise<Uint8Array>>();
  const get = (index: number): Promise<Uint8Array> => {
    let found = fetched.get(index);
    if (found === undefined) {
      found = slice(index);
      fetched.set(index, found);
    }
    return found;
  };
  return {
    size,
    read: async (offset: number, length: number): Promise<Uint8Array> => {
      const start = Math.max(0, offset);
      const end = Math.min(size, offset + length);
      if (end <= start) {
        return new Uint8Array(0);
      }
      const out = new Uint8Array(end - start);
      for (let index = Math.floor(start / sliceSize); index * sliceSize < end; index += 1) {
        const data = await get(index);
        const from = index * sliceSize;
        const head = Math.max(start, from);
        const tail = Math.min(end, from + data.length);
        if (tail > head) {
          out.set(data.subarray(head - from, tail - from), head - start);
        }
      }
      return out;
    },
  };
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** A little-endian 64-bit value, exact while it is below 2^53. */
function uint64(data: DataView, at: number): number {
  return data.getUint32(at, true) + data.getUint32(at + 4, true) * 0x1_0000_0000;
}

/**
 * Where the central directory is, and how many entries it has, from the end
 * of central directory record and, for a ZIP64 archive, its ZIP64 record.
 */
async function locateDirectory(source: ByteSource): Promise<{ offset: number; size: number; count: number }> {
  if (source.size < END_SIZE) {
    throw new ZipError('the file is too short to be a zip archive.');
  }
  // Most files end with the record itself, no comment after it: read just
  // that, and search further back only when it is not there.
  let tailStart = source.size - END_SIZE;
  let tail = await source.read(tailStart, END_SIZE);
  let data = view(tail);
  let at = data.getUint32(0, true) === END_OF_DIRECTORY && data.getUint16(20, true) === 0 ? 0 : -1;
  if (at < 0) {
    const tailLength = Math.min(source.size, END_SIZE + MAX_COMMENT);
    tailStart = source.size - tailLength;
    tail = await source.read(tailStart, tailLength);
    data = view(tail);
    for (let i = tail.length - END_SIZE; i >= 0; i -= 1) {
      if (data.getUint32(i, true) === END_OF_DIRECTORY) {
        at = i;
        break;
      }
    }
  }
  if (at < 0) {
    throw new ZipError('the file has no zip directory.');
  }
  let count = data.getUint16(at + 10, true);
  let size = data.getUint32(at + 12, true);
  let offset = data.getUint32(at + 16, true);
  if (count === 0xFFFF || size === 0xFFFFFFFF || offset === 0xFFFFFFFF) {
    const locatorAt = tailStart + at - 20;
    const locator = view(await source.read(locatorAt, 20));
    if (locatorAt < 0 || locator.byteLength < 20 || locator.getUint32(0, true) !== ZIP64_LOCATOR) {
      throw new ZipError('the zip directory is damaged.');
    }
    const recordOffset = uint64(locator, 8);
    const record = view(await source.read(recordOffset, 56));
    if (record.byteLength < 56 || record.getUint32(0, true) !== ZIP64_END_OF_DIRECTORY) {
      throw new ZipError('the zip directory is damaged.');
    }
    count = uint64(record, 32);
    size = uint64(record, 40);
    offset = uint64(record, 48);
  }
  if (count > MAX_ENTRIES || size > MAX_DIRECTORY_SIZE || offset + size > source.size) {
    throw new ZipError('the zip directory is damaged.');
  }
  return { offset, size, count };
}

/** The ZIP64 sizes and offset an entry's extra field holds for its saturated fields. */
function zip64Extra(
  extra: DataView,
  entry: { compressedSize: number; size: number; offset: number },
): { compressedSize: number; size: number; offset: number } {
  let { compressedSize, size, offset } = entry;
  for (let at = 0; at + 4 <= extra.byteLength;) {
    const id = extra.getUint16(at, true);
    const length = extra.getUint16(at + 2, true);
    if (id === 0x0001) {
      let field = at + 4;
      const end = field + length;
      if (size === 0xFFFFFFFF && field + 8 <= end) {
        size = uint64(extra, field);
        field += 8;
      }
      if (compressedSize === 0xFFFFFFFF && field + 8 <= end) {
        compressedSize = uint64(extra, field);
        field += 8;
      }
      if (offset === 0xFFFFFFFF && field + 8 <= end) {
        offset = uint64(extra, field);
      }
      break;
    }
    at += 4 + length;
  }
  return { compressedSize, size, offset };
}

function readEntries(directory: Uint8Array, count: number): Entry[] {
  const data = view(directory);
  const names = new TextDecoder('utf-8');
  const entries: Entry[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    if (at + ENTRY_SIZE > directory.length || data.getUint32(at, true) !== DIRECTORY_ENTRY) {
      throw new ZipError('the zip directory is damaged.');
    }
    const method = data.getUint16(at + 10, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const nameStart = at + ENTRY_SIZE;
    const extraStart = nameStart + nameLength;
    if (extraStart + extraLength + commentLength > directory.length) {
      throw new ZipError('the zip directory is damaged.');
    }
    const name = names.decode(directory.subarray(nameStart, extraStart));
    const sizes = zip64Extra(view(directory.subarray(extraStart, extraStart + extraLength)), {
      compressedSize: data.getUint32(at + 20, true),
      size: data.getUint32(at + 24, true),
      offset: data.getUint32(at + 42, true),
    });
    entries.push({ name, method, ...sizes });
    at = extraStart + extraLength + commentLength;
  }
  return entries;
}

/**
 * Inflate raw deflate data with the platform's `DecompressionStream`,
 * stopping at `limit` bytes.
 */
async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('this browser cannot decompress zip files (no DecompressionStream).');
  }
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      // A copy, so the stream gets a plain ArrayBuffer view, as it requires.
      controller.enqueue(new Uint8Array(data));
      controller.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ZipError('a file in the archive is larger than it claims.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Read a zip archive's central directory.
 *
 * @param source - The archive's bytes.
 * @returns The archive, whose files are read when asked for.
 * @throws {ZipError} When the file is not a zip archive, or its directory is
 * damaged.
 */
export async function openZip(source: ByteSource): Promise<ZipArchive> {
  const { offset, size, count } = await locateDirectory(source);
  const entries = readEntries(await source.read(offset, size), count);
  const byName = new Map<string, Entry>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, entry);
    }
  }

  const bytes = async (name: string): Promise<Uint8Array | undefined> => {
    const entry = byName.get(name.replace(/^\//, '').toLowerCase());
    if (entry === undefined) {
      return undefined;
    }
    if (entry.size > MAX_INFLATED_SIZE) {
      throw new ZipError(`${entry.name} is too large to read.`);
    }
    const header = await source.read(entry.offset, LOCAL_SIZE);
    const data = view(header);
    if (header.length < LOCAL_SIZE || data.getUint32(0, true) !== LOCAL_HEADER) {
      throw new ZipError(`${entry.name} is damaged.`);
    }
    const start = entry.offset + LOCAL_SIZE + data.getUint16(26, true) + data.getUint16(28, true);
    const stored = await source.read(start, entry.compressedSize);
    if (stored.length < entry.compressedSize) {
      throw new ZipError(`${entry.name} is damaged.`);
    }
    if (entry.method === STORED) {
      return stored;
    }
    if (entry.method === DEFLATED) {
      return inflate(stored, Math.min(entry.size, MAX_INFLATED_SIZE));
    }
    throw new ZipError(`${entry.name} is compressed in a way this reader does not know (method ${entry.method}).`);
  };

  return {
    names: entries.map(entry => entry.name),
    has: (name: string): boolean => byName.has(name.replace(/^\//, '').toLowerCase()),
    bytes,
    text: async (name: string): Promise<string | undefined> => {
      const found = await bytes(name);
      return found === undefined ? undefined : new TextDecoder('utf-8').decode(found);
    },
  };
}
