/** A minimal ZIP writer. Files are stored uncompressed: audio barely shrinks and this keeps it instant. */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = files.map((f) => ({ name: encoder.encode(f.name), data: f.data, crc: crc32(f.data) }));
  const size = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length + 46 + e.name.length, 22);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let pos = 0;

  // Shared by the local header (from its version field) and the central directory entry.
  const fields = (e: (typeof entries)[number]) => {
    view.setUint16(pos, 20, true); // version needed
    view.setUint16(pos + 2, 0x0800, true); // names are UTF-8
    view.setUint16(pos + 4, 0, true); // stored
    view.setUint16(pos + 6, 0, true); // time
    view.setUint16(pos + 8, 0x21, true); // date: 1 Jan 1980
    view.setUint32(pos + 10, e.crc, true);
    view.setUint32(pos + 14, e.data.length, true);
    view.setUint32(pos + 18, e.data.length, true);
    view.setUint16(pos + 22, e.name.length, true);
    view.setUint16(pos + 24, 0, true); // extra field
    pos += 26;
  };

  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true);
    pos += 4;
    fields(e);
    out.set(e.name, pos);
    pos += e.name.length;
    out.set(e.data, pos);
    pos += e.data.length;
  }

  const directory = pos;
  entries.forEach((e, i) => {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true); // version made by
    pos += 6;
    fields(e);
    // comment length, disk number, internal and external attributes are all zero
    view.setUint32(pos + 10, offsets[i], true);
    pos += 14;
    out.set(e.name, pos);
    pos += e.name.length;
  });

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - directory, true);
  view.setUint32(pos + 16, directory, true);
  return out;
}
