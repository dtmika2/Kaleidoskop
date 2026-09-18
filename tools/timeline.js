// Prints what the app is doing over virtual time, for when the question is not
// "does it throw" but "what does it actually do between one second and the
// next". It is what showed that b27's glide ran exactly as written and was
// still wrong -- clearing in half a second while dragging the view a third of
// the way across the circle on its own.
//
//   node tools/timeline.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

const app = install(fs.readFileSync(process.argv[2], 'utf8'));

function readout(label) {
  console.log(String(label).padEnd(26), '|', app.line('offset').padEnd(26),
    '|', app.line('pan').padEnd(20), '|', app.line('reshuffle'));
}

app.openReadout();

// Park the pointer near the bottom of the screen, then go idle so the reset
// fires, then resume. pan should track the pointer throughout and be entirely
// unmoved by the reset -- the source is what moves.
app.move(450, 820); app.advance(100); readout('pointer parked');
app.advance(22000);                    readout('after 20s idle');
for (let i = 0; i < 6; i++) {
  app.move(450, 820 + (i % 2 ? 6 : 0));
  app.advance(100);
  readout('resume +' + ((i + 1) * 100) + 'ms');
}
