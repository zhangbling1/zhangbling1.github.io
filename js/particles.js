/**
 * 粒子动态流动背景 - particles.js (暗黑星云定制版)
 * 基于 Simplex Noise 的自适应宇宙星云粒子系统
 */

(function () {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height, DPR;
  let particles = [];
  const mouse = { x: -5000, y: -5000 };
  let frameCount = 0;
  let animationId = null;

  const isMobile = window.innerWidth < 768;
  const CONFIG = {
    introDuration: 180,
    explosionForce: 36,
    drag: 0.72,
    returnStrength: 0.012,
    particleCount: isMobile ? 450 : 1100,
    clusterRadius: 460,
    clusterRatioX: 1.55,
    clusterRatioY: 1.0,
    minDistance: 24,
    voidBaseSize: 120,
    voidBreathing: 18,
    voidMoveSpeed: 0.002,
    voidWaitTime: 400,
    sizeMin: 1.0,
    sizeMax: 3.2,
    sizePeakPos: 0.85,
    aspectRatio: 1.6,
    // 暗黑专属发光霓虹调色
    colorBase: { r: 59, g: 130, b: 246 },    // 柔和深海蓝
    colorHover: { r: 0, g: 242, b: 254 },    // 极光电光青
    colorAccent: { r: 139, g: 92, b: 246 },  // 星云紫
    mouseRepelDist: 160,
    mouseSenseDist: 340,
    colorChangeDist: 180,
    timeSpeed: 0.0002,
    minLife: 350,
    maxLife: 850,
    fadeSpeed: 0.02
  };

  const Simplex = (function () {
    const p = new Uint8Array([
      151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
    ]);
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    return {
      noise3D: (x, y, z) => {
        const F3 = 1.0 / 3.0, s = (x + y + z) * F3;
        const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
        const G3 = 1.0 / 6.0, t = (i + j + k) * G3;
        const X0 = i - t, Y0 = j - t, Z0 = k - t;
        const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;
        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
          if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
          else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
          else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
        } else {
          if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
          else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
          else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
        }
        const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;
        const ii = i & 255, jj = j & 255, kk = k & 255;
        const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
        const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
        const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
        const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        let n0 = t0 < 0 ? 0 : Math.pow(t0, 4) * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        let n1 = t1 < 0 ? 0 : Math.pow(t1, 4) * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        let n2 = t2 < 0 ? 0 : Math.pow(t2, 4) * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        let n3 = t3 < 0 ? 0 : Math.pow(t3, 4) * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
        return 32.0 * (n0 + n1 + n2 + n3);
      }
    };
  })();

  function getSpatialSize(n) {
    const d = Math.max(0, Math.min(1, n));
    const p = CONFIG.sizePeakPos;
    if (d < p) return CONFIG.sizeMin + Math.pow(d / p, 1.5) * (CONFIG.sizeMax - CONFIG.sizeMin);
    return CONFIG.sizeMin + (1 - Math.pow((d - p) / (1 - p), 0.6)) * (CONFIG.sizeMax - CONFIG.sizeMin);
  }

  const GhostVoid = {
    x: 0, y: 0, targetX: 0, targetY: 0, timer: 0, currentRadius: 0,
    init() { this.pickNewTarget(); this.x = this.targetX; this.y = this.targetY; },
    pickNewTarget() {
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.clusterRadius * (0.7 + Math.random() * 0.4);
      this.targetX = Math.cos(a) * r * CONFIG.clusterRatioX;
      this.targetY = Math.sin(a) * r * CONFIG.clusterRatioY;
      this.timer = CONFIG.voidWaitTime + Math.random() * 200;
    },
    update(t) {
      this.timer--;
      if (this.timer < 0) this.pickNewTarget();
      this.x += (this.targetX - this.x) * CONFIG.voidMoveSpeed;
      this.y += (this.targetY - this.y) * CONFIG.voidMoveSpeed;
      this.currentRadius = CONFIG.voidBaseSize + Math.sin(t * 0.01) * CONFIG.voidBreathing;
    }
  };

  class BioParticle {
    constructor(x, y) {
      this.homeX = x; this.homeY = y;
      const dx = this.homeX - width / 2;
      const dy = this.homeY - height / 2;
      const a = CONFIG.clusterRadius * CONFIG.clusterRatioX;
      const b = CONFIG.clusterRadius * CONFIG.clusterRatioY;
      const n = Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
      this.baseGeneSize = getSpatialSize(n);
      this.x = width / 2; this.y = height / 2;
      const an = Math.atan2(this.homeY - height / 2, this.homeX - width / 2);
      const f = CONFIG.explosionForce * (0.5 + Math.random() * 1.0);
      this.vx = Math.cos(an) * f; this.vy = Math.sin(an) * f;
      this.rotation = 0; this.phase = Math.random() * Math.PI * 2;
      this.resetLife(true);
      this.currentColor = { ...CONFIG.colorBase };
    }
    resetLife(i = false) {
      this.life = i ? Math.random() : 0;
      this.lifeSpeed = 1 / (CONFIG.minLife + Math.random() * (CONFIG.maxLife - CONFIG.minLife));
    }
    update(t, ex) {
      if (ex) {
        this.vx *= CONFIG.drag; this.vy *= CONFIG.drag;
        this.vx += (this.homeX - this.x) * CONFIG.returnStrength;
        this.vy += (this.homeY - this.y) * CONFIG.returnStrength;
        this.x += this.vx; this.y += this.vy;
        this.rotation = Math.atan2(this.vy, this.vx);
        this.currentSize = this.baseGeneSize;
        this.currentAlpha = 0.35;
        return;
      }
      this.life += this.lifeSpeed;
      if (this.life > 1 + CONFIG.fadeSpeed * 2) this.resetLife();
      let lf = 1;
      if (this.life < 0.2) lf = this.life / 0.2;
      else if (this.life > 0.8) lf = 1 - (this.life - 0.8) / 0.2;
      if (lf < 0) lf = 0;

      const ns = Simplex.noise3D(this.homeX * 0.003, this.homeY * 0.003, t * CONFIG.timeSpeed);
      const ang = ns * Math.PI * 2;
      const w = 2 + this.baseGeneSize;
      let bx = this.homeX + Math.cos(ang) * w;
      let by = this.homeY + Math.sin(ang) * w;
      const dx = bx - mouse.x;
      const dy = by - mouse.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      let px = 0, py = 0;
      let ta = ang;

      if (d < CONFIG.mouseSenseDist) {
        ta = Math.atan2(mouse.y - by, mouse.x - bx);
        if (d < CONFIG.colorChangeDist) {
          const b = 1 - (d / CONFIG.colorChangeDist);
          this.currentColor.r += (CONFIG.colorHover.r - this.currentColor.r) * 0.18 * b;
          this.currentColor.g += (CONFIG.colorHover.g - this.currentColor.g) * 0.18 * b;
          this.currentColor.b += (CONFIG.colorHover.b - this.currentColor.b) * 0.18 * b;
        }
        if (d < CONFIG.mouseRepelDist) {
          const f = Math.pow((CONFIG.mouseRepelDist - d) / CONFIG.mouseRepelDist, 2) * 48;
          px = Math.cos(Math.atan2(dy, dx)) * f;
          py = Math.sin(Math.atan2(dy, dx)) * f;
        }
      } else {
        this.currentColor.r += (CONFIG.colorBase.r - this.currentColor.r) * 0.04;
        this.currentColor.g += (CONFIG.colorBase.g - this.currentColor.g) * 0.04;
        this.currentColor.b += (CONFIG.colorBase.b - this.currentColor.b) * 0.04;
      }

      let df = ta - this.rotation;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.rotation += df * 0.1;
      this.x += (bx + px - this.x) * 0.1;
      this.y += (by + py - this.y) * 0.1;
      this.currentSize = this.baseGeneSize * (1 + Math.sin(t * 0.05 + this.phase) * 0.1) * lf;
      const af = (this.baseGeneSize - CONFIG.sizeMin) / (CONFIG.sizeMax - CONFIG.sizeMin);
      this.currentAlpha = (0.18 + af * 0.45) * lf;
    }
    draw() {
      if (this.currentSize < 0.2) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      const w = this.currentSize;
      ctx.fillStyle = `rgba(${this.currentColor.r},${this.currentColor.g},${this.currentColor.b},${this.currentAlpha})`;
      ctx.beginPath();
      ctx.arc(-w * CONFIG.aspectRatio / 4, 0, w / 2, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(w * CONFIG.aspectRatio / 4, 0, w / 2, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function initParticles() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(DPR, DPR);

    particles = [];
    for (let i = 0; i < CONFIG.particleCount * 2.5; i++) {
      if (particles.length >= CONFIG.particleCount) break;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * CONFIG.clusterRadius;
      const x = width / 2 + Math.cos(a) * r * CONFIG.clusterRatioX;
      const y = height / 2 + Math.sin(a) * r * CONFIG.clusterRatioY;
      let ok = true;
      for (let p of particles) {
        const dx = p.homeX - x;
        const dy = p.homeY - y;
        if (dx * dx + dy * dy < CONFIG.minDistance * CONFIG.minDistance) {
          ok = false;
          break;
        }
      }
      if (ok) particles.push(new BioParticle(x, y));
    }
    GhostVoid.init();
  }

  function animate() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    frameCount++;
    GhostVoid.update(frameCount);
    const ex = frameCount < CONFIG.introDuration;
    particles.forEach(p => {
      p.update(frameCount, ex);
      p.draw();
    });
    animationId = requestAnimationFrame(animate);
  }

  let lastMouseTs = 0;
  window.addEventListener('mousemove', e => {
    const now = performance.now();
    if (now - lastMouseTs > 16) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMouseTs = now;
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(initParticles, 250);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animationId) cancelAnimationFrame(animationId);
    } else {
      animate();
    }
  });

  initParticles();
  animate();
})();
