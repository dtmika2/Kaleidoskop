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
// Position is left to CSS (a 50% offset with a translate), so the size is the
// whole of what latchLayout decides and the whole of what can churn.
const box = () => wrap.style.width + ' x ' + wrap.style.height;

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

// A flip to a narrower portrait shrinks vmin, which is the interesting case:
// it must be taken at once rather than sitting out LAYOUT_SETTLE_MS the way a
// bar would. (Flipping 1280x800 to 800x1280 leaves vmin alone and would prove
// nothing.)
app.orient(700, 1280);
app.advance(100);
const portrait = box();
check('a flip that shrinks vmin is adopted at once, not after the delay',
  parseInt(portrait, 10) === Math.round(700 * 0.94), portrait);

app.orient(W, H);
app.advance(100);
check('and back again', box() === settled, box());


// --- holding position on the screen while a bar comes and goes ---------------
// Size is only half of it. The viewport really does shrink when a bar appears
// (measured on the tablet: 533x853 becomes 533x775), so anything centred in the
// viewport moves by half the difference between the top and bottom insets. The
// circle has to stay where it is on the SCREEN, which is the viewport position
// plus however far the viewport itself has been pushed down.
const W2 = 533, FULL = 853, IN_TOP = 24, IN_BOTTOM = 54;
const WITH_BARS = FULL - IN_TOP - IN_BOTTOM;
const screenCentre = inset => parseFloat(wrap.style.top) + inset;

console.log('');
app.setSafeArea();
app.resize(W2, FULL);
app.advance(100);
const base = screenCentre(0);

app.setSafeArea({ top: IN_TOP, bottom: IN_BOTTOM });
app.resize(W2, WITH_BARS);
app.advance(100);
const shown = screenCentre(IN_TOP);

app.setSafeArea();
app.resize(W2, FULL);
app.advance(100);
const back = screenCentre(0);

check('the circle holds its place on screen while a bar shows',
  Math.abs(shown - base) < 1, 'moved ' + Math.abs(shown - base).toFixed(1) + 'px');
check('and is back where it started once it goes',
  Math.abs(back - base) < 1, 'moved ' + Math.abs(back - base).toFixed(1) + 'px');

// The same, with the platform reporting no insets at all -- which is what this
// device does, so the assumed share is the path that actually runs on it.
const blind = install(fs.readFileSync(process.argv[2], 'utf8'));
const blindWrap = blind.els.stageWrap;
blind.resize(W2, FULL);
blind.advance(100);
const blindBase = parseFloat(blindWrap.style.top);
blind.resize(W2, WITH_BARS);
blind.advance(100);
const blindShown = parseFloat(blindWrap.style.top) + IN_TOP;
check('and stays close even when no insets are reported',
  Math.abs(blindShown - blindBase) < 6,
  'moved ' + Math.abs(blindShown - blindBase).toFixed(1) + 'px on the assumed share');

if (fails) {
  console.error('\n' + fails + ' check(s) failed');
  process.exit(1);
}
console.log('\nlayout OK: a system bar passing through moves nothing; real changes are honoured');
