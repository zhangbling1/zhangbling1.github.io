/* Run with: node scripts/check-page-entry.cjs [dist]
   Exercise the production head bootstrap, route, asynchronous book loader and
   intro exit together. The drawing itself is irrelevant to scroll ownership. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const intro = fs.readFileSync(path.join(root, 'js/intro.js'), 'utf8');
const bootstrap = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function helper(source, name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `Missing production function ${name}`);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('\n  }') + 4);
}

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ fn, once: options.once, signal: options.signal });
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.fn !== fn));
  }
  dispatchEvent(event) {
    for (const entry of [...(this.listeners.get(event.type) || [])]) {
      if (entry.signal?.aborted) continue;
      if (entry.once) this.removeEventListener(event.type, entry.fn);
      entry.fn(event);
    }
    return true;
  }
}

function harness({ hash = '#contents', type = 'reload', reduced = false, savedY = 2400 } = {}) {
  let time = 0, timerId = 0, dataReady;
  const timers = new Map(), frames = [], nodes = new Map(), calls = [], scripts = [];
  const dataGate = new Promise(resolve => { dataReady = resolve; });
  const url = new URL(`http://localhost/portfolio/?v=entry-test${hash}`);
  const classes = new Set();
  const document = new Events();
  document.readyState = 'loading';
  document.documentElement = { style: {}, classList: {
    add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)
  } };
  document.body = { style: {} };
  document.head = { appendChild: script => scripts.push(script) };
  document.createElement = tag => ({ tagName: tag.toUpperCase(), style: {}, append() {}, addEventListener() {} });
  document.activeElement = null;
  document.querySelector = () => null;
  document.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, hidden: false, style: {}, classList: { add() {} }, setAttribute() {},
      scrollIntoView() {
        calls.push({ kind: 'anchor', id });
        scope.scrollY = id === 'contents' ? 744 : 8500;
      },
      contains: () => false, remove() {}, replaceChildren() {}
    });
    return nodes.get(id);
  };
  const history = {
    scrollRestoration: 'auto', state: { example: 'preserve me' },
    replaceState(state, title, target) {
      this.state = state;
      const next = new URL(target, url);
      url.href = next.href;
    }
  };
  const scope = Object.assign(new Events(), {
    document, history, location: url, console, URL, Event, AbortController,
    performance: { now: () => time, getEntriesByType: () => [{ type }], navigation: { type: type === 'reload' ? 1 : 0 } },
    matchMedia: () => ({ matches: reduced }), scrollY: savedY,
    scrollTo(options, y) {
      const nextY = typeof options === 'number' ? y : options.top;
      calls.push({ kind: 'top', y: nextY, instant: options?.behavior === 'instant' });
      this.scrollY = nextY;
    },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    $: id => document.getElementById(id),
    markNav() {}, moveLens() {}, activeLink: () => ({}), navHeld: 0, layoutBook() {},
    chaptersRoot: document.getElementById('chapters'),
    state: {}, reel: {}, readJSON: async () => { await dataGate; return { items: [] }; },
    buildBook() {}, applySiteInfo() {}, applyProfile() {}, pickReel: () => [], buildReel() {},
    videoObserver: { disconnect() {} }, plateLoader: { disconnect() {} },
    renderContents() {}, renderChapters() {},
    element: () => ({ append() {}, addEventListener() {} }),
    root: document.documentElement, events: new AbortController(),
    inertNodes: [], revealTimer: 0, leftAt: 0, done: false, watchdog: 0,
    worker: null, send() {}, splash: document.getElementById('splash')
  });
  scope.window = scope;
  vm.createContext(scope);
  vm.runInContext(bootstrap, scope);
  vm.runInContext([helper(app, 'route'), helper(app, 'loadData'), helper(intro, 'leave'), helper(intro, 'finish')].join('\n'), scope);
  const flushFrames = () => {
    let turns = 0;
    while (frames.length) {
      assert(++turns < 20, 'Animation frames failed to settle');
      const pending = frames.splice(0);
      pending.forEach(callback => callback(time));
    }
  };
  const boot = () => {
    scope.route();
    document.readyState = 'interactive';
    document.dispatchEvent(new Event('DOMContentLoaded'));
    flushFrames();
  };
  const book = async () => {
    const pending = scope.loadData();
    dataReady();
    await pending;
    flushFrames();
  };
  const pageShow = () => {
    document.readyState = 'complete';
    scope.dispatchEvent(new Event('load'));
    // The browser restores its saved position near load/pageshow unless manual.
    if (type !== 'navigate' && history.scrollRestoration === 'auto') scope.scrollY = savedY;
    scope.dispatchEvent(new Event('pageshow'));
    flushFrames();
  };
  const advance = delay => {
    time += delay;
    for (const [id, timer] of [...timers]) if (timer.at <= time) {
      timers.delete(id); timer.callback();
    }
    flushFrames();
  };
  return { scope, calls, scripts, boot, book, pageShow, flushFrames, advance,
    navigate(target) { url.hash = target; scope.dispatchEvent(new Event('hashchange')); scope.route(); flushFrames(); } };
}

let checks = 0;
async function check(name, run) {
  await run(); checks++;
  console.log(`PASS ${name}`);
}
function atCover(run) {
  assert.equal(run.scope.scrollY, 0, 'Intro exit must show the absolute page top');
  assert.equal(run.scope.$('portfolio-view').hidden, false, 'Reload must show the portfolio cover');
  assert.equal(run.scope.document.documentElement.classList.contains('intro'), false);
  assert.equal(run.scope.location.pathname, '/portfolio/');
  assert.equal(run.scope.location.search, '?v=entry-test');
  assert.equal(run.scope.history.state.example, 'preserve me');
}

(async () => {
  await check('Reload drops stale anchors before route and book loading can scroll', async () => {
    for (const hash of ['#contents', '#chapter-1', '#work-tools', '#tool-media-batch', '#contact', '#about', '']) {
      const run = harness({ hash });
      run.boot(); await run.book(); run.pageShow();
      run.scope.leave(); run.advance(300); run.scope.finish(); run.flushFrames();
      atCover(run);
      assert.equal(run.calls.filter(call => call.kind === 'anchor').length, 0, `Old anchor ${hash} was revisited`);
    }
  });
  await check('Skip before page load keeps native scroll restoration from undoing the top', async () => {
    const run = harness({ hash: '', savedY: 9800 });
    run.boot(); run.scope.finish(); run.flushFrames();
    run.pageShow(); await run.book(); atCover(run);
    assert.equal(run.scope.history.scrollRestoration, 'auto');
  });
  await check('A late book response after intro completion does not revisit the old chapter', async () => {
    const run = harness({ hash: '#work-tools' });
    run.boot(); run.pageShow(); run.scope.finish(); run.flushFrames();
    await run.book(); atCover(run);
  });
  await check('Reduced motion, a failed intro script and the failsafe all release at the cover', async () => {
    for (const exit of ['reduced', 'error', 'failsafe']) {
      const run = harness({ reduced: exit === 'reduced' });
      run.boot();
      if (exit === 'error') run.scripts[0].onerror();
      if (exit === 'failsafe') run.advance(9000);
      run.pageShow(); await run.book(); atCover(run);
    }
  });
  await check('First visits honor shared links and back/forward keeps its saved position', async () => {
    for (const type of ['navigate', 'back_forward']) {
      const run = harness({ type, hash: '#work-tools', savedY: 3210 });
      run.boot(); await run.book(); run.pageShow();
      run.scope.finish(); run.flushFrames();
      assert.equal(run.scope.location.hash, '#work-tools');
      assert.equal(run.scope.scrollY, type === 'navigate' ? 8500 : 3210);
      assert.ok(run.calls.some(call => call.kind === 'anchor' && call.id === 'work-tools'));
    }
  });
  await check('Navigation after skipping is not pulled back by a later load event', async () => {
    const run = harness();
    run.boot(); await run.book(); run.scope.finish(); run.flushFrames();
    run.navigate('#work-tools'); run.pageShow();
    assert.equal(run.scope.scrollY, 8500);
    assert.equal(run.scope.location.hash, '#work-tools');
    assert.equal(run.scope.history.scrollRestoration, 'auto');
  });
  console.log(`\n${checks} page entry regression checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
