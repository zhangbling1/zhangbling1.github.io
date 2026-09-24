/* The opening: an ink horse and rider gallop from a few lines into a finished
   drawing while the book loads, then ride off. Shown once per session; the
   inline script in index.html decides whether to show it at all. */
(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('intro')) return;

  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;
  const mix = (a, b, t) => a + (b - a) * t;
  const wrap = v => ((v % 1) + 1) % 1;
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const ramp = (v, a, b) => clamp((v - a) / (b - a));
  const INK = '23, 23, 22';
  const SEAL = '216, 67, 44';

  /* ---------- The rig: units follow a horse about 112 long, y points down ---------- */

  const GROUND = 76;
  const STRIDE = 0.5;          // seconds per stride
  const PACE = 60 / (0.27 * STRIDE);   // ground speed that keeps a planted fore hoof still

  // Cyclic Catmull-Rom through [time, value] keys on [0, 1).
  function track(keys) {
    const n = keys.length;
    return p => {
      p = wrap(p);
      let i = n - 1;
      for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
      const at = k => keys[((k % n) + n) % n];
      const k0 = at(i - 1), k1 = at(i), k2 = at(i + 1), k3 = at(i + 2);
      const t = wrap(p - k1[0]) / (wrap(k2[0] - k1[0]) || 1);
      const v0 = k0[1], v1 = k1[1], v2 = k2[1], v3 = k3[1];
      return 0.5 * (2 * v1 + (v2 - v0) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (3 * v1 - v0 - 3 * v2 + v3) * t * t * t);
    };
  }

  // top: joint on the body; segments: [length, width at start, width at end];
  // bend: +1 when the middle joint juts forward (knee), -1 when it juts back (hock);
  // reach: hoof x at touchdown and lift-off; swing: absolute angles of upper leg,
  // cannon and pastern on the way from lift-off back to touchdown.
  const FORE = {
    top: [38, 12], stance: 0.27, bend: 1, reach: [62, 2],
    segments: [[28, 14, 7], [20, 6.2, 5.6], [8, 5.2, 5]],
    pastern: track([[0, 18], [0.27, 34], [0.4, -60], [0.6, -120], [0.82, -10], [0.93, 14]]),
    swing: [[0.2, [-18, -104, -150]], [0.45, [30, -84, -126]], [0.72, [54, 16, -6]]],
  };
  const HIND = {
    top: [-34, 12], stance: 0.3, bend: -1, reach: [-12, -84],
    segments: [[30, 16, 7], [22, 6.6, 5.8], [8, 5.4, 5.2]],
    pastern: track([[0, 26], [0.3, 40], [0.42, -30], [0.62, -50], [0.84, -6], [0.94, 20]]),
    swing: [[0.2, [-74, -16, -46]], [0.48, [-44, 4, -30]], [0.75, [8, 34, 10]]],
  };
  // Transverse gallop on the right lead: left hind, right hind, left fore, right fore.
  const LEGS = [
    { type: HIND, far: true, down: 0.11 },
    { type: FORE, far: true, down: 0.42 },
    { type: HIND, far: false, down: 0 },
    { type: FORE, far: false, down: 0.31 },
  ];
  const PITCH = track([[0.04, -3], [0.18, -7], [0.34, -1], [0.5, 5], [0.66, 2], [0.86, -2]]);
  const BOB = track([[0.04, 1], [0.2, 3], [0.36, 1], [0.52, 3], [0.7, -3], [0.88, -6]]);
  const NOD = track([[0.1, -7], [0.32, 0], [0.52, 10], [0.72, 3], [0.9, -5]]);

  const BODY = [[57, -6], [52, 10], [36, 21], [6, 24], [-18, 19], [-30, 22], [-46, 21], [-58, 2], [-54, -18], [-38, -29], [-16, -26], [6, -25], [26, -32]];
  const NECK = [[22, -30], [40, -44], [62, -56], [70, -41], [64, -22], [58, -4]];
  const HEAD = [[64, -56], [76, -58], [92, -46], [100, -36], [102, -31], [97, -27], [90, -28], [80, -31], [74, -38], [68, -43]];
  const CREST = [[26, -34], [36, -42], [46, -48], [55, -53], [62, -56]];
  const TORSO = [[-5, -39], [5, -51], [25, -61], [35, -58], [30, -51], [12, -43], [0, -35]];

  function solve(jx, jy, fx, fy, l1, l2, bend) {
    const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(fx - jx, fy - jy)));
    const base = Math.atan2(fx - jx, fy - jy);
    const a1 = base + bend * Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
    const kx = jx + Math.sin(a1) * l1, ky = jy + Math.cos(a1) * l1;
    return [a1 / DEG, Math.atan2(fx - kx, fy - ky) / DEG];
  }

  // Planted hooves are placed on the ground and the leg solved to reach them;
  // in the air the leg follows its swing keyframes between those two poses.
  function legAngles(type, p, jx, jy) {
    const [[l1], [l2], [l3]] = type.segments;
    const planted = q => {
      const past = type.pastern(q) * DEG;
      const hx = mix(type.reach[0], type.reach[1], q / type.stance);
      return [...solve(jx, jy, hx - Math.sin(past) * (l3 + 6), GROUND - Math.cos(past) * (l3 + 6), l1, l2, type.bend), past / DEG];
    };
    if (p < type.stance) return planted(p);
    const u = (p - type.stance) / (1 - type.stance);
    const keys = [[0, planted(type.stance - 1e-4)], ...type.swing, [1, planted(0)]];
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
    const t = (u - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    const e = t * t * (3 - 2 * t);
    return keys[i][1].map((v, j) => mix(v, keys[i + 1][1][j], e));
  }

  // Everything the renderers need for one frame, in rig units.
  function pose(phase, time) {
    const pitch = PITCH(phase) * DEG, bob = BOB(phase);
    const c = Math.cos(pitch), s = Math.sin(pitch);
    const body = ([x, y]) => [x * c - y * s, bob + x * s + y * c];
    const nod = NOD(phase) * DEG, nc = Math.cos(nod), ns = Math.sin(nod);
    const neck = ([x, y]) => { const dx = x - 44, dy = y + 14; return body([44 + dx * nc - dy * ns, -14 + dx * ns + dy * nc]); };
    // The rider pitches less than the horse and rides a little above its bounce.
    const rp = pitch * 0.3, rc = Math.cos(rp), rs = Math.sin(rp);
    const lift = bob * 0.5 - 1.2 * Math.sin(TAU * (phase + 0.25));
    const rider = ([x, y]) => [x * rc - y * rs, lift + x * rs + y * rc];
    const legs = LEGS.map(leg => {
      const p = wrap(phase - leg.down);
      const top = body([leg.type.top[0] + (leg.far ? -3 : 0), leg.type.top[1]]);
      const angles = legAngles(leg.type, p, top[0], top[1]);
      const joints = [top];
      leg.type.segments.forEach(([length], i) => {
        const a = angles[i] * DEG;
        joints.push([joints[i][0] + Math.sin(a) * length, joints[i][1] + Math.cos(a) * length]);
      });
      return { leg, p, joints, angle: angles[2] * DEG };
    });
    // The tail streams back and ripples.
    const tail = [body([-55, -16])];
    let tx = -55, ty = -16, ta = -98;
    for (let i = 0; i < 6; i++) {
      ta += 4 + 8 * Math.sin(time * 10 - i * 1.1);
      tx += Math.sin(ta * DEG) * 10;
      ty += Math.cos(ta * DEG) * 10;
      tail.push(body([tx, ty]));
    }
    return { body, neck, rider, legs, tail, phase, time };
  }

  /* ---------- Paths ----------
     Every subpath winds the same way, so overlapping masses fill as one
     shape instead of cancelling out where they cross. */

  const clockwise = points => points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) > 0;

  function smooth(ctx, points) {
    if (clockwise(points)) points = [...points].reverse();
    const n = points.length;
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    ctx.closePath();
  }
  function taper(ctx, [ax, ay], [bx, by], w0, w1) {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    ctx.moveTo(ax + nx * w0 / 2, ay + ny * w0 / 2);
    ctx.lineTo(bx + nx * w1 / 2, by + ny * w1 / 2);
    ctx.lineTo(bx - nx * w1 / 2, by - ny * w1 / 2);
    ctx.lineTo(ax - nx * w0 / 2, ay - ny * w0 / 2);
    ctx.closePath();
  }
  function disc(ctx, [x, y], r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU, true);
  }
  function polygon(ctx, points) {
    if (clockwise(points)) points = [...points].reverse();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
  }
  function chain(ctx, points, w0, w1) {
    const n = points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = mix(w0, w1, i / n), b = mix(w0, w1, (i + 1) / n);
      taper(ctx, points[i], points[i + 1], a, b);
      disc(ctx, points[i + 1], b / 2);
    }
  }
  function hoof(ctx, L) {
    const [fx, fy] = L.joints[3];
    const dx = Math.sin(L.angle), dy = Math.cos(L.angle), nx = -dy, ny = dx;
    ctx.moveTo(fx + nx * 2.8, fy + ny * 2.8);
    ctx.lineTo(fx + dx * 6 + nx * 4, fy + dy * 6 + ny * 4);
    ctx.lineTo(fx + dx * 6 - nx * 3.4, fy + dy * 6 - ny * 3.4);
    ctx.lineTo(fx - nx * 2.8, fy - ny * 2.8);
    ctx.closePath();
  }
  function leg(ctx, L) {
    const seg = L.leg.type.segments;
    disc(ctx, L.joints[0], seg[0][1] / 2);
    for (let i = 0; i < 3; i++) {
      taper(ctx, L.joints[i], L.joints[i + 1], seg[i][1], seg[i][2]);
      disc(ctx, L.joints[i + 1], seg[i][2] / 2);
    }
    hoof(ctx, L);
  }
  // The horse's masses in drawing order: far legs, body, near legs, rider.
  function masses(P) {
    const far = ctx => P.legs.filter(L => L.leg.far).forEach(L => leg(ctx, L));
    const near = ctx => P.legs.filter(L => !L.leg.far).forEach(L => leg(ctx, L));
    const horse = ctx => {
      smooth(ctx, BODY.map(P.body));
      chain(ctx, P.tail, 11, 1.4);
      smooth(ctx, NECK.map(P.neck));
      smooth(ctx, HEAD.map(P.neck));
      for (const [ox, oy] of [[0, 0], [4, 1]]) polygon(ctx, [[64 + ox, -55 + oy], [61 + ox, -65 + oy], [69 + ox, -56 + oy]].map(P.neck));
    };
    const rider = ctx => {
      const R = P.rider;
      smooth(ctx, TORSO.map(R));
      chain(ctx, [[1, -38], [20, -36], [12, -22]].map(R), 10, 6);
      taper(ctx, R([12, -22]), R([18, -20]), 5, 4);
      chain(ctx, [[31, -57], [41, -48], [55, -42]].map(R), 6.4, 4.8);
      disc(ctx, R([38, -65]), 6.6);
      ctx.moveTo(...R([46.6, -63]));
      ctx.ellipse(...R([43, -63]), 3.6, 1.9, 0.35, 0, TAU, true);
    };
    return { far, horse, near, rider };
  }

  /* ---------- Four stages of one drawing ---------- */

  // 01 构想: joints and bones, like a motion study.
  function sketch(ctx, P, alpha, unit) {
    if (alpha <= 0) return;
    const bones = [];
    const B = P.body, N = P.neck, R = P.rider;
    bones.push([B([-55, -16]), B([-36, -20]), B([-6, -22]), B([26, -28])]);
    bones.push([B([26, -28]), N([48, -44]), N([66, -52]), N([100, -34])]);
    bones.push([B([-36, -20]), P.legs[0].joints[0]], [B([30, -24]), P.legs[1].joints[0]]);
    for (const L of P.legs) bones.push([...L.joints, [L.joints[3][0] + Math.sin(L.angle) * 6, L.joints[3][1] + Math.cos(L.angle) * 6]]);
    bones.push(P.tail);
    bones.push([R([1, -37]), R([20, -36]), R([12, -22])], [R([1, -37]), R([31, -57]), R([38, -65])], [R([31, -57]), R([41, -48]), R([55, -42])]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5 / unit;
    ctx.strokeStyle = `rgba(${INK}, ${alpha * 0.85})`;
    ctx.beginPath();
    for (const line of bones) line.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.stroke();
    ctx.fillStyle = `rgba(${INK}, ${alpha})`;
    ctx.beginPath();
    for (const line of bones) for (const p of line) disc(ctx, p, 2.2 / unit * 1.2);
    disc(ctx, R([38, -65]), 4.2);
    ctx.fill();
  }

  // 02 结构: construction circles in seal red, then outlines of every mass.
  function construct(ctx, P, alpha, unit) {
    if (alpha <= 0) return;
    const B = P.body, N = P.neck;
    ctx.lineWidth = 1.1 / unit;
    ctx.strokeStyle = `rgba(${SEAL}, ${alpha * 0.55})`;
    ctx.beginPath();
    for (const [c, r] of [[B([34, 2]), 23], [B([-2, 2]), 20], [B([-36, -1]), 25], [N([86, -42]), 14]]) disc(ctx, c, r);
    ctx.moveTo(...B([-60, -2])); ctx.lineTo(...B([60, -2]));
    ctx.stroke();
    const m = masses(P);
    ctx.lineWidth = 1.3 / unit;
    ctx.lineJoin = 'round';
    for (const [part, a] of [[m.far, 0.45], [m.horse, 1], [m.near, 1], [m.rider, 1]]) {
      ctx.strokeStyle = `rgba(${INK}, ${alpha * a * 0.8})`;
      ctx.beginPath();
      part(ctx);
      ctx.stroke();
    }
  }

  // 03 造型: the silhouette in ink, the far legs in a lighter wash.
  function form(ctx, P, alpha) {
    if (alpha <= 0) return;
    const m = masses(P);
    for (const [part, a] of [[m.far, 0.42], [m.horse, 1], [m.near, 1], [m.rider, 1]]) {
      ctx.fillStyle = `rgba(${INK}, ${alpha * a})`;
      ctx.beginPath();
      part(ctx);
      ctx.fill('nonzero');
    }
  }

  // 04 精修: mane and tail strands, reins, a rim of light, and the red scarf last.
  function refine(ctx, P, alpha, scarf, unit) {
    if (alpha > 0) {
      const N = P.neck, B = P.body, t = P.time;
      ctx.fillStyle = `rgba(${INK}, ${alpha})`;
      ctx.beginPath();
      CREST.forEach(([x, y], i) => {
        const len = 9 + (i % 2) * 4, a = (-128 + 10 * Math.sin(t * 12 - i * 0.9)) * DEG;
        taper(ctx, N([x, y]), N([x + Math.sin(a) * len, y + Math.cos(a) * len]), 4.2, 0.6);
      });
      for (let k = 0; k < 3; k++) {
        const strand = [];
        let x = -55, y = -16, a = -102 + k * 7;
        strand.push([x, y]);
        for (let i = 0; i < 7; i++) {
          a += 3 + 9 * Math.sin(t * 9.5 - i * 1.15 - k * 0.8);
          x += Math.sin(a * DEG) * (9 + k);
          y += Math.cos(a * DEG) * (9 + k);
          strand.push([x, y]);
        }
        chain(ctx, strand.map(B), 3.2, 0.5);
      }
      ctx.fill();
      // Reins from hand to bit.
      ctx.strokeStyle = `rgba(${INK}, ${alpha * 0.8})`;
      ctx.lineWidth = 1.2 / unit;
      ctx.beginPath();
      ctx.moveTo(...P.rider([55, -42]));
      ctx.quadraticCurveTo(...P.neck([80, -30]), ...P.neck([97, -29]));
      ctx.stroke();
      // A thin rim of light along the back and crest, as if lit from above.
      ctx.strokeStyle = `rgba(255, 246, 236, ${alpha * 0.5})`;
      ctx.lineWidth = 1.1 / unit;
      ctx.beginPath();
      [[-52, -18], [-38, -27], [-16, -24], [6, -23]].map(B).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.moveTo(...N([28, -30]));
      [[40, -41], [52, -49], [62, -53], [74, -55]].map(N).forEach(p => ctx.lineTo(...p));
      ctx.stroke();
    }
    if (scarf > 0) {
      const R = P.rider, t = P.time;
      const base = [32, -61];
      const edge = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        edge.push([base[0] - u * 70, base[1] - u * 9 + Math.sin(t * 12 - u * 6.5) * (0.6 + u * 6.5)]);
      }
      ctx.fillStyle = `rgba(${SEAL}, ${scarf})`;
      ctx.beginPath();
      edge.forEach(([x, y], i) => { const w = 3.6 * (1 - i / 17); (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...R([x, y - w])); });
      for (let i = edge.length - 1; i >= 0; i--) { const w = 3.6 * (1 - i / 17); ctx.lineTo(...R([edge[i][0], edge[i][1] + w])); }
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- The splash ---------- */

  const MIN = 2.4, MAX = 6.5, EXIT = 0.7;
  const splash = document.getElementById('splash');
  const canvas = document.getElementById('splash-canvas');
  const context = canvas?.getContext?.('2d');
  const stages = splash ? [...splash.querySelectorAll('.splash-stages li')] : [];
  const count = document.getElementById('splash-count');
  const dust = [];
  let ready = Boolean(window.bookReady);
  let width = 0, height = 0, ratio = 1, start = 0, leaving = 0, frame = 0, done = false;
  if (!splash || !context) return finish();

  document.addEventListener('book:ready', () => { ready = true; }, { once: true });
  root.style.overflow = 'hidden';

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = splash.clientWidth;
    height = splash.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }

  function leave() {
    if (leaving || done) return;
    leaving = performance.now();
    splash.classList.add('is-leaving');
    // The cover starts its own entrance while the paper lifts.
    setTimeout(() => root.classList.remove('intro'), 120);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    root.classList.remove('intro');
    root.style.overflow = '';
    splash?.remove();
    try { sessionStorage.setItem('zn-intro', '1'); } catch (error) { /* private mode */ }
    document.dispatchEvent(new CustomEvent('intro:done'));
  }

  function draw(now) {
    const time = (now - start) / 1000;
    const fidelity = clamp(time / 2.1);
    const eased = fidelity < 0.5 ? 2 * fidelity * fidelity : 1 - (2 - 2 * fidelity) ** 2 / 2;
    const exit = leaving ? (now - leaving) / 1000 / EXIT : 0;
    if (exit >= 1) return finish();
    const phase = wrap(time / STRIDE);
    const P = pose(phase, time);
    // The horse fills about three quarters of a phone, less of a wide screen.
    const unit = Math.min(width * 0.78 / 230, height * 0.5 / 150, 4.4);
    const ox = width * 0.5 - 4 * unit + exit * exit * width * 0.9;
    const oy = height * 0.47 - 6 * unit;
    const ctx = context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Ground: a measured track scrolling past, as in Muybridge's studies.
    const groundY = oy + GROUND * unit + 0.5;
    const measure = ramp(eased, 0.08, 0.3);
    ctx.fillStyle = `rgba(${INK}, 0.5)`;
    ctx.fillRect(0, groundY, width, 1);
    if (measure > 0) {
      const gap = 48 * unit, shift = (time * PACE * unit) % gap;
      ctx.font = `500 ${Math.max(9, 3 * unit)}px Manrope, sans-serif`;
      ctx.textAlign = 'center';
      for (let x = -shift, n = Math.floor(time * PACE * unit / gap); x < width + gap; x += gap, n++) {
        const edge = Math.min(1, Math.min(x, width - x) / (width * 0.18));
        if (edge <= 0) continue;
        ctx.fillStyle = `rgba(${INK}, ${measure * edge * 0.45})`;
        ctx.fillRect(x, groundY - 4 * unit, 1, 4 * unit);
        ctx.fillText(String(((n % 99) + 99) % 99 + 1).padStart(2, '0'), x, groundY + 7 * unit);
      }
    }
    const solid = ramp(eased, 0.5, 0.7);
    if (solid > 0) {
      const shadow = ctx.createRadialGradient(ox, groundY, 0, ox, groundY, 70 * unit);
      shadow.addColorStop(0, `rgba(${INK}, ${0.16 * solid})`);
      shadow.addColorStop(1, `rgba(${INK}, 0)`);
      ctx.fillStyle = shadow;
      ctx.save();
      ctx.translate(ox, groundY);
      ctx.scale(1, 0.08);
      ctx.translate(-ox, -groundY);
      ctx.fillRect(ox - 70 * unit, groundY - 70 * unit, 140 * unit, 140 * unit);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(unit, unit);
    construct(context, P, ramp(eased, 0.1, 0.24) * (1 - ramp(eased, 0.56, 0.74)), unit);
    form(context, P, solid);
    sketch(context, P, 1 - ramp(eased, 0.22, 0.42), unit);
    const finesse = ramp(eased, 0.7, 0.9);
    refine(context, P, finesse, ramp(eased, 0.84, 1), unit);
    ctx.restore();

    // Hooves leaving the ground kick up a little ink.
    if (finesse > 0) {
      for (const L of P.legs) {
        if (Math.abs(L.p - L.leg.type.stance) < 0.03 && Math.random() < 0.8) {
          dust.push({ x: ox + L.joints[3][0] * unit, y: groundY - 2, vx: -(PACE * 0.2 + Math.random() * 60) * unit / 4, vy: -(20 + Math.random() * 50), life: 1, r: 0.8 + Math.random() * 1.8 });
        }
      }
    }
    ctx.fillStyle = `rgba(${INK}, 1)`;
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.x += d.vx / 60; d.y += d.vy / 60; d.vy += 140 / 60; d.life -= 1 / 40;
      if (d.life <= 0 || d.y > groundY) { dust.splice(i, 1); continue; }
      ctx.globalAlpha = d.life * 0.55 * finesse;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const stage = Math.min(3, Math.floor(eased * 4));
    stages.forEach((node, i) => node.classList.toggle('is-on', i <= stage));
    splash.style.setProperty('--progress', eased.toFixed(3));
    if (count) count.textContent = `${String(Math.round(eased * (ready ? 100 : 96))).padStart(2, '0')}%`;
    if (!leaving && ((ready && time >= MIN) || time >= MAX)) leave();
    frame = requestAnimationFrame(draw);
  }

  function begin() {
    resize();
    window.addEventListener('resize', resize);
    // Any intent to move on skips the rest.
    const skip = () => leave();
    for (const type of ['pointerdown', 'wheel', 'touchmove', 'keydown']) window.addEventListener(type, skip, { once: true, passive: true });
    start = performance.now();
    frame = requestAnimationFrame(draw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
  else begin();
})();
