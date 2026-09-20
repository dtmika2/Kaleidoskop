// The clue picture has to arrive on the same schedule as the word: nothing at
// all until the first letters light, and complete on the frame the last letter
// lands. That is the property this file checks, since it is the one that was
// asked for and the one an implementation can quietly get wrong -- a picture
// that fades in on its own timer looks fine in isolation and wrong beside the
// letters.
//
// What it cannot check is whether the result is visible. The harness has no
// styling and no layout, so a picture that is composed, tinted and positioned
// off-screen passes everything here. Only the tablet settles that.
//
//   node tools/clue-test.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const script = fs.readFileSync(process.argv[2], 'utf8');
const app = install(script);

const clientFor = v => (v - 450) / 1.6 + 450;   // inverse of the 1.6 pointer gain
const mod = v => ((v % 900) + 900) % 900;

// proximity is 1 - dist/500, so these are the distances the thresholds sit at.
const REVEAL_START_DIST = 50;   // proximity 0.90, first two letters
const REVEAL_FULL_DIST = 10;    // proximity 0.98, whole word
const WORD_LEN = 7;
// Read back from the readout rather than repeated here: how many steps the
// reveal is cut into is a tuning decision, and a test that hardcodes it fails
// on a change that is not a fault.
let LEVELS = 0;

// The debug panel repaints on a 100ms interval, so anything that reads a line
// back has to give it more than that or it reads the previous position.
const SETTLE_MS = 150;

const FIRE = { x: 444, y: 370, image: 'zrcadlo.png' };   // Ohen / Zrcadlo
const EARTH = { x: 738, y: 481, image: 'jeskyne.png' };  // Zeme / Jeskyne

const lit = (ctx = app) =>
  ctx.els.wordOverlay.children.filter(c => c.classList.contains('lit')).length;

const clue = (ctx = app) => {
  const m = ctx.line('clue').match(/clue\s+(\S+)\s+level\s+(\d+)\/(\d+)(\s+NOT LOADED)?/);
  return m ? { image: m[1], level: +m[2], levels: +m[3], loaded: !m[4] } : null;
};

const offsetNow = (ctx = app) => {
  const m = ctx.line('offset').match(/offset\s+(-?\d+),\s*(-?\d+)/);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
};

// Stand a given distance from a pattern's current position, along +y.
function standNear(target, dist, ctx = app) {
  const o = offsetNow(ctx);
  const tx = mod(target.x - o.x), ty = mod(target.y - o.y);
  ctx.move(clientFor(tx), clientFor(ty + dist));
  ctx.advance(SETTLE_MS);
}

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (detail ? '   ' + detail : ''));
}

app.openReadout();
app.advance(SETTLE_MS);

// --- before the pictures have loaded -----------------------------------------
standNear(FIRE, 0);
const cold = clue();
check('a dead-on approach with nothing loaded still works',
  cold !== null && !cold.loaded && lit() === WORD_LEN,
  cold ? cold.image + ' level ' + cold.level + ' NOT LOADED, ' + lit() + '/7 letters' : 'no clue line');

// The kaleidoscope source texture loads through Image as well, so it is in the
// same batch; only the clue art is this file's business.
const clueSrcs = app.loadImages().filter(s => s.startsWith('Obrazce/'));
app.advance(SETTLE_MS);
LEVELS = clue().levels;
check('the reveal is cut into a sane number of steps', LEVELS >= WORD_LEN && LEVELS <= 256, LEVELS + ' steps');
check('all four clue pictures requested up front', clueSrcs.length === 4, clueSrcs.join(' '));
check('paths are ASCII under Obrazce/',
  clueSrcs.every(s => /^Obrazce\/[a-z]+\.png$/.test(s)), clueSrcs.join(' '));
check('the picture appears once its file arrives', clue().loaded, clue().image);

// --- the ramp ----------------------------------------------------------------
console.log('\n  distance  letters  clue level');
const rows = [];
for (const dist of [200, 80, 51, 50, 42, 34, 26, 18, 10, 0]) {
  standNear(FIRE, dist);
  const c = clue();
  rows.push({ dist, lit: lit(), level: c.level });
  console.log('    ' + String(dist).padStart(4) + '      ' + String(lit()).padStart(2) + '/7'
    + '      ' + String(c.level).padStart(2) + '/' + LEVELS);
}
console.log('');

const closing = rows.filter(r => r.dist <= REVEAL_START_DIST);
const monotonic = closing.every((r, i) => i === 0 || r.level >= closing[i - 1].level);
const far = rows.filter(r => r.dist > REVEAL_START_DIST);
const atStart = rows.find(r => r.dist === REVEAL_START_DIST);
const atFull = rows.find(r => r.dist === REVEAL_FULL_DIST);
const dead = rows.find(r => r.dist === 0);

check('nothing showing before the letters do', far.every(r => r.level === 0 && r.lit === 0));
check('picture starts with the first letters',
  atStart.level >= 1 && atStart.lit >= 2, 'level ' + atStart.level + ', ' + atStart.lit + ' letters');
check('picture completes with the last letter',
  atFull.level === LEVELS && atFull.lit === WORD_LEN, 'level ' + atFull.level + ', ' + atFull.lit + ' letters');
check('stays complete dead on target', dead.level === LEVELS && dead.lit === WORD_LEN);
check('level never goes backwards while closing in', monotonic);

// --- swapping and leaving ----------------------------------------------------
console.log('');
standNear(FIRE, 0);
check('fire pattern shows its own picture', clue().image === FIRE.image, clue().image);
standNear(EARTH, 0);
check('earth pattern swaps to its own', clue().image === EARTH.image, clue().image);
check('and is fully revealed there too', clue().level === LEVELS, 'level ' + clue().level);

standNear(EARTH, 200);
const backedOff = clue();
check('picture leaves once out of the reveal band', backedOff.level === 0,
  backedOff.image + ' level ' + backedOff.level);

// --- a missing file ----------------------------------------------------------
// A 404 on one picture must not take its word down with it, and must say so
// rather than leaving a silent blank.
console.log('');
const app2 = install(script);
app2.openReadout();
app2.advance(SETTLE_MS);
app2.loadImages(['jeskyne']);          // one 404, the rest fine
standNear(EARTH, 0, app2);

const broken = app2.line('clue');
const panel = app2.els.debugPanel.textContent || '';
check('a missing picture is reported, not thrown', /NOT LOADED/.test(broken), broken.trim());
check('and the log names it', panel.includes('clue image missing'),
  (panel.split('\n').find(l => l.includes('clue image missing')) || 'not in the log').trim());
check('the word still reveals without its picture', lit(app2) === WORD_LEN, lit(app2) + '/7 letters');

if (fails) {
  console.error('\n' + fails + ' check(s) failed');
  process.exit(1);
}
console.log('\nclue OK: the picture arrives with the first letters and completes with the last');
