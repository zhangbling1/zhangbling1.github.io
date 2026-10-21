/* The project chapters after the works: the catalog is validated, and every
   file they need reaches the hosted build — in the package, or as a remote film. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scope = { window: { matchMedia: () => ({ matches: false }) }, document: {}, matchMedia: () => ({ matches: false }) };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/showcase.js'), 'utf8'), scope);
const showcase = scope.window.PortfolioShowcase;
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/showcase.json'), 'utf8'));
const byId = id => config.projects.find(project => project.id === id);
const site = byId('mini-games'), app = byId('xiaozhang'), games = byId('playables');
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

check('The mini-game site, the playable ads and 小帐 follow the works as numbered chapters', () => {
  const chapters = showcase.chapters(config, 9);
  assert.deepEqual(Array.from(chapters, chapter => [chapter.number, chapter.id, chapter.category.name]), [[9, 'mini-games', '小游戏demo'], [10, 'playables', '试玩广告'], [11, 'xiaozhang', '小帐']]);
  for (const chapter of chapters) assert.equal(chapter.plates.length, 0);
  assert.equal(chapters[2].showcase.films.length, 2);
  assert.equal(chapters[2].showcase.screens.length, 4);
});
check('Playable ads list their games by name only; a draft or a game from elsewhere stays off the page', () => {
  const [chapter] = showcase.chapters({ projects: [games] }, 10);
  const shown = games.games.filter(game => !game.draft);
  assert.deepEqual([...chapter.showcase.games].map(game => game.name), shown.map(game => game.name));
  assert.equal(chapter.showcase.count, `${shown.length} 款`);
  assert.deepEqual([...chapter.showcase.works], shown.map(game => game.tag ? `${game.name}（${game.tag}）` : game.name));
  // 用别人素材复刻的那款必须标明复刻
  for (const game of shown) if (game.src.startsWith('games/tycoon/')) assert.equal(game.tag, '复刻');
  for (const game of shown) assert.ok(!/参照|基于|改编|仿/.test(game.name + (games.note || '')), game.name);
  const one = shown[0];
  assert.equal(showcase.chapters({ projects: [{ ...games, games: [{ ...one, src: 'games/park/index.html' }] }] }, 10).length, 1);
  for (const bad of [{ ...one, src: 'https://example.com/a.html' }, { ...one, src: '../games/a.html' }, { ...one, src: 'games/a.js' }, { ...one, src: 'games/park/other.html' }, { ...one, src: 'games/a/b/index.html' }, { ...one, poster: 'https://example.com/a.webp' }, { ...one, name: ' ' }, { ...one, draft: true }])
    assert.equal(showcase.chapters({ projects: [{ ...games, games: [bad] }] }, 10).length, 0);
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
const remoteFilms = new Set(config.projects.flatMap(project => (project.films || []).map(film => film.src)));
check('Every still and film exists, is small, and reaches the build exactly one way', () => {
  const build = fs.readFileSync(path.join(root, 'scripts/build-dist.cjs'), 'utf8');
  const list = name => (new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(build) || [, ''])[1];
  const shipped = list('STATIC_FILES');
  const remote = list('REMOTE_FILES');
  const dirs = [...list('STATIC_DIRS').matchAll(/'([^']+)'/g)].map(match => match[1]);
  const files = [...new Set(config.projects.flatMap(project => [...(project.stills || []), ...(project.screens || []).map(screen => screen.src), ...(project.films || []).flatMap(film => [film.src, film.poster]),
    ...(project.games || []).filter(game => !game.draft).flatMap(game => [game.src, game.poster])]))];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(fs.statSync(path.join(root, file)).size < (file.startsWith('games/') ? 3 : 2) * 1024 * 1024, file);   // 一款试玩是一个完整的单文件游戏
    const inPackage = shipped.includes(`'${file}'`) || dirs.some(dir => file.startsWith(`${dir}/`));
    const isRemote = remote.includes(`'${file}'`);
    assert.ok(inPackage !== isRemote, `${file} must be packaged or remote, not both or neither`);
    assert.ok(remoteFilms.has(file) === isRemote, `${file} may only be remote while it is a film`);
  }
  assert.ok(fs.readFileSync(path.join(root, 'js/showcase.js'), 'utf8').includes('__PORTFOLIO_MEDIA_BASE__'),
    'Remote films need the page to resolve them against the build origin');
  for (const file of ['css/showcase.css', 'js/showcase.js', 'data/showcase.json']) assert.ok(shipped.includes(`'${file}'`), file);
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(page.includes('js/showcase.js') && page.includes('css/showcase.css'));
});
console.log(`\n${count} project chapter checks passed.`);
