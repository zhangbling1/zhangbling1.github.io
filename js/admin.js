(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const Order = PortfolioOrder;
  const state = { data: null, previews: {}, revision: '', saved: '', online: false, busy: false, loaded: false,
    category: '', status: 'all', type: 'all', keyword: '', page: 1, pageSize: 48,
    selected: new Set(), missing: new Set(), undo: [], redo: [], editKey: null, savedAt: '', error: '' };
  let toastTimer, moveRequest, reviewAction, drag;
  const serialize = () => JSON.stringify(state.data);
  const dirty = () => Boolean(state.data && serialize() !== state.saved);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className, action, aria) => {
    const node = el('button', className, label);
    node.type = 'button';
    if (aria) { node.setAttribute('aria-label', aria); node.title = aria; }
    node.addEventListener('click', action);
    return node;
  };
  const title = item => item.title || item.fileName || '未命名作品';
  const mediaURL = src => {
    if (typeof src !== 'string' || !/^(images|assets)\//.test(src) || src.split('/').includes('..')) return '';
    const url = new URL(src, document.baseURI);
    return url.origin === location.origin ? url.href : '';
  };
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    // Native dialogs sit above every z-index; keep feedback in the active top layer.
    (document.querySelector('dialog[open]') || document.body).append($('toast'));
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 7500 : 4000);
  }
  async function json(url, body) {
    const response = await fetch(url, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || `请求失败（${response.status}）`);
    return data;
  }
  function updateStatus() {
    const changed = dirty();
    $('save').disabled = !state.data || !state.online || state.busy || !changed;
    $('save').textContent = state.busy ? '处理中…' : changed ? '保存修改 ●' : '已保存';
    if (!state.online && state.loaded) $('save').textContent = '静态预览';
    $('save-status').textContent = state.error ? '保存未完成 · 修改仍在' : state.busy ? '正在处理…' : changed ? '有未保存的修改' : state.savedAt ? `已保存 ${state.savedAt}` : state.online ? '已与本地同步' : '导出模式';
    $('save-status').classList.toggle('dirty', changed || Boolean(state.error));
    $('undo').disabled = !state.undo.length || state.busy;
    $('redo').disabled = !state.redo.length || state.busy;
    $('connection').textContent = !state.loaded ? '正在连接本地服务' : state.online ? '本地服务已连接' : '静态预览 · 无法写盘';
    $('connection').classList.toggle('offline', !state.online);
    if (state.data) {
      $('total-count').textContent = state.data.items.length;
      $('visible-count').textContent = state.data.items.filter(item => item.visible !== false).length;
    }
    $('notice').replaceChildren();
    $('notice').hidden = !state.loaded || (state.online && !state.error && !state.missing.size);
    if (!state.online) {
      $('notice').append(el('span', '', '当前是静态预览，修改只能导出为文件。双击项目中的「启动管理后台.bat」后，使用本地后台保存。'));
      const link = el('a', '', '打开本地后台 ↗'); link.href = 'http://127.0.0.1:3000/admin.html'; link.target = '_blank'; $('notice').append(link);
    } else if (state.error) {
      $('notice').append(el('span', '', state.error), button('导出当前修改', '', openBackup), button('重新载入', '', reloadReview));
    } else if (state.missing.size) {
      $('notice').append(el('span', '', `${state.missing.size} 幅作品的原文件已移动或替换。扫描素材可同步文件变化，并保留现有编辑。`), button('查看缺失作品', '', () => {
        state.status = 'missing'; $('status-filter').value = 'missing'; resetFilter();
      }));
    }
  }
  function busy(value) {
    state.busy = value;
    $('editor-main').inert = value;
    document.querySelector('.sidebar').inert = value;
    document.querySelectorAll('dialog').forEach(dialog => { dialog.inert = value; });
    updateStatus();
  }
  function change(mutator, { render = true, key = null } = {}) {
    if (state.busy || !state.data) return;
    const before = serialize();
    mutator();
    if (before === serialize()) return;
    if (!key || key !== state.editKey) {
      state.undo.push(before);
      if (state.undo.length > 40) state.undo.shift();
    }
    state.editKey = key;
    state.redo = [];
    state.error = '';
    if (render) renderAll(); else updateStatus();
  }
  function history(direction) {
    if (state.busy) return;
    const from = state[direction], to = state[direction === 'undo' ? 'redo' : 'undo'];
    if (!from.length) return;
    to.push(serialize()); state.data = JSON.parse(from.pop()); state.editKey = null; state.selected.clear();
    state.error = ''; renderAll(); toast(direction === 'undo' ? '已撤销上一步' : '已重做');
  }
  function setSnapshot(result) {
    Order.validate(result.data);
    state.data = result.data; state.revision = result.revision || '';
    state.saved = serialize(); state.undo = []; state.redo = []; state.selected.clear(); state.editKey = null;
    state.savedAt = result.savedAt ? new Date(result.savedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    state.missing = new Set(result.missing || []); state.error = '';
    renderAll();
  }
  async function load() {
    busy(true);
    try {
      const [status, previews] = await Promise.all([
        json('/api/status').catch(() => null), json('data/media-previews.json').catch(() => ({}))
      ]);
      state.online = status?.status === 'running'; state.previews = previews;
      setSnapshot(state.online ? await json('/api/portfolio') : { data: await json('data/portfolio-data.json') });
    } catch (error) {
      state.error = `读取失败：${error.message}`;
      $('assets-grid').replaceChildren(el('div', 'empty', '配置未能读取。请检查本地服务，再重新载入。'));
      $('assets-grid').append(button('重新载入', 'btn', load));
      toast(state.error, true);
    } finally { state.loaded = true; busy(false); }
  }
  async function save() {
    if (!state.online || state.busy || !state.data) return false;
    if (!dirty()) return true;
    busy(true); state.error = '';
    try {
      const result = await json('/api/save', { data: state.data, revision: state.revision });
      state.revision = result.revision; state.saved = serialize();
      state.editKey = null;
      state.savedAt = new Date(result.savedAt).toLocaleTimeString('zh-CN', { hour12: false });
      toast('已保存到本地。刷新前台即可看到修改。'); return true;
    } catch (error) { state.error = error.message; toast(`保存未完成：${error.message}`, true); return false; }
    finally { busy(false); }
  }
  function renderAll() {
    if (!state.data) return;
    if (state.category && !state.data.categories.some(cat => cat.id === state.category)) state.category = '';
    renderCategories(); renderAssets(); renderChapters(); renderProfile(); renderSettings(); updateStatus();
  }
  function renderCategories() {
    const categories = [{ id: '', name: '全部作品' }, ...[...state.data.categories].sort((a, b) => a.order - b.order)];
    $('categories').replaceChildren(...categories.map(cat => {
      const node = button(cat.name, cat.id === state.category ? 'active' : '', () => { state.category = cat.id; resetFilter(); });
      node.setAttribute('aria-pressed', String(cat.id === state.category));
      node.append(el('span', '', state.data.items.filter(item => !cat.id || item.category === cat.id).length));
      return node;
    }));
  }
  function filtered() {
    const keyword = state.keyword.toLocaleLowerCase();
    return Order.ordered(state.data, state.category).filter(item =>
      (state.status === 'all' || (state.status === 'visible' && item.visible !== false) || (state.status === 'hidden' && item.visible === false) || (state.status === 'missing' && state.missing.has(item.id)))
      && (state.type === 'all' || item.mediaType === state.type)
      && (!keyword || [item.title, item.fileName, item.categoryName, ...(item.tags || [])].join(' ').toLocaleLowerCase().includes(keyword)));
  }
  function resetFilter() { state.page = 1; state.selected.clear(); renderCategories(); renderAssets(); }
  function pageItems() {
    const items = filtered();
    const size = state.pageSize === 'all' ? Math.max(items.length, 1) : state.pageSize;
    const pages = Math.max(1, Math.ceil(items.length / size));
    state.page = Math.max(1, Math.min(state.page, pages));
    return { items: items.slice((state.page - 1) * size, state.page * size), total: items.length, size, pages };
  }
  function renderAssets() {
    const page = pageItems();
    const ranks = new Map(), lengths = new Map();
    for (const item of Order.ordered(state.data)) {
      const rank = (lengths.get(item.category) || 0) + 1;
      lengths.set(item.category, rank); ranks.set(item.id, rank);
    }
    $('result-count').textContent = `${page.total} 幅作品${page.pages > 1 ? ` · 第 ${state.page} / ${page.pages} 页` : ''}`;
    const neighbors = new Map(), previous = new Map();
    for (const item of filtered()) {
      const before = previous.get(item.category);
      neighbors.set(item.id, { up: before ? ranks.get(before.id) : null, down: null });
      if (before) neighbors.get(before.id).down = ranks.get(item.id);
      previous.set(item.category, item);
    }
    $('assets-grid').replaceChildren(...page.items.map(item => assetCard(item, ranks.get(item.id), lengths.get(item.category), neighbors.get(item.id))));
    if (!page.total) $('assets-grid').append(el('div', 'empty', '没有符合条件的作品，试试其他分类或筛选。'));
    renderSelection();
    const prev = button('← 上一页', 'btn', () => { state.page--; renderAssets(); $('categories').scrollIntoView({ block: 'start' }); });
    const next = button('下一页 →', 'btn', () => { state.page++; renderAssets(); $('categories').scrollIntoView({ block: 'start' }); });
    prev.disabled = state.page === 1; next.disabled = state.page === page.pages;
    const jump = el('input'); jump.type = 'number'; jump.min = '1'; jump.max = String(page.pages); jump.value = state.page; jump.setAttribute('aria-label', '跳转页码');
    jump.addEventListener('change', () => { state.page = Number(jump.value) || 1; renderAssets(); });
    $('pagination').replaceChildren(prev, jump, el('span', '', `/ ${page.pages} 页`), next);
    $('pagination').hidden = page.pages <= 1;
  }
  function assetCard(item, rank, total, neighbors) {
    const card = el('article', `asset${item.visible === false ? ' hidden-work' : ''}${state.selected.has(item.id) ? ' selected' : ''}`);
    card.dataset.id = item.id; card.dataset.category = item.category;
    const top = el('div', 'asset-top');
    const select = el('input'); select.type = 'checkbox'; select.checked = state.selected.has(item.id); select.setAttribute('aria-label', `选择 ${title(item)}`);
    select.addEventListener('change', () => { select.checked ? state.selected.add(item.id) : state.selected.delete(item.id); card.classList.toggle('selected', select.checked); renderSelection(); });
    const rankButton = button(String(rank).padStart(2, '0'), 'rank', () => openMove([item.id]), `移动 ${title(item)}，当前第 ${rank} 幅`);
    const handle = button('⠿', 'drag-handle', () => {}, `拖动 ${title(item)} 排序；方向键调整位置`);
    handle.addEventListener('pointerdown', event => beginDrag(event, item, card));
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const position = event.key === 'Home' ? 1 : event.key === 'End' ? total : neighbors[event.key === 'ArrowUp' ? 'up' : 'down'];
      if (position === null) return;
      moveItems([item.id], position);
      document.querySelectorAll('.asset').forEach(node => { if (node.dataset.id === item.id) node.querySelector('.drag-handle').focus(); });
    });
    top.append(select, rankButton, handle);
    const media = button('', 'asset-media', () => openItem(item.id), `编辑 ${title(item)}`);
    const preview = state.previews[item.src];
    const source = mediaURL(preview?.variants?.[0]?.src) || (item.mediaType !== 'video' ? mediaURL(item.src) : '');
    if (source) {
      const img = el('img'); img.src = source; img.alt = title(item); img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      img.addEventListener('error', () => { media.classList.add('is-broken'); }); media.append(img);
    }
    media.append(el('span', 'media-placeholder', state.missing.has(item.id) ? '原文件缺失 · 待同步' : item.mediaType === 'video' ? '▶ 点击播放视频' : '预览暂不可用'));
    if (item.mediaType !== 'image') media.append(el('span', 'media-type', item.mediaType === 'video' ? '▶ VIDEO' : 'GIF'));
    const body = el('div', 'asset-body');
    body.append(button(title(item), 'asset-title', () => openItem(item.id)), el('p', 'asset-meta', `${item.fileName} · ${preview ? `${preview.width} × ${preview.height}` : item.categoryName || item.category}`));
    const footer = el('div', 'asset-footer');
    footer.append(button(item.visible === false ? '已隐藏' : '已公开', `visibility${item.visible === false ? ' is-hidden' : ''}`, () => {
      change(() => { item.visible = item.visible === false; });
    }, `${item.visible === false ? '公开' : '隐藏'} ${title(item)}`));
    const up = button('↑', 'icon-btn', () => moveItems([item.id], neighbors.up), `上移 ${title(item)}`);
    const down = button('↓', 'icon-btn', () => moveItems([item.id], neighbors.down), `下移 ${title(item)}`);
    up.disabled = neighbors.up === null; down.disabled = neighbors.down === null;
    footer.append(up, down); body.append(footer); card.append(top, media, body); return card;
  }
  function renderSelection() {
    const page = pageItems().items;
    const count = page.filter(item => state.selected.has(item.id)).length;
    $('select-page').checked = page.length > 0 && count === page.length;
    $('select-page').indeterminate = count > 0 && count < page.length;
    $('selection-bar').hidden = !state.selected.size;
    $('selection-count').textContent = `已选 ${state.selected.size} 幅`;
  }
  function selectedCategory(ids) {
    const items = ids.map(id => state.data.items.find(item => item.id === id));
    if (!items.length || items.some(item => !item || item.category !== items[0].category)) throw new Error('移动前请选择同一分类的作品');
    return items[0].category;
  }
  function moveItems(ids, position) {
    try {
      const category = selectedCategory(ids);
      change(() => Order.move(state.data, category, ids, position));
      toast(`已调整 ${ids.length} 幅作品的顺序，可撤销`);
    } catch (error) { toast(error.message, true); }
  }
  function openMove(ids) {
    try {
      const category = selectedCategory(ids), items = Order.ordered(state.data, category);
      moveRequest = { ids, category, max: items.length - ids.length + 1 };
      const name = state.data.categories.find(cat => cat.id === category)?.name || category;
      $('move-description').textContent = `「${name}」共 ${items.length} 幅作品，正在移动 ${ids.length} 幅。`;
      $('move-position').max = String(moveRequest.max);
      $('move-position').value = Math.min(moveRequest.max, items.findIndex(item => item.id === ids[0]) + 1);
      $('move-dialog').showModal(); $('move-position').select();
    } catch (error) { toast(error.message, true); }
  }
  function finishMove(position) {
    moveItems(moveRequest.ids, position); $('move-dialog').close();
  }
  function beginDrag(event, item, card) {
    if (event.button !== 0 || state.busy) return;
    event.preventDefault();
    const ids = state.selected.has(item.id) ? [...state.selected] : [item.id];
    try { selectedCategory(ids); } catch (error) { toast(error.message, true); return; }
    drag = { ids, category: item.category, startX: event.clientX, startY: event.clientY, active: false, card, target: null, after: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  document.addEventListener('pointermove', event => {
    if (!drag) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.active = true; drag.card.classList.add('dragging');
    document.querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.asset');
    drag.target = null;
    if (target && target.dataset.category === drag.category && !drag.ids.includes(target.dataset.id)) {
      const rect = target.getBoundingClientRect(); drag.after = event.clientX > rect.left + rect.width / 2;
      drag.target = target.dataset.id; target.classList.add(drag.after ? 'drop-after' : 'drop-before');
    }
    if (event.clientY < 145) window.scrollBy(0, -18);
    else if (event.clientY > innerHeight - 80) window.scrollBy(0, 18);
  });
  function endDrag(commit) {
    if (!drag) return;
    const current = drag; drag = null;
    document.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(node => node.classList.remove('dragging', 'drop-before', 'drop-after'));
    if (commit && current.active && current.target) {
      const rest = Order.ordered(state.data, current.category).filter(item => !current.ids.includes(item.id));
      moveItems(current.ids, rest.findIndex(item => item.id === current.target) + 1 + Number(current.after));
    }
  }
  document.addEventListener('pointerup', () => endDrag(true));
  document.addEventListener('pointercancel', () => endDrag(false));
  function field(label, value, onInput, { multiline = false, full = false, type = 'text', key = label } = {}) {
    const wrapper = el('label', `field${full ? ' full' : ''}`, label);
    const input = el(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = type;
    input.value = value ?? '';
    input.addEventListener('input', () => change(() => onInput(input.value), { render: false, key }));
    input.addEventListener('blur', () => { state.editKey = null; });
    wrapper.append(input); return wrapper;
  }
  function openItem(id) {
    const item = state.data.items.find(work => work.id === id);
    $('item-heading').textContent = title(item); $('item-file').textContent = `${item.categoryName || item.category} / ${item.fileName}`;
    const media = el(item.mediaType === 'video' ? 'video' : 'img'); media.src = mediaURL(item.src);
    if (item.mediaType === 'video') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
    else { media.alt = title(item); media.addEventListener('error', () => $('item-preview').replaceChildren(el('p', 'muted', '原文件无法读取，请同步素材目录。'))); }
    $('item-preview').replaceChildren(media);
    $('item-fields').replaceChildren(
      field('作品标题', item.title, value => { item.title = value; }, { full: true, key: `title:${id}` }),
      field('作品说明', item.description, value => { item.description = value; }, { multiline: true, full: true, key: `description:${id}` }),
      field('标签（逗号分隔）', (item.tags || []).join('，'), value => { item.tags = value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean); }, { full: true, key: `tags:${id}` })
    );
    $('item-dialog').showModal();
  }
  $('item-dialog').addEventListener('close', () => { $('item-preview').replaceChildren(); renderAssets(); });
  function renderChapters() {
    const cats = [...state.data.categories].sort((a, b) => a.order - b.order);
    $('chapter-list').replaceChildren(...cats.map((cat, index) => {
      const row = el('div', 'form-card chapter-card');
      row.append(el('span', 'chapter-index', String(index + 1).padStart(2, '0')),
        field('分类名称', cat.name, value => { cat.name = value; state.data.items.filter(item => item.category === cat.id).forEach(item => { item.categoryName = value; }); renderCategories(); }, { key: `cat-name:${cat.id}` }),
        field('英文名称', cat.en, value => { cat.en = value; state.data.items.filter(item => item.category === cat.id).forEach(item => { item.categoryEn = value; }); }, { key: `cat-en:${cat.id}` }));
      const controls = el('div', 'chapter-controls');
      for (const direction of [-1, 1]) {
        const move = button(direction === -1 ? '↑' : '↓', 'icon-btn', () => change(() => {
          [cats[index], cats[index + direction]] = [cats[index + direction], cats[index]];
          cats.forEach((category, i) => { category.order = i + 1; });
          state.data.categories = cats;
          state.data.items.forEach(item => { item.categoryOrder = cats.find(category => category.id === item.category)?.order; });
        }), `${direction === -1 ? '上移' : '下移'}分类 ${cat.name}`);
        move.disabled = index + direction < 0 || index + direction >= cats.length; controls.append(move);
      }
      row.append(controls); return row;
    }));
  }
  function renderProfile() {
    const profile = state.data.profile;
    const specs = [['姓名', 'name'], ['职业身份', 'title'], ['邮箱', 'email'], ['电话', 'phone'], ['微信', 'wechat'], ['城市', 'location'], ['个人简介', 'bio', true], ['专业技能（逗号分隔）', 'skills'], ['首页 AI 工具说明', 'aiToolsIntro']];
    $('profile-fields').replaceChildren(...specs.map(([label, key, multiline]) => field(label, key === 'skills' ? (profile.skills || []).join('，') : profile[key], value => {
      profile[key] = key === 'skills' ? value.split(/[,，]/).map(item => item.trim()).filter(Boolean) : value;
    }, { multiline, full: multiline || key === 'skills' || key === 'aiToolsIntro', key: `profile:${key}` })));
    const experiences = profile.experiences || (profile.experiences = []);
    $('experience-list').replaceChildren(...experiences.map((exp, index) => {
      const card = el('div', `form-card${index === 0 ? ' latest' : ''}`);
      const head = el('div', 'form-card-heading');
      head.append(el('p', 'eyebrow', index === 0 ? '01 / 最近一份 · 大卡片' : `${String(index + 1).padStart(2, '0')} / 工作经历`));
      for (const direction of [-1, 1]) {
        const move = button(direction === -1 ? '↑' : '↓', 'icon-btn', () => change(() => {
          [experiences[index], experiences[index + direction]] = [experiences[index + direction], experiences[index]];
        }), `${direction === -1 ? '上移' : '下移'}经历 ${exp.company || index + 1}`);
        move.disabled = index + direction < 0 || index + direction >= experiences.length; head.append(move);
      }
      head.append(button('删除', 'text-btn', () => { change(() => experiences.splice(index, 1)); toast('经历已移除，可以撤销'); }, `删除经历 ${exp.company || index + 1}`));
      const fields = el('div', 'fields');
      fields.append(...[['公司', 'company'], ['职位', 'role'], ['时间', 'period'], ['城市', 'location'], ['工作内容', 'description']].map(([label, key]) =>
        field(label, exp[key], value => { exp[key] = value; }, { multiline: key === 'description', full: key === 'description', key: `exp:${index}:${key}` })));
      card.append(head, fields); return card;
    }));
  }
  function renderSettings() {
    const settings = state.data.siteInfo;
    $('settings-fields').replaceChildren(...[['浏览器标题', 'title'], ['导航品牌文字', 'brandName'], ['封面标题前半', 'heroTitlePrefix'], ['封面标题后半', 'heroTitleSuffix'], ['封面副标题', 'heroSubtitle'], ['页脚版权', 'footerCopyright']].map(([label, key]) =>
      field(label, settings[key], value => { settings[key] = value; }, { full: ['heroSubtitle', 'footerCopyright'].includes(key), key: `site:${key}` })));
  }
  function openBackup() {
    if (!state.data) return;
    $('backup-json').value = JSON.stringify(state.data, null, 2); $('backup-dialog').showModal();
  }
  function openReview(heading, description, content, label, action, commit = false) {
    $('review-heading').textContent = heading; $('review-description').textContent = description;
    $('review-content').textContent = content; $('review-confirm').textContent = label;
    $('commit-field').hidden = !commit; reviewAction = action; $('review-dialog').showModal();
  }
  function reloadReview() {
    if (!dirty()) return load();
    openReview('重新载入磁盘配置', '当前未保存的修改将被替换。需要保留时，请先关闭此窗口并导出备份。', '此操作会清空本页的撤销记录。', '放弃草稿并载入', load);
  }
  function toolsReady() {
    if (!state.online) { toast('请启动本地管理后台后操作。', true); return false; }
    if (dirty()) { $('tools-dialog').close(); toast('请先保存当前修改，再同步或发布。', true); return false; }
    return true;
  }
  $('rescan').addEventListener('click', async () => {
    if (!toolsReady()) return;
    busy(true);
    try {
      const result = await json('/api/rescan', { revision: state.revision, preview: true });
      const s = result.summary;
      const changes = Object.entries({ '新增（保持隐藏）': s.added, '同名格式替换': s.replaced, '移除缺失文件的记录': s.removed }).map(([label, files]) => `${label} · ${files.length}\n${files.join('\n') || '无'}`).join('\n\n');
      $('tools-dialog').close();
      openReview('同步素材变化', '原有标题、可见状态与顺序会保留。保存前会自动备份旧配置。', changes, '确认同步', async () => {
        busy(true);
        try { const updated = await json('/api/rescan', { revision: state.revision }); setSnapshot(updated); toast('素材已同步到本地，新作品可在「已隐藏」中查看。'); }
        catch (error) { state.error = error.message; toast(error.message, true); }
        finally { busy(false); }
      });
    } catch (error) { toast(error.message, true); } finally { busy(false); }
  });
  $('build-previews').addEventListener('click', async () => {
    if (!toolsReady()) return;
    busy(true); toast('正在生成预览图，素材较多时需要一些时间。');
    try { const result = await json('/api/build-previews', {}); state.previews = await json('data/media-previews.json'); renderAssets(); toast(result.message); }
    catch (error) { toast(`预览图未完成：${error.message}`, true); } finally { busy(false); }
  });
  $('publish-review').addEventListener('click', async () => {
    if (!toolsReady()) return;
    busy(true);
    try {
      const status = await json('/api/git-status'); $('tools-dialog').close();
      openReview('发布到 GitHub', `将提交以下全部改动并推送到 ${status.branch} 分支（另有 ${status.ahead} 个本地提交）。`, `${status.remote}\n\n${status.changes || '没有未提交的文件改动。'}`, '确认提交并推送', async () => {
        busy(true);
        try { const result = await json('/api/git-push', { revision: state.revision, review: status.review, commitMsg: $('commit-message').value }); toast(result.message); }
        catch (error) { toast(`发布未完成：${error.message}`, true); } finally { busy(false); }
      }, true);
    } catch (error) { toast(error.message, true); } finally { busy(false); }
  });
  $('review-confirm').addEventListener('click', async () => { $('review-dialog').close(); if (reviewAction) await reviewAction(); });
  $('save').addEventListener('click', save);
  $('undo').addEventListener('click', () => history('undo'));
  $('redo').addEventListener('click', () => history('redo'));
  $('search').addEventListener('input', event => { state.keyword = event.target.value.trim(); resetFilter(); });
  $('status-filter').addEventListener('change', event => { state.status = event.target.value; resetFilter(); });
  $('type-filter').addEventListener('change', event => { state.type = event.target.value; resetFilter(); });
  $('page-size').addEventListener('change', event => { state.pageSize = event.target.value === 'all' ? 'all' : Number(event.target.value); resetFilter(); });
  $('select-page').addEventListener('change', event => {
    pageItems().items.forEach(item => event.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id)); renderAssets();
  });
  $('selection-clear').addEventListener('click', () => { state.selected.clear(); renderAssets(); });
  $('selection-move').addEventListener('click', () => openMove([...state.selected]));
  for (const [id, visible] of [['selection-show', true], ['selection-hide', false]]) $(id).addEventListener('click', () => {
    change(() => state.data.items.filter(item => state.selected.has(item.id)).forEach(item => { item.visible = visible; }));
    toast(`已${visible ? '公开' : '隐藏'} ${state.selected.size} 幅作品，可撤销`);
  });
  for (const [id, compact] of [['view-comfort', false], ['view-compact', true]]) $(id).addEventListener('click', () => {
    $('assets-grid').classList.toggle('compact', compact);
    $('view-comfort').classList.toggle('active', !compact); $('view-compact').classList.toggle('active', compact);
    $('view-comfort').setAttribute('aria-pressed', String(!compact)); $('view-compact').setAttribute('aria-pressed', String(compact));
  });
  $('move-form').addEventListener('submit', event => { event.preventDefault(); finishMove(Number($('move-position').value)); });
  $('move-first').addEventListener('click', () => finishMove(1));
  $('move-last').addEventListener('click', () => finishMove(moveRequest.max));
  $('add-experience').addEventListener('click', () => {
    change(() => state.data.profile.experiences.unshift({ company: '', role: '', period: '', location: '', description: '' }));
    $('experience-list').querySelector('input')?.focus(); toast('新经历已放在最前面，填写后保存即可。');
  });
  document.querySelectorAll('[data-section]').forEach(node => node.addEventListener('click', () => {
    if (!state.data) return;
    document.querySelectorAll('[data-section]').forEach(nav => { nav.classList.toggle('active', nav === node); nav.setAttribute('aria-current', nav === node ? 'page' : 'false'); });
    document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === node.dataset.section));
    window.scrollTo({ top: 0 });
  }));
  $('backup').addEventListener('click', openBackup);
  $('maintenance').addEventListener('click', () => {
    $('tools-note').textContent = state.online ? '扫描前先查看变化清单。同步与发布均需要先保存草稿。' : '当前为静态预览。请启动本地管理后台以使用这些功能。';
    ['rescan', 'build-previews', 'publish-review'].forEach(id => { $(id).disabled = !state.online; });
    $('tools-dialog').showModal();
  });
  $('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = 'portfolio-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出当前配置；导出不会替代本地保存。');
  });
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('备份超过 20 MB', true); return; }
    $('backup-json').value = await file.text(); event.target.value = '';
  });
  $('import').addEventListener('click', () => {
    try { const data = Order.validate(JSON.parse($('backup-json').value)); change(() => { state.data = data; state.selected.clear(); }); $('backup-dialog').close(); toast('已导入为草稿。可撤销，保存后生效。'); }
    catch (error) { toast(`导入失败：${error.message}`, true); }
  });
  document.querySelectorAll('[data-close]').forEach(node => node.addEventListener('click', () => node.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog && !state.busy) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  } }));
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') endDrag(false);
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
    const editing = event.target.closest('input,textarea,[contenteditable]');
    if (!editing && !document.querySelector('dialog[open]') && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); }
  });
  load();
})();
