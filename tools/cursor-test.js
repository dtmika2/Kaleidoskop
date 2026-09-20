// Which cursor is showing, and where. The dot is the cursor inside the disc and
// for a margin past its rim; the OS cursor takes over beyond that.
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

// Bisect for the flip. Start by confirming the two ends are what they should be,
// or the search below is meaningless.
const atCentre = at(0);
const farOut = at(RADIUS * 3);
check('dot only at the centre of the disc', !atCentre);
check('OS cursor well outside the disc', farOut);

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

if (fails) {
  console.error('\n' + fails + ' check(s) failed');
  process.exit(1);
}
console.log('\ncursor OK: hidden out to ' + margin.toFixed(2) + ' radii, OS cursor beyond');
