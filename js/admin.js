/**
 * 个人作品集管理后台业务逻辑 - admin.js
 */

// 全局应用状态
let portfolioData = null;
let mediaPreviews = {};
let currentTab = 'tab-assets';
let isServerOnline = false;
let isDirty = false;

const state = {
  category: 'all',
  status: 'all', // all | visible | hidden | featured
  mediaType: 'all', // all | image | video | gif
  keyword: '',
  page: 1,
  pageSize: 40
};

// DOM 元素引用
const serverDot = document.getElementById('server-dot');
const saveStatusText = document.getElementById('save-status-text');
const catChipsRoot = document.getElementById('cat-chips-root');
const assetsGridRoot = document.getElementById('assets-grid-root');
const paginationRoot = document.getElementById('pagination-root');
const toastContainer = document.getElementById('toast-container');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFilterEvents();
  setupActionButtons();
  await checkServerStatus();
  await loadPortfolioData();
});

// 检查本地 Node 服务连接状态
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      isServerOnline = data.status === 'running';
    } else {
      isServerOnline = false;
    }
  } catch (e) {
    isServerOnline = false;
  }

  updateServerIndicator();
}

function updateServerIndicator() {
  if (isServerOnline) {
    serverDot.className = isDirty ? 'dot dirty' : 'dot';
    saveStatusText.textContent = isDirty ? '有未保存修改 (本地服务就绪)' : '本地服务已连接';
  } else {
    serverDot.className = 'dot dirty';
    serverDot.style.background = '#f59e0b';
    saveStatusText.textContent = '静态模式 (建议双击运行 启动管理后台.bat)';
  }
}

function markDirty(dirty = true) {
  isDirty = dirty;
  updateServerIndicator();
}

// 加载作品集主配置与海报预览索引
async function loadPortfolioData() {
  try {
    const [dataRes, prevRes] = await Promise.all([
      fetch('data/portfolio-data.json?t=' + Date.now()),
      fetch('data/media-previews.json?t=' + Date.now()).catch(() => null)
    ]);
    if (!dataRes.ok) throw new Error('无法读取 data/portfolio-data.json');
    portfolioData = await dataRes.json();
    if (prevRes && prevRes.ok) {
      mediaPreviews = await prevRes.json();
    } else {
      mediaPreviews = {};
    }

    initCategoryChips();
    renderStatistics();
    renderAssetsView();
    renderChaptersView();
    initProfileView();
    initSettingsView();
    markDirty(false);
  } catch (err) {
    console.error(err);
    showToast('加载作品配置失败: ' + err.message, 'error');
  }
}

// 统计卡片渲染
function renderStatistics() {
  if (!portfolioData || !portfolioData.items) return;
  const items = portfolioData.items;

  document.getElementById('stat-total').textContent = items.length;
  document.getElementById('stat-visible').textContent = items.filter(i => i.visible).length;
  const vidEl = document.getElementById('stat-videos');
  if (vidEl) vidEl.textContent = items.filter(i => i.mediaType === 'video').length;
  document.getElementById('stat-hidden').textContent = items.filter(i => !i.visible).length;
}

// 分类筛选标签初始化
function initCategoryChips() {
  if (!portfolioData || !portfolioData.categories) return;
  catChipsRoot.innerHTML = '';

  const totalCount = portfolioData.items.length;
  createChip('all', '全部素材', totalCount, state.category === 'all');

  portfolioData.categories.forEach(cat => {
    const count = portfolioData.items.filter(i => i.category === cat.id).length;
    createChip(cat.id, cat.name, count, state.category === cat.id);
  });
}

function createChip(id, name, count, isActive) {
  const btn = document.createElement('button');
  btn.className = `chip-btn ${isActive ? 'active' : ''}`;
  btn.innerHTML = `${name} <span class="chip-count">(${count})</span>`;
  btn.onclick = () => {
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.category = id;
    state.page = 1;
    renderAssetsView();
  };
  catChipsRoot.appendChild(btn);
}

// 过滤计算
function getFilteredItems() {
  if (!portfolioData || !portfolioData.items) return [];

  return portfolioData.items.filter(item => {
    // 分类筛选
    if (state.category !== 'all' && item.category !== state.category) return false;

    // 状态筛选
    if (state.status === 'visible' && !item.visible) return false;
    if (state.status === 'hidden' && item.visible) return false;
    if (state.status === 'featured' && !item.featured) return false;

    // 格式筛选
    if (state.mediaType !== 'all') {
      if (state.mediaType === 'image' && item.mediaType !== 'image') return false;
      if (state.mediaType === 'video' && item.mediaType !== 'video') return false;
      if (state.mediaType === 'gif' && item.mediaType !== 'gif') return false;
    }

    // 关键词搜索
    if (state.keyword.trim()) {
      const kw = state.keyword.trim().toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(kw);
      const matchFile = (item.fileName || '').toLowerCase().includes(kw);
      const matchCategory = (item.categoryName || '').toLowerCase().includes(kw);
      const matchTags = (item.tags || []).some(t => t.toLowerCase().includes(kw));
      if (!matchTitle && !matchFile && !matchCategory && !matchTags) return false;
    }

    return true;
  });
}

// 渲染作品卡片列表
function renderAssetsView() {
  const filtered = getFilteredItems();
  const total = filtered.length;
  const startIdx = (state.page - 1) * state.pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + state.pageSize);

  assetsGridRoot.innerHTML = '';

  if (pageItems.length === 0) {
    assetsGridRoot.innerHTML = `
      <div style="grid-column: 1/-1; padding: 60px 0; text-align: center; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">未找到匹配的作品素材</p>
        <p style="font-size: 0.85rem;">请尝试调整上方筛选分类或清空搜索关键词</p>
      </div>
    `;
    paginationRoot.innerHTML = '';
    return;
  }

  pageItems.forEach(item => {
    const card = createAssetCard(item);
    assetsGridRoot.appendChild(card);
  });

  renderPagination(total);
}

// 创建单个卡片 DOM
function createAssetCard(item) {
  const card = document.createElement('div');
  card.className = `asset-card ${!item.visible ? 'hidden-item' : ''}`;
  card.id = `card-${item.id}`;

  const isVideo = item.mediaType === 'video';
  const isGif = item.mediaType === 'gif';
  const preview = mediaPreviews[item.src];
  const thumbSrc = preview && preview.variants && preview.variants.length > 0
    ? preview.variants[0].src
    : item.src;
  const durationText = preview && preview.duration ? `${Math.round(preview.duration)}s` : '';

  // 计算本分类内的当前次序
  const categoryItems = portfolioData.items.filter(it => it.category === item.category);
  const rank = categoryItems.findIndex(it => it.id === item.id) + 1;

  card.innerHTML = `
    <div class="card-thumb-wrap" onclick="openMediaPreview('${item.id}')" title="点击放大预览/播放视频">
      <img class="card-thumb" src="${thumbSrc}" alt="${escapeHtml(item.title || '')}" loading="lazy">
      ${isVideo ? `<div class="badge-video">▶ 视频${durationText ? ` · ${durationText}` : ''}</div>` : ''}
      ${isGif ? `<div class="badge-video" style="background:#8b5cf6;">GIF</div>` : ''}
    </div>

    <div class="card-body">
      <div class="card-meta-line">
        <span class="card-category-tag">${escapeHtml(item.categoryName || item.category)}</span>
        <span class="card-order-badge">本章第 ${rank} 位</span>
        <span class="card-index">${escapeHtml(item.fileName)}</span>
      </div>

      <input type="text" class="card-title-input" value="${escapeHtml(item.title || '')}" placeholder="输入作品标题...">
      <input type="text" class="card-desc-input" value="${escapeHtml(item.description || '')}" placeholder="输入作品说明 (前台灯箱展示)...">

      <div class="card-footer-controls">
        <label class="toggle-wrap" title="切换是否在前台该章节画廊中展示">
          <input type="checkbox" ${item.visible ? 'checked' : ''} class="item-visible-toggle">
          <span class="toggle-switch"></span>
          <span class="toggle-label">${item.visible ? '公开中' : '已隐藏'}</span>
        </label>

        <div class="card-order-controls">
          <button type="button" class="order-btn" title="置顶到该章节最前" onclick="moveItem('${item.id}', 'top')">🔝 置顶</button>
          <button type="button" class="order-btn" title="向前移一位" onclick="moveItem('${item.id}', 'up')">◀</button>
          <button type="button" class="order-btn" title="向后移一位" onclick="moveItem('${item.id}', 'down')">▶</button>
        </div>
      </div>
    </div>
  `;

  // 绑定即时同步事件
  const titleInput = card.querySelector('.card-title-input');
  titleInput.addEventListener('input', () => {
    item.title = titleInput.value.trim();
    markDirty();
  });

  const descInput = card.querySelector('.card-desc-input');
  descInput.addEventListener('input', () => {
    item.description = descInput.value.trim();
    markDirty();
  });

  const toggle = card.querySelector('.item-visible-toggle');
  const toggleLabel = card.querySelector('.toggle-label');
  toggle.addEventListener('change', () => {
    item.visible = toggle.checked;
    toggleLabel.textContent = item.visible ? '公开中' : '已隐藏';
    card.classList.toggle('hidden-item', !item.visible);
    renderStatistics();
    markDirty();
  });

  return card;
}

// 渲染分页
function renderPagination(total) {
  paginationRoot.innerHTML = '';
  const totalPages = Math.ceil(total / state.pageSize);
  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-secondary btn-sm';
  prevBtn.textContent = '◀ 上一页';
  prevBtn.disabled = state.page <= 1;
  prevBtn.onclick = () => {
    state.page--;
    renderAssetsView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  paginationRoot.appendChild(prevBtn);

  const pageInfo = document.createElement('span');
  pageInfo.style.fontSize = '0.85rem';
  pageInfo.style.color = 'var(--text-muted)';
  pageInfo.textContent = `第 ${state.page} / ${totalPages} 页 (共 ${total} 件)`;
  paginationRoot.appendChild(pageInfo);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary btn-sm';
  nextBtn.textContent = '下一页 ▶';
  nextBtn.disabled = state.page >= totalPages;
  nextBtn.onclick = () => {
    state.page++;
    renderAssetsView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  paginationRoot.appendChild(nextBtn);
}

// 绑定筛选事件
function setupFilterEvents() {
  const searchInput = document.getElementById('asset-search');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.keyword = searchInput.value;
      state.page = 1;
      renderAssetsView();
    }, 250);
  });

  const statusSelect = document.getElementById('filter-status');
  statusSelect.addEventListener('change', () => {
    state.status = statusSelect.value;
    state.page = 1;
    renderAssetsView();
  });

  const typeSelect = document.getElementById('filter-type');
  typeSelect.addEventListener('change', () => {
    state.mediaType = typeSelect.value;
    state.page = 1;
    renderAssetsView();
  });

  // 批量操作按钮
  document.getElementById('batch-visible-btn').onclick = () => {
    const items = getFilteredItems();
    items.forEach(it => it.visible = true);
    renderStatistics();
    renderAssetsView();
    markDirty();
    showToast(`已将当前筛选的 ${items.length} 个作品设为公开显示`, 'success');
  };

  document.getElementById('batch-hidden-btn').onclick = () => {
    const items = getFilteredItems();
    items.forEach(it => it.visible = false);
    renderStatistics();
    renderAssetsView();
    markDirty();
    showToast(`已将当前筛选的 ${items.length} 个作品设为隐藏`, 'info');
  };

  document.getElementById('batch-keep20-btn').onclick = () => {
    if (state.category === 'all') {
      showToast('请先选择具体分类（如 CG风格）后再使用此快捷精简功能！', 'error');
      return;
    }
    const catItems = portfolioData.items.filter(it => it.category === state.category);
    catItems.forEach((it, idx) => {
      it.visible = idx < 20;
    });
    renderStatistics();
    renderAssetsView();
    markDirty();
    showToast(`分类【${state.category}】已仅保留前 20 张公开，其余已设为隐藏`, 'success');
  };
}

// 标签页切换
function setupNavigation() {
  document.querySelectorAll('.side-nav-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTabId = btn.dataset.tab;
      const targetEl = document.getElementById(targetTabId);
      if (targetEl) {
        targetEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    };
  });
}

// ================= 排序与预览控制 =================

// 作品分类内次序调整
window.moveItem = function(itemId, direction) {
  const itemIndex = portfolioData.items.findIndex(it => it.id === itemId);
  if (itemIndex === -1) return;
  const item = portfolioData.items[itemIndex];
  const cat = item.category;

  const catIndices = [];
  portfolioData.items.forEach((it, idx) => {
    if (it.category === cat) catIndices.push(idx);
  });

  const posInCat = catIndices.indexOf(itemIndex);
  if (posInCat === -1) return;

  if (direction === 'top') {
    if (posInCat === 0) return;
    portfolioData.items.splice(itemIndex, 1);
    portfolioData.items.splice(catIndices[0], 0, item);
  } else if (direction === 'up') {
    if (posInCat === 0) return;
    const prevIdx = catIndices[posInCat - 1];
    portfolioData.items[itemIndex] = portfolioData.items[prevIdx];
    portfolioData.items[prevIdx] = item;
  } else if (direction === 'down') {
    if (posInCat === catIndices.length - 1) return;
    const nextIdx = catIndices[posInCat + 1];
    portfolioData.items[itemIndex] = portfolioData.items[nextIdx];
    portfolioData.items[nextIdx] = item;
  }

  markDirty();
  renderAssetsView();
  showToast(`已调整【${item.title || item.fileName}】排序`, 'info');
};

// 章节排序调整
window.moveChapter = function(catId, direction) {
  const cats = portfolioData.categories;
  const idx = cats.findIndex(c => c.id === catId);
  if (idx === -1) return;

  if (direction === 'up' && idx > 0) {
    const temp = cats[idx];
    cats[idx] = cats[idx - 1];
    cats[idx - 1] = temp;
  } else if (direction === 'down' && idx < cats.length - 1) {
    const temp = cats[idx];
    cats[idx] = cats[idx + 1];
    cats[idx + 1] = temp;
  } else {
    return;
  }

  cats.forEach((c, i) => { c.order = i + 1; });
  markDirty();
  initCategoryChips();
  renderChaptersView();
  showToast('章节呈现顺序已更新！前台目录将按此顺序显示。', 'success');
};

// 渲染章节列表管理
function renderChaptersView() {
  const root = document.getElementById('chapters-list-root');
  if (!root || !portfolioData || !portfolioData.categories) return;
  root.innerHTML = '';

  const cats = portfolioData.categories;
  cats.forEach((cat, idx) => {
    const totalCount = portfolioData.items.filter(it => it.category === cat.id).length;
    const visibleCount = portfolioData.items.filter(it => it.category === cat.id && it.visible).length;

    const item = document.createElement('div');
    item.className = 'chapter-manage-item';
    item.innerHTML = `
      <div class="chapter-meta">
        <span class="chapter-num-badge">第 0${idx + 1} 章</span>
        <div style="flex:1; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">章节中文名称</label>
            <input type="text" class="form-control cat-name-input" value="${escapeHtml(cat.name || '')}">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">英文副标题</label>
            <input type="text" class="form-control cat-en-input" value="${escapeHtml(cat.en || '')}">
          </div>
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted); text-align:right; min-width:90px;">
          <div>公开: <b style="color:var(--accent-green);">${visibleCount}</b> / ${totalCount}</div>
          <div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">ID: ${escapeHtml(cat.id)}</div>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <button type="button" class="order-btn" title="上移此章节" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} onclick="moveChapter('${cat.id}', 'up')">⬆️ 上移</button>
        <button type="button" class="order-btn" title="下移此章节" ${idx === cats.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} onclick="moveChapter('${cat.id}', 'down')">⬇️ 下移</button>
      </div>
    `;

    const nameInput = item.querySelector('.cat-name-input');
    nameInput.addEventListener('input', () => {
      cat.name = nameInput.value.trim();
      initCategoryChips();
      markDirty();
    });

    const enInput = item.querySelector('.cat-en-input');
    enInput.addEventListener('input', () => {
      cat.en = enInput.value.trim();
      markDirty();
    });

    root.appendChild(item);
  });
}

// 灯箱媒体预览
window.openMediaPreview = function(itemId) {
  const item = portfolioData.items.find(it => it.id === itemId);
  if (!item) return;

  const modal = document.getElementById('admin-preview-modal');
  const stage = document.getElementById('admin-preview-stage');
  const title = document.getElementById('admin-preview-title');
  const cat = document.getElementById('admin-preview-category');
  const desc = document.getElementById('admin-preview-desc');

  title.textContent = item.title || item.fileName;
  cat.textContent = `${item.categoryName || item.category} · #${item.fileIndex}`;
  desc.textContent = item.description || (item.tags || []).join(' / ') || '';

  stage.innerHTML = '';
  if (item.mediaType === 'video') {
    const video = document.createElement('video');
    video.src = item.src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '75vh';
    stage.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.title || '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '75vh';
    img.style.objectFit = 'contain';
    stage.appendChild(img);
  }

  modal.classList.add('active');
};

window.closePreviewModal = function(e) {
  if (e && e.target && e.target.closest && e.target.closest('.preview-modal-box') && !e.target.classList.contains('modal-close')) {
    return;
  }
  const modal = document.getElementById('admin-preview-modal');
  if (modal) {
    const stage = document.getElementById('admin-preview-stage');
    if (stage) stage.innerHTML = '';
    modal.classList.remove('active');
  }
};

// 个人资料与简历编辑初始化
function initProfileView() {
  if (!portfolioData || !portfolioData.profile) return;
  const p = portfolioData.profile;

  document.getElementById('prof-name').value = p.name || '';
  document.getElementById('prof-title').value = p.title || '';
  document.getElementById('prof-email').value = p.email || '';
  document.getElementById('prof-phone').value = p.phone || '';
  document.getElementById('prof-wechat').value = p.wechat || '';
  document.getElementById('prof-location').value = p.location || '';
  document.getElementById('prof-bio').value = p.bio || '';
  document.getElementById('prof-skills').value = (p.skills || []).join(', ');

  // 监听输入修改
  ['prof-name', 'prof-title', 'prof-email', 'prof-phone', 'prof-wechat', 'prof-location', 'prof-bio', 'prof-skills'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      syncProfileFromInputs();
      markDirty();
    });
  });

  renderExperiences();
}

function syncProfileFromInputs() {
  portfolioData.profile.name = document.getElementById('prof-name').value.trim();
  portfolioData.profile.title = document.getElementById('prof-title').value.trim();
  portfolioData.profile.email = document.getElementById('prof-email').value.trim();
  portfolioData.profile.phone = document.getElementById('prof-phone').value.trim();
  portfolioData.profile.wechat = document.getElementById('prof-wechat').value.trim();
  portfolioData.profile.location = document.getElementById('prof-location').value.trim();
  portfolioData.profile.bio = document.getElementById('prof-bio').value.trim();
  portfolioData.profile.skills = document.getElementById('prof-skills').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

// 渲染工作经历编辑列表
function renderExperiences() {
  const root = document.getElementById('experiences-editor-root');
  root.innerHTML = '';
  const exps = portfolioData.profile.experiences || [];

  exps.forEach((exp, idx) => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg-tertiary)';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = 'var(--radius-sm)';
    card.style.padding = '14px';
    card.style.marginBottom = '12px';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-weight:700; color:#fff;">经历 #${idx + 1}</span>
        <button class="btn btn-secondary btn-sm" style="color:var(--accent-red);" onclick="deleteExperience(${idx})">删除</button>
      </div>
      <div style="display:grid; grid-template-columns: 1.2fr 1fr 1.2fr 0.8fr; gap:10px; margin-bottom:10px;">
        <input type="text" class="form-control exp-comp" value="${escapeHtml(exp.company || '')}" placeholder="公司名称">
        <input type="text" class="form-control exp-role" value="${escapeHtml(exp.role || '')}" placeholder="职位角色">
        <input type="text" class="form-control exp-period" value="${escapeHtml(exp.period || '')}" placeholder="时间区间 (如 2024.6 - 2024.12)">
        <input type="text" class="form-control exp-loc" value="${escapeHtml(exp.location || '')}" placeholder="城市 (如 北京)">
      </div>
      <textarea class="form-control exp-desc" placeholder="工作内容详情说明...">${escapeHtml(exp.description || '')}</textarea>
    `;

    card.querySelector('.exp-comp').addEventListener('change', e => { exp.company = e.target.value.trim(); markDirty(); });
    card.querySelector('.exp-role').addEventListener('change', e => { exp.role = e.target.value.trim(); markDirty(); });
    card.querySelector('.exp-period').addEventListener('change', e => { exp.period = e.target.value.trim(); markDirty(); });
    card.querySelector('.exp-loc').addEventListener('change', e => { exp.location = e.target.value.trim(); markDirty(); });
    card.querySelector('.exp-desc').addEventListener('change', e => { exp.description = e.target.value.trim(); markDirty(); });

    root.appendChild(card);
  });
}

window.deleteExperience = function(idx) {
  portfolioData.profile.experiences.splice(idx, 1);
  renderExperiences();
  markDirty();
};

document.getElementById('btn-add-experience').onclick = () => {
  portfolioData.profile.experiences = portfolioData.profile.experiences || [];
  portfolioData.profile.experiences.push({
    company: '新公司名称',
    role: '职位名称',
    period: '2026 - 至今',
    location: '北京',
    description: '负责相关设计工作...'
  });
  renderExperiences();
  markDirty();
};

// 全局站点设置初始化
function initSettingsView() {
  if (!portfolioData || !portfolioData.siteInfo) return;
  const s = portfolioData.siteInfo;

  document.getElementById('site-title').value = s.title || '';
  document.getElementById('site-brand').value = s.brandName || '';
  document.getElementById('site-hero-prefix').value = s.heroTitlePrefix || '';
  document.getElementById('site-hero-suffix').value = s.heroTitleSuffix || '';
  document.getElementById('site-hero-sub').value = s.heroSubtitle || '';
  document.getElementById('site-footer').value = s.footerCopyright || '';

  ['site-title', 'site-brand', 'site-hero-prefix', 'site-hero-suffix', 'site-hero-sub', 'site-footer'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      syncSettingsFromInputs();
      markDirty();
    });
  });
}

function syncSettingsFromInputs() {
  portfolioData.siteInfo.title = document.getElementById('site-title').value.trim();
  portfolioData.siteInfo.brandName = document.getElementById('site-brand').value.trim();
  portfolioData.siteInfo.heroTitlePrefix = document.getElementById('site-hero-prefix').value.trim();
  portfolioData.siteInfo.heroTitleSuffix = document.getElementById('site-hero-suffix').value.trim();
  portfolioData.siteInfo.heroSubtitle = document.getElementById('site-hero-sub').value.trim();
  portfolioData.siteInfo.footerCopyright = document.getElementById('site-footer').value.trim();
}

// 按钮动作绑定
function setupActionButtons() {
  // 保存所有修改
  document.getElementById('btn-save-all').onclick = saveAllChanges;

  // 重新扫描素材
  document.getElementById('btn-rescan').onclick = async () => {
    if (!confirm('重新扫描将检测本地 images/ 目录是否有新增图片/视频。是否继续？')) return;
    showToast('正在重新扫描本地素材...', 'info');
    try {
      const res = await fetch('/api/rescan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await loadPortfolioData();
      } else {
        showToast('扫描失败: ' + data.message, 'error');
      }
    } catch (e) {
      showToast('本地服务未响应，请确保 scripts/server.js 正在运行', 'error');
    }
  };

  // 触发生成/更新预览海报 (调用 build-previews.py)
  const buildBtn = document.getElementById('btn-build-previews');
  if (buildBtn) {
    buildBtn.onclick = async () => {
      showToast('正在分析资产并生成 WebP 缩略图与视频海报...', 'info');
      try {
        const res = await fetch('/api/build-previews', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          await loadPortfolioData();
        } else {
          showToast('生成预览失败: ' + data.message, 'error');
        }
      } catch (e) {
        showToast('本地服务未响应，请确保 scripts/server.js 正在运行', 'error');
      }
    };
  }

  // 弹窗控制
  document.getElementById('btn-export-modal').onclick = () => {
    syncProfileFromInputs();
    syncSettingsFromInputs();
    document.getElementById('json-textarea').value = JSON.stringify(portfolioData, null, 2);
    document.getElementById('export-modal').classList.add('active');
  };

  document.getElementById('btn-github-modal').onclick = async () => {
    if (isServerOnline) {
      if (!confirm('确定要将本地已保存的全部配置、海报与文件改动一键推送到 GitHub 远程仓库吗？\n\n推送后 GitHub Pages 将自动部署上线（约 1-2 分钟生效）。')) return;
      showToast('🚀 正在向 GitHub 推送更新中，请稍候...', 'info');
      try {
        const res = await fetch('/api/git-push', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          alert('🎉 恭喜！已成功发布到 GitHub！\n\n线上网站地址：' + (data.siteUrl || 'https://zhangbling1.github.io') + '\n\nGitHub Pages 通常需要 1-2 分钟构建生效，稍后刷新页面即可查看最新效果。');
        } else {
          showToast('推送失败: ' + data.message, 'error');
          alert('Git 推送遇到问题：\n' + data.message);
        }
      } catch (e) {
        showToast('请求本地服务出错: ' + e.message, 'error');
      }
    } else {
      const savedToken = localStorage.getItem('gh_portfolio_token') || '';
      if (savedToken) document.getElementById('gh-token').value = savedToken;
      document.getElementById('github-modal').classList.add('active');
    }
  };

  document.getElementById('btn-copy-json').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(portfolioData, null, 2))
      .then(() => showToast('已将配置 JSON 复制到剪贴板！', 'success'));
  };

  document.getElementById('btn-download-json').onclick = () => {
    const blob = new Blob([JSON.stringify(portfolioData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio-data.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('已开始下载 portfolio-data.json', 'success');
  };

  document.getElementById('btn-import-json').onclick = () => {
    try {
      const raw = document.getElementById('json-textarea').value.trim();
      const parsed = JSON.parse(raw);
      if (!parsed.items) throw new Error('JSON 格式缺少 items 字段');
      portfolioData = parsed;
      closeModals();
      initCategoryChips();
      renderStatistics();
      renderAssetsView();
      initProfileView();
      initSettingsView();
      markDirty();
      showToast('配置导入成功，请点击【保存修改配置】以生效！', 'success');
    } catch (e) {
      showToast('JSON 格式不合法: ' + e.message, 'error');
    }
  };

  // GitHub 一键推送
  document.getElementById('btn-gh-push').onclick = pushToGitHub;
}

// 保存所有修改到本地
async function saveAllChanges() {
  syncProfileFromInputs();
  syncSettingsFromInputs();

  showToast('正在保存配置...', 'info');

  if (isServerOnline) {
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portfolioData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        markDirty(false);
      } else {
        showToast('保存失败: ' + data.message, 'error');
      }
    } catch (err) {
      showToast('请求本地服务出错: ' + err.message, 'error');
    }
  } else {
    // 静态离线环境降级处理
    const blob = new Blob([JSON.stringify(portfolioData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio-data.json';
    a.click();
    URL.revokeObjectURL(url);

    showToast('未检测到本地 Node 服务，已为您自动下载最新的 portfolio-data.json。替换至 data/ 目录即可！', 'info');
    markDirty(false);
  }
}

// GitHub API 一键直连发布
async function pushToGitHub() {
  const token = document.getElementById('gh-token').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const commitMsg = document.getElementById('gh-commit-msg').value.trim() || 'Update portfolio config';

  if (!token) {
    showToast('请输入 GitHub Token！', 'error');
    return;
  }

  localStorage.setItem('gh_portfolio_token', token);
  showToast('正在通过 GitHub API 获取当前文件版本...', 'info');

  try {
    const filePath = 'data/portfolio-data.json';
    const getUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

    let sha = null;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (getRes.ok) {
      const fileMeta = await getRes.json();
      sha = fileMeta.sha;
    }

    showToast('正在向 GitHub 提交更新...', 'info');

    // 格式化 Base64
    syncProfileFromInputs();
    syncSettingsFromInputs();
    const jsonStr = JSON.stringify(portfolioData, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

    const putRes = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMsg,
        content: contentBase64,
        sha: sha || undefined
      })
    });

    if (putRes.ok) {
      showToast('🎉 成功发布到 GitHub！GitHub Pages 将在 1-2 分钟内自动部署更新。', 'success');
      markDirty(false);
      closeModals();
    } else {
      const errData = await putRes.json();
      showToast('GitHub 提交失败: ' + (errData.message || '权限或配置错误'), 'error');
    }
  } catch (err) {
    showToast('GitHub API 请求出错: ' + err.message, 'error');
  }
}

// 辅助方法
window.closeModals = function() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
};

function previewMedia(src, isVideo) {
  // 简易灯箱预览
  window.open(src, '_blank');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> <span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
