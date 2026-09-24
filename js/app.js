(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { data: null, previews: {}, chapters: [], plates: [], viewerIndex: -1, runningChapter: null };
  const reel = { plates: [], tracks: 0, vertical: true, shown: undefined, userPaused: false, inView: true, width: 0, deferred: [] };
  const dialog = $('lightbox');
  const chaptersRoot = $('chapters');
  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12Z"/></svg>';
  const downIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg>';
  const chevronIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const narrowScreen = matchMedia('(max-width: 760px)');
  const mediumScreen = matchMedia('(max-width: 1100px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let toastTimer;
  let layoutFrame;
  let headFrame;
  let bookWidth = 0;

  const pad = (value, size = 2) => String(value).padStart(size, '0');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mediaURL(src) {
    if (typeof src !== 'string' || !/^(images|assets)\//.test(src)) return '';
    const url = new URL(src, document.baseURI);
    return url.origin === location.origin ? url.href : '';
  }

  async function readJSON(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return response.json();
  }

  // The asset scanner names untitled works "CG风格 #12"; plates show only real titles.
  function realTitle(item) {
    const title = String(item.title || '').trim();
    return /#\d+$/.test(title) ? '' : title;
  }

  // Single icons and stickers are small assets; chapters made of them set more per row.
  function isSmall(item, width, height) {
    return item.mediaType !== 'video' && ((item.category === 'Icon Design' && width < 2400)
      || item.category === 'Other' || (width < 600 && height < 900));
  }

  function previewSet(item) {
    const variants = (state.previews[item.src]?.variants || []).filter(variant => mediaURL(variant.src));
    const widths = new Map(variants.map(variant => [variant.width, mediaURL(variant.src)]));
    return Array.from(widths, ([width, src]) => ({ width, src }));
  }

  // Average colour of a work, painted behind it until the image arrives.
  function toneOf(item) {
    const color = state.previews[item.src]?.color;
    return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '';
  }

  /* ---------- Book structure ---------- */

  // One chapter per category, in category order. Works listed in
  // siteInfo.workOrder open their chapter; the rest follow sortOrder.
  // Plates are numbered once through the whole book.
  function buildBook(items, data) {
    const opening = new Map((data.siteInfo?.workOrder || []).map((id, index) => [id, index]));
    const categories = [...(data.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const groups = new Map(categories.map(category => [category.id, { category, items: [] }]));
    for (const item of items) {
      if (!groups.has(item.category)) groups.set(item.category, { category: { id: item.category, name: item.categoryName || item.category, en: item.categoryEn || '' }, items: [] });
      groups.get(item.category).items.push(item);
    }
    state.chapters = [];
    state.plates = [];
    for (const { category, items: group } of groups.values()) {
      if (!group.length) continue;
      group.sort((a, b) => (opening.get(a.id) ?? Infinity) - (opening.get(b.id) ?? Infinity) || (a.sortOrder || 0) - (b.sortOrder || 0));
      const number = state.chapters.length + 1;
      const chapter = { number, id: `chapter-${number}`, category, plates: [], expanded: false };
      for (const item of group) {
        const preview = state.previews[item.src];
        const plate = { item, chapter, number: state.plates.length + 1, known: Boolean(preview), crop: '' };
        plate.ratio = preview ? preview.width / preview.height : item.mediaType === 'video' ? 16 / 9 : 4 / 3;
        plate.small = preview ? isSmall(item, preview.width, preview.height) : false;
        chapter.plates.push(plate);
        state.plates.push(plate);
      }
      measureChapter(chapter);
      state.chapters.push(chapter);
    }
  }

  // Row height follows the chapter's median shape: tall character art gets tall rows.
  function measureChapter(chapter) {
    const ratios = chapter.plates.map(plate => plate.ratio).sort((a, b) => a - b);
    const middle = ratios.length >> 1;
    chapter.medianRatio = ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2;
    chapter.small = chapter.plates.filter(plate => plate.small).length > chapter.plates.length / 2;
  }

  async function loadData() {
    chaptersRoot.setAttribute('aria-busy', 'true');
    try {
      const [data, previews] = await Promise.all([
        readJSON('data/portfolio-data.json'),
        readJSON('data/media-previews.json').catch(() => ({}))
      ]);
      if (!Array.isArray(data.items)) throw new Error('Invalid portfolio data');
      state.data = data;
      state.previews = previews;
      buildBook(data.items.filter(item => item.visible !== false && mediaURL(item.src)), data);
      applySiteInfo(data.siteInfo || {});
      applyProfile(data.profile || {});
      reel.plates = pickReel(15);
      buildReel();
      renderContents();
      renderChapters();
      layoutBook();
      // Chapters now exist and push later sections down; land on the requested one.
      const target = location.hash && location.hash !== '#home' && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && !$('portfolio-view').hidden) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant' }));
    } catch (error) {
      console.error(error);
      $('reel').hidden = true;
      const message = element('div', 'book-message wrap');
      message.append(element('h3', '', '作品暂时没能载入'), element('p', '', '请检查网络连接，再试一次。'));
      const retry = element('button', 'line-link', '重新加载');
      retry.type = 'button';
      retry.addEventListener('click', loadData);
      message.append(retry);
      chaptersRoot.replaceChildren(message);
    } finally {
      chaptersRoot.setAttribute('aria-busy', 'false');
    }
  }

  function applySiteInfo(info) {
    if (info.title) document.title = info.title;
    const fields = { brandName: 'nav-brand-text', heroTitlePrefix: 'hero-prefix', heroTitleSuffix: 'hero-suffix', footerCopyright: 'footer-copy' };
    for (const [key, id] of Object.entries(fields)) if (info[key]) $(id).textContent = info[key];
    if (info.heroSubtitle) setLead(info.heroSubtitle);
    // The mark carries the first character of the name.
    const seal = Array.from(String(info.brandName || '张宁'))[0];
    for (const id of ['brand-seal', 'about-seal', 'footer-seal']) $(id).textContent = seal;
  }

  // The tagline breaks after its first comma; the second half carries the sheen.
  function setLead(text) {
    const parts = String(text).trim().match(/^(.+?[，,；;])\s*(.+)$/);
    $('hero-sub').replaceChildren(...(parts ? parts.slice(1) : [String(text).trim()]).map(line => element('span', '', line)));
  }

  function applyProfile(profile) {
    $('resume-name').textContent = profile.name || '张宁';
    $('cover-name').textContent = profile.name || '张宁';
    $('resume-title').textContent = profile.title || '';
    $('cover-title').textContent = profile.title || '';
    $('resume-bio').textContent = profile.bio || '';
    $('fact-location').hidden = !profile.location;
    $('hero-location').textContent = profile.location || '';
    const experiences = profile.experiences || [];
    const companies = [...new Set(experiences.map(experience => experience.company).filter(Boolean))];
    $('fact-companies').hidden = !companies.length;
    // Each company stays on one line; only the separators may wrap.
    $('hero-companies').replaceChildren(...companies.flatMap((company, index) => [index ? ' · ' : '', element('span', '', company)]));
    const years = experiences.flatMap(experience => String(experience.period || '').match(/\d{4}/g) || []).map(Number);
    $('cover-label').querySelector('.years')?.remove();
    if (years.length) $('cover-label').append(element('span', 'years', `${Math.min(...years)} — ${new Date().getFullYear()}`));
    const email = String(profile.email || '').replace(/[\r\n]/g, '');
    for (const id of ['resume-email', 'footer-email']) {
      const link = $(id);
      link.hidden = !email;
      if (email) {
        link.href = `mailto:${encodeURIComponent(email)}`;
        link.textContent = email;
      }
    }
    $('row-email').hidden = !email;
    const phone = String(profile.phone || '');
    $('row-phone').hidden = !phone;
    $('resume-phone').textContent = phone;
    if (phone) $('resume-phone').href = `tel:${phone.replace(/[^+\d]/g, '')}`;
    $('row-wechat').hidden = !profile.wechat;
    $('resume-wechat').textContent = profile.wechat || '';
    $('copy-wechat').hidden = !profile.wechat;
    $('resume-skills').replaceChildren(...(profile.skills || []).map(skill => element('li', '', skill)));
    $('resume-exps').replaceChildren(...experiences.map(experience => {
      const row = element('article', 'experience');
      const detail = element('div');
      detail.append(element('h3', '', experience.company || ''), element('p', 'experience-role', [experience.role, experience.location].filter(Boolean).join(' · ')));
      if (experience.description) detail.append(element('p', 'experience-description', experience.description));
      row.append(element('p', 'experience-period', String(experience.period || '').replace(/\s*-\s*/, ' — ')), detail);
      return row;
    }));
  }

  /* ---------- Reel: the cover's drifting selection ---------- */

  // Works from siteInfo.workOrder first, then the rest of the book one chapter
  // at a time. Videos, stickers and extreme panoramas or scrolls stay out.
  function pickReel(count) {
    const usable = plate => plate.item.mediaType !== 'video' && !plate.small && previewSet(plate.item).length
      && plate.ratio > .45 && plate.ratio < 2.6;
    const byId = new Map(state.plates.map(plate => [plate.item.id, plate]));
    const picked = new Set();
    for (const id of state.data.siteInfo?.workOrder || []) {
      const plate = byId.get(id);
      if (plate && usable(plate)) picked.add(plate);
    }
    const queues = state.chapters.map(chapter => chapter.plates.filter(plate => usable(plate) && !picked.has(plate)));
    while (picked.size < count && queues.some(queue => queue.length)) {
      for (const queue of queues) if (queue.length && picked.size < count) picked.add(queue.shift());
    }
    return [...picked].slice(0, count);
  }

  const tileRatio = plate => Math.min(2, Math.max(.66, plate.ratio));

  function buildReel() {
    const holder = $('reel-window');
    $('reel').hidden = !reel.plates.length;
    // Built once the cover is on screen (the page may open on the About view).
    if (!reel.plates.length || !holder.clientWidth) return;
    reel.vertical = !narrowScreen.matches;
    reel.tracks = reel.vertical && !mediumScreen.matches ? 3 : 2;
    // Fewer works where the reel is smaller: five per column, five per row on phones.
    const plates = reel.plates.slice(0, reel.tracks * 5);
    holder.style.setProperty('--tracks', reel.tracks);
    const gap = parseFloat(getComputedStyle($('reel')).getPropertyValue('--reel-gap')) || 12;
    // Columns share the window's width; phone rows share one tile height.
    const across = reel.vertical ? (holder.clientWidth - (reel.tracks - 1) * gap) / reel.tracks : Math.min(168, Math.max(120, innerWidth * .36));
    const span = reel.vertical ? holder.clientHeight : holder.clientWidth;
    const extent = plate => (reel.vertical ? across / tileRatio(plate) : across * tileRatio(plate)) + gap;
    // Deal each work to the shortest track so every loop is about as long.
    const tracks = Array.from({ length: reel.tracks }, () => ({ plates: [], length: 0 }));
    for (const plate of plates) {
      const track = tracks.reduce((shortest, candidate) => candidate.length < shortest.length ? candidate : shortest);
      track.plates.push(plate);
      track.length += extent(plate);
    }
    reel.deferred = [];
    holder.replaceChildren(...tracks.map((track, index) => {
      // A loop must outrun the window, or its seam would show.
      const loop = [...track.plates];
      for (let length = track.length; length < span * 1.15 && track.plates.length; length += track.length) loop.push(...track.plates);
      // Works in view when the page opens load now; the rest wait for the page.
      let reach = 0;
      const eager = loop.map(plate => {
        const visible = reach < span;
        reach += extent(plate);
        return visible;
      });
      const column = element('div', 'reel-col');
      column.style.setProperty('--i', index);
      const strip = element('div', 'reel-track');
      for (let copy = 0; copy < 2; copy++) {
        const set = element('div', 'reel-set');
        loop.forEach((plate, order) => set.append(reelTile(plate, across, eager[order])));
        strip.append(set);
      }
      column.append(strip);
      return column;
    }));
    reel.width = holder.clientWidth;
    timeReel();
    showReelCard(null, true);
    $('reel').classList.add('is-ready');
    if (document.readyState === 'complete') hydrateReel();
  }

  function reelTile(plate, across, eager) {
    const { item } = plate;
    const ratio = tileRatio(plate);
    const tile = element('span', 'reel-tile');
    tile.dataset.index = String(plate.number - 1);
    tile.style.setProperty('--ratio', ratio.toFixed(4));
    const tone = toneOf(item);
    if (tone) tile.style.setProperty('--tone', tone);
    if (plate.ratio < ratio) tile.dataset.crop = 'top';
    const image = element('img');
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('load', () => tile.classList.add('is-loaded'), { once: true });
    // The reel never needs more than the 640px preview.
    const all = previewSet(item);
    const sources = all.filter(source => source.width <= 640);
    if (!sources.length) sources.push(all[0]);
    image.sizes = `${Math.round(reel.vertical ? across : across * ratio)}px`;
    const srcset = sources.map(source => `${source.src} ${source.width}w`).join(', ');
    if (eager) {
      image.srcset = srcset;
      image.src = sources[0].src;
    } else reel.deferred.push(() => { image.srcset = srcset; image.src = sources[0].src; });
    tile.append(image);
    return tile;
  }

  function hydrateReel() {
    const pending = reel.deferred.splice(0);
    if (!pending.length) return;
    const start = () => pending.forEach(load => load());
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  }

  // Each column drifts at its own steady pace, whatever its length.
  function timeReel() {
    const speeds = reel.vertical ? [24, 19, 27] : [20, 16];
    $('reel-window').querySelectorAll('.reel-track').forEach((strip, index) => {
      const set = strip.firstElementChild;
      const length = reel.vertical ? set.offsetHeight : set.offsetWidth;
      strip.style.setProperty('--dur', `${Math.max(18, length / speeds[index % speeds.length]).toFixed(1)}s`);
    });
  }

  function showReelCard(plate, force) {
    if (plate === reel.shown && !force) return;
    reel.shown = plate;
    const text = $('reel-card-text');
    const apply = () => {
      if (plate) {
        $('reel-label').textContent = `图版 ${pad(plate.number, 3)} · ${plate.item.categoryName || plate.chapter.category.name}`;
        $('reel-title').textContent = realTitle(plate.item) || plate.chapter.category.name;
      } else {
        const english = element('span', '', 'Selected Works');
        english.lang = 'en';
        $('reel-label').replaceChildren('精选作品', english);
        $('reel-title').textContent = `${state.plates.length} 幅作品 · ${state.chapters.length} 个章节`;
      }
      text.classList.remove('is-swapping');
    };
    clearTimeout(reel.swapTimer);
    if (force) return apply();
    text.classList.add('is-swapping');
    reel.swapTimer = setTimeout(apply, 170);
  }

  function syncReelMotion() {
    $('reel').classList.toggle('is-paused', reel.userPaused || !reel.inView);
  }

  /* ---------- Contents ---------- */

  function renderContents() {
    $('toc').replaceChildren(...state.chapters.map(chapter => {
      const link = element('a');
      link.href = `#${chapter.id}`;
      const arrow = element('span', 'toc-arrow');
      arrow.innerHTML = downIcon;
      link.append(element('span', 'toc-num', pad(chapter.number)), element('span', 'toc-name', chapter.category.name),
        element('span', 'toc-en', chapter.category.en || ''), element('span', 'toc-count', `${chapter.plates.length} 幅`), arrow);
      const item = element('li');
      item.append(link);
      return item;
    }));
    $('colophon-count').textContent = `收录图版 ${state.plates.length} 幅`;
  }

  function renderChapters() {
    videoObserver.disconnect();
    plateLoader.disconnect();
    chaptersRoot.replaceChildren(...state.chapters.map(chapter => {
      const section = element('section', 'chapter wrap');
      section.id = chapter.id;
      section.setAttribute('aria-labelledby', `${chapter.id}-title`);
      const heading = element('h2', '', chapter.category.name);
      heading.id = `${chapter.id}-title`;
      if (chapter.category.en) {
        const english = element('span', '', chapter.category.en);
        english.lang = 'en';
        heading.append(english);
      }
      const titles = element('div', 'chapter-titles');
      titles.append(heading);
      const numeral = element('p', 'chapter-num', pad(chapter.number));
      numeral.setAttribute('aria-hidden', 'true');
      const head = element('header', 'chapter-head');
      head.append(numeral, titles, element('p', 'chapter-count', `${chapter.plates.length} 幅`));
      const box = element('div', 'plates');
      box.id = `${chapter.id}-plates`;
      for (const plate of chapter.plates) box.append(createPlate(plate));
      const more = element('button', 'more-button glass');
      more.type = 'button';
      more.setAttribute('aria-controls', box.id);
      more.addEventListener('click', () => toggleChapter(chapter));
      const foot = element('div', 'chapter-foot');
      foot.append(more);
      section.append(head, box, foot);
      revealObserver.observe(section);
      Object.assign(chapter, { section, box, more, foot });
      return section;
    }));
  }

  function badge(text, bottom) {
    const node = element('span', bottom ? 'badge is-bottom' : 'badge');
    if (!bottom) node.innerHTML = playIcon;
    node.append(document.createTextNode(text));
    return node;
  }

  // Load video metadata only when its plate approaches the viewport.
  const videoObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting && video.dataset.src) {
        video.src = video.dataset.src;
        delete video.dataset.src;
      }
      if (!entry.isIntersecting) video.pause();
    }
  }, { rootMargin: '200px' });

  // Plates fetch their image when about a screen away. The browser's own lazy
  // loading starts several screens early, which slows the first visit.
  const plateLoader = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target.querySelector('img[data-src]');
      if (image) {
        if (image.dataset.srcset) image.srcset = image.dataset.srcset;
        image.src = image.dataset.src;
        delete image.dataset.srcset;
        delete image.dataset.src;
      }
      plateLoader.unobserve(entry.target);
    }
  }, { rootMargin: '700px 0px' });

  // Plates and chapter heads rise in as they enter; plates arriving together
  // are staggered from top left to bottom right.
  const revealObserver = new IntersectionObserver(entries => {
    const arriving = entries.filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    arriving.forEach((entry, index) => {
      entry.target.style.setProperty('--delay', `${Math.min(index, 8) * 60}ms`);
      entry.target.classList.add('is-in');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });

  function createPlate(plate) {
    const { item } = plate;
    const figure = element('figure', 'plate');
    figure.dataset.itemId = item.id;
    const title = realTitle(item);
    const button = element('button', 'plate-open');
    button.type = 'button';
    button.setAttribute('aria-label', `查看图版 ${pad(plate.number, 3)}${title ? `：${title}` : ''}`);
    const media = element('span', 'plate-media');
    const tone = toneOf(item);
    if (tone) media.style.setProperty('--tone', tone);
    button.append(media);
    const caption = element('figcaption', 'plate-caption');
    caption.append(element('span', 'plate-no', pad(plate.number, 3)));
    if (title) caption.append(element('span', 'plate-title', title));
    figure.append(button, caption);
    const markLoaded = () => figure.classList.add('is-loaded');
    if (item.mediaType === 'video') {
      const video = element('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.dataset.src = mediaURL(item.src);
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('loadedmetadata', () => learnRatio(plate, video.videoWidth, video.videoHeight));
      video.addEventListener('loadeddata', markLoaded);
      button.addEventListener('pointerenter', () => {
        if (!reducedMotion.matches && video.src) video.play().catch(() => {});
      });
      button.addEventListener('pointerleave', () => video.pause());
      videoObserver.observe(video);
      media.append(video, badge('视频'));
    } else {
      const image = element('img');
      image.alt = '';
      image.decoding = 'async';
      image.addEventListener('load', () => {
        if (!plate.known) learnRatio(plate, image.naturalWidth, image.naturalHeight);
        markLoaded();
      });
      image.addEventListener('error', () => {
        if (image.src === mediaURL(item.src)) {
          media.replaceChildren(element('span', 'media-failure', '预览暂不可用'));
          markLoaded();
        } else {
          image.removeAttribute('srcset');
          image.src = mediaURL(item.src);
        }
      });
      const sources = previewSet(item);
      if (sources.length) {
        image.sizes = '(max-width: 760px) 50vw, 30vw';
        image.dataset.srcset = sources.map(source => `${source.src} ${source.width}w`).join(', ');
        image.dataset.src = sources[0].src;
      } else image.dataset.src = mediaURL(item.src);
      media.append(image);
      if (item.mediaType === 'gif') media.append(badge('动图'));
      plateLoader.observe(figure);
    }
    button.addEventListener('click', () => openViewer(plate.number - 1));
    revealObserver.observe(figure);
    Object.assign(plate, { figure, media });
    return figure;
  }

  function learnRatio(plate, width, height) {
    if (!(width > 0 && height > 0)) return;
    plate.ratio = width / height;
    plate.known = true;
    plate.small = isSmall(plate.item, width, height);
    measureChapter(plate.chapter);
    scheduleLayout();
  }

  /* ---------- Justified rows ---------- */

  // Greedy justified rows: close a row as soon as it is no taller than the
  // target, keeping whichever break lands closer to the target height.
  function justify(ratios, width, gap, target) {
    const rows = [];
    let start = 0;
    while (start < ratios.length) {
      let sum = 0;
      let row = null;
      for (let end = start; end < ratios.length && !row; end++) {
        sum += ratios[end];
        const height = (width - (end - start) * gap) / sum;
        if (height > target) continue;
        const previous = end > start ? (width - (end - start - 1) * gap) / (sum - ratios[end]) : Infinity;
        row = Math.log(previous / target) < Math.log(target / height)
          ? { start, end: end - 1, height: previous }
          : { start, end, height };
      }
      if (!row) {
        // The remainder cannot fill a row; stretch it only if that stays modest.
        const full = (width - (ratios.length - 1 - start) * gap) / sum;
        row = full <= target * 1.25 ? { start, end: ratios.length - 1, height: full } : { start, end: ratios.length - 1, height: target, ragged: true };
      }
      rows.push(row);
      start = row.end + 1;
    }
    return rows;
  }

  function layoutChapter(chapter) {
    const box = chapter.box;
    const width = box?.clientWidth;
    if (!width) return;
    const styles = getComputedStyle(box);
    const read = name => parseFloat(styles.getPropertyValue(name));
    const gap = read('--gap');
    const rowGap = read('--row-gap');
    const caption = read('--caption');
    const perRow = read(chapter.small ? '--per-row-small' : '--per-row');
    const target = Math.min(read('--max-h'), Math.max(read('--min-h'), (width - (perRow - 1) * gap) / (perRow * chapter.medianRatio)));
    // Plates narrower than --min-w show their top; very wide ones are cropped at 2.4:1.
    const minRatio = read('--min-w') / target;
    const ratios = chapter.plates.map(plate => {
      const crop = plate.ratio < minRatio ? 'top' : plate.ratio > 2.4 ? 'center' : '';
      if (crop !== plate.crop) {
        plate.crop = crop;
        plate.figure.dataset.crop = crop;
        // Only truly long images (which scroll in the viewer) are labelled.
        const hint = plate.media.querySelector('.badge.is-bottom');
        if (crop === 'top' && plate.ratio < .5 && !hint) plate.media.append(badge('长图', true));
        else if (crop !== 'top' || plate.ratio >= .5) hint?.remove();
      }
      return crop === 'top' ? minRatio : crop === 'center' ? 2.4 : plate.ratio;
    });
    const rows = justify(ratios, width, gap, target);
    // A closed chapter shows whole rows up to about ten plates.
    let visibleRows = rows.length;
    if (!chapter.expanded) {
      const preview = narrowScreen.matches ? 6 : 10;
      let count = 0;
      for (let index = 0; index < rows.length; index++) {
        count += rows[index].end - rows[index].start + 1;
        if (count >= preview) { visibleRows = index + 1; break; }
      }
      if (chapter.plates.length - count <= 2) visibleRows = rows.length;
    }
    let top = 0;
    rows.forEach((row, index) => {
      const shown = index < visibleRows;
      const height = Math.round(row.height);
      let left = 0;
      for (let position = row.start; position <= row.end; position++) {
        const plate = chapter.plates[position];
        plate.figure.hidden = !shown;
        if (!shown) continue;
        const plateWidth = position === row.end && !row.ragged ? width - left : Math.round(ratios[position] * row.height);
        plate.figure.style.width = `${plateWidth}px`;
        plate.figure.style.transform = `translate(${left}px,${top}px)`;
        plate.media.style.height = `${height}px`;
        const image = plate.media.querySelector('img');
        if (image) image.sizes = `${plateWidth}px`;
        left += plateWidth + gap;
      }
      if (shown) top += height + caption + rowGap;
    });
    box.style.height = `${Math.max(0, top - rowGap)}px`;
    const collapsible = visibleRows < rows.length || chapter.expanded;
    chapter.foot.hidden = !collapsible;
    chapter.more.setAttribute('aria-expanded', String(chapter.expanded));
    chapter.more.replaceChildren(document.createTextNode(chapter.expanded ? '收起本章' : `展开全部 ${chapter.plates.length} 幅`));
    chapter.more.insertAdjacentHTML('beforeend', chevronIcon);
  }

  function layoutBook() {
    cancelAnimationFrame(layoutFrame);
    state.chapters.forEach(layoutChapter);
    updateRunningHead();
  }

  function scheduleLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layoutBook);
  }

  function toggleChapter(chapter) {
    // Keep the button where it is on screen when a chapter closes above it.
    const before = chapter.more.getBoundingClientRect().top;
    chapter.expanded = !chapter.expanded;
    layoutChapter(chapter);
    if (!chapter.expanded) window.scrollBy({ top: chapter.more.getBoundingClientRect().top - before, behavior: 'instant' });
    updateRunningHead();
  }

  /* ---------- Running head ---------- */

  function updateRunningHead() {
    const masthead = $('masthead');
    masthead.classList.toggle('is-scrolled', window.scrollY > 4);
    let current = null;
    let progress = 0;
    if (!$('portfolio-view').hidden) {
      const line = masthead.offsetHeight + 48;
      for (const chapter of state.chapters) {
        const rect = chapter.section?.getBoundingClientRect();
        if (rect && rect.top <= line && rect.bottom > line) {
          current = chapter;
          progress = (line - rect.top) / rect.height;
        }
      }
    }
    const head = $('running-head');
    if (current) head.style.setProperty('--progress', progress.toFixed(3));
    if (current === state.runningChapter) return;
    state.runningChapter = current;
    if (current) {
      $('running-num').textContent = pad(current.number);
      $('running-name').textContent = current.category.name;
    }
    head.classList.toggle('is-visible', Boolean(current));
  }

  /* ---------- Liquid details ---------- */

  // The droplet behind the active link. Moving right, its right edge leads and
  // its left edge follows late, so it stretches and then settles.
  let lensLeft = null;
  function moveLens(link, instant) {
    const lens = $('nav-lens');
    if (!link?.offsetWidth) return;
    const left = link.offsetLeft;
    const right = link.offsetParent.clientWidth - left - link.offsetWidth;
    const forward = lensLeft === null || left >= lensLeft;
    lens.style.setProperty('--tl', forward ? '.62s' : '.34s');
    lens.style.setProperty('--tr', forward ? '.34s' : '.62s');
    lens.classList.toggle('is-instant', Boolean(instant) || lensLeft === null);
    lens.style.setProperty('--l', `${left}px`);
    lens.style.setProperty('--r', `${right}px`);
    lensLeft = left;
    if (lens.classList.contains('is-instant')) {
      void lens.offsetWidth;
      lens.classList.remove('is-instant');
    }
  }
  const activeLink = () => document.querySelector('.nav-link.is-active');

  // Glass catches the light where the pointer is.
  function followLight() {
    let lit = null;
    let frame = 0;
    let last = null;
    document.addEventListener('pointermove', event => {
      last = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const glass = last.target instanceof Element ? last.target.closest('.glass, .glass-dark') : null;
        if (lit && lit !== glass) lit.style.setProperty('--glow', '0');
        lit = glass;
        if (!glass) return;
        const rect = glass.getBoundingClientRect();
        glass.style.setProperty('--mx', `${Math.round(last.clientX - rect.left)}px`);
        glass.style.setProperty('--my', `${Math.round(last.clientY - rect.top)}px`);
        glass.style.setProperty('--glow', '1');
      });
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      lit?.style.setProperty('--glow', '0');
      lit = null;
    });
  }

  /* ---------- Plate viewer ---------- */

  function clearViewerMedia() {
    const holder = $('lightbox-media');
    const video = holder.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    holder.replaceChildren();
    holder.classList.remove('is-long', 'is-pending');
    holder.scrollTop = 0;
  }

  // The room takes its light from the plate: a blurred copy of a preview the
  // page has usually loaded already.
  function lightViewer(plate, index) {
    const ambient = $('viewer-ambient');
    ambient.classList.remove('is-lit');
    const loaded = plate.media?.querySelector('img')?.currentSrc;
    const glow = plate.item.mediaType === 'video' ? '' : loaded || previewSet(plate.item)[0]?.src;
    if (!glow) return;
    const probe = new Image();
    probe.onload = () => {
      if (state.viewerIndex !== index) return;
      ambient.style.backgroundImage = `url("${glow}")`;
      ambient.classList.add('is-lit');
    };
    probe.src = glow;
  }

  function openViewer(index) {
    const plate = state.plates[index];
    if (!plate) return;
    const { item } = plate;
    state.viewerIndex = index;
    clearViewerMedia();
    chaptersRoot.querySelectorAll('video').forEach(video => video.pause());
    const holder = $('lightbox-media');
    const original = mediaURL(item.src);
    const fail = () => holder.replaceChildren(element('p', 'media-failure', '这个文件暂时无法预览，可以用右下角的链接打开原文件。'));
    if (item.mediaType === 'video') {
      const video = element('video');
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.addEventListener('error', fail, { once: true });
      video.src = original;
      holder.append(video);
    } else {
      // Show the cached preview at once, then swap in the original when it is ready.
      const preview = state.previews[item.src];
      const sources = previewSet(item);
      const quick = sources.length ? sources[sources.length - 1].src : '';
      const image = element('img');
      image.alt = realTitle(item) || item.categoryName || '';
      image.decoding = 'async';
      // The box fits the stage and never enlarges the original past 1.5x, so the
      // preview and the original occupy exactly the same space.
      const fit = (width, height) => {
        const long = width / height < .5;
        holder.classList.toggle('is-long', long);
        image.style.maxWidth = `min(100%, ${Math.round(width * 1.5)}px)`;
        image.style.maxHeight = long ? 'none' : `min(100%, ${Math.round(height * 1.5)}px)`;
      };
      if (preview) fit(preview.width, preview.height);
      holder.classList.add('is-pending');
      image.addEventListener('load', () => {
        if (!preview) fit(image.naturalWidth, image.naturalHeight);
        holder.classList.remove('is-pending');
      });
      image.addEventListener('error', () => {
        if (image.src !== original) image.src = original;
        else fail();
      });
      image.src = quick || original;
      holder.append(image);
      if (quick && quick !== original) {
        const full = new Image();
        full.src = original;
        full.decode().then(() => {
          if (state.viewerIndex === index && image.isConnected) image.src = original;
        }).catch(() => {});
      }
    }
    lightViewer(plate, index);
    const tags = (item.tags || []).filter(tag => tag !== item.categoryName && tag !== item.categoryEn);
    $('lb-meta').textContent = [`第 ${pad(plate.chapter.number)} 章`, item.categoryName, ...tags].filter(Boolean).join(' · ');
    $('lb-title').textContent = realTitle(item) || `图版 ${pad(plate.number, 3)}`;
    $('lb-description').textContent = item.description || '';
    $('lb-counter').textContent = `${pad(plate.number, 3)} / ${pad(state.plates.length, 3)}`;
    $('lb-original').href = original;
    $('lb-prev').disabled = $('lb-next').disabled = state.plates.length < 2;
    for (const offset of [1, -1]) {
      const neighbour = state.plates[(index + offset + state.plates.length) % state.plates.length];
      const sources = neighbour ? previewSet(neighbour.item) : [];
      if (sources.length) new Image().src = sources[sources.length - 1].src;
    }
    if (!dialog.open) {
      document.body.classList.add('viewer-open');
      dialog.showModal();
      $('lb-close').focus();
    }
  }

  function stepViewer(direction) {
    if (!dialog.open || !state.plates.length) return;
    openViewer((state.viewerIndex + direction + state.plates.length) % state.plates.length);
  }

  /* ---------- Views ---------- */

  function route() {
    const hash = decodeURIComponent(location.hash);
    const about = hash === '#about' || hash === '#resume';
    if (hash !== '#contact') {
      $('portfolio-view').hidden = about;
      $('resume-view').hidden = !about;
      $('nav-portfolio-btn').classList.toggle('is-active', !about);
      $('nav-resume-btn').classList.toggle('is-active', about);
      $('nav-portfolio-btn').toggleAttribute('aria-current', !about);
      $('nav-resume-btn').toggleAttribute('aria-current', about);
      (about ? $('nav-resume-btn') : $('nav-portfolio-btn')).setAttribute('aria-current', 'page');
      moveLens(activeLink());
    }
    requestAnimationFrame(() => {
      layoutBook();
      if (about || hash === '#home' || !hash) window.scrollTo({ top: 0, behavior: 'instant' });
      else document.getElementById(hash === '#works' ? 'contents' : hash.slice(1))?.scrollIntoView();
    });
  }

  function showToast(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }

  new ResizeObserver(() => {
    if (chaptersRoot.clientWidth === bookWidth) return;
    bookWidth = chaptersRoot.clientWidth;
    layoutBook();
    moveLens(activeLink(), true);
  }).observe(chaptersRoot);
  // Tiles scale with their column, so a new width only needs new loop timings.
  let reelResize;
  new ResizeObserver(() => {
    const width = $('reel-window').clientWidth;
    if (!reel.plates.length || !width || width === reel.width) return;
    clearTimeout(reelResize);
    if (!reel.width) return buildReel();
    reelResize = setTimeout(() => {
      reel.width = $('reel-window').clientWidth;
      timeReel();
    }, 150);
  }).observe($('reel-window'));
  // The cover's motion rests while it is off screen.
  new IntersectionObserver(([entry]) => {
    reel.inView = entry.isIntersecting;
    syncReelMotion();
    document.querySelector('.ambient').classList.toggle('is-paused', !entry.isIntersecting);
  }).observe($('home'));
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(headFrame);
    headFrame = requestAnimationFrame(updateRunningHead);
  }, { passive: true });
  window.addEventListener('load', hydrateReel, { once: true });

  const reelWindow = $('reel-window');
  reelWindow.addEventListener('click', event => {
    const tile = event.target.closest('.reel-tile');
    if (tile) openViewer(Number(tile.dataset.index));
  });
  reelWindow.addEventListener('pointerover', event => {
    const tile = event.target.closest('.reel-tile');
    if (tile && event.pointerType === 'mouse') showReelCard(state.plates[Number(tile.dataset.index)]);
  });
  reelWindow.addEventListener('pointerleave', () => { if (reel.shown) showReelCard(null); });
  $('reel-toggle').addEventListener('click', () => {
    reel.userPaused = !reel.userPaused;
    $('reel-toggle').setAttribute('aria-pressed', String(reel.userPaused));
    $('reel-toggle').setAttribute('aria-label', reel.userPaused ? '继续作品滚动' : '暂停作品滚动');
    syncReelMotion();
  });

  const nav = $('main-nav');
  nav.addEventListener('pointerover', event => {
    const link = event.target.closest('.nav-link');
    if (link && event.pointerType === 'mouse') moveLens(link);
  });
  nav.addEventListener('pointerleave', () => moveLens(activeLink()));
  nav.addEventListener('focusin', event => moveLens(event.target.closest('.nav-link')));
  nav.addEventListener('focusout', () => moveLens(activeLink()));

  const tocWrap = $('toc-wrap');
  tocWrap.addEventListener('pointerover', event => {
    const link = event.target.closest('.toc a');
    if (!link || event.pointerType !== 'mouse') return;
    const lens = $('toc-lens');
    lens.style.setProperty('--y', `${Math.round(link.getBoundingClientRect().top - tocWrap.getBoundingClientRect().top) + 5}px`);
    lens.style.setProperty('--h', `${link.offsetHeight - 10}px`);
    tocWrap.classList.add('is-lensed');
  });
  tocWrap.addEventListener('pointerleave', () => tocWrap.classList.remove('is-lensed'));

  for (const query of [narrowScreen, mediumScreen]) query.addEventListener('change', () => { if (reel.plates.length) buildReel(); });
  if (finePointer.matches) followLight();

  $('lb-close').addEventListener('click', () => dialog.close());
  $('lb-prev').addEventListener('click', () => stepViewer(-1));
  $('lb-next').addEventListener('click', () => stepViewer(1));
  dialog.addEventListener('close', () => {
    clearViewerMedia();
    $('viewer-ambient').classList.remove('is-lit');
    document.body.classList.remove('viewer-open');
    state.viewerIndex = -1;
  });
  dialog.addEventListener('keydown', event => {
    if (event.target.tagName === 'VIDEO') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stepViewer(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  let touchStart = null;
  $('lightbox-media').addEventListener('touchstart', event => {
    touchStart = event.target.tagName === 'IMG' && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  $('lightbox-media').addEventListener('touchend', event => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) stepViewer(dx > 0 ? -1 : 1);
    touchStart = null;
  }, { passive: true });
  $('print-resume').addEventListener('click', () => window.print());
  $('copy-wechat').addEventListener('click', async () => {
    const wechat = state.data?.profile?.wechat;
    if (!wechat) return;
    try { await navigator.clipboard.writeText(String(wechat)); showToast('微信号已复制'); }
    catch { showToast(`微信号：${wechat}`); }
  });
  window.addEventListener('hashchange', route);
  route();
  document.fonts?.ready.then(() => moveLens(activeLink(), true));
  loadData();
})();
