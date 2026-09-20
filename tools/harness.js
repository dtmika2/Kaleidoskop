// The DOM stub the test scripts share. It exists because circle.html is one
// file with one inline script and no build step, so the only way to exercise it
// is to hand it a document convincing enough to run against.
//
// It was three copies of this before, in smoke.js and timeline.js and a
// throwaway, and they drifted: one of them could not see classes, another kept
// every word ever revealed because innerHTML = '' did not drop the children.
// Both showed up as test failures against correct code, which is the most
// expensive kind of wrong.
//
// Everything runs on a virtual clock. performance.now, requestAnimationFrame,
// setInterval and setTimeout all read from it, and nothing moves until advance()
// is called, so behaviour spread over twenty seconds can be measured in a few
// milliseconds of real time.
function install(code) {
  let T = 0;
  const rafQ = new Map(); let rafId = 1;
  const intervals = [], timeouts = [];
  const listeners = { window: {}, document: {}, el: {} };
  const els = {};

  const makeStyle = () => new Proxy({}, {
    get: (t, k) => (k === 'setProperty' ? () => {} : (t[k] || '')),
    set: (t, k, v) => { t[k] = v; return true; },
  });

  // Classes and querySelectorAll are real, not no-ops: the reveal of the hidden
  // word is driven by toggling .lit on spans found with querySelectorAll, so a
  // stub that drops either cannot see the one thing the puzzle does.
  function makeEl(id) {
    const classes = new Set();
    const el = {
      id, style: makeStyle(), dataset: {},
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
        toggle(c, on) {
          const want = on === undefined ? !classes.has(c) : !!on;
          if (want) classes.add(c); else classes.delete(c);
          return want;
        },
      },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      width: 420, height: 420, clientWidth: 800, clientHeight: 800,
      textContent: '', children: [],
      // Assigning innerHTML replaces the content, so it drops the children too.
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; this.children.length = 0; },
      appendChild(c) { this.children.push(c); return c; },
      querySelectorAll(sel) {
        const want = String(sel).replace(/^\./, '');
        return el.children.filter(c => c.classList.contains(want));
      },
      // 900x900 and at the origin, so stage coordinates and client coordinates
      // are the same number and a test can aim at a source position directly.
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 900 }),
      getContext: () => new Proxy({}, { get: () => () => ({}) }),
      addEventListener(type, fn) { (listeners.el[id] ||= {})[type] = fn; },
      requestPointerLock: () => Promise.resolve(),
      requestFullscreen: () => Promise.resolve(),
    };
    return el;
  }

  const document = {
    documentElement: makeEl('html'), body: makeEl('body'),
    fullscreenElement: null, pointerLockElement: null, visibilityState: 'visible',
    getElementById: id => (els[id] ||= makeEl(id)),
    createElement: () => makeEl('created'),
    addEventListener(type, fn) { listeners.document[type] = fn; },
  };
  const window = {
    devicePixelRatio: 2,
    addEventListener(type, fn) { (listeners.window[type] ||= []).push(fn); },
    matchMedia: () => ({ matches: false }),
  };

  global.window = window;
  global.document = document;
  global.navigator = { maxTouchPoints: 5, serviceWorker: { controller: null, addEventListener() {}, register: () => Promise.resolve({ update() {} }) } };
  global.performance = { now: () => T };
  global.requestAnimationFrame = cb => { const id = rafId++; rafQ.set(id, cb); return id; };
  global.cancelAnimationFrame = id => { rafQ.delete(id); };
  global.setInterval = (fn, ms) => { intervals.push({ fn, ms, next: T + ms }); return intervals.length; };
  global.setTimeout = (fn, ms) => { timeouts.push({ fn, next: T + (ms || 0) }); return timeouts.length; };
  global.clearTimeout = () => {};
  global.matchMedia = window.matchMedia;
  global.getComputedStyle = () => ({ fontSize: '40px' });
  // Images stay unloaded until a test asks for them. Loading is a real event in
  // the browser and code is entitled to behave differently before it happens, so
  // the default is the unloaded state and loadImages() is the explicit step --
  // which also means a test can assert what the app does while a picture is
  // still missing.
  const pendingImages = [];
  global.Image = function () {
    const img = { naturalWidth: 600, naturalHeight: 500, onload: null, onerror: null, _src: "" };
    Object.defineProperty(img, "src", {
      get() { return img._src; },
      set(v) { img._src = v; pendingImages.push(img); },
    });
    return img;
  };
  global.location = { reload() {} };

  new Function(code).call(window);

  const api = {
    els, listeners, document,
    get now() { return T; },
    advance(ms, step = 16) {
      for (let done = 0; done < ms; done += step) {
        T += step;
        for (const it of intervals) while (it.next <= T) { it.next += it.ms; it.fn(); }
        for (const to of timeouts) if (to.next !== null && to.next <= T) { to.next = null; to.fn(); }
        const due = [...rafQ.entries()]; rafQ.clear();
        for (const [, cb] of due) cb(T);
      }
    },
    move(x, y, buttons = 0) {
      (listeners.window.pointermove || []).forEach(fn =>
        fn({ clientX: x, clientY: y, buttons, pointerType: 'mouse', movementX: 1, movementY: 1 }));
    },
    down(x = 450, y = 450) {
      (listeners.window.pointerdown || []).forEach(fn =>
        fn({ clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 }));
    },
    openReadout() { (listeners.window.keydown || []).forEach(fn => fn({ key: 'd' })); },
    // Fire onload for every image whose src has been set since the last call.
    // Pass a list of substrings to fail instead, as a 404 would.
    loadImages(failing = []) {
      const batch = pendingImages.splice(0);
      for (const img of batch) {
        const broken = failing.some(f => img.src.includes(f));
        const fn = broken ? img.onerror : img.onload;
        if (typeof fn === "function") fn.call(img);
      }
      return batch.map(i => i.src);
    },
    line(key) {
      const txt = els.debugPanel.textContent || '';
      return (txt.split('\n').find(l => l.startsWith(key)) || (key + ' -')).trim();
    },
  };
  return api;
}

module.exports = { install };
