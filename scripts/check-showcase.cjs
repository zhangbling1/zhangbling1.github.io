/* The website chapter: its catalog is validated, and every file it needs ships
   in the hosted package. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scope = { window: {}, document: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/showcase.js'), 'utf8'), scope);
const showcase = scope.window.PortfolioShowcase;
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/showcase.json'), 'utf8'));
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

check('The website becomes its own chapter without image plates', () => {
  const chapter = showcase.chapter(config, 9);
  assert.equal(chapter.id, 'mini-games');
  assert.equal(chapter.number, 9);
  assert.equal(chapter.plates.length, 0);
  assert.equal(chapter.showcase.url, config.url);
  assert.equal(chapter.showcase.stills.length, 2);
});
check('A missing, insecure or nameless catalog leaves the book as it is', () => {
  for (const data of [null, {}, { ...config, url: 'http://example.com/' }, { ...config, url: 'javascript:alert(1)' }, { ...config, name: ' ' }]) {
    assert.equal(showcase.chapter(data, 9), null);
  }
  const outside = showcase.chapter({ ...config, stills: ['https://example.com/a.webp', ...config.stills] }, 9);
  assert.deepEqual([...outside.showcase.stills], config.stills);
});
check('Its stills exist and the hosted package ships every file', () => {
  for (const still of config.stills) assert.ok(fs.existsSync(path.join(root, still)), still);
  const build = fs.readFileSync(path.join(root, 'scripts/build-dist.cjs'), 'utf8');
  for (const file of ['css/showcase.css', 'js/showcase.js', 'data/showcase.json', ...config.stills]) assert.ok(build.includes(`'${file}'`), file);
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(page.includes('js/showcase.js') && page.includes('css/showcase.css'));
});
console.log(`\n${count} website chapter checks passed.`);
