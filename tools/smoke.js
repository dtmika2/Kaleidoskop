// Does the script run, and do the pointer handlers survive being called? Node
// only parses with --check, which is why b23 shipped with a deleted variable
// declaration -- valid syntax that threw at runtime, so every pointermove died
// before reaching the mapping and nothing moved in any mode.
//
//   node tools/smoke.js <extracted-script.js>
const fs = require('fs');
const { install } = require('./harness.js');

let app;
try {
  app = install(fs.readFileSync(process.argv[2], 'utf8'));
} catch (err) {
  console.error('TOP-LEVEL THREW: ' + err.message);
  process.exit(1);
}

// Fire the handlers that carry the interaction, twice, so paths that need a
// seeding event are actually exercised.
try {
  app.down();
  app.move(450, 450);
  app.move(480, 430);
  app.move(510, 400);
  if (app.listeners.document.pointerlockchange) app.listeners.document.pointerlockchange();
  app.move(520, 390);
  app.advance(100);
} catch (err) {
  console.error('HANDLER THREW: ' + err.message);
  process.exit(1);
}

console.log('smoke OK: script ran and pointer handlers executed cleanly');
