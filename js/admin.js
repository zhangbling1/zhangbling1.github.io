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
  document.getElementById('stat-featured').textContent = items.filter(i => i.featured).length;
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
  card.className = `asset-card ${!item.visible ? 'hidden-item' : ''} ${item.featured ? 'featured-item' : ''}`;
  card.id = `card-${item.id}`;

  const isVideo = item.mediaType === 'video';
  const isGif = item.mediaType === 'gif';
  const preview = mediaPreviews[item.src];
  const thumbSrc = preview && preview.variants && preview.variants.length > 0
    ? preview.variants[0].src
    : item.src;
  const durationText = preview && preview.duration ? `${Math.round(preview.duration)}s` : '';

  card.innerHTML = `
    <div class="card-thumb-wrap" onclick="previewMedia('${item.src}', ${isVideo})" title="点击查看原图/播放视频">
      <img class="card-thumb" src="${thumbSrc}" alt="${escapeHtml(item.title || '')}" loading="lazy">
      ${isVideo ? `<div class="badge-video">▶ 视频${durationText ? ` · ${durationText}` : ''}</div>` : ''}
      ${isGif ? `<div class="badge-video" style="background:#8b5cf6;">GIF</div>` : ''}
      ${item.featured ? `<div class="badge-featured">⭐ 精选</div>` : ''}
    </div>

    <div class="card-body">
      <div class="card-meta-line">
        <span class="card-category-tag">${item.categoryName}</span>
        <span class="card-index">#${item.fileIndex} · ${item.fileName}</span>
      </div>

      <input type="text" class="card-title-input" value="${escapeHtml(item.title || '')}" placeholder="输入作品标题...">

      <input type="text" class="card-tags-input" value="${escapeHtml((item.tags || []).join(', '))}" placeholder="标签 (用逗号分隔)...">

      <div class="card-footer-controls">
        <label class="toggle-wrap">
          <input type="checkbox" ${item.visible ? 'checked' : ''} class="item-visible-toggle">
          <span class="toggle-switch"></span>
          <span class="toggle-label">${item.visible ? '公开中' : '已隐藏'}</span>
        </label>

        <button class="btn-star ${item.featured ? 'active' : ''}" title="${item.featured ? '取消精选' : '设为精选'}">
          ${item.featured ? '★' : '☆'}
        </button>
      </div>
    </div>
  `;

  // 绑定交互事件
  const titleInput = card.querySelector('.card-title-input');
  titleInput.addEventListener('change', () => {
    item.title = titleInput.value.trim() || `${item.categoryName} #${item.fileIndex}`;
    markDirty();
  });

  const tagsInput = card.querySelector('.card-tags-input');
  tagsInput.addEventListener('change', () => {
    item.tags = tagsInput.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
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

  const starBtn = card.querySelector('.btn-star');
  starBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    item.featured = !item.featured;
    starBtn.classList.toggle('active', item.featured);
    starBtn.textContent = item.featured ? '★' : '☆';
    card.classList.toggle('featured-item', item.featured);
    
    // 更新或增删 badge
    const existingBadge = card.querySelector('.badge-featured');
    if (item.featured && !existingBadge) {
      const b = document.createElement('div');
      b.className = 'badge-featured';
      b.textContent = '⭐ 精选';
      card.querySelector('.card-thumb-wrap').appendChild(b);
    } else if (!item.featured && existingBadge) {
      existingBadge.remove();
    }

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
      document.getElementById(targetTabId).classList.add('active');
    };
  });
}

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

  document.getElementById('btn-github-modal').onclick = () => {
    const savedToken = localStorage.getItem('gh_portfolio_token') || '';
    if (savedToken) document.getElementById('gh-token').value = savedToken;
    document.getElementById('github-modal').classList.add('active');
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
