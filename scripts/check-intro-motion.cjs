/* Run with: node scripts/check-intro-motion.cjs
   Execute the production worker against a deterministic 120 Hz clock. Record
   the actual finished-color fill paths to catch held poses and contour jumps.
   No browser, image library or installed npm dependency is required. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../js/intro.js'), 'utf8');
const stride = Number(source.match(/const STRIDE = ([\d.]+)/)[1]);
const frameCount = 33;

class DrawingPath {
  constructor(data = '') { this.data = data; this.outline = []; this.outer = false; this.started = false; }
  moveTo(x, y) {
    this.outer = !this.started;
    this.started = true;
    if (this.outer) this.outline.push([x, y]);
    this.data += `M${x},${y}`;
  }
  lineTo(x, y) {
    if (this.outer) this.outline.push([x, y]);
    this.data += `L${x},${y}`;
  }
  closePath() { this.data += 'Z'; }
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

const sample = harness(), frames = [];
for (let i = 0; i < 66; i++) frames.push(sample(2.5 + i / 120).data);
const held = frames.slice(1).filter((frame, i) => frame === frames[i]).length;
assert(held < frames.length * 0.05, `${held}/${frames.length - 1} refreshes held the previous finished-color pose.`);
console.log(`PASS: 120 Hz playback — ${held} held poses across ${frames.length} samples.`);

// On either side of every pose boundary, including the stride wrap, the same
// outline vertices must be present. Tiny epsilon motion is allowed; a lost
// extremity or a shifted contour starting point is not.
function distance(a, b) {
  let largest = 0;
  for (const [x, y] of a) {
    let nearest = Infinity;
    for (const [xx, yy] of b) nearest = Math.min(nearest, (x - xx) ** 2 + (y - yy) ** 2);
    largest = Math.max(largest, nearest);
  }
  return Math.sqrt(largest);
}
const boundary = harness();
let maximum = 0;
for (let f = 0; f < frameCount; f++) {
  const time = (4 + f / frameCount) * stride - 1 / 120;
  const before = boundary(time - 1e-6).outline;
  const after = boundary(time + 1e-6).outline;
  assert(before.length && after.length, 'The finished outline must be sampled continuously.');
  assert([...before, ...after].flat().every(Number.isFinite), 'Invalid outline coordinate.');
  const jump = Math.max(distance(before, after), distance(after, before));
  maximum = Math.max(maximum, jump);
  assert(jump < 0.08, `Pose ${f}: contour jumped ${jump.toFixed(3)} drawing pixels.`);
}
console.log(`PASS: all ${frameCount} pose seams, including loop wrap — max ${maximum.toFixed(4)} drawing pixels.`);
