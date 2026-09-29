/* Run with: node scripts/check-intro-motion.cjs [intro.js]
   Run the production drawing worker with a deterministic animation clock.
   Check actual finished-color silhouettes, including refreshes between the
   traced poses: no held frames, no contour jumps, no feet below the track,
   and no forward skating while a hoof is planted. No npm dependencies. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../js/intro.js'), 'utf8');
const stride = Number(source.match(/const STRIDE = ([\d.]+)/)[1]);
const keyCount = 15;
const start = 2.5 - 1 / 120; // Align to the production clock's first key pose.

class DrawingPath {
  constructor() { this.pieces = []; }
  moveTo(x, y) { this.pieces.push([[x, y]]); }
  lineTo(x, y) { this.pieces[this.pieces.length - 1]?.push([x, y]); }
  quadraticCurveTo(cx, cy, x, y) { this.pieces[this.pieces.length - 1]?.push([x, y]); }
  rect() {}
  closePath() {}
  addPath(other) { this.pieces.push(...other.pieces.map(p => p.slice())); }
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

const signature = frame => JSON.stringify(frame.pieces.map(p => p.map(([x, y]) => [Math.round(x * 1e5), Math.round(y * 1e5)])));
const sample = harness(), shown = [];
for (let i = 0; i <= Math.round(2 * stride * 120); i++) shown.push(sample(start + i / 120));
const points = shown.flatMap(f => f.pieces.flat());
assert(points.flat().every(Number.isFinite), 'Invalid outline coordinate.');
for (const hz of [60, 120]) {
  const frames = shown.filter((_, i) => i % (120 / hz) === 0), ids = frames.map(signature);
  const held = ids.slice(1).filter((id, i) => id === ids[i]).length;
  assert.equal(held, 0, `${held} refreshes held the previous pose at ${hz} Hz.`);
  console.log(`PASS: every refresh advances the horse at ${hz} Hz (${frames.length - 1} refreshes, no held poses).`);
}

const lowest = Math.max(...points.map(([, y]) => y));
assert(lowest <= 1e-6, `A hoof overshot the track by ${lowest.toFixed(3)} drawing units.`);
console.log('PASS: no interpolated pose sinks below the track.');

// The head and throat are a solid silhouette. Tiny gaps carried over from
// the video trace used to appear only around poses 11–13, then disappear.
const headGaps = shown.flatMap(f => f.pieces.slice(1)).filter(p => {
  if (p.length < 3 || !p.every(([x, y]) => x > 60 && y < -90)) return false;
  const area = p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  return Math.abs(area) > 0.1;
});
assert.equal(headGaps.length, 0, 'The head/throat contains a flickering opening.');
console.log('PASS: the head and throat stay solid throughout the stride.');

function distance(a, b) {
  let largest = 0;
  for (const [x, y] of a) {
    let nearest = Infinity;
    for (const [xx, yy] of b) nearest = Math.min(nearest, (x - xx) ** 2 + (y - yy) ** 2);
    largest = Math.max(largest, nearest);
  }
  return Math.sqrt(largest);
}
const separation = (a, b) => Math.max(distance(a.pieces[0], b.pieces[0]), distance(b.pieces[0], a.pieces[0]));

// Approach each key pose from either side, including the last-to-first join.
// This catches a change of point correspondence that resets the silhouette.
const seams = harness(), epsilon = 0.000001;
let seam = 0;
for (let i = 1; i <= keyCount; i++) {
  const at = start + i * stride / keyCount;
  const before = seams(at - epsilon), after = seams(at + epsilon);
  seam = Math.max(seam, separation(before, after));
}
assert(seam < 0.1, `The contour jumps ${seam.toFixed(3)} units at a key pose.`);
const loop = separation(shown[0], shown[Math.round(stride * 120)]);
assert(loop < 0.1, `The loop drifts ${loop.toFixed(3)} units in one stride.`);
console.log(`PASS: all ${keyCount} pose joins are continuous (largest seam ${seam.toFixed(4)} units); the stride repeats without drift.`);

// The original contact poses remain physically grounded. Sampling exact keys
// avoids treating a different, newly landing hoof as the one that just left.
const contactsAt = harness(), contacts = [];
for (let i = 0; i < keyCount; i++) {
  const f = contactsAt(start + i * stride / keyCount);
  const xs = f.pieces.flat().filter(([, y]) => y > -2).map(([x]) => x).sort((a, b) => a - b), feet = [];
  for (const x of xs) {
    const foot = feet[feet.length - 1];
    if (foot && x - foot[foot.length - 1] < 5) foot.push(x); else feet.push([x]);
  }
  contacts.push(feet.map(foot => (foot[0] + foot[foot.length - 1]) / 2));
}
let skid = -Infinity;
contacts.forEach((feet, i) => {
  for (const x of contacts[(i + 1) % keyCount]) {
    const from = feet.filter(b => x - b > -60 && x - b < 20);
    if (from.length) skid = Math.max(skid, x - Math.max(...from));
  }
});
assert(Number.isFinite(skid), 'No consecutive ground contacts were sampled.');
assert(skid < 2, `A planted hoof skated ${skid.toFixed(1)} units forward.`);
console.log(`PASS: planted hooves move backward along the track (at least ${(-skid).toFixed(1)} units between contact poses).`);
