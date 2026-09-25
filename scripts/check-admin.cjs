const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Order = require('../js/portfolio-order.js');
const { mergeAssets, scanAllAssets } = require('./scan-assets.js');
const { createServer } = require('./server.js');
const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-admin-check-'));
const dataFile = path.join(fixture, 'data', 'portfolio-data.json');
const sourceFile = path.join(root, 'data', 'portfolio-data.json');
const original = fs.readFileSync(sourceFile);
const ids = (data, category) => Order.ordered(data, category).map(item => item.id);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

(async () => {
  const source = JSON.parse(original);
  Order.validate(source);
  const data = structuredClone(source);
  const category = data.categories[0].id;
  const start = ids(data, category);
  const other = data.categories[1].id;
  const untouched = ids(data, other);
  check('Legacy opening priority is consumed when moving a work to the last position', () => {
    Order.move(data, category, [start[0]], start.length);
    assert.equal(ids(data, category).at(-1), start[0]);
    assert.equal(ids(data, category)[0], start[1]);
    assert.deepEqual(ids(data, other), untouched);
  });
  check('Cross-page multi-selection keeps relative order, includes hidden works and survives JSON reload', () => {
    const before = ids(data, category);
    const block = [before[70], before[3], before[49]];
    Order.move(data, category, block, 2);
    const reloaded = JSON.parse(JSON.stringify(data));
    assert.deepEqual(ids(reloaded, category).slice(1, 4), [before[3], before[49], before[70]]);
    assert.deepEqual(new Set(ids(reloaded, category)), new Set(before));
    const publicItems = reloaded.items.filter(item => item.category === category && item.visible !== false).sort(Order.compare(reloaded));
    assert.deepEqual(publicItems.map(item => item.id), Order.ordered(reloaded, category).filter(item => item.visible !== false).map(item => item.id));
  });
  check('Invalid import is rejected before it can replace the portfolio', () => {
    assert.throws(() => Order.validate({ items: [] }));
    assert.throws(() => Order.validate({ ...data, items: [...data.items, data.items[0]] }));
    assert.throws(() => Order.move(data, category, [data.items.find(item => item.category === other).id], 1));
  });
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'images', 'Art'), { recursive: true });
  for (const name of ['1.png', '2.webp', '3.webp', 'new.png']) fs.writeFileSync(path.join(fixture, 'images', 'Art', name), 'test asset');
  const initial = { version: 'test', siteInfo: { workOrder: ['art2'] }, profile: { name: 'Test', experiences: [] },
    categories: [{ id: 'Art', name: 'Custom chapter', en: 'Custom English', order: 1 }], items: [
      { id: 'art1', fileKey: 'Art/1.webp', src: 'images/Art/1.webp', category: 'Art', sortOrder: 0, title: '', visible: true, custom: 'preserve' },
      { id: 'art2', fileKey: 'Art/2.webp', src: 'images/Art/2.webp', category: 'Art', sortOrder: 1, title: 'Second', visible: false },
      { id: 'art3', fileKey: 'Art/3.webp', src: 'images/Art/3.webp', category: 'Art', sortOrder: 2, title: 'Third', visible: true },
      { id: 'gone', fileKey: 'Art/gone.png', src: 'images/Art/gone.png', category: 'Art', sortOrder: 3, visible: false }
    ] };
  const merged = mergeAssets(initial, scanAllAssets(fixture));
  check('Rescan preserves edited chapter, empty title, visibility, extra fields and existing order', () => {
    assert.equal(merged.data.categories[0].name, 'Custom chapter');
    assert.deepEqual(ids(merged.data, 'Art').slice(0, 3), ['art2', 'art1', 'art3']);
    const replaced = merged.data.items.find(item => item.id === 'art1');
    assert.equal(replaced.src, 'images/Art/1.png'); assert.equal(replaced.title, ''); assert.equal(replaced.custom, 'preserve');
    assert.equal(merged.data.items.find(item => item.id === 'art2').visible, false);
    assert.equal(merged.data.items.find(item => item.fileKey === 'Art/new.png').visible, false);
    assert.deepEqual(merged.summary.replaced, ['Art/1.png']); assert.deepEqual(merged.summary.removed, ['Art/gone.png']);
    assert.deepEqual(mergeAssets(merged.data, scanAllAssets(fixture)).summary, { added: [], replaced: [], removed: [] });
  });
  fs.writeFileSync(path.join(fixture, 'images', 'Art', '2.png'), 'duplicate stem');
  check('Same stem with multiple file extensions produces unique, stable IDs', () => {
    const first = mergeAssets(merged.data, scanAllAssets(fixture));
    assert.equal(new Set(first.data.items.map(item => item.id)).size, first.data.items.length);
    const second = mergeAssets(first.data, scanAllAssets(fixture));
    assert.deepEqual(ids(second.data, 'Art'), ids(first.data, 'Art'));
    assert.equal(second.data.items.find(item => item.fileKey === 'Art/2.webp').id, 'art2');
  });
  fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2));
  const server = createServer({ rootDir: fixture, assetRoot: root, allowPublish: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (endpoint, body, headers = {}) => fetch(url + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const first = await (await fetch(url + '/api/portfolio')).json();
    assert.deepEqual(first.missing, ['art1', 'gone']);
    first.data.profile.name = 'Saved test';
    Order.move(first.data, 'Art', ['art2'], 3);
    const saved = await post('/api/save', { data: first.data, revision: first.revision });
    assert.equal(saved.status, 200);
    const receipt = await saved.json();
    const reload = await (await fetch(url + '/api/portfolio')).json();
    check('Real HTTP save -> backup -> read from disk retains order and edits', () => {
      assert.equal(reload.data.profile.name, 'Saved test'); assert.equal(reload.revision, receipt.revision);
      assert.deepEqual(ids(reload.data, 'Art'), ['art1', 'art3', 'art2', 'gone']);
      assert.deepEqual(JSON.parse(fs.readFileSync(`${dataFile}.bak`)), initial);
    });
    const conflict = await post('/api/save', { data: initial, revision: first.revision });
    assert.equal(conflict.status, 409);
    const invalid = await post('/api/save', { data: { items: [] }, revision: receipt.revision });
    assert.equal(invalid.status, 400);
    check('Stale and invalid saves cannot overwrite the latest disk file', () => {
      assert.equal(JSON.parse(fs.readFileSync(dataFile)).profile.name, 'Saved test');
    });
    const beforeScan = fs.readFileSync(dataFile, 'utf8');
    const preview = await post('/api/rescan', { revision: receipt.revision, preview: true });
    assert.equal(preview.status, 200);
    assert.equal(fs.readFileSync(dataFile, 'utf8'), beforeScan);
    const scan = await post('/api/rescan', { revision: receipt.revision });
    assert.equal(scan.status, 200);
    const scanned = await scan.json();
    check('Scan preview is read-only; confirmed scan updates disk without resetting order', () => {
      assert.deepEqual(ids(scanned.data, 'Art').slice(0, 3), ['art1', 'art3', 'art2']);
      assert.deepEqual(JSON.parse(fs.readFileSync(dataFile)), scanned.data);
    });
    assert.equal((await post('/api/save', { data: initial, revision: scanned.revision }, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await post('/api/git-push', { revision: scanned.revision })).status, 403);
    assert.equal((await fetch(url + '/data/portfolio-data.json.bak')).status, 403);
    const range = await fetch(url + '/images/Art/1.png', { headers: { Range: 'bytes=0-3' } });
    assert.equal(range.status, 206); assert.equal(await range.text(), 'test');
    for (const file of ['/admin.html', '/js/portfolio-order.js', '/css/admin.css', '/assets/fonts/manrope-latin.woff2']) assert.equal((await fetch(url + file)).status, 200, file);
    check('Editor assets, media seeking and local-only mutation protection work', () => {});
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(fs.readFileSync(sourceFile), original, 'Real portfolio data must not change during verification');
  console.log(`\n${checks} checks passed. Real portfolio data unchanged.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const target = path.resolve(fixture);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('portfolio-admin-check-'));
  fs.rmSync(target, { recursive: true, force: true });
});
