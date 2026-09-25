const fs = require('fs');
const path = require('path');
const Order = require('../js/portfolio-order.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// 分类元数据映射
const CATEGORY_MAP = {
  'CG Style':    { id: 'CG Style',    name: 'CG风格',    en: 'CG Style',        order: 1, defaultVisibleCount: 30, featuredIndices: [1, 2, 3, 5, 8] },
  'Character':   { id: 'Character',   name: '角色原画',  en: 'Character',       order: 2, defaultVisibleCount: 30, featuredIndices: [1, 2, 7] },
  'Video':       { id: 'Video',       name: '动态视觉',  en: 'Motion & Video',  order: 3, defaultVisibleCount: 29, featuredIndices: [1, 2, 3] },
  '平面设计':    { id: '平面设计',    name: '平面设计',  en: 'Graphic Design',  order: 4, defaultVisibleCount: 30, featuredIndices: [1, 2, 3] },
  'Cartoon':     { id: 'Cartoon',     name: '欧美卡通',  en: 'Cartoon',         order: 5, defaultVisibleCount: 30, featuredIndices: [1, 5] },
  'Icon Design': { id: 'Icon Design', name: 'Icon设计',  en: 'Icon Design',     order: 6, defaultVisibleCount: 30, featuredIndices: [1, 3] },
  'Other':       { id: 'Other',       name: '其他类型',  en: 'Other',           order: 7, defaultVisibleCount: 30, featuredIndices: [] },
  'webp':        { id: 'webp',        name: '插画图层',  en: 'Layers & Art',    order: 8, defaultVisibleCount: 20, featuredIndices: [1] }
};

// 预设自定义标题
const CUSTOM_TITLES = {
  'CG Style/1.jpg': '黑暗之魂同人',
  'CG Style/1.webp': '黑暗之魂同人',
  'Cartoon/5.webp': '快乐小镇',
  'Other/26.mp4': '动态视觉展示 01',
  'Other/27.mp4': '动态视觉展示 02',
  'Other/28.mp4': '动态视觉展示 03',
  'Other/29.mp4': '动态视觉展示 04',
  'Other/30.mp4': '动态视觉展示 05',
};

// 扫描所有素材
function scanAllAssets(rootDir = ROOT_DIR) {
  const imagesDir = path.join(rootDir, 'images');
  const dirs = fs.readdirSync(imagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const allAssets = [];
  const validExts = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov']);

  for (const dirName of dirs) {
    const catMeta = CATEGORY_MAP[dirName] || {
      id: dirName,
      name: dirName,
      en: dirName,
      order: 99,
      defaultVisibleCount: 20,
      featuredIndices: []
    };

    const dirPath = path.join(imagesDir, dirName);
    const files = fs.readdirSync(dirPath)
      .filter(f => validExts.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    files.forEach((file, idx) => {
      const ext = path.extname(file).toLowerCase();
      const isVideo = ext === '.mp4' || ext === '.mov';
      const isGif = ext === '.gif';
      const relPath = `images/${dirName}/${file}`;
      const numMatch = file.match(/^\d+/);
      const fileIndex = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
      const key = `${dirName}/${file}`;

      const title = CUSTOM_TITLES[key] || `${catMeta.name} #${fileIndex}`;
      const isFeatured = (catMeta.featuredIndices || []).includes(fileIndex);
      const isVisible = idx < (catMeta.defaultVisibleCount || 25);

      allAssets.push({
        id: `${dirName}_${file.replace(/\.[^.]+$/, '')}`.replace(/\s+/g, '_'),
        fileKey: key,
        src: relPath,
        fileName: file,
        category: catMeta.id,
        categoryName: catMeta.name,
        categoryEn: catMeta.en,
        categoryOrder: catMeta.order,
        title: title,
        description: '',
        tags: [catMeta.name, isVideo ? '视频' : (isGif ? '动图' : '视觉设计')],
        mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
        ext: ext,
        fileIndex: fileIndex,
        sortOrder: idx,
        visible: isVisible,
        featured: isFeatured,
        dateAdded: new Date().toISOString().slice(0, 10)
      });
    });
  }

  // 排序：按分类优先级及文件顺序
  allAssets.sort((a, b) => {
    if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    return a.fileIndex - b.fileIndex;
  });

  return allAssets;
}

// 基础配置文件结构
const initialPortfolioConfig = {
  version: '2.0.0',
  siteInfo: {
    title: '张宁 | 个人作品集 Portfolio',
    brandName: '张宁-作品集',
    heroTitlePrefix: 'Design',
    heroTitleSuffix: 'Portfolio.',
    heroSubtitle: '探索数字艺术与视觉表达的无限边界 · 游戏原画 / AI美术 / 视觉设计',
    footerCopyright: `© ${new Date().getFullYear()} Zhang Ning. All rights reserved.`
  },
  profile: {
    name: '张宁',
    title: '平面设计师 / 视觉设计师 / AI美术',
    email: 'tfcthinker@outlook.com',
    phone: '17678020036',
    wechat: '17678020036',
    location: '北京',
    bio: '毕业于内蒙古农业大学视觉传达系。拥有游戏宣传图视觉设计和原画设计经验，同时也涉足动漫行业宣发。掌握 3D 辅助平面设计流程。深度运用 AI 美术工具提升设计效率与创意。',
    videoSoftware: ['AE', 'PR', '达芬奇', '剪映'],
    aiTools: ['Stable Diffusion (ComfyUI/WebUI)', 'Midjourney', 'Nano Banana', 'GPT/Sora Image', '即梦'],
    skills: [
      'Photoshop', 'ComfyUI', 'Stable Diffusion', 'Midjourney',
      'Nano Banana', '平面设计', '游戏原画', '3D辅助设计', '视频剪辑 (AE/PR)'
    ],
    experiences: [
      {
        company: '极客创游',
        role: 'AI美术',
        period: '2025.2 - 2026.1',
        location: '北京',
        description: '负责项目游戏内礼包图设计、部分角色/怪物设定及宣发图绘制。负责礼包图美术风格迭代与优化，设计并优化 ComfyUI 工作流，探索并制作了AI视频转spine的工作流程，利用 AI 工具开发小程序辅助美术生产，提高生产效率。'
      },
      {
        company: '万达游戏',
        role: '视觉设计师',
        period: '2024.6 - 2024.12',
        location: '北京',
        description: '负责东京喰种项目的游戏宣传图设计。'
      },
      {
        company: '明日世界',
        role: '视觉设计师',
        period: '2023.7 - 2024.1',
        location: '北京',
        description: '负责《A3影之刃》、《我叫MT》、《哆啦A梦飞车》、《驯龙高手》等项目的平面设计工作。'
      },
      {
        company: '英雄互娱',
        role: '视觉设计师',
        period: '2021.7 - 2023.5',
        location: '北京',
        description: '任职于英雄游戏组。主要负责平面设计、兼顾一些视频剪辑、动态贴片制作及网页设计。主要参与游戏宣发作用素材的制作。掌握并应用“三渲二”技术，利用 Maya 和 UE 为二维设计渲染高精度素材。结合游戏运营数据分析优化设计产出。'
      },
      {
        company: '爱普优邦',
        role: '视觉设计师',
        period: '2019 - 2021.4',
        location: '北京',
        description: '担任游戏平面设计师，设计游戏商店图、Banner 及落地页的视觉设计与绘制。'
      }
    ]
  },
  categories: Object.values(CATEGORY_MAP).map(c => ({
    id: c.id,
    name: c.name,
    en: c.en,
    order: c.order
  })),
  items: []
};

function mergeAssets(existing, scanned) {
  const data = structuredClone(existing || initialPortfolioConfig);
  const savedByFile = new Map(data.items.map(item => [item.fileKey, item]));
  const oldOrder = new Map(Order.ordered(data).map((item, index) => [item.id, index]));
  const scannedKeys = new Set(scanned.map(item => item.fileKey));
  const stem = item => item.fileKey.replace(/\.[^/.]+$/, '');
  const unused = data.items.filter(item => !scannedKeys.has(item.fileKey));
  const usedIds = new Set();
  const added = [], replaced = [];
  data.items = scanned.map(asset => {
    let saved = savedByFile.get(asset.fileKey);
    if (!saved) {
      // A single same-name replacement (webp -> png) keeps its edits and position.
      const candidates = unused.filter(item => stem(item) === stem(asset) && !usedIds.has(item.id));
      if (candidates.length === 1 && scanned.filter(item => stem(item) === stem(asset)).length === 1) {
        saved = candidates[0]; replaced.push(asset.fileKey);
      }
    }
    let item = saved ? { ...asset, ...saved, src: asset.src, fileKey: asset.fileKey, fileName: asset.fileName,
      ext: asset.ext, mediaType: asset.mediaType } : { ...asset, visible: existing ? false : asset.visible };
    if (!saved) added.push(asset.fileKey);
    const base = item.id;
    let suffix = 1;
    // Reserve old IDs even if a new file with the same stem appears earlier in the scan.
    while (usedIds.has(item.id) || (!saved && data.items.some(old => old.id === item.id))) item.id = `${base}_${suffix++}`;
    usedIds.add(item.id);
    return item;
  });
  for (const asset of scanned) {
    if (!data.categories.some(cat => cat.id === asset.category)) data.categories.push({ id: asset.category,
      name: asset.categoryName, en: asset.categoryEn, order: data.categories.length + 1 });
  }
  const removed = (existing?.items || []).filter(item => !usedIds.has(item.id)).map(item => item.fileKey);
  for (const cat of data.categories) {
    const items = data.items.filter(item => item.category === cat.id).sort((a, b) =>
      (oldOrder.get(a.id) ?? Infinity) - (oldOrder.get(b.id) ?? Infinity) || a.fileIndex - b.fileIndex);
    items.forEach((item, index) => Object.assign(item, { categoryName: cat.name, categoryEn: cat.en, categoryOrder: cat.order, sortOrder: index }));
  }
  data.siteInfo.workOrder = (data.siteInfo.workOrder || []).filter(id => usedIds.has(id));
  Order.validate(data);
  return { data, summary: { added, replaced, removed } };
}

function rescan(rootDir = ROOT_DIR, existing) {
  return mergeAssets(existing, scanAllAssets(rootDir));
}

if (require.main === module) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filename = path.join(DATA_DIR, 'portfolio-data.json');
  // Invalid existing JSON must never be silently replaced by defaults.
  const existing = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
  const scanned = scanAllAssets();
  const result = mergeAssets(existing, scanned);
  if (existing) fs.copyFileSync(filename, `${filename}.bak`);
  fs.writeFileSync(`${filename}.tmp`, JSON.stringify(result.data, null, 2));
  fs.renameSync(`${filename}.tmp`, filename);
  fs.writeFileSync(path.join(DATA_DIR, 'all-assets.json'), JSON.stringify(scanned, null, 2));
  console.log(`[Scan] ${scanned.length} 个素材；新增 ${result.summary.added.length}，替换 ${result.summary.replaced.length}，移除 ${result.summary.removed.length}。原有编辑与排序已保留。`);
}

module.exports = { scanAllAssets, mergeAssets, rescan };
