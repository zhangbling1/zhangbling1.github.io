/* The project chapters after the works: the catalog is validated, and every
   file they need ships in the hosted package. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scope = { window: { matchMedia: () => ({ matches: false }) }, document: {}, matchMedia: () => ({ matches: false }) };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/showcase.js'), 'utf8'), scope);
const showcase = scope.window.PortfolioShowcase;
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/showcase.json'), 'utf8'));
const [site, app] = config.projects;
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

check('The mini-game site and 小帐 follow the works as numbered chapters', () => {
  const chapters = showcase.chapters(config, 9);
  assert.deepEqual(Array.from(chapters, chapter => [chapter.number, chapter.id, chapter.category.name]), [[9, 'mini-games', '小游戏demo'], [10, 'xiaozhang', '小帐']]);
  for (const chapter of chapters) assert.equal(chapter.plates.length, 0);
  assert.equal(chapters[1].showcase.films.length, 2);
  assert.equal(chapters[1].showcase.screens.length, 4);
});
check('A missing, insecure, nameless or duplicate project leaves the book as it is', () => {
  for (const data of [null, {}, { projects: false }, { projects: [null, {}] }]) assert.equal(showcase.chapters(data, 9).length, 0);
  const bad = [{ ...site, url: 'http://example.com/' }, { ...site, url: 'javascript:alert(1)' }, { ...site, name: ' ' }, { ...site, id: '../x' },
    { ...app, screens: [], films: [{ src: 'https://example.com/a.mp4', poster: app.films[0].poster }] }, { ...app, films: [], screens: [{ src: 'https://example.com/a.webp' }] }, { ...site, kind: 'other' }];
  assert.equal(showcase.chapters({ projects: bad }, 9).length, 0);
  assert.equal(showcase.chapters({ projects: [site, site, app] }, 9).length, 2);
  const outside = showcase.chapters({ projects: [{ ...site, stills: ['https://example.com/a.webp', ...site.stills] }] }, 9)[0];
  assert.deepEqual([...outside.showcase.stills], site.stills);
});
check('The category names read plainly, with videos closing the works', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/portfolio-data.json'), 'utf8'));
  const names = [...data.categories].sort((a, b) => a.order - b.order).map(category => category.name);
  assert.equal(names.at(-1), '视频');
  for (const old of ['动态视觉', '分类01', '其他类型']) assert.ok(!names.includes(old), old);
});
check('Every still and film exists, is small, and ships in the hosted package', () => {
  const build = fs.readFileSync(path.join(root, 'scripts/build-dist.cjs'), 'utf8');
  const files = [...new Set(config.projects.flatMap(project => [...(project.stills || []), ...(project.screens || []).map(screen => screen.src), ...(project.films || []).flatMap(film => [film.src, film.poster])]))];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(fs.statSync(path.join(root, file)).size < 2 * 1024 * 1024, file);
    assert.ok(build.includes(`'${file}'`), file);
  }
  for (const file of ['css/showcase.css', 'js/showcase.js', 'data/showcase.json']) assert.ok(build.includes(`'${file}'`), file);
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(page.includes('js/showcase.js') && page.includes('css/showcase.css'));
});
console.log(`\n${count} project chapter checks passed.`);
