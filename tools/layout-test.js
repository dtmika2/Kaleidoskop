// Android reveals a system bar when the pointer reaches the top or bottom of the
// screen, and the viewport shrinks by its height. Nothing in a web page can stop
// the reveal. What it can stop is answering a transient shrink by relaying out:
// before b38 the circle was sized in vmin, so the bar appearing resized it,
// reallocated and repainted the canvas at a new resolution, and rebuilt the clue
// field mid-reveal. On the tablet that read as the whole app flickering and
// changing resolution.
//
// So: a bar passing through must change nothing, while a real change -- an
// orientation flip, or a smaller viewport that persists -- must still be
// honoured.
//
//   node tools/layout-test.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const app = install(fs.readFileSync(process.argv[2], 'utf8'));
const wrap = app.els.stageWrap;
const box = () => wrap.style.width + ' x ' + wrap.style.height
  + ' at ' + wrap.style.left + ',' + wrap.style.top;

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (detail ? '   ' + detail : ''));
}

const BAR = 48;                    // roughly a system bar in CSS px
const W = 1280, H = 800;

app.resize(W, H);
app.advance(100);
const settled = box();
check('laid out on load', /\d+px/.test(wrap.style.width), settled);

// --- a bar passing through ---------------------------------------------------
app.resize(W, H - BAR);
app.advance(100);
check('a bar revealing changes nothing', box() === settled, box());

app.resize(W, H);                  // and hiding again
app.advance(100);
check('and hiding again changes nothing', box() === settled, box());

// Repeatedly, the way an impatient pointer at the top edge would.
for (let i = 0; i < 5; i++) {
  app.resize(W, H - BAR); app.advance(60);
  app.resize(W, H);       app.advance(60);
}
check('nor does it after five reveals in a row', box() === settled, box());

// --- a shrink that is actually real ------------------------------------------
app.resize(W, H - 200);
app.advance(300);
check('a fresh shrink is not adopted immediately', box() === settled, box());
app.advance(2500);                 // outlasts LAYOUT_SETTLE_MS
const shrunk = box();
check('but is adopted once it persists', shrunk !== settled, shrunk);

// --- growing back, and turning the tablet over -------------------------------
app.resize(W, H);
app.advance(100);
check('growing back is adopted at once', box() === settled, box());

app.orient(H, W);                  // portrait
app.advance(100);
const portrait = box();
check('an orientation flip is adopted at once', portrait !== settled, portrait);

app.orient(W, H);
app.advance(100);
check('and back again', box() === settled, box());

if (fails) {
  console.error('\n' + fails + ' check(s) failed');
  process.exit(1);
}
console.log('\nlayout OK: a system bar passing through moves nothing; real changes are honoured');
