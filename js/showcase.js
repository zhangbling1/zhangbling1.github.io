/* A whole website shown as one chapter of the book: the mini-game demo pages,
   live in a framed window, so they can be read and played without leaving. */
(() => {
  'use strict';

  const pad = value => String(value).padStart(2, '0');
  const down = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg>';
  const out = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function chapter(config, number) {
    const url = typeof config?.url === 'string' && /^https:\/\//.test(config.url) ? config.url : '';
    if (!url || typeof config.name !== 'string' || !config.name.trim()) return null;
    const stills = (config.stills || []).filter(src => /^assets\/showcase\/[a-z-]+\.webp$/.test(src));
    return { number, id: 'mini-games', category: { name: config.name, en: config.en || '' }, plates: [], showcase: { ...config, url, stills } };
  }

  // In the contents it is a row of its own, like the tools, with its two home screens.
  function contents(chapter) {
    const { showcase } = chapter;
    const item = el('li', 'tool-toc-item');
    const link = el('a', 'toc-card tool-toc site-toc');
    link.href = `#${chapter.id}`;
    const art = el('span', 'tool-toc-art site-toc-art');
    art.setAttribute('aria-hidden', 'true');
    for (const src of showcase.stills) {
      const still = el('img');
      Object.assign(still, { src, alt: '', loading: 'lazy', decoding: 'async', width: 108, height: 192 });
      art.append(still);
    }
    const text = el('span', 'tool-toc-copy');
    text.append(el('span', 'toc-num', pad(chapter.number)), el('span', 'tool-toc-name', showcase.name), el('span', 'tool-toc-en', showcase.en));
    const names = el('span', 'tool-toc-names');
    names.append(...(showcase.works || []).map(name => el('span', '', name)));
    const count = el('span', 'toc-count', '完整网页');
    const arrow = el('span', 'toc-arrow');
    arrow.innerHTML = down;
    count.append(arrow);
    link.append(art, text, names, count);
    item.append(link);
    return item;
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
    head.append(num, titles, el('p', 'chapter-count', `${(showcase.works || []).length || ''} 个方向`));
    const intro = el('div', 'site-intro');
    if (showcase.statement) intro.append(el('p', 'site-statement', showcase.statement));
    if (showcase.description) intro.append(el('p', 'site-description', showcase.description));
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
    const foot = el('div', 'chapter-foot');
    const back = el('a', 'chapter-next', '返回目录');
    back.href = '#contents';
    back.insertAdjacentHTML('beforeend', down);
    foot.append(el('p', 'chapter-progress', '网页里的页面和试玩都可以直接操作'), back);
    section.append(head, intro, frame, foot);
    return section;
  }

  window.PortfolioShowcase = { chapter, contents, render };
})();
