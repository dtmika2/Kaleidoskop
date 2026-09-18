// The idle reset has one job: a visitor who solves a clue and walks away must
// not leave it sitting there for the next one. This checks that directly --
// stand on an answer until the word is fully revealed, wait out the idle
// stretch, come back to the same spot, and see what is there.
//
// It is the test the recentring never had. Four builds went into making the
// view return to the middle, and none of them measured whether that actually
// took the answer away, because moving the view could not do it on a device
// where the pointer cannot be moved with it.
//
//   node tools/reset-test.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const app = install(fs.readFileSync(process.argv[2], 'utf8'));
const { els } = app;

// The stage rect is 900x900 at the origin, so this inverts the 1.6 pointer gain
// to find the screen position that puts pan on a given source coordinate.
const clientFor = v => (v - 450) / 1.6 + 450;
const mod = v => ((v % 900) + 900) % 900;
// ring opacity is proximity * 0.9, and proximity is 1 - dist/500, so the panel
// hands back the distance to the nearest answer. Letters appear inside 50.
const REVEAL_DIST = 50;
const distToNearest = () => 500 * (1 - (+(els.ring.style.opacity || 0)) / 0.9);
const lettersLit = () => els.wordOverlay.children.filter(c => c.classList.contains('lit')).length;
const offsetNow = () => {
  const m = app.line('offset').match(/offset\s+(-?\d+),\s*(-?\d+)/);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
};

const TARGET = { x: 444, y: 370 }; // the first pattern, as authored
const WORD_LEN = 7;                // 'Zrcadlo'
const RUNS = 8;

app.openReadout();
let fails = 0;

for (let run = 1; run <= RUNS; run++) {
  // Walk to wherever that answer currently is and solve it.
  const o = offsetNow();
  const tx = mod(TARGET.x - o.x), ty = mod(TARGET.y - o.y);
  app.move(clientFor(tx), clientFor(ty));
  app.advance(200);
  const dBefore = distToNearest(), litBefore = lettersLit();

  app.advance(22000);                        // leave; the idle reset fires

  app.move(clientFor(tx), clientFor(ty) + 1); // next visitor, same spot, a nudge
  app.advance(200);
  const dAfter = distToNearest(), litAfter = lettersLit();

  const ok = dBefore < 5 && litBefore === WORD_LEN
    && litAfter === 0 && dAfter >= REVEAL_DIST * 3;
  if (!ok) fails++;
  console.log('run ' + run + ': solved (dist ' + dBefore.toFixed(0) + ', ' + litBefore + '/' + WORD_LEN
    + ' lit) -> after reset (dist ' + dAfter.toFixed(0) + ', ' + litAfter + ' lit)   ' + (ok ? 'ok' : 'FAIL'));
}

if (fails) {
  console.error('\n' + fails + ' of ' + RUNS + ' resets left the answer within reach');
  process.exit(1);
}
console.log('\nreset OK: every reset cleared the word and moved its answer more than '
  + (REVEAL_DIST * 3) + ' from where it was solved');
