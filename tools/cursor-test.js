// Which cursor is showing, and where, and what happens when the pointer is
// pushed past the rim.
//
// This exists because the tests cannot see the page. b29 hid the OS cursor to
// make room for a dot that was still switched off in CSS, and every suite
// passed while the disc had no cursor at all. This cannot catch that -- only an
// eye on the device can -- but it does pin the half that is logic.
//
// It measures where the boundary falls rather than asserting a number, because
// the margin is a tuning decision that has already moved once, and a test that
// repeats it fails on a change that is not a fault.
//
//   node tools/cursor-test.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const app = install(fs.readFileSync(process.argv[2], 'utf8'));
const RADIUS = 450;                     // the harness stage rect is 900x900 at the origin
const CORNER = RADIUS * Math.SQRT2;     // past here there is no stage box left to be in

const osCursorShowing = () =>
  (app.els.stage.style.cursor || '').startsWith('url(') &&
  app.document.body.style.cursor !== 'none';

function at(dist) {
  app.move(450, 450 + dist);            // straight down from the centre
  app.advance(20);
  return osCursorShowing();
}

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (detail ? '   ' + detail : ''));
}

// Bisect for the flip. Confirm the two ends first, or the search means nothing.
check('dot only at the centre of the disc', !at(0));
check('OS cursor well outside the disc', at(RADIUS * 3));

let lo = 0, hi = RADIUS * 3;
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2;
  if (at(mid)) hi = mid; else lo = mid;
}
const edge = (lo + hi) / 2;
const margin = edge / RADIUS;
console.log('\n  the OS cursor appears at ' + edge.toFixed(0) + 'px from centre'
  + '   = ' + margin.toFixed(2) + ' radii\n');

check('the hidden area reaches past the rim', margin > 1.01, margin.toFixed(2) + ' radii');
check('and stops short of the box corners, so the OS cursor stays reachable',
  edge < CORNER, edge.toFixed(0) + 'px vs corner at ' + CORNER.toFixed(0) + 'px');

// Crossing back and forth, so a toggle that sticks one way is caught.
const walk = [0, 300, RADIUS - 10, edge - 20, edge + 20, 800, edge - 20, 0, 800];
const want = walk.map(d => d > edge);
const got = walk.map(d => at(d));
check('toggles both ways along a walk in and out',
  got.every((g, i) => g === want[i]),
  walk.map((d, i) => Math.round(d) + (got[i] ? ':os' : ':dot')).join('  '));

// --- pushing past the rim ----------------------------------------------------
// Beyond the rim pan is clamped and the view stops dead, which is
// indistinguishable from a freeze. The dot swells instead, so the stillness
// reads as the edge of the picture rather than as a fault.
//
// The circle has radius 450 and the 1.6 gain puts pan at 450 + offset * 1.6, so
// the rim is reached 281px from centre on screen and a full RIM_PUSH_FULL
// overshoot at 350px.
app.openReadout();
app.advance(150);

const push = () => {
  const m = app.line('rim').match(/push\s+([\d.]+)/);
  return m ? Number(m[1]) : null;
};
const dotScale = () => {
  const m = (app.els.cursorDot.style.transform || '').match(/scale\(([\d.]+)\)/);
  return m ? Number(m[1]) : null;
};
const dotColour = () => app.els.cursorDot.style.background || '-';

// The dot breathes while it is being pushed, so its scale is only meaningful
// as a range sampled over time rather than as a single reading.
function scaleRange(ms) {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < ms; t += 80) {
    app.advance(80);
    const v = dotScale();
    if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  return { lo, hi };
}

const standAt = off => { app.move(450, 450 + off); app.advance(150); };

console.log('\n  offset   rim push   dot scale');
const seen = [];
for (const off of [0, 200, 281, 315, 350, 450]) {
  standAt(off);
  seen.push({ off, push: push(), scale: dotScale() });
  console.log('    ' + String(off).padStart(4) + '      ' + String(push()).padStart(5)
    + '       ' + String(dotScale()).padStart(5));
}
console.log('');

const inside = seen.filter(r => r.off <= 281);
const part = seen.find(r => r.off === 315);
const hard = seen.find(r => r.off === 450);

check('no push while the pointer is still within the disc',
  inside.every(r => r.push === 0), inside.map(r => r.off + ':' + r.push).join(' '));
check('partial push part way past the rim',
  part.push > 0.2 && part.push < 0.8, String(part.push));
check('saturates when pushed hard', hard.push === 1, String(hard.push));
// Bloat is capped well under double, and the breath is shallow and slow.
standAt(450);
const range = scaleRange(3000);
check('the dot grows, but not by much, and never past the cap',
  range.hi > 1.2 && range.hi <= 1.52, 'peaks at ' + range.hi.toFixed(2));
check('and breathes gently rather than blinking',
  range.hi - range.lo > 0.02 && range.hi - range.lo < 0.15,
  'swings ' + (range.hi - range.lo).toFixed(3) + ' over 3s');
check('and turns red when pushed hard', /^#[ef]/i.test(dotColour()), dotColour());
standAt(0);
check('and returns to normal back inside', dotScale() === 1 && push() === 0,
  'scale ' + dotScale() + ', push ' + push());

if (fails) {
  console.error('\n' + fails + ' check(s) failed');
  process.exit(1);
}
console.log('\ncursor OK: hidden out to ' + margin.toFixed(2) + ' radii, and the rim pushes back');
