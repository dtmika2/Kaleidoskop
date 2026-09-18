// Runs circle.html's script on a virtual clock and reads the numbers back out
// of the debug panel, so behaviour that unfolds over time can be measured
// instead of watched. smoke.js only proves the handlers do not throw; this
// proves what they do. It is what showed that b27's glide ran exactly as
// written and was still wrong -- clearing in half a second while dragging the
// view a third of the way across the circle on its own.
//
// Extract the inline script first, then:  node tools/timeline.js <script.js>
const fs = require('fs');
const code = fs.readFileSync(process.argv[2], 'utf8');

let T = 0;
const rafQ = new Map(); let rafId = 1;
const intervals = []; const timeouts = [];
const listeners = { window: {}, document: {}, el: {} };

function makeStyle(){ return new Proxy({}, { get:(t,k)=>(k==='setProperty'?()=>{}:(t[k]||'')), set:(t,k,v)=>{t[k]=v;return true;} }); }
function makeEl(id){ return { id, style:makeStyle(), classList:{toggle:()=>{},add:()=>{},remove:()=>{}}, dataset:{},
  width:420, height:420, clientWidth:800, clientHeight:800, textContent:'', innerHTML:'', children:[],
  appendChild(c){this.children.push(c);}, querySelectorAll:()=>[],
  getBoundingClientRect:()=>({left:0,top:0,width:900,height:900}),
  getContext:()=>new Proxy({},{get:()=>()=>({})}),
  addEventListener(type,fn){ (listeners.el[id] ||= {})[type]=fn; },
  requestPointerLock:()=>Promise.resolve(), requestFullscreen:()=>Promise.resolve() }; }

const els = {};
const document = { documentElement: makeEl('html'), fullscreenElement:null, pointerLockElement:null,
  visibilityState:'visible', getElementById:id=>(els[id] ||= makeEl(id)), createElement:()=>makeEl('created'),
  addEventListener(type,fn){ listeners.document[type]=fn; } };
const window = { devicePixelRatio:2, addEventListener(type,fn){ (listeners.window[type] ||= []).push(fn); },
  matchMedia:()=>({matches:false}) };

global.window = window; global.document = document;
global.navigator = { maxTouchPoints:5, serviceWorker:{ controller:null, addEventListener(){}, register:()=>Promise.resolve({update(){}}) } };
global.performance = { now: () => T };
global.requestAnimationFrame = cb => { const id = rafId++; rafQ.set(id, cb); return id; };
global.cancelAnimationFrame = id => { rafQ.delete(id); };
global.setInterval = (fn, ms) => { intervals.push({fn, ms, next: T + ms}); return intervals.length; };
global.setTimeout = (fn, ms) => { timeouts.push({fn, next: T + (ms||0)}); return timeouts.length; };
global.clearTimeout = () => {};
global.matchMedia = window.matchMedia; global.getComputedStyle = () => ({fontSize:'40px'});
global.Image = function(){ return { set src(v){}, onload:null }; };
global.location = { reload(){} };

new Function(code).call(window);

function advance(ms, step = 16) {
  for (let done = 0; done < ms; done += step) {
    T += step;
    for (const it of intervals) while (it.next <= T) { it.next += it.ms; it.fn(); }
    for (const to of timeouts) if (to.next !== null && to.next <= T) { to.next = null; to.fn(); }
    const due = [...rafQ.entries()]; rafQ.clear();
    for (const [, cb] of due) cb(T);
  }
}
function move(x, y) {
  (listeners.window.pointermove || []).forEach(fn =>
    fn({ clientX:x, clientY:y, buttons:0, pointerType:'mouse', movementX:1, movementY:1 }));
}
function readout(label) {
  const txt = els.debugPanel.textContent || '';
  const pick = k => (txt.split('\n').find(l => l.startsWith(k)) || k + ' -').trim();
  console.log(String(label).padEnd(26), '|', pick('slack').padEnd(34), '|', pick('anchor').padEnd(30), '|', pick('pan'));
}

(listeners.window.keydown || []).forEach(fn => fn({ key:'d' }));  // open the readout

// Park the pointer near the bottom of the screen, then go idle so the drift runs.
move(450, 820); advance(100); readout('pointer parked');
advance(22000);                 readout('after 20s idle + drift');

// Resume: small movements, sampled every 100ms of virtual time.
for (let i = 0; i < 8; i++) { move(450, 820 + (i % 2 ? 6 : 0)); advance(100); readout('resume +' + ((i+1)*100) + 'ms'); }
