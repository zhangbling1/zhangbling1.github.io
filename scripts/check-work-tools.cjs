/* Catalog and hosted-package regressions. The build uses a disposable folder,
   leaving the user's existing dist/ previews and original tools untouched. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/work-tools.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/work-tools.json'), 'utf8'));
const scope = { window: {} };
vm.runInNewContext(source.replace('window.PortfolioTools = { chapter, contents, render };',
  'window.PortfolioTools = { chapter, contents, render }; window.models = { outputName, planCount, filterRecords, debugRecords };'), scope);
const tools = scope.window.PortfolioTools;
const models = scope.window.models;
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

check('Three distinct tools share a chapter without becoming numbered image plates', () => {
  const chapter = tools.chapter(catalog, 9);
  assert.equal(chapter.id, 'work-tools');
  assert.equal(chapter.number, 9);
  assert.equal(chapter.plates.length, 0);
  assert.deepEqual(Array.from(chapter.tools, item => item.id), ['media-batch', 'capture-studio', 'game-debug']);
  for (const tool of chapter.tools) {
    assert.ok(fs.existsSync(path.join(root, tool.cover)));
    const svg = fs.readFileSync(path.join(root, tool.cover), 'utf8');
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!/(?:href|src)=["'](?:https?:|file:)|Quark Download|\.exe|\.dll/i.test(svg));
  }
});
check('Absent or malformed optional tool catalogs leave the artwork book usable', () => {
  for (const data of [null, {}, { projects: false }, { projects: [null, {}] }]) assert.equal(tools.chapter(data, 9), null);
  const valid = catalog.projects[0];
  const chapter = tools.chapter({ projects: [
    null, valid, valid, { ...catalog.projects[1], visible: false },
    { ...catalog.projects[2], cover: 'https://example.com/private.svg' }
  ] }, 9);
  assert.equal(chapter.tools.length, 1);
  assert.equal(chapter.tools[0].id, valid.id);
});
check('Video names retain language, source/output format and unique sequence numbers', () => {
  assert.equal(models.outputName('en', 'portrait'), 'DEMO_英_ob1_1_1_横竖_ZN_260930.mp4');
  assert.equal(models.outputName('th', 'landscape', 3), 'DEMO_泰_ob1_1_3_横_ZN_260930.mp4');
  assert.equal(models.outputName('vi', 'square', 2), 'DEMO_越_ob1_1_2_横方_ZN_260930.mp4');
});
check('Recording output follows the selected hero, stage and language combinations', () => {
  assert.equal(models.planCount(['a', 'b'], ['en', 'th']), 12);
  assert.equal(models.planCount(['a', 'b', 'c'], ['en', 'th', 'vi']), 27);
  assert.equal(models.planCount(['a'], ['en']), 3);
  assert.equal(models.planCount([], ['en']), 0);
});
check('Debug search covers names, IDs, types and scenery without leaking real tables', () => {
  const records = models.debugRecords.levels;
  assert.equal(models.filterRecords(records, '雪地').length, 2);
  assert.equal(models.filterRecords(records, 'lv-056')[0].name, '雪原前哨');
  assert.equal(models.filterRecords(records, '不存在').length, 0);
  assert.equal(models.filterRecords(records, '  ').length, 6);
});
check('The hosted package ships all three covers, the catalog and the interactive reader', () => {
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
    for (const file of ['css/work-tools.css', 'js/tool-art.js', 'js/work-tools.js', 'data/work-tools.json', ...catalog.projects.map(item => item.cover)]) {
      assert.deepEqual(fs.readFileSync(path.join(destination, file)), fs.readFileSync(path.join(root, file)));
    }
    assert.ok(fs.readFileSync(path.join(destination, 'index.html'), 'utf8').includes('js/work-tools.js'));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
console.log(`\n${count} tool showcase checks passed.`);
