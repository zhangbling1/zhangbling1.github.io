/* The cover's particle field, after Google Antigravity: short dashes ring a
   focus that eases toward the pointer. Each dash points at the focus and
   follows it with its own lag, so the ring flows like liquid. Ink with the
   seal's reds, drawn on one canvas behind the cover; it rests off screen, in
   hidden tabs and for readers who prefer less motion. */
(() => {
  'use strict';

  const canvas = document.getElementById('field');
  const cover = document.getElementById('home');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || !cover) return;

  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  const INK = '74, 72, 67';
  const WARM = ['210, 62, 38', '238, 128, 70', '224, 168, 72'];
  const focus = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0, at: -Infinity };
  let width = 0, height = 0, ratio = 1, radius = 0, rest = { x: 0, y: 0 };
  let batches = [], specks = [], frame = 0, last = 0, clock = 0, inView = true, started = false;

  function seed() {
    ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    width = canvas.parentElement.clientWidth;
    height = Math.ceil(cover.getBoundingClientRect().bottom - canvas.parentElement.getBoundingClientRect().top);
    if (!width || !height) return false;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const view = Math.min(height, window.innerHeight);
    radius = Math.max(160, Math.min(420, Math.min(width, view) * 0.36));
    // At rest the ring sits between the name and the reel (behind the name on phones).
    rest = width > 760 ? { x: width * 0.38, y: view * 0.5 } : { x: width * 0.5, y: view * 0.36 };
    if (!started) Object.assign(focus, rest);
    // Dashes are grouped by colour, strength and weight so a frame is a few strokes.
    const groups = new Map();
    const count = Math.round(Math.min(640, Math.max(220, width * view / 2000)));
    for (let i = 0; i < count; i++) {
      const rho = 0.5 + Math.pow(Math.random(), 1.35) * 0.9;
      const theta = Math.random() * TAU;
      const heat = Math.pow((Math.cos(theta + 0.5) + 1) / 2, 1.2);
      const warm = Math.random() < heat * 0.8;
      const color = warm ? WARM[Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2] : INK;
      const strength = Math.exp(-(((rho - 0.78) / 0.36) ** 2));
      const level = 0.2 + strength * 0.75 + Math.random() * 0.2;
      const alpha = level > 0.8 ? 0.6 : level > 0.5 ? 0.38 : 0.2;
      const weight = strength > 0.6 && Math.random() < 0.5 ? 1.9 : 1.3;
      const key = `${color}|${alpha}|${weight}`;
      if (!groups.has(key)) groups.set(key, { style: `rgba(${color}, ${warm ? alpha : alpha * 0.8})`, weight, dots: [] });
      groups.get(key).dots.push({
        theta, rho,
        spin: (0.05 + Math.random() * 0.04) / rho,
        follow: 0.025 + Math.random() * 0.03 + (1.4 - rho) * 0.035,
        length: 3 + strength * 6 + Math.random() * 2,
        wobble: Math.random() * TAU,
        x: focus.x, y: focus.y,
      });
    }
    batches = [...groups.values()];
    specks = Array.from({ length: Math.round(count / 7) }, () => [Math.random() * width, Math.random() * height]);
    return true;
  }

  function draw(dt) {
    clock += dt / 60;
    // Follow a mouse that moved recently; otherwise drift slowly around the middle.
    const idle = !mouse.matches || performance.now() - pointer.at > 4000;
    const tx = idle ? rest.x + width * 0.16 * Math.sin(clock * 0.23) : pointer.x;
    const ty = idle ? rest.y + rest.y * 0.22 * Math.sin(clock * 0.31) : pointer.y;
    focus.x += (tx - focus.x) * Math.min(1, 0.06 * dt);
    focus.y += (ty - focus.y) * Math.min(1, 0.06 * dt);
    const breathe = 1 + 0.035 * Math.sin(clock * 0.9);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(${INK}, 0.16)`;
    for (const [x, y] of specks) ctx.fillRect(x, y, 1.2, 1.2);
    ctx.lineCap = 'round';
    for (const batch of batches) {
      ctx.beginPath();
      for (const d of batch.dots) {
        const a = d.theta + clock * d.spin;
        const r = radius * d.rho * breathe + Math.sin(clock * 1.3 + d.wobble) * 6;
        d.x += (focus.x + Math.cos(a) * r - d.x) * Math.min(1, d.follow * dt);
        d.y += (focus.y + Math.sin(a) * r * 0.86 - d.y) * Math.min(1, d.follow * dt);
        const dx = focus.x - d.x, dy = focus.y - d.y;
        const scale = d.length / 2 / (Math.hypot(dx, dy) || 1);
        ctx.moveTo(d.x - dx * scale, d.y - dy * scale);
        ctx.lineTo(d.x + dx * scale, d.y + dy * scale);
      }
      ctx.lineWidth = batch.weight;
      ctx.strokeStyle = batch.style;
      ctx.stroke();
    }
  }

  function tick(now) {
    const dt = Math.min(3, (now - (last || now)) / 16.67) || 1;
    last = now;
    draw(dt);
    frame = requestAnimationFrame(tick);
  }

  function play() {
    cancelAnimationFrame(frame);
    if (!started || !inView || document.hidden || reduced.matches) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (started || !seed()) return;
    started = true;
    canvas.classList.add('is-on');
    // Without motion the ring is drawn once, already settled.
    if (reduced.matches) {
      for (let i = 0; i < 240; i++) draw(1);
      return;
    }
    play();
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const box = canvas.getBoundingClientRect();
    pointer.x = event.clientX - box.left;
    pointer.y = event.clientY - box.top;
    pointer.at = performance.now();
  }, { passive: true });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    play();
  }).observe(canvas);
  document.addEventListener('visibilitychange', play);
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (started && seed() && reduced.matches) for (let i = 0; i < 240; i++) draw(1); }, 200);
  }).observe(cover);

  // Starts once the opening has lifted, or when the page settles if there is none.
  if (document.documentElement.classList.contains('intro')) {
    document.addEventListener('intro:done', start, { once: true });
    setTimeout(start, 9500);
  } else if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 });
  else setTimeout(start, 300);
})();
