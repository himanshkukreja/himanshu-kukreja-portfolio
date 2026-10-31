/**
 * Byte-level checks for avatar images, with no decoder: what a file really is (magic bytes, not the
 * name or the browser's MIME guess), and for the cropped output we store, its pixel size and
 * whether it still carries metadata (EXIF / XMP / IPTC, where a phone puts GPS).
 * Pure functions on bytes: used by the picker (before the crop) and the upload route (after it).
 */

export type ImageFormat = "jpeg" | "png" | "webp" | "heic" | "gif";

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

/** What the bytes are, from the file signature. */
export function sniffImage(b: Uint8Array): ImageFormat | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (ascii(b, 0, 4) === "GIF8") return "gif";
  // ISO-BMFF: [size]["ftyp"][brand]: HEIC/HEIF from phones
  if (ascii(b, 4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 4))) return "heic";
  return null;
}

export type StoredImageInfo = { format: "webp" | "jpeg"; width: number; height: number; hasMetadata: boolean };

/** Reads a WebP or JPEG's size and metadata flags; null when the structure doesn't hold together. */
export function inspectStoredImage(b: Uint8Array): StoredImageInfo | null {
  const f = sniffImage(b);
  if (f === "webp") return inspectWebp(b);
  if (f === "jpeg") return inspectJpeg(b);
  return null;
}

const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

function inspectWebp(b: Uint8Array): StoredImageInfo | null {
  const riffSize = u32le(b, 4);
  if (riffSize < 12 || riffSize + 8 > b.length) return null;
  const end = riffSize + 8;
  let i = 12;
  let width = 0, height = 0, hasMetadata = false, sawImage = false;
  while (i + 8 <= end) {
    const tag = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const data = i + 8;
    if (data + size > end) return null;
    if (tag === "VP8X" && size >= 10) {
      if (b[data] & 0x0c) hasMetadata = true; // EXIF (0x08) / XMP (0x04) flags
      width = u24le(b, data + 4) + 1;
      height = u24le(b, data + 7) + 1;
    } else if (tag === "VP8 " && size >= 10) {
      sawImage = true;
      if (!width && b[data + 3] === 0x9d && b[data + 4] === 0x01 && b[data + 5] === 0x2a) {
        width = u16le(b, data + 6) & 0x3fff;
        height = u16le(b, data + 8) & 0x3fff;
      }
    } else if (tag === "VP8L" && size >= 5) {
      sawImage = true;
      if (!width && b[data] === 0x2f) {
        const bits = u32le(b, data + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      }
    } else if (tag === "EXIF" || tag === "XMP ") {
      hasMetadata = true;
    }
    i = data + size + (size & 1);
  }
  if (!sawImage || !width || !height) return null;
  return { format: "webp", width, height, hasMetadata };
}

function inspectJpeg(b: Uint8Array): StoredImageInfo | null {
  let i = 2;
  let width = 0, height = 0, hasMetadata = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan: headers are done
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    // APP1 = EXIF / XMP, APP13 = IPTC (Photoshop): anything that can carry location or camera data
    if (marker === 0xe1 || marker === 0xed) hasMetadata = true;
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = u16be(b, i + 5);
      width = u16be(b, i + 7);
    }
    i += 2 + len;
  }
  if (!width || !height) return null;
  return { format: "jpeg", width, height, hasMetadata };
}

/**
 * The same image with every metadata block removed (no re-encode): JPEG APP1 (EXIF / XMP), APP13
 * (IPTC) and comments; WebP EXIF / XMP chunks (and their VP8X flags). Colour info (JFIF, ICC,
 * Adobe) stays. Canvas output is already pixels-only, but some encoders (Safari's JPEG) still write
 * an EXIF block of their own, and the server never relies on the browser for this.
 */
export function stripMetadata(b: Uint8Array): Uint8Array {
  const f = sniffImage(b);
  if (f === "jpeg") return stripJpeg(b);
  if (f === "webp") return stripWebp(b);
  return b;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b; // not a structure we understand: leave it (inspect will judge)
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push(b.subarray(i, i + (marker === 0xff ? 1 : 2)));
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return b;
    if (!(marker === 0xe1 || marker === 0xed || marker === 0xfe)) keep.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  keep.push(b.subarray(i)); // scan data to the end
  return concat(keep);
}

function stripWebp(b: Uint8Array): Uint8Array {
  const riffSize = u32le(b, 4);
  if (riffSize < 12 || riffSize + 8 > b.length) return b;
  const end = riffSize + 8;
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= end) {
    const tag = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const next = i + 8 + size + (size & 1);
    if (next > end + 1) return b;
    if (tag !== "EXIF" && tag !== "XMP ") {
      const chunk = b.slice(i, Math.min(next, end));
      if (tag === "VP8X" && size >= 10) chunk[8] &= ~0x0c; // clear the EXIF / XMP flags
      parts.push(chunk);
    }
    i = next;
  }
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  const n = body.length + 4;
  out[4] = n & 255;
  out[5] = (n >> 8) & 255;
  out[6] = (n >> 16) & 255;
  out[7] = (n >>> 24) & 255;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
