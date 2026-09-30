/* Catalog, demo data and hosted-package regressions for the tools chapter. The
   build uses a disposable folder, leaving the user's existing dist/ untouched. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/work-tools.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/work-tools.json'), 'utf8'));
const exported = source.match(/window\.PortfolioTools = \{.*\};/)?.[0];
assert.ok(exported, 'work-tools.js must publish window.PortfolioTools on one line');
const scope = { window: {}, matchMedia: () => ({ matches: false }) };
vm.runInNewContext(source.replace(exported, `${exported} window.models = { filterRecords, debugRecords, debugExample, captureOrder, media };`), scope);
const tools = scope.window.PortfolioTools;
const models = scope.window.models;
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

check('Three tools share one chapter without becoming numbered image plates', () => {
  const chapter = tools.chapter(catalog, 9);
  assert.equal(chapter.id, 'work-tools');
  assert.equal(chapter.number, 9);
  assert.equal(chapter.plates.length, 0);
  assert.deepEqual(Array.from(chapter.tools, item => item.id), ['media-batch', 'capture-studio', 'game-debug']);
});
check('Absent or malformed tool catalogs leave the artwork book usable', () => {
  for (const data of [null, {}, { projects: false }, { projects: [null, {}] }]) assert.equal(tools.chapter(data, 9), null);
  const [first, second, third] = catalog.projects;
  const chapter = tools.chapter({ projects: [null, first, first, { ...second, visible: false }, { ...third, id: 'unknown' }, { ...third, name: ' ' }] }, 9);
  assert.deepEqual(Array.from(chapter.tools, item => item.id), [first.id]);
});
check('Every tool has its copy and two readouts, with no output counts, row counts or timings', () => {
  for (const project of catalog.projects) {
    for (const field of ['summary', 'problem', 'approach']) assert.ok(project[field]?.trim(), `${project.id} ${field}`);
    assert.equal(project.facts.length, 2, project.id);
    for (const fact of project.facts) assert.ok(fact.value && fact.label, project.id);
  }
  const shown = JSON.stringify(catalog);
  for (const withdrawn of ['200+', '1,674', '0.8']) assert.ok(!shown.includes(withdrawn), withdrawn);
});
check('Debug search covers codes, names, types and places', () => {
  const codes = (table, query) => Array.from(models.filterRecords(models.debugRecords[table], query), record => record.code);
  assert.deepEqual(codes('levels', '雪地'), ['LV-056', 'LV-095']);
  assert.deepEqual(codes('items', '金币'), ['IT-001', 'IT-048']);
  assert.deepEqual(codes('levels', 'lv-056'), ['LV-056']);
  assert.equal(codes('levels', '  ').length, models.debugRecords.levels.length);
  assert.equal(codes('levels', '不存在').length, 0);
});
check('The example search finds the level it then sends', () => {
  const { query, code } = models.debugExample;
  assert.ok(models.filterRecords(models.debugRecords.levels, query).some(record => record.code === code), `${query} → ${code}`);
});
check('Recording takes each hero through every language in turn', () => {
  assert.deepEqual({ ...models.captureOrder(0) }, { hero: 'A', tongue: 'EN' });
  assert.deepEqual({ ...models.captureOrder(5) }, { hero: 'B', tongue: 'TH' });
  assert.deepEqual({ ...models.captureOrder(11) }, { hero: 'C', tongue: 'VI' });
});
check('Stage clips are small, local and have posters', () => {
  for (const clip of Object.values(models.media)) {
    for (const file of [clip.src, clip.poster]) {
      assert.ok(/^assets\/toolkit\/[a-z-]+\.(mp4|webp)$/.test(file), file);
      assert.ok(fs.existsSync(path.join(root, file)), file);
    }
    assert.ok(fs.statSync(path.join(root, clip.src)).size < 1.5 * 1024 * 1024, clip.src);
  }
});
check('The hosted package ships the chapter, its clips and stills', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-tool-check-'));
  const temporaryRoot = path.resolve(temp);
  assert.ok(temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporaryRoot).startsWith('portfolio-tool-check-'));
  const destination = path.join(temporaryRoot, 'dist');
  try {
    const buildSource = fs.readFileSync(path.join(root, 'scripts/build-dist.cjs'), 'utf8');
    const marker = "const DIST = path.join(ROOT, 'dist');";
    assert.ok(buildSource.includes(marker));
    const buildScope = { require, __dirname: path.join(root, 'scripts'), module: { exports: {} }, console, TEST_DIST: destination };
    vm.runInNewContext(buildSource.replace(marker, 'const DIST = TEST_DIST;'), buildScope);
    buildScope.module.exports.build();
    const shipped = ['css/work-tools.css', 'js/work-tools.js', 'data/work-tools.json', 'assets/toolkit/batch-still.webp',
      ...Object.values(models.media).flatMap(clip => [clip.src, clip.poster])];
    for (const file of shipped) assert.deepEqual(fs.readFileSync(path.join(destination, file)), fs.readFileSync(path.join(root, file)));
    const page = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
    assert.ok(page.includes('js/work-tools.js'));
    assert.ok(!page.includes('tool-art'));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
console.log(`\n${count} tool showcase checks passed.`);
