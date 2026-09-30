/* Portfolio case studies, not the desktop programs. Every demo stays in this page. */
(() => {
  'use strict';

  const supported = ['media-batch', 'capture-studio', 'game-debug'];
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const pad = value => String(value).padStart(2, '0');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, handler) => {
    const node = el('button', className, text);
    node.type = 'button';
    if (handler) node.addEventListener('click', handler);
    return node;
  };
  const image = tool => {
    const node = el('img');
    node.src = tool.cover;
    node.alt = '';
    node.width = 960;
    node.height = 640;
    node.loading = 'lazy';
    node.decoding = 'async';
    node.draggable = false;
    return node;
  };

  let catalog = [];
  let dialog;
  let returnFocus;
  let dispose = () => {};
  let disposeCovers = () => {};
  const transitions = new WeakMap();
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function animate(node, frames, duration = 420) {
    if (!node?.animate || reducedMotion()) return;
    transitions.get(node)?.cancel();
    const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
    transitions.set(node, animation);
    return animation;
  }

  function activateCovers(section) {
    disposeCovers();
    const cards = [...section.querySelectorAll('.tool-card')];
    // CSS runs the artwork loops. JavaScript only follows actual pointer input.
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-live', entry.isIntersecting);
        if (entry.isIntersecting) entry.target.classList.add('has-entered');
      });
    }, { threshold: .12 }) : null;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const cleanups = [];
    cards.forEach((card, index) => {
      card.style.setProperty('--card-delay', `${index * 95}ms`);
      if (observer) observer.observe(card);
      else card.classList.add('is-live', 'has-entered');
      const surface = card.querySelector('.tool-card-art');
      const trigger = card.querySelector('.tool-card-open');
      let frame = 0;
      const reset = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        card.classList.remove('is-pointed');
        ['--rx', '--ry', '--depth-x', '--depth-y', '--spot-x', '--spot-y'].forEach(name => surface.style.removeProperty(name));
      };
      const move = event => {
        if (!pointer.matches || reducedMotion() || event.pointerType !== 'mouse') return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const bounds = trigger.getBoundingClientRect();
          const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
          const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
          card.classList.add('is-pointed');
          surface.style.setProperty('--rx', `${-y * 4}deg`);
          surface.style.setProperty('--ry', `${x * 6}deg`);
          surface.style.setProperty('--depth-x', `${x * 18}px`);
          surface.style.setProperty('--depth-y', `${y * 12}px`);
          surface.style.setProperty('--spot-x', `${(x + 1) * 50}%`);
          surface.style.setProperty('--spot-y', `${(y + 1) * 50}%`);
          frame = 0;
        });
      };
      trigger.addEventListener('pointermove', move, { passive: true });
      trigger.addEventListener('pointerleave', reset);
      trigger.addEventListener('blur', reset);
      trigger.addEventListener('click', reset);
      cleanups.push(() => {
        reset();
        trigger.removeEventListener('pointermove', move);
        trigger.removeEventListener('pointerleave', reset);
        trigger.removeEventListener('blur', reset);
        trigger.removeEventListener('click', reset);
      });
    });
    const visibility = () => section.classList.toggle('is-tab-hidden', document.hidden);
    document.addEventListener('visibilitychange', visibility);
    visibility();
    disposeCovers = () => {
      observer?.disconnect();
      cleanups.forEach(cleanup => cleanup());
      document.removeEventListener('visibilitychange', visibility);
    };
  }

  function chapter(config, number) {
    catalog = [];
    if (!Array.isArray(config?.projects)) return null;
    const seen = new Set();
    catalog = config.projects.filter(tool => {
      if (!tool || !supported.includes(tool.id) || seen.has(tool.id) || tool.visible === false
        || !/^assets\/toolkit\/[a-z-]+\.svg$/.test(tool.cover || '') || typeof tool.name !== 'string' || !tool.name.trim()) return false;
      seen.add(tool.id);
      return true;
    }).sort((a, b) => (a.order || 0) - (b.order || 0));
    return catalog.length ? {
      number, id: 'work-tools', category: { name: 'AI 工作工具', en: 'AI Toolkit' },
      plates: [], tools: catalog
    } : null;
  }

  function contents(chapter) {
    const item = el('li', 'tool-toc-item');
    const link = el('a', 'toc-card tool-toc is-loaded');
    link.href = '#work-tools';
    const cover = el('span', 'tool-toc-art');
    cover.setAttribute('aria-hidden', 'true');
    chapter.tools.forEach(tool => cover.append(image(tool)));
    const text = el('span', 'tool-toc-copy');
    text.append(el('span', 'toc-num', pad(chapter.number)),
      el('span', 'tool-toc-name', chapter.category.name),
      el('span', 'tool-toc-en', 'AI-assisted. Built for work.'));
    const names = el('span', 'tool-toc-names');
    names.append(...chapter.tools.map(tool => el('span', '', tool.name)));
    const count = el('span', 'toc-count', `${chapter.tools.length} 款`);
    const icon = el('span', 'toc-arrow');
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg>';
    count.append(icon);
    link.append(cover, text, names, count);
    item.append(link);
    return item;
  }

  function render(chapter) {
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
    const intro = el('div', 'tool-chapter-intro');
    intro.append(el('p', 'tool-chapter-statement', '把重复劳动，写成自己的工具。'),
      el('p', 'tool-chapter-description', '从游戏调试、自动录屏到视频交付，用 AI 辅助开发，把工作中的具体问题变成可复用的流程。'));
    const grid = el('ul', 'tool-grid');
    chapter.tools.forEach((tool, index) => {
      const item = el('li');
      const card = el('article', 'tool-card');
      card.dataset.tool = tool.id;
      const heading = el('h3');
      const open = button('tool-card-open', undefined, () => openTool(tool, open));
      open.setAttribute('aria-label', `查看${tool.name}，打开项目与交互演示`);
      const art = el('span', 'tool-card-art');
      art.append(window.PortfolioToolArt?.(tool.id) || image(tool));
      const chip = el('span', 'tool-card-chip', '进入工作台');
      chip.insertAdjacentHTML('beforeend', arrow);
      art.append(chip);
      const copy = el('span', 'tool-card-copy');
      const eyebrow = el('span', 'tool-card-eyebrow', `${pad(index + 1)} / ${tool.en}`);
      eyebrow.lang = 'en';
      const tags = el('span', 'tool-card-tags');
      (tool.tags || []).forEach(tag => tags.append(el('span', '', tag)));
      copy.append(eyebrow, el('span', 'tool-card-title', tool.name), el('span', 'tool-card-summary', tool.summary), tags);
      open.append(art, copy);
      heading.append(open);
      card.append(heading);
      item.append(card);
      grid.append(item);
    });
    const foot = el('div', 'chapter-foot');
    const back = el('a', 'chapter-next', '返回目录');
    back.href = '#contents';
    back.insertAdjacentHTML('beforeend', arrow);
    foot.append(el('p', 'chapter-progress', 'AI 辅助开发 · 工作中使用的桌面工具'), back);
    section.append(head, intro, grid, foot);
    activateCovers(section);
    return section;
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = el('dialog', 'tool-dialog');
    dialog.id = 'tool-dialog';
    dialog.setAttribute('aria-labelledby', 'tool-detail-title');
    dialog.innerHTML = `<div class="tool-toolbar">
      <span class="tool-toolbar-label"><i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg></i><span>工作工具实验室 <small lang="en">AI TOOL LAB</small></span></span>
      <nav class="tool-project-nav" aria-label="切换工具项目"></nav>
      <button type="button" class="tool-close" aria-label="关闭工具项目">${closeIcon}</button>
    </div><div class="tool-detail"></div>`;
    dialog.querySelector('.tool-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dispose();
      document.body.classList.remove('tool-viewer-open');
      document.body.style.removeProperty('--tool-scrollbar');
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    });
    document.body.append(dialog);
  }

  function openTool(tool, trigger) {
    ensureDialog();
    returnFocus = trigger;
    const nav = dialog.querySelector('.tool-project-nav');
    nav.replaceChildren(...catalog.map((entry, index) => {
      const labels = { 'media-batch': '视频', 'capture-studio': '录屏', 'game-debug': '调试' };
      const item = button('', `${pad(index + 1)} ${labels[entry.id]}`, () => showTool(entry));
      item.dataset.project = entry.id;
      item.setAttribute('aria-label', `查看${entry.name}`);
      return item;
    }));
    showTool(tool);
    document.body.style.setProperty('--tool-scrollbar', `${innerWidth - document.documentElement.clientWidth}px`);
    document.body.classList.add('tool-viewer-open');
    dialog.showModal();
    animate(dialog, [{ opacity: 0, transform: 'translateY(24px) scale(.975)' }, { opacity: 1, transform: 'none' }], 520);
    dialog.querySelector('.tool-close').focus({ preventScroll: true });
  }

  function showTool(tool) {
    dispose();
    const previous = supported.indexOf(dialog.dataset.tool);
    const current = supported.indexOf(tool.id);
    dialog.dataset.tool = tool.id;
    dialog.querySelectorAll('[data-project]').forEach(item => {
      const active = item.dataset.project === tool.id;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    const detail = dialog.querySelector('.tool-detail');
    detail.style.setProperty('--enter-x', `${previous >= 0 && current < previous ? -20 : 20}px`);
    detail.innerHTML = `<header class="tool-detail-head">
      <span class="tool-detail-index" aria-hidden="true">${pad(current + 1)}</span>
      <div><p class="tool-detail-eyebrow">${esc(tool.discipline)} <span>AI 辅助开发</span></p>
        <h2 id="tool-detail-title">${esc(tool.name)}</h2><p class="tool-detail-en" lang="en">${esc(tool.en)}</p></div>
      <p class="tool-detail-intro">${esc(tool.intro)}</p>
    </header>
    <section class="tool-demo" aria-labelledby="tool-demo-title">
      <header class="tool-demo-bar"><h3 id="tool-demo-title">${esc({ 'media-batch': '从素材，到交付', 'capture-studio': '从计划，到采集', 'game-debug': '从数据，到操作' }[tool.id])}</h3>
        <span><i aria-hidden="true"></i>交互演示 · 示例数据</span></header>
      <div class="tool-demo-mount"></div>
    </section>
    <div class="tool-case-context"><section><p class="label">工作中的问题</p><p>${esc(tool.problem)}</p></section>
      <section><p class="label">我的解决方式</p><p>${esc(tool.approach)}</p></section></div>
    <div class="tool-feature-grid">${(tool.features || []).map((feature, index) => `<section><span>${pad(index + 1)}</span><h3>${esc(feature.title)}</h3><p>${esc(feature.text)}</p></section>`).join('')}</div>
    <footer class="tool-detail-foot"><p>开发与工作流 <span>${(tool.stack || []).map(esc).join(' / ')}</span></p><p>演示展示工作流程；实际处理由本地桌面工具完成。</p></footer>`;
    const demos = { 'media-batch': videoDemo, 'capture-studio': captureDemo, 'game-debug': debugDemo };
    const demo = demos[tool.id]();
    detail.querySelector('.tool-demo-mount').append(demo.node);
    dispose = demo.dispose || (() => {});
    dialog.scrollTop = 0;
  }

  // Original vector scenery is used instead of a game's private source material.
  const scene = `<svg class="demo-scene" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="tool-sky" x2="0" y2="1"><stop stop-color="#1a333b"/><stop offset="1" stop-color="#c0936b"/></linearGradient>
      <linearGradient id="tool-ridge" x2="0" y2="1"><stop stop-color="#294649"/><stop offset="1" stop-color="#112d31"/></linearGradient></defs>
    <path fill="url(#tool-sky)" d="M0 0h640v360H0z"/><circle cx="405" cy="124" r="51" fill="#eabd79"/>
    <circle cx="405" cy="124" r="70" fill="none" stroke="#eabd79" stroke-opacity=".14"/>
    <path fill="#52676a" d="m0 260 105-140 76 76 80-134 99 150 90-94 68 79 53-32 69 96v99H0Z"/>
    <path fill="url(#tool-ridge)" d="m0 270 75-70 91 38 63-77 75 135 62-49 77 40 78-86 119 123v36H0Z"/>
    <path fill="#112b2b" d="M0 316q170-71 300-6t340-8v58H0Z"/>
    <path fill="none" stroke="#cebb90" stroke-width="2" stroke-opacity=".36" d="m109 345 67-41 107 32 64-19 81 27"/>
    <path fill="#1a3130" d="m143 299 8-32 8 32h-5v15h-6v-15Zm370 10 12-56 12 56h-8v18h-8v-18Z"/>
    <path fill="#ddb778" d="M319 292h4v17h-4z"/><path fill="#ebcf9e" d="m317 295 5-13 6 16Z"/>
  </svg>`;

  const formats = {
    portrait: { ratio: '9 / 16', size: '1080 × 1920', short: '9:16', naming: '横竖' },
    square: { ratio: '1 / 1', size: '1080 × 1080', short: '1:1', naming: '横方' },
    landscape: { ratio: '16 / 9', size: '1920 × 1080', short: '16:9', naming: '横' }
  };
  const languages = { en: '英', th: '泰', vi: '越', id: '印尼' };

  function outputName(language, format, serial = 1) {
    return `DEMO_${languages[language] || languages.en}_ob1_1_${serial}_${formats[format]?.naming || formats.portrait.naming}_ZN_260930.mp4`;
  }

  function videoDemo() {
    const node = el('div', 'video-demo');
    node.innerHTML = `<div class="video-demo-grid"><div class="video-preview">
      <div class="demo-window-label"><span>画面预览</span><span class="demo-source-label">SOURCE / 16:9</span></div>
      <div class="video-preview-area"><div class="video-canvas" data-format="portrait" data-mode="frame">
        <div class="video-backdrop">${scene.replaceAll('tool-sky', 'tool-bg-sky').replaceAll('tool-ridge', 'tool-bg-ridge')}</div>
        <div class="video-composition-head"><span>NEW ADVENTURE</span><b>想象，正在发生。</b></div>
        <div class="video-source">${scene}<button type="button" class="video-source-play" aria-label="暂停示意画面动画" aria-pressed="true">Ⅱ</button></div>
        <div class="video-composition-foot"><b>EXPLORE <br>THE UNKNOWN</b><span>DEMO / PLAY</span></div>
      </div></div><p class="video-dimensions">输出预览 <span>1080 × 1920</span></p>
      <div class="video-preview-timeline" aria-hidden="true"><span>PREVIEW / DEMO</span><i><b></b></i><span>00:08</span></div>
    </div><div class="demo-controls">
      <div class="demo-control-head"><span>交付设定</span><span>01 — 03</span></div>
      <fieldset><legend>输出版式</legend><div class="demo-segments demo-formats" aria-label="输出版式">
        <button type="button" data-format="portrait" aria-pressed="true"><i class="format-glyph portrait"></i>9:16</button>
        <button type="button" data-format="square" aria-pressed="false"><i class="format-glyph square"></i>1:1</button>
        <button type="button" data-format="landscape" aria-pressed="false"><i class="format-glyph landscape"></i>16:9</button>
      </div></fieldset>
      <fieldset><legend>画面做法</legend><div class="demo-segments demo-modes">
        <button type="button" data-mode="frame" aria-pressed="true">套底图</button><button type="button" data-mode="blur" aria-pressed="false">模糊背景</button>
      </div></fieldset>
      <label class="demo-field">素材语言<select aria-label="示例素材语言"><option value="en">English / 英语</option><option value="th">ไทย / 泰语</option><option value="vi">Tiếng Việt / 越南语</option><option value="id">Indonesia / 印尼语</option></select></label>
      <div class="video-matching"><span>素材匹配</span><p><i></i><b>EN</b> / 片头 + 片尾 + 竖版底图</p></div>
      <div class="demo-file"><span>自动命名 / 示例</span><code></code></div>
      <button type="button" class="demo-primary video-manifest-toggle" aria-expanded="false">查看示例交付清单 <span>↗</span></button>
    </div></div>
    <div class="video-manifest" hidden><div class="demo-output-head"><strong>示例交付清单</strong><span>3 条示例素材 · 名称与资源可追溯</span></div><ol></ol></div>
    <div class="demo-flow"><span><b>01</b>识别素材</span><i>→</i><span><b>02</b>匹配资源</span><i>→</i><span><b>03</b>合成与命名</span><i>→</i><span><b>04</b>输出清单</span></div>
    <p class="demo-interaction-hint">试试切换版式、画面做法或语言，查看对应的画面与输出名称。</p>`;
    let format = 'portrait';
    let mode = 'frame';
    const select = node.querySelector('select');
    const canvas = node.querySelector('.video-canvas');
    const manifest = node.querySelector('.video-manifest');
    const toggle = node.querySelector('.video-manifest-toggle');
    const playback = node.querySelector('.video-source-play');
    let layoutAnimation;
    const update = (motion = false) => {
      const before = motion ? canvas.getBoundingClientRect() : null;
      layoutAnimation?.cancel();
      canvas.dataset.format = format;
      canvas.dataset.mode = mode;
      canvas.style.setProperty('--output-ratio', formats[format].ratio);
      node.querySelector('.video-dimensions span').textContent = formats[format].size;
      node.querySelector('.demo-file code').textContent = outputName(select.value, format);
      const layout = { portrait: '竖版', square: '方版', landscape: '横版' }[format];
      node.querySelector('.video-matching b').textContent = select.value.toUpperCase();
      node.querySelector('.video-matching p').lastChild.textContent = ` / 片头 + 片尾 + ${mode === 'blur' ? '模糊背景' : `${layout}底图`}`;
      node.querySelectorAll('button[data-format]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.format === format)));
      node.querySelectorAll('button[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.mode === mode)));
      manifest.querySelector('ol').replaceChildren(...[1, 2, 3].map(serial => {
        const item = el('li');
        item.innerHTML = `${checkIcon}<code>${esc(outputName(select.value, format, serial))}</code><span>${esc(layout)} · ${mode === 'frame' ? '底图合成' : '模糊背景'}</span>`;
        return item;
      }));
      if (before) {
        const after = canvas.getBoundingClientRect();
        layoutAnimation = animate(canvas, [
          { width: `${before.width}px`, height: `${before.height}px` },
          { width: `${after.width}px`, height: `${after.height}px` }
        ], 620);
        animate(node.querySelector('.demo-file'), [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }]);
        animate(node.querySelector('.video-dimensions span'), [{ opacity: 0 }, { opacity: 1 }]);
      }
    };
    node.querySelector('.demo-formats').addEventListener('click', event => {
      const item = event.target.closest('button');
      if (item && format !== item.dataset.format) { format = item.dataset.format; update(true); }
    });
    node.querySelector('.demo-modes').addEventListener('click', event => {
      const item = event.target.closest('button');
      if (item && mode !== item.dataset.mode) { mode = item.dataset.mode; update(true); }
    });
    select.addEventListener('change', () => update(true));
    const pause = value => {
      node.classList.toggle('is-paused', value);
      playback.setAttribute('aria-pressed', String(!value));
      playback.setAttribute('aria-label', value ? '播放示意画面动画' : '暂停示意画面动画');
      playback.textContent = value ? '▷' : 'Ⅱ';
    };
    playback.addEventListener('click', () => pause(!node.classList.contains('is-paused')));
    pause(Boolean(reducedMotion()));
    toggle.addEventListener('click', () => {
      manifest.hidden = !manifest.hidden;
      toggle.setAttribute('aria-expanded', String(!manifest.hidden));
      toggle.firstChild.textContent = manifest.hidden ? '查看示例交付清单 ' : '收起示例交付清单 ';
    });
    update();
    return { node, dispose: () => layoutAnimation?.cancel() };
  }

  const routeScene = `<svg class="capture-map" viewBox="0 0 600 340" aria-hidden="true">
    <defs><pattern id="tool-map-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0v30" fill="none" stroke="#b7d3c6" stroke-opacity=".07"/></pattern></defs>
    <path fill="url(#tool-map-grid)" d="M0 0h600v340H0z"/>
    <g fill="#abc7b7" fill-opacity=".04" stroke="#abc7b7" stroke-opacity=".12"><path d="m69 100 61-48 100 12 43 45-31 52-112 3Z"/><path d="m335 52 70 10 57 55-34 49-53-5-29-47Z"/><path d="m125 230 44-35 73 9 44 42-41 52-88-9Z"/><path d="m399 230 65-19 73 52-13 40-72 4-61-36Z"/></g>
    <g fill="none" stroke="#92b3a4" stroke-opacity=".17"><path d="m57 98 66-63 115 14 62 59-45 68-131 4Z"/><path d="m42 92 76-72 129 17 75 70-54 83-153 4Z"/><path d="m322 44 89 4 69 65-44 64-68-4-38-55Z"/><path d="m380 225 87-26 85 61-12 58-92 7-77-45Z"/></g>
    <path class="capture-route-base" d="M65 265 155 188 247 160 341 214 440 130 529 83"/>
    <path class="capture-route-progress" d="M65 265 155 188 247 160 341 214 440 130 529 83" pathLength="100"/>
    <g class="capture-route-nodes"><circle cx="65" cy="265" r="5"/><circle cx="155" cy="188" r="5"/><circle cx="247" cy="160" r="5"/><circle cx="341" cy="214" r="5"/><circle cx="440" cy="130" r="5"/><circle cx="529" cy="83" r="5"/></g>
    <g class="capture-marker"><circle r="19" fill="#a6dfbd" fill-opacity=".12"/><circle r="8" fill="#bce8ce"/><circle r="3" fill="#18342a"/></g>
    <text x="58" y="293">START</text><text x="510" y="63">CAPTURE</text>
  </svg>`;

  function planCount(heroes, languages, stages = 3) {
    return heroes.length * languages.length * stages;
  }

  function captureDemo() {
    const node = el('div', 'capture-demo');
    node.innerHTML = `<div class="capture-demo-grid"><div class="capture-preview">
      <div class="demo-window-label"><span>素材采集路线 / 示意</span><span class="capture-live"><i></i>等待演示</span></div>
      <div class="capture-map-wrap">${routeScene}<span class="map-caption">VISUAL PERCEPTION<br><b>PLAY. CAPTURE. REPEAT.</b></span></div>
      <ol class="capture-stepper"><li>准备计划</li><li>切换语言</li><li>自动游玩</li><li>校验录像</li><li>完成归档</li></ol>
      <p class="capture-log" role="status" aria-live="polite">先选角色与语言，看看这次需要采集多少段素材。</p>
    </div><div class="demo-controls">
      <div class="demo-control-head"><span>录制计划</span><span>PLAN / DEMO</span></div>
      <fieldset><legend>示例角色</legend><div class="capture-choices" data-choice="heroes">
        <label><input type="checkbox" value="a" checked><span>A</span>角色 A</label><label><input type="checkbox" value="b" checked><span>B</span>角色 B</label><label><input type="checkbox" value="c"><span>C</span>角色 C</label>
      </div></fieldset>
      <fieldset><legend>素材语言</legend><div class="capture-languages" data-choice="languages">
        <label><input type="checkbox" value="en" checked><span>EN</span>英语</label><label><input type="checkbox" value="th" checked><span>TH</span>泰语</label><label><input type="checkbox" value="id"><span>ID</span>印尼语</label><label><input type="checkbox" value="vi"><span>VI</span>越南语</label>
      </div></fieldset>
      <div class="capture-plan-summary"><span>示例计划产出</span><p><b>12</b><span>段素材</span></p><small>2 位角色 × 3 个示例关卡 × 2 种语言</small></div>
      <button type="button" class="demo-primary capture-run">演示录制流程 <span>▷</span></button>
    </div></div><p class="demo-interaction-hint">组合不同角色和语言，再点击演示，查看计划如何走到素材归档。</p>`;
    const choices = kind => [...node.querySelectorAll(`[data-choice="${kind}"] input:checked`)].map(input => input.value);
    const action = node.querySelector('.capture-run');
    const steps = [...node.querySelectorAll('.capture-stepper li')];
    const marker = node.querySelector('.capture-marker');
    const status = node.querySelector('.capture-log');
    let timer;
    let disposed = false;
    const reset = () => {
      clearTimeout(timer);
      node.classList.add('is-resetting');
      node.classList.remove('is-running', 'is-complete');
      node.style.setProperty('--route-progress', 0);
      steps.forEach(step => step.classList.remove('is-active', 'is-done'));
      marker.style.transform = 'translate(65px, 265px)';
      node.querySelector('.capture-live').lastChild.textContent = '等待演示';
      action.disabled = false;
      action.firstChild.textContent = '演示录制流程 ';
      // Commit the start point before a replay so the marker follows the route,
      // rather than taking a shortcut back from the previous finish position.
      marker.getBoundingClientRect();
      node.classList.remove('is-resetting');
    };
    const update = () => {
      reset();
      const heroes = choices('heroes');
      const languages = choices('languages');
      node.querySelector('.capture-plan-summary b').textContent = planCount(heroes, languages);
      animate(node.querySelector('.capture-plan-summary b'), [{ transform: 'translateY(9px)', opacity: .3 }, { transform: 'none', opacity: 1 }]);
      node.querySelector('.capture-plan-summary small').textContent = `${heroes.length} 位角色 × 3 个示例关卡 × ${languages.length} 种语言`;
      status.textContent = '计划已更新，可以开始演示。';
    };
    node.addEventListener('change', event => {
      const input = event.target;
      const group = input.closest('[data-choice]');
      if (!group) return;
      if (!choices(group.dataset.choice).length) {
        input.checked = true;
        status.textContent = '请至少保留一位角色和一种语言。';
        return;
      }
      update();
    });
    action.addEventListener('click', () => {
      reset();
      action.disabled = true;
      action.firstChild.textContent = '正在演示… ';
      node.classList.add('is-running');
      const count = planCount(choices('heroes'), choices('languages'));
      const messages = [
        `示例计划：${count} 段素材，按角色、关卡与语言编排。`,
        `语言任务：${choices('languages').map(value => value.toUpperCase()).join(' / ')}，按计划切换。`,
        '自动游玩：画面识别与地图学习辅助路线选择。',
        '录像校验：检查文件增长、录制结束后的稳定状态。',
        `演示完成：${count} 段计划素材进入归档步骤。`
      ];
      const positions = [[155, 188], [247, 160], [341, 214], [440, 130], [529, 83]];
      const routePoints = [[65, 265], ...positions];
      const distances = routePoints.slice(1).map((point, index) => Math.hypot(point[0] - routePoints[index][0], point[1] - routePoints[index][1]));
      const total = distances.reduce((sum, length) => sum + length, 0);
      const finish = () => {
        if (disposed) return;
        node.classList.remove('is-running');
        node.classList.add('is-complete');
        steps[4].classList.add('is-done');
        node.querySelector('.capture-live').lastChild.textContent = '演示完成';
        status.textContent = `演示完成：${count} 段计划素材进入归档步骤。`;
        action.disabled = false;
        action.firstChild.textContent = '重新演示 ';
      };
      const advance = index => {
        if (disposed) return;
        steps.forEach((step, i) => { step.classList.toggle('is-active', i === index); step.classList.toggle('is-done', i < index); });
        node.style.setProperty('--route-progress', distances.slice(0, index + 1).reduce((sum, length) => sum + length, 0) / total * 100);
        marker.style.transform = `translate(${positions[index][0]}px, ${positions[index][1]}px)`;
        node.querySelector('.capture-live').lastChild.textContent = '演示进行中';
        status.textContent = index === 4 ? '完成归档：采集计划整理到素材清单。' : messages[index];
        animate(status, [{ opacity: .25, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 350);
        if (index < 4) timer = setTimeout(() => advance(index + 1), 950);
        else timer = setTimeout(finish, 950);
      };
      advance(0);
    });
    reset();
    return { node, dispose: () => { disposed = true; clearTimeout(timer); } };
  }

  // Fictional records keep internal game tables and command names off the website.
  const debugRecords = {
    levels: [
      { id: 'LV-041', name: '林地入口', type: '复合关卡', environment: '森林', note: '展示关卡定位与参数检索的示例。' },
      { id: 'LV-056', name: '雪原前哨', type: '精英突袭', environment: '雪地', note: '展示按关卡类型筛选的示例。' },
      { id: 'LV-072', name: '沙漠遗迹', type: '复合关卡', environment: '沙漠', note: '展示地图与关卡信息集中查询的示例。' },
      { id: 'LV-095', name: '寒霜要塞', type: '首领突袭', environment: '雪地', note: '展示关卡详情与方案编排的示例。' },
      { id: 'LV-118', name: '远山营地', type: '精英突袭', environment: '山地', note: '展示关卡定位的示例。' },
      { id: 'LV-142', name: '古城回廊', type: '首领突袭', environment: '城堡', note: '展示批量方案中的关卡条目。' }
    ],
    equipment: [
      { id: 'EQ-001', name: '巡游者长剑', type: '武器', environment: '稀有', note: '展示装备数据检索与属性查看的示例。' },
      { id: 'EQ-002', name: '守望者护甲', type: '防具', environment: '史诗', note: '展示装备等级与品质信息的示例。' },
      { id: 'EQ-003', name: '晨光指环', type: '饰品', environment: '稀有', note: '展示装备条目加入方案的示例。' }
    ],
    items: [
      { id: 'IT-001', name: '体力补给', type: '消耗品', environment: '补给', note: '展示道具查询与操作编排的示例。' },
      { id: 'IT-002', name: '训练手册', type: '材料', environment: '成长', note: '展示道具分类检索的示例。' },
      { id: 'IT-003', name: '探索凭证', type: '消耗品', environment: '探索', note: '展示常用操作集中管理的示例。' }
    ]
  };

  function filterRecords(records, query) {
    const search = String(query).trim().toLowerCase();
    return records.filter(record => [record.id, record.name, record.type, record.environment].some(value => value.toLowerCase().includes(search)));
  }

  function debugDemo() {
    const node = el('div', 'debug-demo');
    node.innerHTML = `<div class="debug-demo-grid"><div class="debug-library">
      <div class="demo-window-label"><span>数据工作台</span><span>INDEX / DEMO</span></div>
      <div class="debug-tabs" aria-label="示例数据分类"><button type="button" data-tab="levels" aria-pressed="true">关卡</button><button type="button" data-tab="equipment" aria-pressed="false">装备</button><button type="button" data-tab="items" aria-pressed="false">道具</button></div>
      <label class="debug-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5"/></svg><input type="search" aria-label="搜索示例调试数据" placeholder="搜索名称、编号或类型"><span>筛选</span></label>
      <div class="debug-table-head"><span>编号 / 名称</span><span>类型</span><span class="debug-environment">场景 / 属性</span></div>
      <div class="debug-records"></div><p class="debug-result-count"></p>
    </div><div class="debug-inspector"><div class="demo-control-head"><span>条目详情</span><span>INSPECT</span></div>
      <div class="debug-inspector-content"></div><button type="button" class="demo-primary debug-add">加入演示方案 <span>＋</span></button>
      <p class="debug-demo-status" role="status" aria-live="polite">选择条目，可以查看详情并编排方案。</p>
    </div></div>
    <div class="debug-queue"><div class="demo-output-head"><strong>演示方案 <span class="debug-queue-count">0 项</span></strong><button type="button" class="debug-clear">清空方案</button></div><ol></ol></div>
    <p class="demo-interaction-hint">试试搜索「雪地」、切换数据分类，再把需要的条目加入演示方案。</p>`;
    let tab = 'levels';
    let selected;
    let inspectedId;
    let queue = [];
    const search = node.querySelector('input');
    const add = node.querySelector('.debug-add');
    const clear = node.querySelector('.debug-clear');
    const status = node.querySelector('.debug-demo-status');
    const inspector = () => {
      const content = node.querySelector('.debug-inspector-content');
      content.innerHTML = selected ? `<span class="debug-item-id">${esc(selected.id)}</span><h4>${esc(selected.name)}</h4>
        <dl><div><dt>类型</dt><dd>${esc(selected.type)}</dd></div><div><dt>场景 / 属性</dt><dd>${esc(selected.environment)}</dd></div><div><dt>数据来源</dt><dd>虚构示例</dd></div></dl><p>${esc(selected.note)}</p>`
        : '<p class="debug-empty-inspector">没有匹配条目，试试其他关键词。</p>';
      const queued = selected && queue.some(record => record.id === selected.id);
      add.disabled = !selected || queued;
      add.firstChild.textContent = queued ? '已加入演示方案 ' : '加入演示方案 ';
      if (inspectedId !== selected?.id) {
        animate(content, [{ opacity: .2, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }]);
        inspectedId = selected?.id;
      }
    };
    const renderRecords = () => {
      const records = filterRecords(debugRecords[tab], search.value);
      if (!records.some(record => record.id === selected?.id)) selected = records[0];
      const holder = node.querySelector('.debug-records');
      if (!records.length) holder.replaceChildren(el('p', 'debug-no-results', '没有找到匹配的示例数据。'));
      else holder.replaceChildren(...records.map(record => {
        const item = button('debug-record', undefined, () => {
          selected = record;
          renderRecords();
          node.querySelector('.debug-record[aria-pressed="true"]').focus({ preventScroll: true });
        });
        item.setAttribute('aria-pressed', String(selected?.id === record.id));
        item.innerHTML = `<span><small>${esc(record.id)}</small><b>${esc(record.name)}</b></span><span>${esc(record.type)}</span><span class="debug-environment">${esc(record.environment)}</span>`;
        return item;
      }));
      node.querySelector('.debug-result-count').textContent = `显示 ${records.length} / ${debugRecords[tab].length} 条示例数据`;
      inspector();
    };
    const renderQueue = () => {
      node.querySelector('.debug-queue-count').textContent = `${queue.length} 项`;
      clear.disabled = !queue.length;
      const list = node.querySelector('.debug-queue ol');
      const previous = new Map([...list.querySelectorAll('[data-queue-id]')].map(row => [row.dataset.queueId, row.getBoundingClientRect().top]));
      if (!queue.length) list.replaceChildren(el('li', 'debug-queue-empty', '把常用操作放在一起，下次少做一次重复劳动。'));
      else list.replaceChildren(...queue.map((record, index) => {
        const row = el('li');
        row.dataset.queueId = record.id;
        row.append(el('span', 'debug-queue-number', pad(index + 1)), el('span', 'debug-queue-name', record.name), el('span', 'debug-queue-id', record.id));
        const remove = button('debug-queue-remove', undefined, () => {
          queue = queue.filter(item => item.id !== record.id);
          renderQueue();
          // The clicked control was removed; keep keyboard focus inside this task.
          (list.querySelector('button') || (add.disabled ? search : add)).focus({ preventScroll: true });
        });
        remove.innerHTML = closeIcon;
        remove.setAttribute('aria-label', `从演示方案移除${record.name}`);
        row.append(remove);
        return row;
      }));
      list.querySelectorAll('[data-queue-id]').forEach(row => {
        const oldTop = previous.get(row.dataset.queueId);
        const distance = oldTop === undefined ? 14 : oldTop - row.getBoundingClientRect().top;
        if (oldTop === undefined || Math.abs(distance) > .5) animate(row, [
          { opacity: oldTop === undefined ? 0 : 1, transform: `translateY(${distance}px)` },
          { opacity: 1, transform: 'none' }
        ]);
      });
      animate(node.querySelector('.debug-queue-count'), [{ color: 'var(--tool-accent)', transform: 'translateY(-3px)' }, { transform: 'none' }], 500);
      inspector();
    };
    node.querySelector('.debug-tabs').addEventListener('click', event => {
      const item = event.target.closest('button');
      if (!item) return;
      tab = item.dataset.tab;
      search.value = '';
      selected = undefined;
      node.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
      renderRecords();
    });
    search.addEventListener('input', renderRecords);
    add.addEventListener('click', () => {
      if (!selected || queue.some(record => record.id === selected.id)) return;
      queue.push(selected);
      status.textContent = `已将「${selected.name}」加入演示方案。`;
      renderQueue();
    });
    clear.addEventListener('click', () => {
      queue = [];
      renderQueue();
      status.textContent = '演示方案已清空。';
      (add.disabled ? search : add).focus({ preventScroll: true });
    });
    renderRecords();
    renderQueue();
    return { node };
  }

  window.PortfolioTools = { chapter, contents, render };
})();
