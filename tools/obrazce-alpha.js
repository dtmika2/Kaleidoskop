// Turns the clue artwork into something tintable.
//
// The four images in Obrazce/zdroj are white line art on a solid black
// background, fully opaque -- a greyscale mask in disguise. Drawn as they are
// they would paint a black rectangle over the kaleidoscope, and there would be
// no way to colour them per pattern. This rewrites each one so the drawing
// lives in the alpha channel instead: RGB becomes white everywhere and alpha
// becomes the old luminance, so black turns transparent, white stays solid, and
// the antialiased edges in between become partial alpha rather than grey
// fringes. After that the app can fill them with any colour it likes.
//
// No dependencies. A PNG is a few length-tagged chunks wrapping a zlib stream
// of filtered scanlines, and Node has zlib, so decoding is inflate plus undoing
// the five row filters, and encoding is the same in reverse with a CRC on each
// chunk. This is not a general PNG library: it handles 8-bit truecolour+alpha,
// which is what these four files are, and refuses anything else rather than
// writing a plausible-looking wrong answer.
//
//   node tools/obrazce-alpha.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC_DIR = path.join(__dirname, '..', 'Obrazce', 'zdroj');
const OUT_DIR = path.join(__dirname, '..', 'Obrazce');

// The app needs ASCII paths: sw.js precaches with cache.addAll, which is
// all-or-nothing, so one URL that does not match byte for byte stops the worker
// installing and the whole app stops updating.
const NAMES = {
  'Zrcadlo.png': 'zrcadlo.png',
  'Jeskyně.png': 'jeskyne.png',
  'Spirála.png': 'spirala.png',
  'Kyvadlo.png': 'kyvadlo.png',
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function decode(file) {
  const b = fs.readFileSync(file);
  if (!b.slice(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG: ' + file);

  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p);
    const tag = b.toString('ascii', p + 4, p + 8);
    const data = b.slice(p + 8, p + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      // interlacing would reorder the scanlines and is not handled
      if (data[12] !== 0) throw new Error('interlaced PNG not supported: ' + file);
    } else if (tag === 'IDAT') {
      idat.push(data);
    } else if (tag === 'IEND') {
      break;
    }
    p += 12 + len;
  }
  if (depth !== 8 || type !== 6) {
    throw new Error('expected 8-bit truecolour+alpha, got depth ' + depth + ' type ' + type + ': ' + file);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const CH = 4;
  const stride = w * CH;
  if (raw.length < h * (stride + 1)) throw new Error('short image data: ' + file);

  // Each scanline is prefixed with its filter type and is predicted from the
  // pixel to the left (a), the one above (b) and the one above-left (c).
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= CH ? cur[i - CH] : 0;
      const bb = prev[i];
      const c = i >= CH ? prev[i - CH] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += bb;
      else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) {
        const pp = a + bb - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      } else if (f !== 0) {
        throw new Error('unknown row filter ' + f + ' at line ' + y + ': ' + file);
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, pixels: out };
}

function chunk(tag, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encode(w, h, pixels) {
  const stride = w * 4;
  // Filter type 0 on every row. These are flat-colour images with a lot of
  // identical pixels, so deflate does the work and a filter search would buy
  // very little for the complexity.
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolour + alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    PNG_MAGIC,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function convert(srcName, outName) {
  const { w, h, pixels } = decode(path.join(SRC_DIR, srcName));
  const out = Buffer.alloc(pixels.length);
  let solid = 0;
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2], a = pixels[i * 4 + 3];
    // Rec. 601 luma, then scaled by whatever alpha the file already carried --
    // these are fully opaque today, but a re-export with real transparency
    // should not come out solid.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const alpha = Math.round(lum * (a / 255));
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = alpha;
    if (alpha > 250) solid++;
  }
  const png = encode(w, h, out);
  fs.writeFileSync(path.join(OUT_DIR, outName), png);
  console.log('  ' + srcName.padEnd(16) + ' -> ' + outName.padEnd(14)
    + w + 'x' + h + '   ' + (100 * solid / (w * h)).toFixed(1) + '% solid   '
    + (png.length / 1024).toFixed(0) + ' KB');
}

if (!fs.existsSync(SRC_DIR)) {
  console.error('no such directory: ' + SRC_DIR);
  console.error('the untouched originals belong there, under their original names');
  process.exit(1);
}

console.log('luminance -> alpha, white RGB:');
let failed = 0;
for (const [srcName, outName] of Object.entries(NAMES)) {
  try {
    convert(srcName, outName);
  } catch (err) {
    console.error('  ' + srcName + ': ' + err.message);
    failed++;
  }
}
if (failed) process.exit(1);
