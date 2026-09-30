/* The tools chapter. Each tool is a spread: a page of copy beside a stage where
   one worked example shows what the tool does. Stages keep the book's paper, ink
   and seal; the only pictures on them are the author's own videos from this
   book, and every record in them is invented. */
(() => {
  'use strict';

  const supported = ['media-batch', 'capture-studio', 'game-debug'];
  const media = {
    batch: { src: 'assets/toolkit/batch-source.mp4', poster: 'assets/toolkit/batch-source.webp', still: 'assets/toolkit/batch-still.webp' },
    capture: { src: 'assets/toolkit/capture-play.mp4', poster: 'assets/toolkit/capture-play.webp' }
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const moving = () => !reducedMotion.matches;
  const beat = ms => moving() ? ms : 0;
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  const liquid = 'cubic-bezier(.22, 1, .36, 1)';
  const icons = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>'
  };
  let cleanups = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text, handler) {
    const node = el('button', className, text);
    node.type = 'button';
    if (handler) node.addEventListener('click', handler);
    return node;
  }

  // A pause that rejects as soon as its example is stopped, so a script can be
  // abandoned between any two beats. A visitor's own actions pass no signal.
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const stop = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
      signal?.addEventListener('abort', stop, { once: true });
    });
  }

  function animate(node, frames, options = {}) {
    if (!node?.animate || !moving()) return Promise.resolve();
    return node.animate(frames, { duration: 480, easing: liquid, ...options }).finished.catch(() => {});
  }

  async function type(node, text, signal, speed = 16) {
    if (!moving()) { node.textContent = text; return; }
    node.classList.add('is-typing');
    try {
      for (let index = 1; index <= text.length; index++) {
        node.textContent = text.slice(0, index);
        await wait(speed, signal);
      }
    } finally {
      node.classList.remove('is-typing');
    }
  }

  // A seal pressed onto paper: it lands a little large and turned, then settles.
  function stamp(node) {
    return animate(node, [
      { transform: 'scale(1.9) rotate(-16deg)', opacity: 0 },
      { transform: 'scale(.9) rotate(4deg)', opacity: 1, offset: .62 },
      { transform: 'none', opacity: 1 }
    ], { duration: 440, easing: 'cubic-bezier(.3, 1.3, .5, 1)' });
  }

  // A word leaves upward while its replacement rises into the same place.
  async function flip(holder, text) {
    const old = holder.lastElementChild;
    if (old?.textContent === text) return;
    const next = el('span', '', text);
    if (!old || !moving()) { holder.replaceChildren(next); return; }
    holder.append(next);
    await Promise.all([
      animate(old, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-105%)', opacity: 0 }], { duration: 380, fill: 'forwards' }),
      animate(next, [{ transform: 'translateY(105%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460 })
    ]);
    if (holder.lastElementChild === next) holder.replaceChildren(next);
  }

  // Digits on drums, so a changed number rolls into place. In the pattern every 0
  // is a drum and every other character is printed as it is.
  function odometer(pattern) {
    const node = el('span', 'odo');
    node.setAttribute('aria-hidden', 'true');
    const drums = [];
    for (const char of pattern) {
      if (char !== '0') { node.append(el('span', 'odo-mark', char)); continue; }
      const drum = el('span', 'odo-drum');
      for (let digit = 0; digit < 10; digit++) drum.append(el('span', '', String(digit)));
      node.append(drum);
      drums.push(drum);
    }
    // Leading zeros stay on the drums, faint, as on a mechanical counter.
    node.set = value => {
      const digits = String(Math.max(0, Math.round(value))).padStart(drums.length, '0').slice(-drums.length);
      const first = Math.min(digits.search(/[1-9]/) < 0 ? drums.length - 1 : digits.search(/[1-9]/), drums.length - 1);
      drums.forEach((drum, index) => {
        drum.style.transform = `translateY(${-Number(digits[index]) * 10}%)`;
        drum.classList.toggle('is-lead', index < first);
      });
      node.querySelectorAll('.odo-mark').forEach(mark => mark.classList.toggle('is-lead', !mark.previousElementSibling || mark.previousElementSibling.classList.contains('is-lead')));
    };
    node.set(0);
    return node;
  }

  // A row of choices with a lens that glides to the chosen one, like the masthead's.
  function segmented(className, label, entries, onChoose) {
    const node = el('div', `seg ${className}`);
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', label);
    const lens = el('i', 'seg-lens');
    lens.setAttribute('aria-hidden', 'true');
    node.append(lens);
    const buttons = new Map(entries.map(([key, text]) => {
      const choice = button('', text, () => onChoose(key));
      choice.dataset.key = key;
      node.append(choice);
      return [key, choice];
    }));
    let current = entries[0][0];
    const place = () => {
      const chosen = buttons.get(current);
      if (!chosen?.offsetWidth) return;
      lens.style.width = `${chosen.offsetWidth}px`;
      lens.style.transform = `translateX(${chosen.offsetLeft}px)`;
    };
    const resize = new ResizeObserver(place);
    resize.observe(node);
    cleanups.push(() => resize.disconnect());
    return {
      node,
      select(key) {
        current = key;
        buttons.forEach((choice, name) => choice.setAttribute('aria-pressed', String(name === key)));
        place();
      }
    };
  }

  function cover(canvas, source) {
    const width = source?.videoWidth || source?.naturalWidth;
    const height = source?.videoHeight || source?.naturalHeight;
    if (!width || !canvas.width || !canvas.height) return;
    const scale = Math.max(canvas.width / width, canvas.height / height);
    canvas.getContext('2d').drawImage(source, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
  }

  function clip({ src, poster }) {
    const video = el('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none', poster });
    video.setAttribute('aria-hidden', 'true');
    video.prepare = () => { if (!video.getAttribute('src')) video.src = src; };
    return video;
  }

  function image(src) {
    const node = el('img');
    Object.assign(node, { src, alt: '', decoding: 'async', draggable: false });
    return node;
  }

  // Each stage plays its one example when it is well on screen, then rests on
  // the result. Once it has left the screen it plays again on the way back. A
  // visitor who touches a stage keeps it until they scroll away.
  function direct(stage, scene) {
    let phase = 'idle';
    let controller = null;
    let ratio = 0;
    const active = () => !document.hidden && moving();
    const update = () => {
      if (ratio > 0 && active()) scene.resume?.();
      else scene.suspend?.();
      if (phase === 'idle' && ratio >= .35 && active()) {
        phase = 'playing';
        controller = new AbortController();
        const { signal } = controller;
        scene.play(signal).then(() => { if (!signal.aborted) phase = 'done'; }, error => {
          if (signal.aborted) return;
          console.error(error);
          phase = 'done';
        });
      } else if (phase === 'playing' && !(ratio > 0 && active())) {
        controller.abort();
        phase = 'idle';
      } else if (phase === 'done' && ratio === 0) {
        phase = 'idle';
      }
    };
    const view = new IntersectionObserver(([entry]) => {
      ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      update();
    }, { threshold: [0, .35, .6] });
    view.observe(stage);
    // Videos start loading about a screen before their stage arrives.
    const near = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      scene.prepare?.();
      near.disconnect();
    }, { rootMargin: '900px 0px' });
    near.observe(stage);
    const motion = () => {
      if (!moving()) {
        if (phase === 'playing') controller.abort();
        phase = 'idle';
        scene.still();
      }
      update();
    };
    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener?.('change', motion);
    cleanups.push(() => {
      controller?.abort();
      view.disconnect();
      near.disconnect();
      document.removeEventListener('visibilitychange', update);
      reducedMotion.removeEventListener?.('change', motion);
      scene.suspend?.();
    });
    return {
      takeOver() {
        if (phase === 'playing') controller.abort();
        phase = 'done';
      }
    };
  }

  /* ---------- 01 Video batch: one source, three formats ---------- */

  const batchLanguages = [
    { key: 'en', short: '英', title: 'NEW HERO', cta: 'PLAY NOW' },
    { key: 'th', short: '泰', title: 'ฮีโร่ใหม่', cta: 'เล่นเลย' },
    { key: 'vi', short: '越', title: 'TƯỚNG MỚI', cta: 'CHƠI NGAY' },
    { key: 'id', short: '印尼', title: 'HERO BARU', cta: 'MAIN SEKARANG' }
  ];
  const batchFormats = [
    { kind: 'portrait', name: '横竖', size: '1440 × 2560' },
    { kind: 'square', name: '横方', size: '1440 × 1440' },
    { kind: 'landscape', name: '横', size: '2560 × 1440' }
  ];
  const batchModes = [['blur', '模糊背景'], ['frame', '套底图']];
  // The tool's own naming: project, language, batch, request, clip, source → output shape, maker, date.
  const outputName = (language, format) => `DEMO_${language.short}_ob1_1_1_${format.name}_ZN_260930.mp4`;
  const outputNote = (format, mode, language) => format.kind === 'portrait'
    ? batchModes.find(([key]) => key === mode)[1]
    : format.kind === 'square' ? '套底图' : `片头片尾 · ${language.short}`;

  function batchScene() {
    const state = { language: 0, mode: 'blur', made: new Set(), primed: false };
    let manual;
    const node = el('div', 'scene batch');
    node.innerHTML = `
      <div class="batch-top">
        <figure class="batch-source">
          <figcaption class="scene-label"><b>源素材</b><span>横 · 2560 × 1440</span></figcaption>
          <div class="batch-screen"></div>
          <p class="batch-file" aria-hidden="true"><span><b class="flip batch-token"><span>英</span></b>_ob1_1.mp4</span><em>文件名识别 → <b class="flip batch-found"><span>英</span></b></em></p>
          <i class="batch-flow" aria-hidden="true"><i class="batch-pulse"></i></i>
        </figure>
        <div class="batch-result" aria-hidden="true">
          <p class="scene-label"><b>成品</b><span>一条素材，三种版式</span></p>
          <div class="batch-outputs">${batchFormats.map(format => `
            <figure class="batch-out" data-kind="${format.kind}">
              <div class="out-frame">
                ${format.kind === 'portrait' ? '<canvas class="out-blur" width="27" height="48"></canvas>' : ''}
                ${format.kind === 'landscape' ? '' : '<div class="out-template"><b class="flip out-title"></b><span class="flip out-cta"></span></div>'}
                <canvas class="out-video"></canvas>
                <i class="out-scan"></i>
              </div>
              <figcaption><b>${format.name}</b><span>${format.size}</span></figcaption>
            </figure>`).join('')}
          </div>
        </div>
      </div>
      <div class="batch-manifest" aria-hidden="true">
        <p class="scene-label"><b>产出清单</b><span class="batch-count"></span></p>
        <ol></ol>
      </div>
      <div class="batch-bar"></div>`;

    const video = clip(media.batch);
    const screen = node.querySelector('.batch-screen');
    screen.append(video);
    const poster = new Image();
    poster.decoding = 'async';
    poster.src = media.batch.poster;
    const manifest = node.querySelector('.batch-manifest ol');
    const flow = node.querySelector('.batch-flow');
    const count = odometer('00');
    node.querySelector('.batch-count').append(count, ' / 12 个成品');
    const outs = [...node.querySelectorAll('.batch-out')].map(figure => ({
      figure,
      kind: figure.dataset.kind,
      canvas: figure.querySelector('.out-video'),
      scan: figure.querySelector('.out-scan'),
      title: figure.querySelector('.out-title'),
      cta: figure.querySelector('.out-cta')
    }));
    const canvases = outs.map(out => out.canvas);
    const blur = node.querySelector('.out-blur');

    const languageControl = segmented('batch-languages', '素材语言', batchLanguages.map(language => [language.key, language.short]), chooseLanguage);
    const modeControl = segmented('batch-modes', '竖版做法', batchModes, chooseMode);
    const bar = node.querySelector('.batch-bar');
    for (const [label, control] of [['素材语言', languageControl], ['竖版做法', modeControl]]) {
      const field = el('div', 'batch-field');
      field.append(el('span', 'batch-field-label', label), control.node);
      bar.append(field);
    }

    // One decoded video feeds every output; each canvas redraws only when a new frame arrives.
    const current = () => video.readyState >= 2 ? video : poster;
    const paint = source => {
      canvases.forEach(canvas => cover(canvas, source));
      cover(blur, source);
    };
    // The arrow runs from the middle of the source to the outputs, or down to them on narrow stages.
    const aim = () => node.style.setProperty('--flow-y', `${screen.offsetTop + screen.offsetHeight / 2}px`);
    const sizer = new ResizeObserver(() => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvases.forEach(canvas => {
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
      });
      paint(current());
      aim();
    });
    [...canvases, screen].forEach(target => sizer.observe(target));
    cleanups.push(() => sizer.disconnect());
    poster.addEventListener('load', () => { if (video.readyState < 2) paint(poster); });
    let frame = 0;
    let last = -1;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.currentTime === last) return;
      last = video.currentTime;
      paint(video);
    };
    video.addEventListener('playing', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); });
    video.addEventListener('pause', () => cancelAnimationFrame(frame));

    function words(language, instant) {
      const set = (holder, text) => instant ? holder.replaceChildren(el('span', '', text)) : flip(holder, text);
      set(node.querySelector('.batch-token'), language.short);
      set(node.querySelector('.batch-found'), language.short);
      languageControl.select(language.key);
    }

    function pictures(language) {
      for (const out of outs) {
        out.title?.replaceChildren(el('span', '', language.title));
        out.cta?.replaceChildren(el('span', '', language.cta));
      }
    }

    function showMode(mode) {
      state.mode = mode;
      node.dataset.mode = mode;
      modeControl.select(mode);
    }

    const line = format => {
      const item = el('li');
      item.dataset.kind = format.kind;
      item.innerHTML = `<i class="stamp">${icons.check}</i><code></code><span class="note"></span>`;
      return item;
    };

    function fill(language) {
      manifest.replaceChildren(...batchFormats.map(format => {
        const item = line(format);
        item.classList.add('is-done');
        item.querySelector('code').textContent = outputName(language, format);
        item.querySelector('.note').textContent = outputNote(format, state.mode, language);
        return item;
      }));
    }

    async function write(language, signal) {
      const old = [...manifest.children];
      await Promise.all(old.map((item, index) => animate(item, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 240, delay: index * 40, fill: 'forwards' })));
      if (signal.aborted) return;
      manifest.replaceChildren(...batchFormats.map(line));
      for (const [index, format] of batchFormats.entries()) {
        const item = manifest.children[index];
        await type(item.querySelector('code'), outputName(language, format), signal, 12);
        item.querySelector('.note').textContent = outputNote(format, state.mode, language);
        item.classList.add('is-done');
        stamp(item.querySelector('.stamp'));
        await wait(beat(120), signal);
      }
    }

    // A light passes down each output as it is written out again.
    function sweep(out, delay = 0) {
      return animate(out.scan, [
        { transform: 'translateY(-100%)', opacity: 0 },
        { opacity: 1, offset: .15 },
        { transform: 'translateY(100%)', opacity: 0 }
      ], { duration: 700, delay, easing: 'cubic-bezier(.45, 0, .55, 1)' });
    }

    async function retitle(out, language, delay, signal) {
      sweep(out, delay);
      await wait(beat(delay + 300), signal);
      await Promise.all([out.title && flip(out.title, language.title), out.cta && flip(out.cta, language.cta)]);
    }

    function pulse() {
      const across = flow.clientWidth >= flow.clientHeight;
      const distance = (across ? flow.clientWidth : flow.clientHeight) - 8;
      return animate(flow.firstElementChild, [
        { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
        { opacity: 1, offset: .18 },
        { transform: `${across ? `translateX(${distance}px)` : `translateY(${distance}px)`} scale(1)`, opacity: 0 }
      ], { duration: 620, easing: 'cubic-bezier(.55, 0, .3, 1)' });
    }

    // The source is copied out into its three frames.
    async function fanOut(signal) {
      const from = screen.getBoundingClientRect();
      const base = node.getBoundingClientRect();
      await Promise.all(outs.map(async (out, index) => {
        const to = out.canvas.getBoundingClientRect();
        const ghost = el('canvas', 'batch-ghost');
        ghost.width = 192;
        ghost.height = 108;
        cover(ghost, current());
        Object.assign(ghost.style, { left: `${from.left - base.left}px`, top: `${from.top - base.top}px`, width: `${from.width}px`, height: `${from.height}px` });
        node.append(ghost);
        await animate(ghost, [
          { transform: 'none', opacity: 0 },
          { transform: 'none', opacity: 1, offset: .14 },
          { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`, opacity: 1 }
        ], { duration: 940, delay: index * 150, easing: 'cubic-bezier(.65, 0, .25, 1)', fill: 'forwards' });
        ghost.remove();
        if (signal.aborted) return;
        out.figure.classList.add('is-ready');
        sweep(out);
      }));
    }

    async function pass(index, signal) {
      const language = batchLanguages[index];
      state.language = index;
      words(language);
      await wait(beat(420), signal);
      await pulse();
      if (signal.aborted) return;
      await Promise.all(outs.map((out, order) => retitle(out, language, order * 120, signal)));
      await write(language, signal);
      state.made.add(language.key);
      count.set(state.made.size * 3);
    }

    function prime() {
      state.primed = true;
      outs.forEach(out => out.figure.classList.add('is-ready'));
    }

    function reset() {
      manual?.abort();
      node.querySelectorAll('.batch-ghost').forEach(ghost => ghost.remove());
      Object.assign(state, { language: 0, primed: false });
      state.made.clear();
      showMode('blur');
      words(batchLanguages[0], true);
      pictures(batchLanguages[0]);
      outs.forEach(out => out.figure.classList.remove('is-ready'));
      manifest.replaceChildren();
      count.set(0);
    }

    // A visitor can try another language or tall format on the same source.
    function chooseLanguage(key) {
      scene.director?.takeOver();
      manual?.abort();
      manual = new AbortController();
      if (!state.primed) {
        prime();
        fill(batchLanguages[state.language]);
        state.made.add(batchLanguages[state.language].key);
      }
      pass(batchLanguages.findIndex(language => language.key === key), manual.signal).catch(() => {});
    }

    function chooseMode(mode) {
      scene.director?.takeOver();
      showMode(mode);
      if (!state.primed) return;
      sweep(outs[0]);
      const note = manifest.querySelector('[data-kind="portrait"].is-done .note');
      if (note) note.textContent = outputNote(batchFormats[0], mode, batchLanguages[state.language]);
    }

    const scene = {
      node,
      caption: '演示 · 画面取自本书「动态视觉」里的一条投放视频',
      prepare: () => video.prepare(),
      resume() { video.prepare(); if (video.paused) video.play().catch(() => {}); },
      suspend: () => video.pause(),
      still() {
        video.pause();
        reset();
        prime();
        fill(batchLanguages[0]);
        state.made.add('en');
        count.set(3);
        paint(current());
      },
      async play(signal) {
        reset();
        await wait(500, signal);
        await fanOut(signal);
        if (signal.aborted) return;
        prime();
        await write(batchLanguages[0], signal);
        state.made.add('en');
        count.set(3);
      }
    };
    reset();
    return scene;
  }

  /* ---------- 02 Capture: one run, from switching level to a filed clip ---------- */

  const captureHeroes = ['A', 'B', 'C'];
  const captureTongues = ['EN', 'TH', 'ID', 'VI'];
  const captureSteps = ['切关', '开始录制', '文件增长', '进入战斗', '切换语言', 'AI 接管', '识别胜负', '停止录制', '文件稳定'];
  // Heroes take turns; each is recorded once in every language before the next.
  const captureOrder = index => ({ hero: captureHeroes[Math.floor(index / captureTongues.length)], tongue: captureTongues[index % captureTongues.length] });

  function captureScene() {
    const total = captureHeroes.length * captureTongues.length;
    const node = el('div', 'scene capture');
    node.innerHTML = `
      <div class="capture-main">
        <div class="capture-window">
          <div class="capture-hud" aria-hidden="true">
            <div class="hud-row"><span class="hud-pill hud-rec"><i></i>REC <b>00:00:00</b></span><span class="hud-pill hud-run"><span>英雄 A</span><em>第 41 关</em><span>EN</span></span></div>
            <i class="lock" data-lock="menu" style="--x:11%;--y:7%;--w:21%;--h:12%;--i:0"><span>菜单</span></i>
            <i class="lock" data-lock="timer" style="--x:50%;--y:6.5%;--w:12%;--h:10%;--i:1"><span>计时</span></i>
            <i class="lock" data-lock="skill" style="--x:84%;--y:77.5%;--w:14%;--h:25%;--i:2"><span>技能</span></i>
            <i class="lock is-hero" data-lock="hero" style="--x:50%;--y:48%;--w:9%;--h:19%;--i:0"><span>英雄</span></i>
            <b class="hud-won">胜利</b>
            <i class="hud-flash"></i>
          </div>
        </div>
        <ol class="capture-steps" aria-hidden="true">${captureSteps.map(step => `<li>${step}</li>`).join('')}</ol>
        <div class="capture-film" aria-hidden="true"><span class="scene-label"><b>已归档</b></span><ol class="capture-strip"></ol></div>
      </div>
      <aside class="capture-plan" aria-hidden="true">
        <p class="scene-label"><b>录制计划</b><span>第 41 关 · 草原</span></p>
        <div class="capture-grid"><span></span>${captureTongues.map(tongue => `<span>${tongue}</span>`).join('')}${captureHeroes.map(hero => `<span>${hero}</span>${captureTongues.map(() => '<i class="cell"></i>').join('')}`).join('')}</div>
        <p class="capture-total"></p>
        <p class="capture-eta">3 位英雄 × 4 种语言<br>预计挂机 48 分钟</p>
        <p class="capture-keys"><kbd>F8</kbd>开始<kbd>F9</kbd>安全退出<kbd>F10</kbd>诊断</p>
      </aside>`;

    const video = clip(media.capture);
    node.querySelector('.capture-window').prepend(video);
    const poster = new Image();
    poster.decoding = 'async';
    poster.src = media.capture.poster;
    const cells = [...node.querySelectorAll('.cell')];
    const steps = [...node.querySelectorAll('.capture-steps li')];
    const locks = [...node.querySelectorAll('.lock')];
    const strip = node.querySelector('.capture-strip');
    const clock = node.querySelector('.hud-rec b');
    const count = odometer('00');
    node.querySelector('.capture-total').append(count, ` / ${total} 段`);
    let clockTimer = 0;

    // A few seconds on the stage stand for a whole battle, so the recording clock races.
    function recording(on) {
      node.classList.toggle('is-recording', on);
      clearInterval(clockTimer);
      if (!on) return;
      const start = performance.now();
      const show = () => {
        const seconds = Math.floor((performance.now() - start) / 1000 * 42);
        clock.textContent = `00:${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
      };
      show();
      clockTimer = setInterval(show, 90);
    }

    const lock = (hero, on) => locks.forEach(item => { if (item.classList.contains('is-hero') === hero) item.classList.toggle('is-on', on); });

    async function step(index, ms, signal) {
      steps[index].classList.add('is-active');
      await wait(ms, signal);
      steps[index].classList.replace('is-active', 'is-done');
    }

    // The film holds a frame for every clip in the plan; recorded ones fill in.
    function blank() {
      strip.replaceChildren(...Array.from({ length: total }, (_, index) => {
        const { hero, tongue } = captureOrder(index);
        const item = el('li');
        item.append(el('span', 'frame'), el('span', 'caption', `${hero} · ${tongue}`));
        return item;
      }));
    }
    function file(index, source) {
      const item = strip.children[index];
      const shot = el('canvas');
      shot.width = 160;
      shot.height = 90;
      cover(shot, source);
      item.firstElementChild.replaceChildren(shot);
      item.classList.add('is-filed');
      animate(shot, [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'none' }], { duration: 560 });
    }

    function reset() {
      recording(false);
      clock.textContent = '00:00:00';
      node.classList.remove('is-won');
      locks.forEach(item => item.classList.remove('is-on'));
      steps.forEach(item => item.classList.remove('is-active', 'is-done'));
      cells.forEach(cell => cell.classList.remove('is-active', 'is-done'));
      count.set(0);
      blank();
    }

    async function record(index, signal) {
      cells[index].classList.add('is-active');
      await step(0, 460, signal);
      recording(true);
      await step(1, 360, signal);
      await step(2, 500, signal);
      lock(false, true);
      await step(3, 620, signal);
      await step(4, 480, signal);
      lock(true, true);
      await step(5, 2300, signal);
      lock(false, false);
      node.classList.add('is-won');
      stamp(node.querySelector('.hud-won'));
      await step(6, 640, signal);
      recording(false);
      animate(node.querySelector('.hud-flash'), [{ opacity: 0 }, { opacity: .8, offset: .2 }, { opacity: 0 }], { duration: 460, easing: 'ease-out' });
      file(index, video.readyState >= 2 ? video : poster);
      await step(7, 480, signal);
      await step(8, 440, signal);
      cells[index].classList.replace('is-active', 'is-done');
      stamp(cells[index]);
      count.set(index + 1);
    }

    const scene = {
      node,
      caption: '演示 · 游戏画面取自本书「动态视觉」，识别框与计划为示意',
      prepare: () => video.prepare(),
      resume() { video.prepare(); if (video.paused) video.play().catch(() => {}); },
      suspend: () => video.pause(),
      still() {
        video.pause();
        reset();
        steps.forEach(item => item.classList.add('is-done'));
        locks.forEach(item => item.classList.add('is-on'));
        node.classList.add('is-won');
        clock.textContent = '00:03:12';
        cells[0].classList.add('is-done');
        count.set(1);
        const draw = () => file(0, poster);
        if (poster.complete) draw(); else poster.addEventListener('load', draw, { once: true });
      },
      async play(signal) {
        reset();
        await wait(600, signal);
        await record(0, signal);
        await wait(900, signal);
        lock(true, false);
        node.classList.remove('is-won');
      }
    };
    reset();
    return scene;
  }

  /* ---------- 03 Debug: find a level, queue it, run it ---------- */

  const debugTabs = [
    { key: 'levels', name: '关卡定位', count: 200, head: ['关卡', '名称', '类型', '底图'] },
    { key: 'items', name: '物品发放', count: 243, head: ['代码', '名称', '类型', '用途'] },
    { key: 'roles', name: '角色/装备/藏品', count: 112, head: ['代码', '名称', '类别', '品级'] },
    { key: 'skills', name: '战斗技能', count: 330, head: ['代码', '名称', '类型', '属性'] },
    { key: 'gems', name: '宝石词条', count: 789, head: ['代码', '名称', '方向', '品质'] },
    { key: 'quick', name: '快捷调试', head: ['范围', '操作', '参数', ''] },
    { key: 'queue', name: '批量方案' },
    { key: 'logs', name: '日志与崩溃' }
  ];
  // Invented records in the shape of the real tables; no game's own data leaves the tool.
  const debugRecords = {
    levels: [
      { code: 'LV-041', name: '林地入口', type: '复合关卡', place: '草原', level: 41, goal: '击杀关底首领', time: '3 分钟' },
      { code: 'LV-056', name: '雪原前哨', type: '精英突袭', place: '雪地', level: 56, goal: '击败精英', time: '3 分钟' },
      { code: 'LV-072', name: '沙海遗迹', type: '复合关卡', place: '沙漠', level: 72, goal: '击杀关底首领', time: '4 分钟' },
      { code: 'LV-095', name: '寒霜要塞', type: '首领突袭', place: '雪地', level: 95, goal: '击败首领', time: '2 分钟' },
      { code: 'LV-118', name: '远山营地', type: '精英突袭', place: '山海', level: 118, goal: '击败精英', time: '3 分钟' },
      { code: 'LV-142', name: '古城回廊', type: '首领突袭', place: '城堡', level: 142, goal: '击败首领', time: '2 分钟' }
    ],
    items: [
      { code: 'IT-001', name: '金币', type: '货币', place: '通用', amount: 9999 },
      { code: 'IT-014', name: '体力补给', type: '消耗品', place: '探索', amount: 50 },
      { code: 'IT-027', name: '训练手册', type: '材料', place: '成长', amount: 200 },
      { code: 'IT-033', name: '探索凭证', type: '消耗品', place: '活动', amount: 20 },
      { code: 'IT-048', name: '金币礼盒', type: '礼包', place: '通用', amount: 10 }
    ],
    roles: [
      { code: 'HR-07', name: '寒霜枪手', type: '角色', place: '五星' },
      { code: 'EQ-112', name: '巡游者长剑', type: '装备', place: '史诗' },
      { code: 'CL-203', name: '晨光指环', type: '藏品', place: '橙色' }
    ],
    skills: [
      { code: 'SK-112', name: '冰棱穿刺', type: '主动', place: '冰' },
      { code: 'SK-130', name: '雷霆链', type: '主动', place: '雷' },
      { code: 'SK-207', name: '坚守', type: '被动', place: '防御' }
    ],
    gems: [
      { code: 'GM-305', name: '暴击词条', type: '攻击', place: '紫色' },
      { code: 'GM-318', name: '吸血词条', type: '生存', place: '橙色' },
      { code: 'GM-342', name: '冷却词条', type: '技能', place: '紫色' }
    ],
    quick: [
      { code: '战斗内', name: '设置攻击力', type: '5,000', place: '', amount: 5000, command: 'Battle.SetAttack 5000' },
      { code: '战斗内', name: '设置最大生命', type: '80,000', place: '', command: 'Battle.SetHealth 80000' },
      { code: '战斗内', name: '立即战斗胜利', type: '—', place: '', command: 'Battle.Win' },
      { code: '界面', name: '关闭屏幕调试信息', type: '录屏前', place: '', command: 'Screen.Messages off' },
      { code: '界面', name: '显示 FPS', type: '—', place: '', command: 'Screen.Fps on' }
    ]
  };
  const debugCommand = (tab, record) => ({
    levels: `Level.Jump ${record.level - 1}`,
    items: `Item.Give ${record.code} ${record.amount}`,
    roles: `Role.Grant ${record.code}`,
    skills: `Skill.Grant ${record.code}`,
    gems: `Gem.Affix ${record.code}`,
    quick: record.command
  })[tab];
  const debugNote = (tab, record) => ({
    levels: `主线第 ${record.level} 关，按表格规则发送 ${record.level - 1}`,
    items: '物品会直接发到调试账号',
    roles: '会修改调试账号的进度',
    skills: '战斗内命令需角色已经进入关卡',
    gems: '临时词条，只用于测试，不会保存',
    quick: record.code === '战斗内' ? '战斗内命令需角色已经进入关卡' : '录屏或测试前先关掉屏幕调试信息'
  })[tab];
  const debugAction = (tab, record) => ({ levels: `跳转 ${record.name}`, items: `发放 ${record.name} × ${record.amount?.toLocaleString('en-US')}` })[tab] || record.name;
  // The example: find the snowfield levels and send the first one to the game.
  const debugExample = { query: '雪地', code: 'LV-056' };

  function filterRecords(records, query) {
    const words = String(query).trim().toLowerCase();
    if (!words) return records;
    return records.filter(record => [record.code, record.name, record.type, record.place].some(value => String(value).toLowerCase().includes(words)));
  }

  function debugScene() {
    const state = { tab: 'levels', query: '', selected: null, queue: [], log: [] };
    const node = el('div', 'scene debug');
    node.innerHTML = `
      <header class="debug-bar"><b>游戏调试台</b><span class="debug-live"><i></i>已连接游戏</span><span>鼠标保护 · 开</span></header>
      <div class="debug-tabs" role="group" aria-label="数据页签"><i class="seg-lens" aria-hidden="true"></i></div>
      <div class="debug-list">
        <label class="debug-search">${icons.search}<input type="search" placeholder="搜索代码或中文" aria-label="搜索示例数据" autocomplete="off" spellcheck="false"></label>
        <div class="debug-head" aria-hidden="true"></div>
        <ol class="debug-rows"></ol>
        <p class="debug-meta"></p>
      </div>
      <aside class="debug-inspect">
        <p class="scene-label"><b>将执行的命令</b><span class="inspect-code"></span></p>
        <h4 class="inspect-name"></h4>
        <dl class="inspect-facts"></dl>
        <p class="inspect-amount" hidden><span>数量</span></p>
        <p class="inspect-command"><code></code></p>
        <p class="inspect-note"></p>
        <div class="inspect-actions"></div>
      </aside>
      <section class="debug-queue" aria-label="批量方案">
        <p class="scene-label"><b>批量方案</b><span class="queue-count"></span></p>
        <ol></ol>
        <div class="queue-actions"></div>
      </section>`;
    const tabsNode = node.querySelector('.debug-tabs');
    const lens = tabsNode.querySelector('.seg-lens');
    const input = node.querySelector('input');
    const rows = node.querySelector('.debug-rows');
    const queueList = node.querySelector('.debug-queue ol');
    const commandNode = node.querySelector('.inspect-command code');
    const amount = odometer('0,000');
    node.querySelector('.inspect-amount').append(amount);
    const add = button('debug-add', '加入批量', () => user(enqueue));
    const runAll = button('debug-run', '执行全部', () => user(execute));
    node.querySelector('.inspect-actions').append(add);
    node.querySelector('.queue-actions').append(runAll);
    const tabButtons = new Map(debugTabs.map(tab => {
      const choice = button('', undefined, () => user(() => switchTab(tab.key)));
      choice.dataset.key = tab.key;
      choice.append(el('span', '', tab.name));
      if (tab.count) choice.append(el('small', '', String(tab.count)));
      tabsNode.append(choice);
      return [tab.key, choice];
    }));
    const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

    const placeLens = () => {
      const chosen = tabButtons.get(state.tab);
      if (!chosen?.offsetWidth) return;
      lens.style.width = `${chosen.offsetWidth}px`;
      lens.style.transform = `translateX(${chosen.offsetLeft}px)`;
      // Keep the chosen tab in view on narrow stages without moving the page.
      const left = chosen.offsetLeft - (tabsNode.clientWidth - chosen.offsetWidth) / 2;
      tabsNode.scrollTo({ left: Math.max(0, left), behavior: moving() ? 'smooth' : 'auto' });
    };
    // A fade at the right edge says there are more tabs, until the last one is in view.
    const edge = () => tabsNode.classList.toggle('is-scrolling', tabsNode.scrollWidth - tabsNode.clientWidth - tabsNode.scrollLeft > 4);
    tabsNode.addEventListener('scroll', edge, { passive: true });
    const resize = new ResizeObserver(() => { placeLens(); edge(); });
    resize.observe(tabsNode);
    cleanups.push(() => resize.disconnect());

    const filtered = () => debugRecords[state.tab] ? filterRecords(debugRecords[state.tab], state.query) : [];

    // Rows are drawn afresh; rows that stay glide from where they were.
    function list() {
      const tab = debugTabs.find(entry => entry.key === state.tab);
      const before = new Map([...rows.children].map(row => [row.dataset.key, row.getBoundingClientRect().top]));
      let records;
      let heads = tab.head;
      if (tab.key === 'queue') {
        records = state.queue.map((entry, index) => ({ code: pad(index + 1), name: entry.action, type: entry.done ? '已执行' : '待执行', place: '', key: entry.key }));
        heads = ['序号', '操作', '状态', ''];
      } else if (tab.key === 'logs') {
        records = state.log.map((entry, index) => ({ code: entry.time, name: entry.text, type: '成功', place: '', key: `log-${index}` }));
        heads = ['时间', '记录', '结果', ''];
      } else {
        records = filtered();
      }
      node.querySelector('.debug-head').replaceChildren(...heads.map(text => el('span', '', text)));
      const query = state.query.trim();
      const mark = text => {
        const span = el('span');
        const at = query ? String(text).toLowerCase().indexOf(query.toLowerCase()) : -1;
        if (at < 0) { span.textContent = text; return span; }
        span.append(String(text).slice(0, at), el('mark', '', String(text).slice(at, at + query.length)), String(text).slice(at + query.length));
        return span;
      };
      rows.replaceChildren(...records.map(record => {
        const row = el('li');
        row.dataset.key = record.key || record.code + record.name;
        const pick = button('debug-row', undefined, () => user(() => choose(record)));
        pick.setAttribute('aria-pressed', String(state.selected === record));
        pick.append(mark(record.code), mark(record.name), mark(record.type), mark(record.place));
        if (!debugRecords[state.tab]) pick.disabled = true;
        row.append(pick);
        return row;
      }));
      if (!records.length) rows.append(el('li', 'debug-empty', tab.key === 'queue' ? '批量方案还是空的。' : tab.key === 'logs' ? '还没有执行记录。' : '没有找到，换个关键词试试。'));
      [...rows.children].forEach((row, index) => {
        const top = before.get(row.dataset.key);
        const after = row.getBoundingClientRect().top;
        if (top === undefined) animate(row, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: index * 30 });
        else if (Math.abs(top - after) > .5) animate(row, [{ transform: `translateY(${top - after}px)` }, { transform: 'none' }], { duration: 420 });
      });
      const total = debugRecords[state.tab] ? (tab.count || debugRecords[state.tab].length) : records.length;
      node.querySelector('.debug-meta').textContent = debugRecords[state.tab]
        ? `显示 ${records.length} 条 · 共 ${total} 条 · 示例数据`
        : `${records.length} 条`;
    }

    function inspect(animateIn) {
      const record = state.selected;
      const tab = state.tab;
      const content = node.querySelector('.debug-inspect');
      content.classList.toggle('is-empty', !record);
      node.querySelector('.inspect-code').textContent = record?.code || '';
      node.querySelector('.inspect-name').textContent = record ? record.name : '选一条数据';
      const facts = record ? [['类型', record.type], ['底图', tab === 'levels' ? record.place : ''], ['目标', record.goal], ['时长', record.time], ['用途', tab === 'items' ? record.place : '']].filter(([, value]) => value) : [];
      node.querySelector('.inspect-facts').replaceChildren(...facts.map(([term, value]) => {
        const row = el('div');
        row.append(el('dt', '', term), el('dd', '', value));
        return row;
      }));
      node.querySelector('.inspect-amount').hidden = !(record?.amount);
      if (record?.amount) amount.set(record.amount);
      commandNode.textContent = record ? debugCommand(tab, record) : '';
      node.querySelector('.inspect-note').textContent = record ? debugNote(tab, record) : '在左侧选中条目后，这里会生成对应的命令。';
      add.disabled = !record || state.queue.some(entry => entry.key === tab + record.code + record.name);
      runAll.disabled = !state.queue.some(entry => !entry.done);
      if (animateIn) animate(content.querySelector('.inspect-name'), [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
    }

    function drawQueue() {
      node.querySelector('.queue-count').textContent = `${state.queue.length} 项`;
      queueList.replaceChildren(...state.queue.map((entry, index) => {
        const item = el('li', entry.done ? 'is-done' : '');
        item.dataset.key = entry.key;
        item.innerHTML = `<i class="stamp">${icons.check}</i>`;
        item.append(el('span', 'queue-n', pad(index + 1)), el('span', 'queue-action', entry.action), el('time', '', entry.time || ''));
        return item;
      }));
      if (!state.queue.length) queueList.append(el('li', 'debug-empty', '把常用操作排在一起，一次执行。'));
      runAll.disabled = !state.queue.some(entry => !entry.done);
    }

    function choose(record) {
      state.selected = record;
      const shown = filtered();
      rows.querySelectorAll('.debug-row').forEach((row, index) => row.setAttribute('aria-pressed', String(shown[index] === record)));
      inspect(true);
    }

    function switchTab(key) {
      state.tab = key;
      state.query = '';
      input.value = '';
      input.disabled = !debugRecords[key];
      tabButtons.forEach((choice, name) => choice.setAttribute('aria-pressed', String(name === key)));
      placeLens();
      state.selected = filtered()[0] || null;
      list();
      inspect(true);
    }

    // The example types into the field without taking the visitor's keyboard focus.
    async function search(text, signal) {
      const field = input.parentElement;
      field.classList.add('is-typing-in');
      try {
        for (let index = 1; index <= text.length; index++) {
          input.value = text.slice(0, index);
          state.query = input.value;
          list();
          await wait(beat(280), signal);
        }
      } finally {
        field.classList.remove('is-typing-in');
      }
    }

    // The chosen command flies down into the batch plan.
    async function enqueue() {
      const record = state.selected;
      if (!record || add.disabled) return;
      const entry = { key: state.tab + record.code + record.name, action: debugAction(state.tab, record), command: debugCommand(state.tab, record), done: false };
      const from = commandNode.getBoundingClientRect();
      state.queue.push(entry);
      drawQueue();
      inspect();
      const landed = queueList.querySelector(`[data-key="${CSS.escape(entry.key)}"]`);
      const to = landed.querySelector('.queue-action').getBoundingClientRect();
      if (!moving() || !from.width) return;
      const base = node.getBoundingClientRect();
      const ghost = el('span', 'debug-ghost', entry.command);
      Object.assign(ghost.style, { left: `${from.left - base.left}px`, top: `${from.top - base.top}px` });
      node.append(ghost);
      landed.style.opacity = '0';
      await animate(ghost, [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(.92)`, opacity: .2 }
      ], { duration: 700, easing: 'cubic-bezier(.6, 0, .25, 1)', fill: 'forwards' });
      ghost.remove();
      landed.style.opacity = '';
      animate(landed, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
    }

    async function execute(signal) {
      runAll.disabled = true;
      add.disabled = true;
      for (const entry of state.queue) {
        if (entry.done) continue;
        const item = queueList.querySelector(`[data-key="${CSS.escape(entry.key)}"]`);
        item?.classList.add('is-running');
        await wait(beat(760), signal);
        entry.done = true;
        entry.time = now();
        state.log.unshift({ time: entry.time, text: entry.action });
        item?.classList.replace('is-running', 'is-done');
        if (item) {
          item.querySelector('time').textContent = entry.time;
          stamp(item.querySelector('.stamp'));
        }
      }
      if (state.tab === 'queue' || state.tab === 'logs') list();
      inspect();
    }

    async function press(target, signal) {
      target.classList.add('is-pressed');
      await wait(beat(170), signal);
      target.classList.remove('is-pressed');
    }

    function reset() {
      node.querySelectorAll('.debug-ghost').forEach(ghost => ghost.remove());
      state.queue = [];
      state.log = [];
      drawQueue();
      tabButtons.forEach((choice, name) => choice.setAttribute('aria-pressed', String(name === 'levels')));
      state.tab = 'levels';
      state.query = '';
      input.value = '';
      input.disabled = false;
      state.selected = debugRecords.levels[0];
      placeLens();
      list();
      inspect();
    }

    // A visitor's click or keystroke takes the stage over from the example.
    function user(action) {
      scene.director?.takeOver();
      return Promise.resolve(action()).catch(() => {});
    }
    input.addEventListener('focus', () => scene.director?.takeOver());
    input.addEventListener('input', () => user(() => {
      state.query = input.value;
      list();
      if (!filtered().includes(state.selected)) { state.selected = filtered()[0] || null; inspect(true); }
    }));

    const example = () => debugRecords.levels.find(record => record.code === debugExample.code);
    const scene = {
      node,
      caption: '演示 · 表中数据均为示例',
      still() {
        reset();
        state.query = debugExample.query;
        input.value = debugExample.query;
        list();
        choose(example());
        state.queue = [{ key: `levels${example().code}${example().name}`, action: debugAction('levels', example()), done: true, time: '17:24:08' }];
        drawQueue();
        inspect();
      },
      async play(signal) {
        reset();
        await wait(700, signal);
        await search(debugExample.query, signal);
        await wait(420, signal);
        choose(example());
        await type(commandNode, debugCommand('levels', example()), signal, 36);
        await wait(700, signal);
        await press(add, signal);
        await enqueue();
        await wait(800, signal);
        await press(runAll, signal);
        await execute(signal);
      }
    };
    reset();
    return scene;
  }

  const scenes = { 'media-batch': batchScene, 'capture-studio': captureScene, 'game-debug': debugScene };

  /* ---------- The chapter ---------- */

  function chapter(config, number) {
    if (!Array.isArray(config?.projects)) return null;
    const seen = new Set();
    const tools = config.projects.filter(tool => {
      if (!tool || !supported.includes(tool.id) || seen.has(tool.id) || tool.visible === false
        || typeof tool.name !== 'string' || !tool.name.trim()) return false;
      seen.add(tool.id);
      return true;
    }).sort((a, b) => (a.order || 0) - (b.order || 0));
    return tools.length ? {
      number, id: 'work-tools', category: { name: 'AI 工作工具', en: 'AI Toolkit' }, plates: [], tools
    } : null;
  }

  // In the contents the chapter is a strip: a scrap of the debug ledger and two
  // stills from its stages, fanned like prints.
  function contents(chapter) {
    const item = el('li', 'tool-toc-item');
    const link = el('a', 'toc-card tool-toc');
    link.href = '#work-tools';
    const art = el('span', 'tool-toc-art');
    art.setAttribute('aria-hidden', 'true');
    const ledger = el('span', 'tool-toc-ledger');
    ledger.innerHTML = '<i></i><i></i><i></i><i></i>';
    art.append(ledger, image(media.capture.poster), image(media.batch.still));
    const text = el('span', 'tool-toc-copy');
    text.append(el('span', 'toc-num', pad(chapter.number)), el('span', 'tool-toc-name', chapter.category.name), el('span', 'tool-toc-en', 'AI-assisted. Built for work.'));
    const names = el('span', 'tool-toc-names');
    names.append(...chapter.tools.map(tool => el('span', '', tool.name)));
    const count = el('span', 'toc-count', `${chapter.tools.length} 款`);
    const arrow = el('span', 'toc-arrow');
    arrow.innerHTML = icons.down;
    count.append(arrow);
    link.append(art, text, names, count);
    item.append(link);
    return item;
  }

  // On the cover each tool drifts among the works as a small print of its stage.
  const tileRatios = { 'media-batch': 1.25, 'capture-studio': 16 / 9, 'game-debug': .94 };
  function tile(tool) {
    const node = el('span', 'reel-tool');
    node.dataset.tool = tool.id;
    if (tool.id === 'media-batch') {
      // The same picture as a tall cut with a blurred backdrop, on a square template, and as it came.
      for (const kind of ['portrait', 'square', 'landscape']) {
        const frame = el('i', `reel-frame is-${kind}`);
        if (kind === 'portrait') frame.append(image(media.batch.still));
        frame.append(image(media.batch.still));
        node.append(frame);
      }
    } else if (tool.id === 'capture-studio') {
      node.append(image(media.capture.poster));
      node.insertAdjacentHTML('beforeend', '<i class="reel-lock" style="--x:50%;--y:6.5%;--w:12%;--h:10%"></i><i class="reel-lock" style="--x:84%;--y:77.5%;--w:14%;--h:25%"></i><i class="reel-lock is-hero" style="--x:50%;--y:48%;--w:9%;--h:19%"></i><b class="reel-rec"><i></i>REC</b>');
    } else {
      node.innerHTML = '<b>游戏调试台</b><i class="reel-search">雪地</i><i>LV-041　林地入口</i><i class="is-on">LV-056　雪原前哨</i><i>LV-095　寒霜要塞</i><code>&gt; Level.Jump 55</code>';
    }
    return node;
  }

  function spread(tool, index) {
    const article = el('article', 'tool-spread');
    article.id = `tool-${tool.id}`;
    article.dataset.tool = tool.id;
    article.setAttribute('aria-labelledby', `tool-${tool.id}-title`);
    const scene = scenes[tool.id]();
    const stage = el('figure', 'tool-stage');
    stage.append(scene.node, el('figcaption', 'tool-stage-caption', scene.caption));
    const copy = el('div', 'tool-copy');
    const head = el('div', 'tool-head');
    const number = el('p', 'tool-num', pad(index + 1));
    number.setAttribute('aria-hidden', 'true');
    const eyebrow = el('p', 'tool-eyebrow', tool.discipline || '');
    if (tool.en) {
      const english = el('span', '', tool.en);
      english.lang = 'en';
      eyebrow.append(english);
    }
    const title = el('h3', 'tool-name', tool.name);
    title.id = `tool-${tool.id}-title`;
    head.append(number, eyebrow, title);
    if (tool.summary) head.append(el('p', 'tool-lead', tool.summary));
    const body = el('div', 'tool-body');
    const cases = [['问题', tool.problem], ['做法', tool.approach]].filter(([, text]) => text);
    if (cases.length) {
      const list = el('dl', 'tool-case');
      for (const [term, text] of cases) {
        const row = el('div');
        row.append(el('dt', '', term), el('dd', '', text));
        list.append(row);
      }
      body.append(list);
    }
    const facts = (tool.facts || []).filter(fact => fact?.value && fact?.label);
    if (facts.length) {
      const list = el('dl', 'tool-facts');
      for (const fact of facts) {
        const row = el('div');
        const value = el('dd', 'tool-fact-value', fact.value);
        if (fact.unit) value.append(el('small', '', fact.unit));
        row.append(el('dt', '', fact.label), value);
        list.append(row);
      }
      body.append(list);
    }
    if (tool.stack?.length) body.append(el('p', 'tool-stack', tool.stack.join(' · ')));
    copy.append(head, body);
    article.append(copy, stage);
    scene.director = direct(stage, scene);
    if (!moving()) scene.still();
    return article;
  }

  function render(chapter) {
    cleanups.forEach(cleanup => cleanup());
    cleanups = [];
    const section = el('section', 'chapter wrap tool-chapter');
    section.id = chapter.id;
    section.setAttribute('aria-labelledby', 'work-tools-title');
    const head = el('header', 'chapter-head');
    const num = el('p', 'chapter-num', pad(chapter.number));
    num.setAttribute('aria-hidden', 'true');
    const titles = el('div', 'chapter-titles');
    const title = el('h2', '', chapter.category.name);
    title.id = 'work-tools-title';
    const english = el('span', '', chapter.category.en);
    english.lang = 'en';
    title.append(english);
    titles.append(title);
    head.append(num, titles, el('p', 'chapter-count', `${chapter.tools.length} 款`));
    const intro = el('div', 'tool-intro');
    intro.append(el('p', 'tool-statement', '把重复劳动，写成自己的工具。'),
      el('p', 'tool-description', '从游戏调试、自动录屏到视频交付，用 AI 辅助开发，把工作中的具体问题变成可复用的流程。'));
    const spreads = chapter.tools.map(spread);
    // Spreads rise into place the first time they are reached, like the plates.
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      reveal.unobserve(entry.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    spreads.forEach(item => reveal.observe(item));
    cleanups.push(() => reveal.disconnect());
    const foot = el('div', 'chapter-foot');
    const back = el('a', 'chapter-next', '返回目录');
    back.href = '#contents';
    back.insertAdjacentHTML('beforeend', icons.down);
    foot.append(el('p', 'chapter-progress', 'AI 辅助开发 · 工作中使用的桌面工具'), back);
    section.append(head, intro, ...spreads, foot);
    return section;
  }

  window.PortfolioTools = { chapter, contents, render, tile, tileRatio: tool => tileRatios[tool.id] || 1.3 };
})();
