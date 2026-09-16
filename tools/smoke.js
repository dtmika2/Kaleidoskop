// Minimal DOM stub: enough to execute circle.html's script and fire the events
// that matter. Node only parses with --check, which is why b23 shipped with a
// deleted variable declaration -- it was valid syntax and threw at runtime.
const fs = require('fs');
const path = process.argv[2];
const code = fs.readFileSync(path, 'utf8');

const listeners = { window: {}, document: {}, el: {} };

function makeStyle() {
  return new Proxy({}, {
    get: (t, k) => (k === 'setProperty' ? () => {} : (t[k] || '')),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(id) {
  const el = {
    id,
    style: makeStyle(),
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    dataset: {},
    width: 420, height: 420,
    clientWidth: 800, clientHeight: 800,
    textContent: '',
    innerHTML: '',
    children: [],
    appendChild(c) { this.children.push(c); },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
    getContext: () => new Proxy({}, { get: () => () => ({}) }),
    addEventListener(type, fn) { (listeners.el[id] ||= {})[type] = fn; },
    requestPointerLock: () => Promise.resolve(),
    requestFullscreen: () => Promise.resolve(),
  };
  return el;
}

const els = {};
const document = {
  documentElement: makeEl('html'),
  fullscreenElement: null,
  pointerLockElement: null,
  visibilityState: 'visible',
  getElementById: id => (els[id] ||= makeEl(id)),
  createElement: () => makeEl('created'),
  addEventListener(type, fn) { listeners.document[type] = fn; },
};

const window = {
  devicePixelRatio: 2,
  addEventListener(type, fn) { (listeners.window[type] ||= []).push(fn); },
  matchMedia: () => ({ matches: false }),
};

const errors = [];
global.window = window;
global.document = document;
global.navigator = { maxTouchPoints: 5, serviceWorker: { controller: null, addEventListener() {}, register: () => Promise.resolve({ update() {} }) } };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.matchMedia = window.matchMedia;
global.getComputedStyle = () => ({ fontSize: '40px' });
global.Image = function () { return { set src(v) {}, onload: null }; };
global.setInterval = () => 1;
global.setTimeout = () => 1;
global.clearTimeout = () => {};
global.location = { reload() {} };

try {
  new Function(code).call(window);
} catch (err) {
  console.error('TOP-LEVEL THREW: ' + err.message);
  process.exit(1);
}

// Fire the handlers that carry the interaction, twice, so delta paths that need
// a seeding event are actually exercised.
function firePointerMove(x, y) {
  (listeners.window.pointermove || []).forEach(fn =>
    fn({ clientX: x, clientY: y, buttons: 0, pointerType: 'mouse', movementX: 3, movementY: 4 }));
}
function firePointerDown() {
  (listeners.window.pointerdown || []).forEach(fn =>
    fn({ clientX: 400, clientY: 400, pointerType: 'mouse' }));
}

try {
  firePointerDown();
  firePointerMove(400, 400);
  firePointerMove(430, 380);
  firePointerMove(460, 350);
  if (listeners.document.pointerlockchange) listeners.document.pointerlockchange();
  firePointerMove(470, 340);
} catch (err) {
  console.error('HANDLER THREW: ' + err.message);
  process.exit(1);
}

console.log('smoke OK: script ran and pointer handlers executed cleanly');
