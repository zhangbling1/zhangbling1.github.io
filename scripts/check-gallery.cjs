/* Run the actual gallery layout and pagination code against small DOM stubs.
   Regression cases cover the 97-work chapter and small landscape originals. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const helper = name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `Missing application function ${name}`);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('\n  }') + 4);
};
const css = { '--gap': 16, '--row-gap': 26, '--caption': 34, '--per-row': 3.3,
  '--per-row-small': 5, '--min-h': 180, '--max-h': 520, '--min-w': 150 };
const scope = {
  chapterBatchSize: Number(source.match(/const chapterBatchSize = (\d+)/)[1]),
  narrowScreen: { matches: false }, downIcon: '', badge: () => ({}),
  getComputedStyle: () => ({ getPropertyValue: key => css[key] }),
  document: { createTextNode: text => text }, updateRunningHead() {},
  window: { devicePixelRatio: 1, scrollY: 1200,
    scrollTo({ top }) { this.scrollY = top; }, scrollBy({ top }) { this.scrollY += top; } }
};
vm.createContext(scope);
vm.runInContext(['plateHeightLimit', 'justify', 'layoutChapter', 'expandChapter', 'collapseChapter'].map(helper).join('\n'), scope);
const control = () => ({ hidden: false, textContent: '', attributes: {},
  setAttribute(key, value) { this.attributes[key] = value; },
  replaceChildren(text) { this.textContent = text; }, insertAdjacentHTML() {}, focus() { scope.focused = this; } });
function makeChapter(count) {
  const chapter = { limit: 0, medianRatio: 16 / 9, small: false,
    box: { clientWidth: 1328, style: {} }, more: control(), collapse: control(), progress: control() };
  chapter.foot = { getBoundingClientRect: () => ({ top: parseFloat(chapter.box.style.height || 0) - scope.window.scrollY }) };
  chapter.plates = Array.from({ length: count }, () => {
    const button = control();
    return { known: true, width: 640, height: 360, ratio: 16 / 9, small: false, crop: '',
      figure: { hidden: false, style: {}, dataset: {}, querySelector: () => button },
      media: { style: {}, querySelector: () => null, append() {} } };
  });
  return chapter;
}
let checks = 0;
function check(name, fn) { fn(); console.log(`PASS ${name}`); checks++; }
const shown = chapter => chapter.plates.filter(plate => !plate.figure.hidden).length;
function assertFullRows(chapter) {
  const rows = new Map();
  for (const plate of chapter.plates.filter(plate => !plate.figure.hidden)) {
    const [, x, y] = plate.figure.style.transform.match(/translate\(([^,]+)px,([^,]+)px\)/);
    rows.set(Number(y), Number(x) + parseFloat(plate.figure.style.width));
  }
  const rightEdges = [...rows.values()];
  rightEdges.forEach((right, index) => {
    if (shown(chapter) === chapter.plates.length && index === rightEdges.length - 1) return;
    assert.ok(Math.abs(right - chapter.box.clientWidth) < .001,
      `Row ${index + 1} ends at ${right.toFixed(1)}px instead of ${chapter.box.clientWidth}px while more works remain`);
  });
}

check('Preview and intermediate batches fill every row before offering more works', () => {
  const chapter = makeChapter(97);
  scope.layoutChapter(chapter);
  assertFullRows(chapter);
  while (!chapter.more.hidden) {
    const before = shown(chapter);
    scope.expandChapter(chapter);
    assert.ok(shown(chapter) > before);
    assertFullRows(chapter);
  }
});

check('97 works fill complete rows around each 30-work boundary, then collapse and reopen', () => {
  const chapter = makeChapter(97);
  scope.layoutChapter(chapter);
  assert.equal(shown(chapter), 12);
  assert.equal(chapter.more.textContent, '展开至 32 幅');
  for (const count of [32, 60, 92, 97]) {
    const firstNew = shown(chapter);
    const buttonCount = Number(chapter.more.textContent.match(/\d+/)[0]);
    assert.equal(chapter.limit ? buttonCount + firstNew : buttonCount, count);
    const before = scope.window.scrollY;
    scope.expandChapter(chapter);
    assert.equal(shown(chapter), count);
    assert.equal(scope.window.scrollY, before);
    assert.equal(scope.focused, chapter.plates[firstNew].figure.querySelector('button'));
    assert.equal(chapter.more.hidden, count === 97);
    assert.equal(chapter.collapse.hidden, false);
  }
  assert.equal(chapter.progress.textContent, '已展示 97 / 97 幅 · 已全部展示');
  const before = chapter.foot.getBoundingClientRect().top;
  scope.collapseChapter(chapter);
  assert.equal(shown(chapter), 12);
  assert.equal(chapter.foot.getBoundingClientRect().top, before);
  assert.equal(chapter.more.hidden, false);
  assert.equal(chapter.collapse.hidden, true);
  scope.expandChapter(chapter);
  assert.equal(shown(chapter), 32);
});

check('Small chapters and partial final batches stop at their real totals', () => {
  for (const total of [1, 6, 10, 11, 29, 30, 31, 60, 61]) {
    const chapter = makeChapter(total);
    scope.layoutChapter(chapter);
    assert.ok(shown(chapter) >= Math.min(10, total));
    assertFullRows(chapter);
    let turns = 0;
    while (!chapter.more.hidden) {
      scope.expandChapter(chapter);
      assertFullRows(chapter);
      assert.ok(++turns <= Math.ceil(total / 30));
    }
    assert.equal(shown(chapter), total);
  }
});

check('Mobile and desktop keep expanded content through a complete row after resizing', () => {
  const chapter = makeChapter(97);
  scope.narrowScreen.matches = true;
  chapter.box.clientWidth = 350;
  scope.layoutChapter(chapter);
  assert.equal(shown(chapter), 6);
  scope.expandChapter(chapter);
  assert.equal(shown(chapter), 30);
  assertFullRows(chapter);
  scope.narrowScreen.matches = false;
  chapter.box.clientWidth = 1328;
  scope.layoutChapter(chapter);
  assert.equal(shown(chapter), 32);
  assertFullRows(chapter);
});

check('Only the true final row may keep a natural width instead of filling the page', () => {
  const chapter = makeChapter(97);
  chapter.limit = 97;
  scope.layoutChapter(chapter);
  assert.equal(shown(chapter), 97);
  assertFullRows(chapter);
  const last = chapter.plates.at(-1);
  assert.ok(parseFloat(last.figure.style.width) < chapter.box.clientWidth / 2);
  assert.equal(chapter.more.hidden, true);
});

check('The 1024 × 451 sword image cannot stretch across a desktop row', () => {
  const plate = { known: true, width: 1024, height: 451, ratio: 1024 / 451, small: false };
  const limit = scope.plateHeightLimit(plate, plate.ratio, 1080, 1);
  const [row] = scope.justify([plate.ratio], 1080, 16, 480, [limit]);
  assert.ok(row.ragged);
  assert.ok(row.height * plate.ratio <= 640);
});

check('640px landscapes and 256px icons retain enough pixels for their display size', () => {
  for (const [width, height, small, density] of [[640, 360, false, 1], [640, 360, false, 2], [256, 256, true, 2]]) {
    const plate = { known: true, width, height, small, ratio: width / height };
    const limit = scope.plateHeightLimit(plate, plate.ratio, 1440, density);
    assert.ok(limit <= height / Math.max(1.5, density));
    assert.ok(limit * plate.ratio <= (small ? 300 : 640));
  }
  const unknown = { known: false, small: false, ratio: 4 / 3 };
  assert.ok(scope.plateHeightLimit(unknown, unknown.ratio, 1440, 1) * unknown.ratio <= 480);
});

check('Mixed original sizes stay in order, within their limits and inside the row', () => {
  let seed = 17;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const width of [320, 768, 1080, 1440]) {
    for (let trial = 0; trial < 50; trial++) {
      const ratios = Array.from({ length: 1 + Math.floor(random() * 97) }, () => .45 + random() * 1.95);
      const limits = ratios.map(ratio => Math.min(90 + random() * 430, 640 / ratio));
      const rows = scope.justify(ratios, width, 16, 260, limits);
      let next = 0;
      for (const row of rows) {
        assert.equal(row.start, next);
        assert.ok(row.height > 0);
        let used = (row.end - row.start) * 16;
        for (let i = row.start; i <= row.end; i++) {
          assert.ok(row.height <= limits[i] + .0001, `Image ${i} exceeds its resolution limit`);
          used += ratios[i] * row.height;
        }
        assert.ok(used <= width + .0001);
        if (!row.ragged) assert.ok(Math.abs(used - width) < .0001);
        next = row.end + 1;
      }
      assert.equal(next, ratios.length);
    }
  }
});

console.log(`\n${checks} gallery regression checks passed.`);
