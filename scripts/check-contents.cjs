/* Exercise the real contents renderer without a browser or image dependencies.
   Image events are driven explicitly to cover missing/stale preview indexes. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const Order = require('../js/portfolio-order.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const contents = source.slice(source.indexOf('/* ---------- Contents ---------- */'), source.indexOf('  function renderChapters()'));
const helper = name => {
  const start = source.indexOf(`  function ${name}(`);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('\n  }') + 4);
};
class Node {
  constructor(tag, className = '', text) {
    this.tagName = tag; this.className = className; this.textContent = text || '';
    this.children = []; this.dataset = {}; this.attributes = {}; this.events = new Map();
    this.style = { setProperty() {} };
    this.classList = { add: name => { this.className += ` ${name}`; }, contains: name => this.className.split(' ').includes(name) };
  }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
  addEventListener(type, fn, options) { const listeners = this.events.get(type) || []; listeners.push({ fn, once: options?.once }); this.events.set(type, listeners); }
  fire(type) { const listeners = [...(this.events.get(type) || [])]; this.events.set(type, listeners.filter(listener => !listener.once)); listeners.forEach(listener => listener.fn()); }
  find(tag) { return this.tagName === tag ? this : this.children.map(child => child.find(tag)).find(Boolean); }
  findClass(name) { return this.classList.contains(name) ? this : this.children.map(child => child.findClass(name)).find(Boolean); }
}
function render(items, previews = {}) {
  const nodes = new Map();
  const observed = { image: [], video: [] };
  const plates = items.map(item => ({ item }));
  const state = { previews, plates, chapters: plates.map((plate, i) => ({ id: `chapter-${i + 1}`, number: i + 1,
    category: { name: plate.item.categoryName || 'Test', en: 'Test' }, plates: [plate] })) };
  const scope = { state, URL, document: { baseURI: 'http://localhost/' }, location: { origin: 'http://localhost' },
    element: (...args) => new Node(...args), $: id => { if (!nodes.has(id)) nodes.set(id, new Node('div')); return nodes.get(id); },
    pad: value => String(value).padStart(2, '0'), downIcon: '', videoBadge: () => new Node('span', 'badge', '视频'),
    plateLoader: { observe(node) { observed.image.push(node); }, unobserve() {} },
    videoObserver: { observe(node) { observed.video.push(node); }, unobserve() {} }
  };
  vm.runInNewContext(`${helper('mediaURL')}\n${helper('previewSet')}\n${helper('toneOf')}\n${contents}\nrenderContents();`, scope);
  return { cards: nodes.get('toc').children.map(node => node.children[0]), observed };
}
const still = { id: 'new', src: 'images/平面设计/new.png', mediaType: 'image' };
const video = { id: 'motion', src: 'images/Video/1.mp4', mediaType: 'video' };
const preview = { variants: [{ src: 'assets/previews/sample-400.webp', width: 400 }] };
let count = 0;
function check(name, fn) { fn(); console.log(`PASS ${name}`); count++; }

check('Newly scanned image renders its original when no preview entry exists', () => {
  const { cards: [card], observed } = render([still]);
  const image = card.find('img');
  assert.ok(image, 'Contents must create an image even before previews have been generated');
  assert.equal(image.dataset.src, new URL(still.src, 'http://localhost/').href);
  assert.equal(observed.image.length, 1);
  image.fire('load'); assert.ok(card.classList.contains('is-loaded'));
});
check('Valid previews retain responsive, lazy image loading', () => {
  const { cards: [card] } = render([still], { [still.src]: preview });
  const image = card.find('img');
  assert.equal(image.dataset.src, 'http://localhost/assets/previews/sample-400.webp');
  assert.ok(image.dataset.srcset.includes('400w'));
  image.fire('load'); assert.ok(card.classList.contains('is-loaded'));
});
check('A stale preview falls back to the original; a failed original ends with explicit feedback', () => {
  const { cards: [card] } = render([still], { [still.src]: preview });
  const image = card.find('img'); image.srcset = image.dataset.srcset; image.src = image.dataset.src;
  image.fire('error'); assert.equal(image.src, new URL(still.src, 'http://localhost/').href); assert.equal(image.srcset, undefined);
  image.fire('error'); assert.ok(card.findClass('media-failure')); assert.ok(card.classList.contains('is-loaded'));
});
check('Video cover without a poster loads a paused original frame near the viewport', () => {
  const { cards: [card], observed } = render([video]);
  const motion = card.find('video'); assert.ok(motion); assert.equal(motion.preload, 'metadata');
  assert.equal(motion.dataset.src, 'http://localhost/images/Video/1.mp4'); assert.equal(observed.video.length, 1);
  motion.fire('loadeddata'); assert.ok(card.classList.contains('is-loaded'));
});
check('Broken video posters also fall back to the video instead of an empty frame', () => {
  const { cards: [card] } = render([video], { [video.src]: preview });
  card.find('img').fire('error'); assert.ok(card.find('video'));
  card.find('video').fire('error'); assert.ok(card.findClass('media-failure'));
});
check('Current portfolio has a renderable cover for every chapter, even with an empty manifest', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/portfolio-data.json'), 'utf8'));
  const leads = data.categories.map(cat => Order.ordered(data, cat.id).find(item => item.visible !== false)).filter(Boolean);
  const { cards } = render(leads);
  assert.equal(cards.length, leads.length);
  cards.forEach((card, i) => assert.ok(card.find('img') || card.find('video'), `Missing cover for ${leads[i].src}`));
});
console.log(`\n${count} contents regression checks passed.`);
