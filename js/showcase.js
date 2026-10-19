/* Projects that follow the works, each as a chapter of its own: a whole website
   live in a framed window, or an app shown through its own films. */
(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const down = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg>';
  const out = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  const asset = /^assets\/showcase\/[a-z-]+\.(webp|mp4)$/;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function project(config) {
    if (!config || typeof config.name !== 'string' || !config.name.trim() || !/^[a-z-]+$/.test(config.id || '')) return null;
    const stills = (config.stills || []).filter(src => asset.test(src));
    if (config.kind === 'site') {
      const url = typeof config.url === 'string' && /^https:\/\//.test(config.url) ? config.url : '';
      return url ? { ...config, url, stills } : null;
    }
    if (config.kind === 'films') {
      const films = (config.films || []).filter(film => asset.test(film?.src || '') && asset.test(film?.poster || ''));
      const screens = (config.screens || []).filter(screen => asset.test(screen?.src || ''));
      return films.length || screens.length ? { ...config, films, screens, stills } : null;
    }
    return null;
  }

  // Valid projects become chapters numbered on from the works.
  function chapters(config, first) {
    const seen = new Set();
    return (Array.isArray(config?.projects) ? config.projects : []).map(project)
      .filter(entry => entry && !seen.has(entry.id) && seen.add(entry.id))
      .map((entry, index) => ({ number: first + index, id: entry.id, category: { name: entry.name, en: entry.en || '' }, plates: [], showcase: entry }));
  }

  // In the contents each project is a row of its own, like the tools.
  function contents(chapter) {
    const { showcase } = chapter;
    const item = el('li', 'tool-toc-item');
    const link = el('a', 'toc-card tool-toc site-toc');
    link.href = `#${chapter.id}`;
    const art = el('span', 'tool-toc-art site-toc-art');
    art.setAttribute('aria-hidden', 'true');
    for (const src of showcase.stills) {
      const still = el('img', /-icon\.webp$/.test(src) ? 'is-icon' : '');
      Object.assign(still, { src, alt: '', loading: 'lazy', decoding: 'async' });
      art.append(still);
    }
    const text = el('span', 'tool-toc-copy');
    text.append(el('span', 'toc-num', pad(chapter.number)), el('span', 'tool-toc-name', showcase.name), el('span', 'tool-toc-en', showcase.en || ''));
    const names = el('span', 'tool-toc-names');
    names.append(...(showcase.works || []).map(name => el('span', '', name)));
    const count = el('span', 'toc-count', showcase.tocLabel || '');
    const arrow = el('span', 'toc-arrow');
    arrow.innerHTML = down;
    count.append(arrow);
    link.append(art, text, names, count);
    item.append(link);
    return item;
  }

  function siteStage(showcase) {
    const frame = el('figure', 'site-frame');
    const bar = el('figcaption', 'site-bar');
    const address = el('span', 'site-address', showcase.url.replace(/^https:\/\//, '').replace(/\/$/, ''));
    const open = el('a', 'site-open', '新窗口打开');
    open.href = showcase.url;
    open.target = '_blank';
    open.rel = 'noopener';
    open.insertAdjacentHTML('beforeend', out);
    bar.append(address, open);
    const page = el('iframe', 'site-page');
    Object.assign(page, { src: showcase.url, title: `${showcase.name} · 完整网页`, loading: 'lazy' });
    page.setAttribute('allow', 'fullscreen');
    frame.append(bar, page);
    return frame;
  }

  // The app's own screens in a row, each with the name of its tab.
  function screenRow(showcase) {
    const row = el('div', 'app-screens');
    for (const screen of showcase.screens) {
      const figure = el('figure', 'app-screen');
      const image = el('img');
      Object.assign(image, { src: screen.src, alt: `${showcase.name} · ${screen.label || ''}`, loading: 'lazy', decoding: 'async', width: 640, height: 1414 });
      figure.append(image);
      if (screen.label) figure.append(el('figcaption', '', screen.label));
      row.append(figure);
    }
    return row;
  }

  function block(label, body) {
    const part = el('div', 'project-part');
    if (label) part.append(el('p', 'project-part-label', label));
    part.append(body);
    return part;
  }

  // Films play silently while well on screen; their own controls give sound.
  // One the visitor paused stays paused until they play it again.
  function filmStage(showcase) {
    const stage = el('div', 'film-stage');
    for (const film of showcase.films) {
      const figure = el('figure', 'film');
      const video = el('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, controls: true, preload: 'none', poster: film.poster });
      video.setAttribute('aria-label', film.label || showcase.name);
      const load = () => { if (!video.getAttribute('src')) video.src = film.src; };
      let seen = false;
      let stopped = false;
      let ours = false;
      new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(); }, { rootMargin: '900px 0px' }).observe(figure);
      new IntersectionObserver(([entry]) => {
        seen = entry.isIntersecting && entry.intersectionRatio >= .5;
        if (seen && video.paused && !stopped && !reducedMotion?.matches) {
          load();
          video.play().catch(() => {});
        } else if (!seen && !video.paused) {
          ours = true;
          video.pause();
        }
      }, { threshold: [0, .5] }).observe(figure);
      video.addEventListener('pause', () => {
        if (ours) ours = false;
        else if (seen && !document.hidden && video.currentTime > 0) stopped = true;
      });
      video.addEventListener('play', () => { stopped = false; });
      figure.append(video);
      if (film.label) figure.append(el('figcaption', '', film.label));
      stage.append(figure);
    }
    return stage;
  }

  function render(chapter) {
    const { showcase } = chapter;
    const section = el('section', 'chapter wrap site-chapter');
    section.id = chapter.id;
    section.setAttribute('aria-labelledby', `${chapter.id}-title`);
    const head = el('header', 'chapter-head');
    const num = el('p', 'chapter-num', pad(chapter.number));
    num.setAttribute('aria-hidden', 'true');
    const titles = el('div', 'chapter-titles');
    const title = el('h2', '', showcase.name);
    title.id = `${chapter.id}-title`;
    if (showcase.en) {
      const english = el('span', '', showcase.en);
      english.lang = 'en';
      title.append(english);
    }
    titles.append(title);
    head.append(num, titles, el('p', 'chapter-count', showcase.count || ''));
    const intro = el('div', 'site-intro');
    if (showcase.statement) intro.append(el('p', 'site-statement', showcase.statement));
    if (showcase.description) intro.append(el('p', 'site-description', showcase.description));
    const parts = showcase.kind === 'site' ? [siteStage(showcase)] : [
      showcase.screens.length && block(showcase.screensLabel, screenRow(showcase)),
      showcase.films.length && block(showcase.filmsLabel, filmStage(showcase))
    ].filter(Boolean);
    const foot = el('div', 'chapter-foot');
    const back = el('a', 'chapter-next', '返回目录');
    back.href = '#contents';
    back.insertAdjacentHTML('beforeend', down);
    foot.append(el('p', 'chapter-progress', showcase.note || ''), back);
    section.append(head, intro, ...parts, foot);
    return section;
  }

  window.PortfolioShowcase = { chapters, contents, render };
})();
