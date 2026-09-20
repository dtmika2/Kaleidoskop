// Which cursor is showing, and where. The dot is the cursor inside the disc and
// for a margin past its rim; the OS cursor takes over beyond that.
//
// This exists because the tests cannot see the page. b29 hid the OS cursor to
// make room for a dot that was still switched off in CSS, and every suite
// passed while the disc had no cursor at all. This cannot catch that -- only an
// eye on the device can -- but it does pin the half that is logic: the
// threshold, and that crossing it either way actually switches something.
//
//   node tools/cursor-test.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const app = install(fs.readFileSync(process.argv[2], 'utf8'));
const RADIUS = 450;          // the harness stage rect is 900x900 at the origin
const MARGIN = 1.1;          // CURSOR_HIDE_MARGIN in circle.html
const EDGE = RADIUS * MARGIN;

const osCursorShowing = () =>
  (app.els.stage.style.cursor || '').startsWith('url(') &&
  app.document.body.style.cursor !== 'none';

function at(dist) {
  app.move(450, 450 + dist); // straight down from the centre
  app.advance(20);
  return osCursorShowing() ? 'os cursor' : 'dot only';
}

// Interleaved so that toggling back is exercised, not just the first crossing.
const cases = [
  [0, 'dot only'], [300, 'dot only'], [RADIUS - 1, 'dot only'],
  [RADIUS + 20, 'dot only'],                       // the margin past the rim
  [EDGE - 1, 'dot only'], [EDGE + 1, 'os cursor'],
  [600, 'os cursor'], [440, 'dot only'], [700, 'os cursor'],
];

let bad = 0;
for (const [dist, want] of cases) {
  const got = at(dist);
  const ok = got === want;
  if (!ok) bad++;
  console.log('  ' + String(Math.round(dist)).padStart(4) + 'px from centre: '
    + got.padEnd(9) + ' (want ' + want.padEnd(9) + ') ' + (ok ? 'ok' : 'FAIL'));
}

if (bad) {
  console.error('\n' + bad + ' of ' + cases.length + ' positions showed the wrong cursor');
  process.exit(1);
}
console.log('\ncursor OK: hidden out to ' + MARGIN + ' radii, OS cursor beyond');
