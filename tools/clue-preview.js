// Renders the clue art to a PNG so it can be looked at without a tablet.
//
// Be clear about what this is: it RE-IMPLEMENTS composeClue's compositing, it
// does not exercise it. The other tools run the app's own code; this one only
// agrees with it by hand, so if the two ever disagree the likeliest answer is
// that this file is stale. It exists because the rest of the suite runs against
// a DOM stub with no styling and no layout, which means a picture that is
// composed, tinted and invisible passes every check -- and b32 shipped exactly
// that, a shadow stack tuned for thick letters that came to nothing on 2px line
// art. It took rendering it to see.
//
// The background is a stand-in for the kaleidoscope: busy, bright, and in the
// same colour family as the tint, which is the case the shadow has to survive.
//
//   node tools/clue-preview.js [level 1-16] [out.png] [noshadow]
const fs = require('fs'), path = require('path'), m = require('module');

const ROOT = path.join(__dirname, '..');
const convSrc = fs.readFileSync(path.join(__dirname, 'obrazce-alpha.js'), 'utf8')
  .replace(/\nif \(!fs\.existsSync\(SRC_DIR\)\)[\s\S]*$/, '\nmodule.exports={decode,encode};\n');
const mod = new m.Module('conv');
mod.filename = path.join(__dirname, 'obrazce-alpha.js');
mod.paths = m.Module._nodeModulePaths(__dirname);
mod._compile(convSrc, mod.filename);
const { decode, encode } = mod.exports;

const W = 420, H = 420, SCALE = 1;
const PAD = 34, CELL = 6, LEVELS = 16;
const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
const SHADOWS = [
  { blur: 22, y: 10, c: [0,0,0], a: 0.85, times: 1 },
  { blur: 9,  y: 4,  c: [0,0,0], a: 0.95, times: 2 },
  { blur: 5,  y: 0,  c: [0,0,0], a: 1.0,  times: 3 },
  { blur: 26, y: 0,  c: [255,138,61], a: 0.55, times: 2 },
];
const TINT = [255, 138, 61];

// --- art fitted into the box, dithered, as an alpha field --------------------
function artAlpha(file, level) {
  const img = decode(path.join(ROOT, file));
  const s = Math.min((W - PAD*2) / img.w, (H - PAD*2) / img.h);
  const dw = img.w * s, dh = img.h * s;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.round((x - ox) / s), sy = Math.round((y - oy) / s);
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    const cellX = Math.floor(x / CELL) % 4, cellY = Math.floor(y / CELL) % 4;
    if (BAYER[cellY * 4 + cellX] >= level) continue;          // dither
    a[y * W + x] = img.pixels[(sy * img.w + sx) * 4 + 3] / 255;
  }
  return a;
}

// --- separable box blur, three passes ~ gaussian -----------------------------
function blur(src, radius) {
  if (radius < 1) return src.slice();
  let buf = src.slice(), tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let d = -radius; d <= radius; d++) { const xx = x + d; if (xx >= 0 && xx < W) { sum += buf[y*W+xx]; n++; } }
      tmp[y*W+x] = sum / n;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let d = -radius; d <= radius; d++) { const yy = y + d; if (yy >= 0 && yy < H) { sum += tmp[yy*W+x]; n++; } }
      buf[y*W+x] = sum / n;
    }
  }
  return buf;
}

// --- background: something busy and bright, as the kaleidoscope is -----------
function background() {
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const v = 90 + 70 * Math.sin(x / 26) * Math.cos(y / 31) + 40 * Math.sin((x + y) / 14);
    px[i] = Math.max(0, Math.min(255, v * 1.15));
    px[i+1] = Math.max(0, Math.min(255, v * 0.85));
    px[i+2] = Math.max(0, Math.min(255, v * 0.7));
    px[i+3] = 255;
  }
  return px;
}

function render(level, withShadows) {
  const px = background();
  const a = artAlpha('Obrazce/zrcadlo.png', level);
  const over = (i, c, alpha) => {
    for (let k = 0; k < 3; k++) px[i+k] = Math.round(px[i+k] * (1 - alpha) + c[k] * alpha);
  };
  if (withShadows) {
    for (const sh of SHADOWS) for (let rep = 0; rep < (sh.times || 1); rep++) {
      const b = blur(a, Math.max(1, Math.round(sh.blur / 2 / 1.7)));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sy = y - sh.y;
        if (sy < 0 || sy >= H) continue;
        const v = b[sy * W + x] * sh.a;
        if (v > 0.002) over((y*W+x)*4, sh.c, Math.min(1, v));
      }
    }
  }
  for (let i = 0; i < W*H; i++) if (a[i] > 0) over(i*4, TINT, a[i]);
  return encode(W, H, px);
}

const level = Math.max(1, Math.min(LEVELS, Number(process.argv[2]) || LEVELS));
const out = process.argv[3] || 'clue-preview.png';
const mode = process.argv[4] === 'noshadow' ? 'noshadow' : 'shadow';
fs.writeFileSync(out, render(level, mode !== 'noshadow'));
console.log('wrote ' + out + '   level ' + level + '/' + LEVELS + '   ' + mode);
