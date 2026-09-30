// Original vector artwork, shared by the live covers and static contents previews.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rect = (x, y, w, h, fill, radius = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${extra}/>`;
const text = (x, y, value, size, color, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${value}</text>`;
const pill = (x, y, width, label, color) => `${rect(x, y, width, 30, '#ffffff08', 15, 'stroke="#ffffff20"')}${text(x + 13, y + 19, label, 11, color, 'letter-spacing="1.5"')}`;
const float = (kind, content) => `<g class="art-layer art-layer-${kind}"><g class="art-float art-float-${kind}">${content}</g></g>`;
function scene(id, x, y, w, h) {
  return `<defs><clipPath id="scene-${id}">${rect(x, y, w, h, '#fff', 8)}</clipPath></defs><g clip-path="url(#scene-${id})"><svg x="${x}" y="${y}" width="${w}" height="${h}" style="width:${w}px;height:${h}px" viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice">
    <path fill="url(#sky)" d="M0 0h640v420H0z"/><circle cx="380" cy="164" r="89" fill="url(#planet)"/>
    <circle cx="380" cy="164" r="114" fill="none" stroke="#f5b079" stroke-opacity=".18"/><ellipse cx="379" cy="165" rx="141" ry="30" transform="rotate(-27 379 165)" fill="none" stroke="#f6bd90" stroke-width="2" stroke-opacity=".55"/>
    <path d="M0 310 96 243 161 278 230 204 326 315 413 266 498 289 565 231 640 293v127H0Z" fill="#344c51"/>
    <path d="M0 335 97 311 204 345 299 275 407 351 517 316 640 355v65H0Z" fill="#122f37"/>
    <path d="M0 379q148-56 296-10t344-22v73H0Z" fill="#082329"/>
    <path d="m273 391 28-29 47 9 24-14 49 23" fill="none" stroke="#73bcb8" stroke-opacity=".45"/>
    <path d="M306 344h5v21h-5z" fill="#ead4b9"/><path d="m302 351 8-22 11 23Z" fill="#e8af78"/>
  </svg></g>`;
}
function base(id, title, accent, dark, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-cover-svg" width="960" height="640" viewBox="0 0 960 640"><title>${title}</title>
  <defs><radialGradient id="aura"><stop stop-color="${accent}" stop-opacity=".27"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="floor"><stop stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".13"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".075"/></linearGradient>
    <linearGradient id="edge" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".7"/><stop offset=".4" stop-color="${accent}" stop-opacity=".12"/><stop offset="1" stop-color="${accent}" stop-opacity=".7"/></linearGradient>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#07171f"/><stop offset=".65" stop-color="#255966"/><stop offset="1" stop-color="#97bdb8"/></linearGradient>
    <radialGradient id="planet" cx=".35" cy=".3"><stop stop-color="#ffdfa3"/><stop offset=".45" stop-color="#eda678"/><stop offset="1" stop-color="#914a42"/></radialGradient>
    <filter id="shadow" x="-.5" y="-.5" width="2" height="2"><feDropShadow dx="0" dy="19" stdDeviation="17" flood-color="#000" flood-opacity=".6"/></filter>
    <filter id="bloom" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="8"/></filter>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0v50" fill="none" stroke="#fff" stroke-opacity=".033"/></pattern>
  </defs>${rect(0, 0, 960, 640, dark)}${rect(0, 0, 960, 640, 'url(#grid)')}
  <ellipse class="art-aura" cx="530" cy="275" rx="470" ry="400" fill="url(#aura)"/><ellipse cx="500" cy="437" rx="330" ry="106" fill="url(#floor)"/>
  <g fill="${accent}" fill-opacity=".55"><circle class="art-spark" cx="107" cy="226" r="1.6"/><circle class="art-spark" cx="811" cy="119" r="1.8"/><circle class="art-spark" cx="849" cy="442" r="1.3"/></g>
  <path d="M28 82V28h54m796 0h54v54M28 558v54h54m796 0h54v-54" fill="none" stroke="#fff" stroke-opacity=".16"/>
  <g font-family="Manrope, Segoe UI, Arial, sans-serif" font-weight="400">${body}</g></svg>`;
  // Inline SVGs coexist in the document: gradient and clip IDs must be unique.
  return svg.replace(/id="([^"]+)"/g, (_, name) => `id="${id}-${name}"`).replace(/url\(#([^\)]+)\)/g, (_, name) => `url(#${id}-${name})`);
}

const art = {};
const amber = '#ffb373';
let video = text(49, 65, '01 / VIDEO BATCH STUDIO', 12, '#cac2b5', 'letter-spacing="2"') + pill(736, 43, 171, 'ONE → MANY', amber);
video += `<g opacity=".38"><path d="M123 447 295 176 804 190 852 431Z" fill="none" stroke="#ad8b69" stroke-width="1" stroke-dasharray="3 8"/>
  <ellipse cx="522" cy="364" rx="285" ry="130" fill="none" stroke="#e4b581" stroke-opacity=".14" transform="rotate(-15 522 364)"/></g>`;
video += float('back', `<g transform="translate(138 232) rotate(-13 130 90)" filter="url(#shadow)">${rect(5, 7, 286, 180, '#0a171c', 13, 'stroke="#83959655"')}${rect(0, 0, 286, 180, '#10242b', 13, 'stroke="url(#edge)"')}${scene('wide', 10, 10, 266, 143)}
  ${text(16, 170, '1920 × 1080', 9, '#cfdbd9', 'letter-spacing="1"')}${text(241, 170, '16:9', 9, '#cfdbd9')}</g>`);
video += float('front', `<g transform="translate(434 111) rotate(8 106 175)" filter="url(#shadow)">${rect(7, 9, 211, 363, '#a36a42', 17, 'stroke="#f1b8773f"')}${rect(0, 0, 211, 363, '#162b2e', 17, 'stroke="url(#edge)" stroke-width="1.4"')}
  ${scene('tall', 9, 9, 193, 342)}${rect(9, 246, 193, 105, '#09232d99', 8)}${text(25, 278, 'BEYOND', 29, '#eef7ef', 'font-weight="600" letter-spacing="-.7"')}${text(25, 310, 'THE FRAME', 25, '#bce3db', 'font-weight="600" letter-spacing="-.7"')}
  ${text(25, 333, '1080 × 1920 / 9:16', 8, '#c6d8cf', 'letter-spacing="1.6"')}<path d="M23 21h57m95 0h14" stroke="#fff" stroke-opacity=".38"/></g>`);
video += float('side', `<g transform="translate(680 216) rotate(16 86 92)" filter="url(#shadow)">${rect(4, 6, 173, 190, '#222c2e', 12, 'stroke="#e6b58544"')}${rect(0, 0, 173, 190, '#15232b', 12, 'stroke="url(#edge)"')}${scene('square', 8, 8, 157, 157)}
  ${text(14, 182, '1080 × 1080 / 1:1', 8, '#c6d8cf', 'letter-spacing=".6"')}</g>`);
video += float('badge', `${rect(190, 134, 177, 49, '#2e261de0', 8, 'stroke="#ffb3734d"')}${text(206, 154, 'OUTPUT / READY', 8, '#ddb588', 'letter-spacing="1.6"')}${text(206, 173, '3 FORMATS. ONE FLOW.', 10, '#f0dcc0', 'letter-spacing=".4"')}<circle cx="348" cy="153" r="3" fill="${amber}"/>`);
video += text(46, 573, 'RENDER', 92, '#f1e9dd', 'font-weight="600" letter-spacing="-4"') + text(51, 601, 'COMPOSE / ADAPT / DELIVER', 11, '#ad9d85', 'letter-spacing="2.5"')
  + `<path class="art-flow-line" d="M610 553h130l12-12h82" fill="none" stroke="${amber}" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="4 5"/>${text(677, 582, 'LOCAL / AUTOMATED', 10, '#bbac95', 'letter-spacing="2"')}`;
art['media-batch'] = base('media', 'Render — one source, every format', amber, '#15181a', video);

const cyan = '#72e2dc';
let capture = text(49, 65, '02 / GAMEPLAY CAPTURE STUDIO', 12, '#bed1ce', 'letter-spacing="1.7"') + pill(752, 43, 155, 'PLAY → REC', cyan);
const iso = (x, y, z = 0) => [480 + (x - y) * 53, 144 + (x + y) * 27 - z];
const points = values => values.map(point => point.join(',')).join(' ');
capture += `<g class="art-map-plane"><path d="M162 306 480 468 798 306v13L480 481 162 319Z" fill="#061c20" stroke="#7cdbd9" stroke-opacity=".27"/>`;
for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) {
  const p = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
  capture += `<polygon points="${points(p)}" fill="${(x + y) % 2 ? '#142829' : '#152d2d'}" stroke="#71c0bd" stroke-opacity=".22" stroke-width=".8"/>`;
}
capture += `<path d="M162 306 480 468 798 306M480 468v13" fill="none" stroke="#a5e8de" stroke-opacity=".4"/>`;
const blocks = [[1,1,44],[1,2,44],[4,1,55],[4,2,26],[2,4,35],[3,4,35],[5,4,26]];
for (const [x, y, z] of blocks) {
  const a = iso(x,y,z), b = iso(x+1,y,z), c = iso(x+1,y+1,z), d = iso(x,y+1,z);
  capture += `<g><polygon points="${points([a,b,c,d])}" fill="#254949" stroke="#92d7d0" stroke-opacity=".25"/>
    <polygon points="${points([b,c,iso(x+1,y+1),iso(x+1,y)])}" fill="#0b2428" stroke="#87c9c6" stroke-opacity=".18"/>
    <polygon points="${points([c,d,iso(x,y+1),iso(x+1,y+1)])}" fill="#16383b" stroke="#87c9c6" stroke-opacity=".18"/></g>`;
}
const route = [[.5,4.5],[1.5,3.5],[2.5,3.5],[3.5,2.5],[3.5,.5],[5.5,.5]].map(([x,y]) => iso(x,y,8));
const routePath = `M${route.map(point=>point.join(' ')).join('L')}`;
capture += `<path d="${routePath}" fill="none" stroke="${cyan}" stroke-opacity=".3" stroke-width="11" filter="url(#bloom)"/>
  <path d="${routePath}" fill="none" stroke="${cyan}" stroke-width="2.2"/>
  <path class="art-route-light" d="${routePath}" fill="none" stroke="#f0ffff" stroke-width="3.8" pathLength="100" stroke-dasharray="6 94"/>
  ${route.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#112c2d" stroke="${cyan}"/>`).join('')}`;
const p = route[3];
capture += `<g transform="translate(${p[0]} ${p[1]})"><ellipse class="art-target-ring" cy="-3" rx="32" ry="17" fill="none" stroke="${cyan}" stroke-opacity=".55"/></g>`;
capture += float('front', `<g transform="translate(${p[0]} ${p[1]})"><ellipse cy="-3" rx="32" ry="17" fill="${cyan}" fill-opacity=".08" stroke="${cyan}" stroke-opacity=".8"/>
  <path d="M0-49 13-42 0-34-13-42Z" fill="#baf8e9"/><path d="M-13-42 0-34v25l-13-9Z" fill="#459998"/><path d="M13-42 0-34v25l13-9Z" fill="#8ddcd1"/>
  <path d="M0-58v-25m-5 6 5-6 5 6" fill="none" stroke="#97eeeb" stroke-width="1.2"/></g>`);
capture += '</g>';
capture += float('badge', `${rect(620, 139, 256, 82, '#183237e8', 9, 'stroke="#8ae1dd4d"')}${text(639, 163, 'VISION / TARGET ACQUIRED', 9, '#91d7d1', 'letter-spacing="1.3"')}
  ${text(639, 197, 'EN', 20, '#e7faf1', 'font-weight="500"')}${text(696, 195, 'TH / ID / VI', 12, '#a8c9c6', 'letter-spacing="2"')}<circle cx="854" cy="159" r="4" fill="${cyan}"/>`);
capture += text(46, 573, 'CAPTURE', 86, '#e4f2eb', 'font-weight="600" letter-spacing="-4"') + text(51, 601, 'HERO × STAGE × LANGUAGE', 11, '#95b7b3', 'letter-spacing="2.5"')
  + text(706, 582, 'VISION / MOTION', 10, '#abc6c3', 'letter-spacing="2"');
art['capture-studio'] = base('capture', 'Capture — an intelligent material collection workflow', cyan, '#101a1d', capture);

const violet = '#c2a9ff';
let debug = text(49, 65, '03 / GAME DEBUG WORKBENCH', 12, '#c9c4d8', 'letter-spacing="1.8"') + pill(738, 43, 169, 'FIND → CONTROL', violet);
debug += `<g fill="none" stroke="#c2a9ff" stroke-opacity=".13"><ellipse cx="490" cy="373" rx="302" ry="110"/>
  <ellipse class="art-orbit" cx="490" cy="373" rx="334" ry="125" stroke-dasharray="3 8"/><path d="M154 373h90m492 0h90M490 207v42m0 246v24"/></g>`;
function slab(x, y, kind, opacity = 1) {
  return float(kind, `<g opacity="${opacity}" transform="translate(${x} ${y}) skewY(-13)" filter="url(#shadow)">
    ${rect(5, 9, 356, 164, '#151623', 12, 'stroke="#bea2ff40"')}${rect(0, 0, 356, 164, '#20202ce0', 12, 'stroke="url(#edge)"')}${rect(1, 1, 354, 162, 'url(#glass)', 12)}
    <path d="M0 34h356" fill="none" stroke="#ffffff18"/>${text(18, 23, 'DATA / INDEX', 9, '#b5adc9', 'letter-spacing="1.4"')}
    <circle cx="321" cy="18" r="3" fill="#bca0ef"/>${[0,1,2].map(i=>`${rect(18,50+i*30,28,16,'#ba9be914',4)}${text(25,62+i*30,`0${i+1}`,8,'#b1a2c9')}${rect(61,54+i*30,98-i*14,3,'#dad4e7a3',1.5)}${rect(61,62+i*30,145-i*18,2,'#a58bbd35',1)}${rect(267,54+i*30,62,3,'#b499da44',1.5)}`).join('')}
  </g>`);
}
debug += slab(171, 232, 'back', .55) + slab(261, 262, 'side', .85) + slab(351, 292, 'front');
debug += float('badge', `<g transform="translate(586 139)" filter="url(#shadow)">
  <path d="M0 51 93 0l94 51-94 52Z" fill="url(#glass)" stroke="#d7c6f9" stroke-opacity=".75"/>
  <path d="m0 51 93 52v87L0 139Z" fill="#392a5b9c" stroke="#c8a8ff" stroke-opacity=".45"/>
  <path d="m187 51-94 52v87l94-51Z" fill="#a280df2b" stroke="#c8a8ff" stroke-opacity=".45"/>
  <path d="M47 77v87m93-87v87M0 95l93 52 94-52M47 26l93 51m0-51L47 77" fill="none" stroke="#c4a6fa" stroke-opacity=".25"/>
  <path d="M93 43 110 53 93 63 76 53Z" fill="#e7dbff"/><path d="M76 53 93 63v21L76 74Z" fill="#9172c9"/><path d="M110 53 93 63v21l17-10Z" fill="#c0a3f4"/>
  <circle cx="93" cy="59" r="31" fill="#c4a5ff" fill-opacity=".08"/>
  </g>`);
debug += `${rect(111, 139, 203, 60, '#2e2436e6', 9, 'stroke="#c4a5ff4d"')}${text(128, 162, 'QUERY / RESULT', 9, '#c1a7dd', 'letter-spacing="1.5"')}${text(128, 184, 'SELECT. TUNE. EXECUTE.', 11, '#d8cfe7', 'letter-spacing=".7"')}`;
debug += text(46, 573, 'CONTROL', 84, '#f0e9fa', 'font-weight="600" letter-spacing="-4"') + text(51, 601, 'QUERY / EDIT / ORCHESTRATE', 11, '#b7a4cb', 'letter-spacing="2.5"')
  + text(724, 582, 'DATA / ACTION', 10, '#c6b4de', 'letter-spacing="2"');
art['game-debug'] = base('debug', 'Control — a layered data workspace', violet, '#171521', debug);

fs.mkdirSync(path.join(root, 'assets/toolkit'), { recursive: true });
for (const [id, svg] of Object.entries(art)) fs.writeFileSync(path.join(root, `assets/toolkit/${id}.svg`), svg);
const moduleSource = `/* Generated by scripts/build-tool-art.cjs. Original vector scenes; no external assets. */\n(() => {\n  'use strict';\n  const scenes = ${JSON.stringify(art)};\n  window.PortfolioToolArt = id => {\n    if (!Object.hasOwn(scenes, id)) return null;\n    const scene = document.createElement('span');\n    scene.className = 'tool-art-scene';\n    scene.setAttribute('aria-hidden', 'true');\n    scene.innerHTML = scenes[id];\n    return scene;\n  };\n})();\n`;
fs.writeFileSync(path.join(root, 'js/tool-art.js'), moduleSource);
console.log('Built three spatial tool covers and their live vector scenes.');
