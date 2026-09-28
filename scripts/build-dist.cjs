// Builds dist/, the package that goes to the hosted site. The originals are far
// larger than the deployment limit allows, so only the two preview tiers ship and
// the page reads full files and videos from the GitHub Pages origin instead.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACT_LIMIT = 50 * 1024 * 1024;
const SHIPPED_TIER = /-(400|640)\.webp$/;
const MEDIA_BASE = 'https://zhangbling1.github.io';
const STATIC_FILES = [
  'index.html', 'css/style.css', 'js/app.js', 'js/intro.js', 'js/portfolio-order.js',
  'assets/favicon.svg', 'assets/fonts/manrope-latin.woff2', 'assets/fonts/manrope-variable.ttf',
  'assets/fonts/OFL-Manrope.txt', 'data/portfolio-data.json'
];

const readJSON = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const MiB = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

function copy(relative) {
  const target = path.join(DIST, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(ROOT, relative), target);
  return fs.statSync(target).size;
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  const data = readJSON('data/portfolio-data.json');
  const previews = readJSON('data/media-previews.json');
  const shown = data.items.filter(item => item.visible);

  let staticBytes = 0;
  for (const relative of STATIC_FILES) staticBytes += copy(relative);

  // Tell the page which origin still carries the files this package leaves out.
  const page = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const marker = '<script src="js/portfolio-order.js';
  if (!page.includes(marker)) throw new Error('index.html 结构已变，找不到注入位置');
  fs.writeFileSync(path.join(DIST, 'index.html'), page.replace(marker,
    `<script>window.__PORTFOLIO_MEDIA_BASE__ = ${JSON.stringify(MEDIA_BASE)};</script>\n  ${marker}`));

  let previewBytes = 0, previewCount = 0, dropped = 0;
  const manifest = {};
  for (const item of shown) {
    const entry = previews[item.src];
    if (!entry) continue;
    const variants = (entry.variants || []).filter(variant => SHIPPED_TIER.test(variant.src));
    dropped += (entry.variants || []).length - variants.length;
    for (const variant of variants) {
      previewBytes += copy(variant.src);
      previewCount += 1;
    }
    manifest[item.src] = { ...entry, variants };
  }
  fs.writeFileSync(path.join(DIST, 'data', 'media-previews.json'), JSON.stringify(manifest));

  const total = directorySize(DIST);
  console.log(`作品 ${shown.length}/${data.items.length} 幅公开，预览 ${previewCount} 张（略过 ${dropped} 张高清档）`);
  console.log(`静态文件 ${MiB(staticBytes)}，预览 ${MiB(previewBytes)}，dist 合计 ${MiB(total)}`);
  console.log(`原文件与视频取自 ${MEDIA_BASE}`);
  if (total > ARTIFACT_LIMIT) throw new Error(`dist 为 ${MiB(total)}，超过部署上限 ${MiB(ARTIFACT_LIMIT)}`);
  return { total };
}

if (require.main === module) build();
module.exports = { build };
