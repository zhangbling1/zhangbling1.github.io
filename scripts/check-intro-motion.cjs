/* Run with: node scripts/check-intro-motion.cjs [intro.js]
   Execute the production worker against a deterministic clock and record the
   finished-color fill. The horse is a flipbook of traced frames; checks that
   the frames come in order at an even pace, that the stride loops without a
   jump, that nothing sinks below the track, and that a hoof on the track only
   slides back from one frame to the next.
   No browser, image library or installed npm dependency is required. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

// An intro.js to check may be given; the site's own is the default.
const source = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../js/intro.js'), 'utf8');
const stride = Number(source.match(/const STRIDE = ([\d.]+)/)[1]);

// Records each subpath as the points its curve passes through.
class DrawingPath {
  constructor() { this.data = ''; this.pieces = []; }
  moveTo(x, y) { this.pieces.push([[x, y]]); this.data += `M${x},${y}`; }
  lineTo(x, y) { this.pieces[this.pieces.length - 1]?.push([x, y]); this.data += `L${x},${y}`; }
  quadraticCurveTo(cx, cy, x, y) { this.pieces[this.pieces.length - 1]?.push([x, y]); this.data += `Q${cx},${cy},${x},${y}`; }
  rect() {}
  closePath() { this.data += 'Z'; }
  addPath(other) { this.pieces.push(...other.pieces.map(p => p.slice())); this.data += other.data; }
}

function harness() {
  const queue = [];
  let active = null, time = 0;
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'isPointInPath') return () => false;
      if (key === 'fill') return p => { if (p instanceof DrawingPath) active = p; };
      return target[key] ?? (() => {});
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const self = { requestAnimationFrame(cb) { queue.push(cb); return 1; }, postMessage() {} };
  vm.runInNewContext(source, { self, Path2D: DrawingPath, console, performance: { now: () => 0 }, setTimeout, Math });
  self.onmessage({ data: { type: 'init', canvas: { getContext: () => context }, width: 1280, height: 720, ratio: 1, ready: false } });
  queue.shift()(1000);
  return target => {
    while (time < target - 1e-10) {
      time = Math.min(target, time + 0.05);
      const draw = queue.shift();
      assert(draw, 'The opening ended before the motion sample.');
      draw(1000 + time * 1000);
    }
    assert(active, 'No finished-color horse was drawn.');
    return active;
  };
}

// Two strides of the finished horse at 60 Hz: the frames in order.
const sample = harness(), shown = [];
for (let i = 0; i <= Math.round(2 * stride * 60); i++) shown.push(sample(2.5 + i / 60));
const points = shown.flatMap(f => f.pieces.flat());
assert(points.flat().every(Number.isFinite), 'Invalid outline coordinate.');
const frames = [];
for (const f of shown) if (!frames.length || frames[frames.length - 1].data !== f.data) frames.push(f);
const distinct = [...new Set(frames.map(f => f.data))];
const count = distinct.length;
const runs = [];
let run = 1;
for (let i = 1; i < shown.length; i++) {
  if (shown[i].data === shown[i - 1].data) run++;
  else { runs.push(run); run = 1; }
}
const order = frames.map(f => distinct.indexOf(f.data));
const inOrder = order.every((k, i) => i === 0 || k === (order[i - 1] + 1) % count);
assert(inOrder, `Frames came out of order: ${order.join(' ')}.`);
const inner = runs.slice(1);
assert(Math.min(...inner) >= 2 && Math.max(...inner) <= 2, `Frames held for ${Math.min(...inner)}..${Math.max(...inner)} refreshes at 60 Hz; expected an even 2.`);
console.log(`PASS: ${count} frames a stride, in order, each held for 2 refreshes at 60 Hz.`);

// Nothing goes below the track (y = 0 in drawing units).
const lowest = Math.max(...points.map(([, y]) => y));
assert(lowest <= 1e-6, `The drawing reached ${lowest.toFixed(3)} below the track.`);
console.log('PASS: nothing sinks below the track.');

// The stride loops: from the last frame back to the first is a step like any
// other, not a jump. A step is how far the outline moves between frames.
function distance(a, b) {
  let largest = 0;
  for (const [x, y] of a) {
    let nearest = Infinity;
    for (const [xx, yy] of b) nearest = Math.min(nearest, (x - xx) ** 2 + (y - yy) ** 2);
    largest = Math.max(largest, nearest);
  }
  return Math.sqrt(largest);
}
const outline = f => f.pieces[0];
const loop = distinct.map(d => shown.find(f => f.data === d));
const steps = loop.map((f, i) => {
  const g = loop[(i + 1) % count];
  return Math.max(distance(outline(f), outline(g)), distance(outline(g), outline(f)));
});
const wrapStep = steps[count - 1], typical = steps.slice(0, -1).sort((a, b) => a - b)[Math.floor((count - 1) / 2)];
assert(wrapStep <= Math.max(...steps.slice(0, -1)) + 1e-9, `The loop jumps ${wrapStep.toFixed(1)} units from the last frame to the first; the frames step at most ${Math.max(...steps.slice(0, -1)).toFixed(1)}.`);
console.log(`PASS: the stride loops without a jump — ${wrapStep.toFixed(1)} units from last to first, ${typical.toFixed(1)} a typical frame.`);

// A hoof on the track only ever slides back until it lifts: from one frame
// to the next, no patch of outline on the ground moves forward.
const contacts = loop.map(f => {
  const xs = f.pieces.flat().filter(([, y]) => y > -2).map(([x]) => x).sort((a, b) => a - b), feet = [];
  for (const x of xs) { const foot = feet[feet.length - 1]; if (foot && x - foot[foot.length - 1] < 5) foot.push(x); else feet.push([x]); }
  return feet.map(foot => (foot[0] + foot[foot.length - 1]) / 2);
});
let skid = -Infinity;
contacts.forEach((feet, i) => {
  const next = contacts[(i + 1) % count];
  for (const x of next) {
    const from = feet.filter(b => x - b > -60 && x - b < 20);
    if (from.length) skid = Math.max(skid, x - Math.max(...from.filter(b => b >= x - 60)));
  }
});
assert(skid < 2, `A planted hoof skated ${skid.toFixed(1)} drawing units forward in one frame.`);
console.log(`PASS: planted hooves only slide back — the least they slide is ${(-skid).toFixed(1)} units a frame.`);
