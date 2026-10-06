const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
/** 1980-01-01 00:00, the earliest DOS date: every entry gets it so equal input gives equal bytes. */
const DOS_DATE = (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

/**
 * Read a zip archive into path → bytes. Directories are skipped and backslashes become `/`.
 * `inflateRaw` must accept a raw deflate stream (e.g. node:zlib inflateRawSync).
 */
export function readZip(bytes: Uint8Array, inflateRaw: (d: Uint8Array) => Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === END && i + 22 + view.getUint16(i + 20, true) <= bytes.length) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('not a zip file (no end of central directory record)');
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR) throw new Error('zip64 archives are not supported');
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error('multi-disk zip archives are not supported');
  const count = view.getUint16(end + 10, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('zip64 archives are not supported');
  if (cdOffset + cdSize > end) throw new Error('corrupt zip: central directory runs past its end record');

  const names = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let o = cdOffset;
  for (let n = 0; n < count; n++) {
    if (o + 46 > end || view.getUint32(o, true) !== CENTRAL) throw new Error(`corrupt zip: bad central directory entry ${n}`);
    const flags = view.getUint16(o + 8, true);
    const method = view.getUint16(o + 10, true);
    const crc = view.getUint32(o + 16, true);
    const packed = view.getUint32(o + 20, true);
    const size = view.getUint32(o + 24, true);
    const nameLen = view.getUint16(o + 28, true);
    const next = o + 46 + nameLen + view.getUint16(o + 30, true) + view.getUint16(o + 32, true);
    const local = view.getUint32(o + 42, true);
    const name = names.decode(bytes.subarray(o + 46, o + 46 + nameLen)).replace(/\\/g, '/');
    o = next;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error(`${name} is encrypted; encrypted zips are not supported`);
    if (packed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new Error('zip64 archives are not supported');
    if (method !== 0 && method !== 8) throw new Error(`${name} uses compression method ${method}; only stored and deflated entries are supported`);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) throw new Error(`corrupt zip: bad local header for ${name}`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + packed > bytes.length) throw new Error(`corrupt zip: ${name} runs past the end of the file`);
    const raw = bytes.subarray(start, start + packed);
    let data: Uint8Array;
    try {
      const out = method === 0 ? raw : inflateRaw(raw);
      data = new Uint8Array(out);
    } catch (e) {
      throw new Error(`corrupt zip: ${name} does not inflate (${(e as Error).message})`);
    }
    if (data.length !== size || crc32(data) !== crc) throw new Error(`corrupt zip: ${name} fails its size or CRC check`);
    files.set(name, data);
  }
  return files;
}

/**
 * Write a zip archive, deterministic for equal input: entries in the given order, all dated
 * 1980-01-01, deflated only when that shrinks them. `deflateRaw` must produce a raw deflate
 * stream (e.g. node:zlib deflateRawSync).
 */
export function writeZip(files: Iterable<[string, Uint8Array]>, deflateRaw: (d: Uint8Array) => Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, data] of files) {
    const name = enc.encode(path.replace(/\\/g, '/'));
    const deflated = deflateRaw(data);
    const method = deflated.length < data.length ? 8 : 0;
    const body = method ? deflated : data;
    const crc = crc32(data);
    if (offset + 30 + name.length + body.length > 0xffffffff || data.length >= 0xffffffff) throw new Error('archive too large: zip64 is not supported');
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, LOCAL, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, UTF8_FLAG, true);
    h.setUint16(8, method, true);
    h.setUint16(12, DOS_DATE, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    head.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, CENTRAL, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(10, method, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    cd.set(name, 46);
    locals.push(head, body);
    centrals.push(cd);
    offset += head.length + body.length;
  }
  if (centrals.length >= 0xffff) throw new Error('too many entries: zip64 is not supported');
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const tail = new Uint8Array(22);
  const t = new DataView(tail.buffer);
  t.setUint32(0, END, true);
  t.setUint16(8, centrals.length, true);
  t.setUint16(10, centrals.length, true);
  t.setUint32(12, cdSize, true);
  t.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let o = 0;
  for (const p of [...locals, ...centrals, tail]) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
