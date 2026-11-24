// 一人称ダンジョンの描画（レイキャスト）と、階のマップ生成

const VW = 320, VH = 240, TS = 128;
// 今日の塔の様子（宿屋の噂）。game.js が町に戻るたびに決める
let TODAY = {};

// ---------- 乱数（階ごとに同じマップになるよう、種から作る） ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function hash(x, y, s) { let q = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); q ^= q >>> 16; return (q >>> 0) / 4294967296; }

// ---------- テクスチャ ----------
const TEX = { ready: false };
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }); }
function pix(img, w, h) { const o = document.createElement('canvas'); o.width = w; o.height = h; const g = o.getContext('2d'); g.drawImage(img, 0, 0, w, h); return new Uint32Array(g.getImageData(0, 0, w, h).data.buffer); }

// 飾りの置き方（128pxの壁の中での [中心x, 上端y, 縮尺]）
const DECO_PLACE = { vine:[64,0,.27], crack_l:[64,34,.2], crack_s:[44,70,.2], moss:[64,92,.2], torch:[64,40,.28], ring:[64,26,.2], hole:[64,74,.2], poster:[64,24,.26], runes:[64,40,.2] };
const DECO_NAMES = Object.keys(DECO_PLACE);
const TORCH_TIP = [73.6, 54.4];
// 新しい壁飾り（props.js の w_）の置き方: [高さ(px/128), 上端(px)。負の数なら下端合わせ]
const WALL_PLACE = {
  w_banner_red:[62,6], w_banner_blue:[62,6], w_drape:[44,4], w_shield:[40,30], w_swords:[48,26], w_antler:[40,24],
  w_swag:[30,4], w_chain:[34,10], w_lantern:[46,0], w_cage:[54,0], w_plant:[46,0], w_censer:[52,0], w_bracket:[34,40],
  w_arch:[100,-2], w_window:[64,22], w_niche_saint:[100,-2], w_relief_lion:[62,30], w_sun:[40,28], w_compass:[40,28],
  w_banner_skull:[62,6], w_banner_eye:[62,6], w_banner_torn:[62,6], w_skull_horn:[50,20], w_relief_snake:[58,30], w_gargoyle:[66,-30],
  w_cage_empty:[56,0], w_cage_bones:[56,0], w_shackles:[52,14], w_skull_chain:[30,14], w_chandelier:[40,0], w_spikes:[52,22],
  w_niche_hood:[100,-2], w_relief_skulls:[100,-2], w_relief_demon:[100,-2], w_wall_skeleton:[92,-6],
};
// 階ごとの壁飾り: 1〜5階は古い城の飾り、6〜10階は不気味な飾りが混ざる
const WALL_SET_A = ['w_banner_red','w_banner_blue','w_drape','w_shield','w_swords','w_antler','w_swag','w_chain','w_lantern','w_cage','w_plant','w_censer','w_bracket','w_arch','w_window','w_niche_saint','w_relief_lion','w_sun','w_compass'];
const WALL_SET_B = ['w_banner_skull','w_banner_eye','w_banner_torn','w_skull_horn','w_relief_snake','w_gargoyle','w_cage_empty','w_cage_bones','w_shackles','w_skull_chain','w_chandelier','w_spikes','w_niche_hood','w_relief_skulls','w_relief_demon','w_wall_skeleton'];
// 床の小物: [名前, 大きさ(マスの高さに対する割合), 重み]。1〜10階（石のダンジョン）
const FLOOR_PROPS_STONE = [
  ['f_barrels',.42,8], ['f_crates',.42,8], ['f_sacks',.32,7], ['f_pots',.36,7], ['f_rubble',.28,6], ['f_scatter',.2,5],
  ['f_skel_sit',.38,5], ['f_skel_prone',.26,4], ['f_skel_shield',.32,4], ['f_feather',.16,1.2], ['f_mimic',.4,1.2], ['f_mimic_gold',.4,.5],
  ['t_rock1',.4,4], ['t_minecart',.4,3], ['t_pick_rock',.42,3], ['t_crystal',.48,2], ['t_bones',.28,3], ['t_bullskull',.28,2], ['t_planks',.32,3], ['t_wagon',.44,2],
  ['u_mushroom',.34,3], ['u_cairn',.48,2], ['u_stalag',.48,2],
];
const FLOOR_PROPS_DEEP = [['f_skulls',.34,4], ['f_ribcage',.28,3], ['f_sword_grave',.5,3], ['f_altar',.44,1.5], ['f_brazier_skull',.44,2], ['f_rune_stone',.58,2]];
// 鉱脈（石のダンジョン）: [名前, 重み]
const VEINS_STONE = [['v_copper',60], ['v_iron',25], ['v_stone',10], ['v_gems',5]]; // たいまつの棒の先（反転なし／反転）

// エリアごとの絵（2026-11-24。assets/area/<エリア>/）。壁・床・天井（空）・扉・階段・床の小物4つ
const AREA_FILES = ['wall', 'wall2', 'floor', 'ceil', 'door_wood', 'door_iron', 'stairs_up', 'stairs_down'];
// 外のエリアは明るい（たいまつがなくても見える）
const OUTDOOR = { forest: 1, desert: 1, mountain: 1, snow: 1, jungle: 1, canyon: 1, glacier: 1 };
// 空が見えるエリア（森とジャングルは葉の天井）
const SKY = { desert: 1, mountain: 1, snow: 1, canyon: 1, glacier: 1 };
let LIGHT_MIN = 0;
// 床の小物: [名前, 大きさ, 調べたときの種類]
const AREA_PROPS = {
  stone:   [['樽', .44, 'box'], ['木箱', .42, 'box'], ['白骨', .26, 'bone'], ['壊れた荷車', .42, 'wood']],
  forest:  [['切り株', .36, 'wood'], ['苔むした岩', .38, 'rock'], ['キノコの群れ', .32, 'mushroom'], ['倒れた丸太', .3, 'wood']],
  desert:  [['枯れ木', .52, 'wood'], ['牛の頭骨', .28, 'bone'], ['倒れた石柱', .36, 'rock'], ['壺', .4, 'box']],
  mountain:[['大きな岩', .44, 'rock'], ['坑道の支柱', .52, 'wood'], ['トロッコ', .4, 'rock'], ['積み石', .46, 'rock']],
  snow:    [['凍った木', .42, 'wood'], ['雪に埋もれた樽', .26, 'box'], ['氷柱の岩', .42, 'crystal'], ['雪だるまの残骸', .28, 'box']],
  jungle:  [['大きなシダ', .4, 'mushroom'], ['苔むした石像の頭', .38, 'altar'], ['巨大な花', .3, 'mushroom'], ['倒木', .3, 'wood']],
  ruins:   [['オベリスク', .6, 'altar'], ['壊れた石像', .36, 'rock'], ['金の壺', .42, 'box'], ['石棺', .32, 'bone']],
  canyon:  [['溶岩の噴き出す岩', .42, 'crystal'], ['骨', .28, 'bone'], ['尖った岩', .44, 'rock'], ['焦げた木', .36, 'wood']],
  glacier: [['氷の結晶の柱', .56, 'crystal'], ['雲のかたまり', .3, 'box'], ['天の祭壇', .5, 'altar'], ['凍った羽根', .34, 'feather']],
  castle:  [['燭台', .5, 'box'], ['甲冑の飾り', .56, 'bone'], ['玉座の椅子', .5, 'altar'], ['本の積まれた机', .4, 'box']],
};
// エリアに混ぜる小物（Background/miscs の絵）: [絵, 大きさ, 重み]。地面に貼る平らな絵（池・溶岩・落とし穴など）は浮いて見えるので使わない
const AREA_EXTRA = {
  stone:   [['u_boulder',.4,3], ['t_rock2',.4,3]],
  forest:  [['u_grass',.24,6], ['u_flowers',.24,5], ['u_berries',.3,5], ['t_bush',.34,5], ['t_lavender',.32,3], ['u_mossrock',.38,5], ['t_rock3',.4,4], ['u_mossarch',.52,2], ['t_log',.28,3]],
  desert:  [['t_deadtree',.52,5], ['t_deadroots',.3,5], ['t_bones',.28,5], ['t_bullskull',.28,4], ['t_wheat',.32,4], ['u_stalag',.46,4], ['t_rune1',.5,2], ['t_pillars',.48,3], ['u_cairn',.46,3], ['t_head',.34,2]],
  mountain:[['t_rock1',.4,5], ['t_rock2',.4,4], ['t_spire1',.48,4], ['t_spire2',.52,4], ['t_slab',.34,4], ['u_spires',.5,3], ['t_ore_rock',.32,4], ['t_pick_rock',.42,3], ['t_minecart',.4,2], ['t_planks',.3,3], ['t_wagon',.42,2], ['u_boulder',.4,4]],
  snow:    [['u_crystal',.46,5], ['t_deadtree',.52,4], ['u_boulder',.4,4], ['t_rock1',.4,4], ['u_cairn',.46,3], ['t_spire1',.48,3]],
  jungle:  [['t_bush',.34,6], ['u_berries',.3,5], ['u_grass',.26,6], ['u_flowers',.24,4], ['t_lavender',.34,4], ['t_bramble',.34,4], ['u_mossrock',.38,4], ['t_rock3',.4,3], ['u_mossarch',.52,3], ['t_ruinwall',.44,3], ['t_ruinwindow',.56,2], ['t_head',.34,3], ['t_log',.28,3]],
  ruins:   [['t_ruinwall',.44,5], ['t_ruinwindow',.56,4], ['t_pillars',.5,5], ['t_colonnade',.56,3], ['t_ruinarch',.6,3], ['t_arch',.5,3], ['u_pillar',.48,4], ['u_wall',.44,4], ['t_rune1',.52,3], ['t_rune2',.56,3], ['t_head',.34,3], ['u_stalag',.46,2], ['t_bullskull',.28,2]],
  canyon:  [['t_spire1',.48,5], ['t_spire2',.52,5], ['t_rock2',.4,4], ['u_spires',.5,4], ['u_stalag',.46,3], ['t_deadtree',.5,3], ['t_deadroots',.3,3], ['t_bones',.28,4], ['t_bullskull',.28,3], ['u_boulder',.4,3]],
  glacier: [['u_crystal',.48,6], ['t_crystal',.46,4], ['t_spire2',.5,2], ['u_cairn',.46,2]],
  castle:  [['f_barrels',.42,3], ['f_crates',.42,3], ['f_sacks',.32,2], ['f_pots',.36,3], ['u_pillar',.48,4], ['t_pillars',.5,3], ['f_skel_sit',.38,2], ['f_sword_grave',.5,2], ['f_rune_stone',.58,2], ['f_altar',.44,2]],
};
// 床から天井まで届く大きな木の幹（古い森）
const AREA_TRUNKS = { forest: 4 };
// エリアの床の小物（engine.js の AREA_PROPS）も調べられるように
for (const [a, L] of Object.entries(AREA_PROPS)) L.forEach((p, k) => { PROP_INFO[`${a}_p${k + 1}`] = [p[0], p[2]]; });
for (const [a, n] of Object.entries(AREA_TRUNKS)) for (let k = 1; k <= n; k++) PROP_INFO[`${a}_t${k}`] = ['大きな木の幹', 'wood'];
async function loadTextures(set) {
  TEX.ready = false;
  const A = Object.assign({}, ASSETS.stone);
  if (AREA_PROPS[set]) for (const k of AREA_FILES) A[k] = `assets/area/${set}/${k}.webp`;
  A.door_bars = A.door_wood;
  LIGHT_MIN = OUTDOOR[set] ? .72 : 0; TEX.area = set;
  const wallImg = await loadImg(A.wall);
  TEX.wall = pix(wallImg, TS, TS);
  TEX.wall2 = A.wall2 ? pix(await loadImg(A.wall2), TS, TS) : TEX.wall;
  TEX.floor = pix(await loadImg(A.floor), 256, 256);
  TEX.ceil = pix(await loadImg(A.ceil), 256, 256);
  for (const k of ['stairs_up', 'stairs_down', 'door_wood', 'door_iron', 'door_bars']) TEX[k] = pix(await loadImg(A[k]), TS, TS);
  TEX.sprite = {};
  for (const k of ['chest', 'chest_open', 'chest_gold', 'chest_gold_open']) { const im = await loadImg(A[k]); TEX.sprite[k] = { w: im.width, h: im.height, px: pix(im, im.width, im.height) }; }
  TEX.deco = {};
  for (const n of DECO_NAMES) {
    const im = await loadImg(A['deco_' + n]);
    for (const fl of [0, 1]) {
      const o = document.createElement('canvas'); o.width = o.height = TS; const g = o.getContext('2d');
      g.drawImage(wallImg, 0, 0, TS, TS); g.imageSmoothingQuality = 'high';
      const [cx, top, sc] = DECO_PLACE[n], w = im.width * sc, h = im.height * sc;
      g.filter = n === 'runes' ? 'grayscale(1) brightness(.55) contrast(1.4)' : 'none';
      g.save(); if (fl) { g.translate(TS, 0); g.scale(-1, 1); } g.drawImage(im, cx - w / 2, top, w, h); g.restore();
      TEX.deco[n + fl] = new Uint32Array(g.getImageData(0, 0, TS, TS).data.buffer);
    }
  }
  // 掘ったときのヒビ（3段階）。画像が届くまでコードで描く
  TEX.crack = [null];
  for (let s = 1; s <= 3; s++) {
    const o = document.createElement('canvas'); o.width = o.height = TS; const g = o.getContext('2d');
    g.strokeStyle = '#000'; g.lineCap = 'round'; let r = 7 + s * 13;
    const rnd = (() => { let q = 99; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 2 + s * 2; i++) {
      let x = TS / 2 + (rnd() - .5) * 8, y = TS / 2 + (rnd() - .5) * 8, a = rnd() * Math.PI * 2, len = TS * (.12 + .1 * s) * (.6 + rnd() * .6);
      g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += (rnd() - .5) * .9; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; g.lineTo(x, y); }
      g.stroke();
    }
    const d = g.getImageData(0, 0, TS, TS).data, m = new Uint8Array(TS * TS);
    for (let i = 0; i < TS * TS; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0;
    TEX.crack.push(m);
  }
  // 装飾（props.js）
  TEX.vein = {};
  if (typeof PROPS !== 'undefined') for (const [k, src] of Object.entries(PROPS)) {
    const im = await loadImg(src);
    if (k[1] === '_' && 'ftu'.includes(k[0])) { TEX.sprite[k] = { w: im.width, h: im.height, px: pix(im, im.width, im.height) }; continue; }
    if (k.startsWith('w_') && WALL_PLACE[k]) {
      const [hh, top] = WALL_PLACE[k], h = hh, w = Math.min(TS - 6, im.width * h / im.height), h2 = im.height * w / im.width, y = top >= 0 ? top : TS + top - h2;
      for (const fl of [0, 1]) {
        const o = document.createElement('canvas'); o.width = o.height = TS; const g = o.getContext('2d');
        g.drawImage(wallImg, 0, 0, TS, TS); g.imageSmoothingQuality = 'high';
        g.save(); if (fl) { g.translate(TS, 0); g.scale(-1, 1); } g.drawImage(im, TS / 2 - w / 2, y, w, h2); g.restore();
        TEX.deco[k + fl] = new Uint32Array(g.getImageData(0, 0, TS, TS).data.buffer);
      }
      continue;
    }
    if (k.startsWith('v_')) {
      const o = document.createElement('canvas'); o.width = o.height = TS; const g = o.getContext('2d');
      g.drawImage(wallImg, 0, 0, TS, TS); const s = Math.min(82 / im.width, 82 / im.height);
      g.drawImage(im, TS / 2 - im.width * s / 2, TS / 2 - im.height * s / 2, im.width * s, im.height * s);
      TEX.vein[k] = new Uint32Array(g.getImageData(0, 0, TS, TS).data.buffer); continue;
    }
    if (/^c_[123]$/.test(k)) { // ヒビの絵があれば、コードのヒビと入れ替える
      const o = document.createElement('canvas'); o.width = o.height = TS; const g = o.getContext('2d'); g.drawImage(im, 4, 4, TS - 8, TS - 8);
      const d = g.getImageData(0, 0, TS, TS).data, m = new Uint8Array(TS * TS); for (let i = 0; i < TS * TS; i++) m[i] = d[i * 4 + 3] > 90 ? 1 : 0;
      TEX.crackImg = TEX.crackImg || [null]; TEX.crackImg[+k[2]] = m;
    }
  }
  if (TEX.crackImg && TEX.crackImg[3]) TEX.crack = TEX.crackImg;
  // エリアの床の小物
  // 空のいちばん下の色（地平線のかすみ）
  { let r = 0, g = 0, b = 0, n = 0; for (let y = 200; y < 256; y++) for (let x = 0; x < 256; x += 4) { const c = TEX.ceil[y * 256 + x]; r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; n++; }
    r = r / n * .75 + 255 * .25; g = g / n * .75 + 255 * .25; b = b / n * .75 + 255 * .25; TEX.haze = 0xff000000 | (b << 16) | (g << 8) | r; }
  for (let k = 1; k <= (AREA_TRUNKS[set] || 0); k++) { const im = await loadImg(`assets/area/${set}/t${k}.webp`); TEX.sprite[`${set}_t${k}`] = { w: im.width, h: im.height, px: pix(im, im.width, im.height) }; }
  if (AREA_PROPS[set]) for (let k = 1; k <= 4; k++) { const im = await loadImg(`assets/area/${set}/p${k}.webp`); TEX.sprite[`${set}_p${k}`] = { w: im.width, h: im.height, px: pix(im, im.width, im.height) }; }
  TEX.ready = true;
}

// ---------- マップ生成 ----------
// セル: 0=床 1=壁 2=上り階段（次の階へ） 3=下り階段（前の階／町へ） 4=木の扉 5=鉄の扉（ボス部屋）
// 階段と扉は「壁の1面」として描く。2〜5は通れない（扉は開けると床になる）
const SOLID = c => c === 1 || c === 2 || c === 3 || c === 4 || c === 5;
// 6=木など、床に立つ物（光線は通すが、歩いては通れない）
const BLOCK = c => SOLID(c) || c === 6;
// seed: 塔に入るたびに変わる（塔は生きていて、入るたびに中が組み変わる）。節目の階は固定
function genFloor(floor, seed) {
  const R = rng(floor * 7919 + 17 + (seed || 0) * 104729);
  const N = Math.min(31, 13 + floor * 2) | 1; // 低層は小さく、上ほど広く
  const M = Array.from({ length: N }, () => Array(N).fill(1));
  const rooms = [];
  const tries = 6 + floor * 2;
  for (let t = 0; t < tries * 4 && rooms.length < tries; t++) {
    const w = 2 + Math.floor(R() * 3), h = 2 + Math.floor(R() * 3);
    const x = 1 + Math.floor(R() * (N - w - 2)), y = 1 + Math.floor(R() * (N - h - 2));
    if (rooms.some(r => x <= r.x + r.w && x + w >= r.x && y <= r.y + r.h && y + h >= r.y)) continue;
    rooms.push({ x, y, w, h });
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) M[j][i] = 0;
  }
  const c = r => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
  for (let k = 1; k < rooms.length; k++) {
    let [x0, y0] = c(rooms[k - 1]); const [x1, y1] = c(rooms[k]);
    if (R() < .5) { while (x0 !== x1) { M[y0][x0] = 0; x0 += Math.sign(x1 - x0); } while (y0 !== y1) { M[y0][x0] = 0; y0 += Math.sign(y1 - y0); } }
    else { while (y0 !== y1) { M[y0][x0] = 0; y0 += Math.sign(y1 - y0); } while (x0 !== x1) { M[y0][x0] = 0; x0 += Math.sign(x1 - x0); } }
    M[y1][x1] = 0;
  }
  // 階段: 最初の部屋の壁に下り階段、いちばん遠い部屋の壁に上り階段
  const [sx0, sy0] = c(rooms[0]);
  let best = rooms[1] || rooms[0], bd = -1;
  for (const r of rooms) { const [x, y] = c(r), d = Math.abs(x - sx0) + Math.abs(y - sy0); if (d > bd) { bd = d; best = r; } }
  // 部屋のふちの壁から、外側も壁で囲まれている場所を選ぶ（行き止まりの壁に階段を作る）
  function stairWall(r, val) {
    const cand = [];
    for (let i = r.x; i < r.x + r.w; i++) { cand.push([i, r.y - 1, i, r.y, 0, 1]); cand.push([i, r.y + r.h, i, r.y + r.h - 1, 0, -1]); }
    for (let j = r.y; j < r.y + r.h; j++) { cand.push([r.x - 1, j, r.x, j, 1, 0]); cand.push([r.x + r.w, j, r.x + r.w - 1, j, -1, 0]); }
    const ok = cand.filter(([wx, wy]) => wx > 0 && wy > 0 && wx < N - 1 && wy < N - 1 && M[wy][wx] === 1);
    const pick = ok.length ? ok[Math.floor(R() * ok.length)] : cand[0];
    M[pick[1]][pick[0]] = val; return pick; // [壁x, 壁y, 前のマスx, 前のマスy, 部屋に向く向きdx, dy]
  }
  const down = stairWall(rooms[0], 3), up = stairWall(best, 2);
  const sx = down[2], sy = down[3];
  // 扉: 部屋の出入り口（部屋のすぐ外の通路）に、ときどき木の扉
  const inRoom = (x, y) => rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (M[y][x] !== 0 || inRoom(x, y)) continue;
    const h = M[y][x - 1] !== 1 && M[y][x + 1] !== 1 && M[y - 1][x] === 1 && M[y + 1][x] === 1;
    const v = M[y - 1][x] !== 1 && M[y + 1][x] !== 1 && M[y][x - 1] === 1 && M[y][x + 1] === 1;
    const nearRoom = inRoom(x - 1, y) || inRoom(x + 1, y) || inRoom(x, y - 1) || inRoom(x, y + 1);
    if ((h || v) && nearRoom && R() < .45) M[y][x] = 4;
  }
  // 10階: 上り階段の部屋の入口を鉄の扉に
  if (floor === 10) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (M[y][x] !== 0 && M[y][x] !== 4) continue; if (x >= best.x && x < best.x + best.w && y >= best.y && y < best.y + best.h) continue;
    if ([[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => { const X = x + a, Y = y + b; return X >= best.x && X < best.x + best.w && Y >= best.y && Y < best.y + best.h; })) M[y][x] = 5;
  }
  // 宝箱: 部屋の中にいくつか（最初の部屋以外）
  // 宝箱は、床の小物と同じく部屋のふち（外側が壁）に置いて、通れないようにする（M=6）。下で置く
  const chests = [];
  // 壁の飾りとたいまつ
  const face = {}, torches = [], area = typeof areaOf === 'function' ? areaOf(floor)[1] : 'stone', outdoor = !!OUTDOOR[area];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (M[y][x] !== 1) continue;
    for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ox = x + nx, oy = y + ny;
      if (!M[oy] || M[oy][ox] === undefined || SOLID(M[oy][ox])) continue;
      const r = hash(x * 7 + nx, y * 7 + ny, floor * 31 + 21 + (seed || 0));
      let v = null;
      if (!outdoor && r < .10) { v = 'torch'; torches.push([x + .5 + nx * .55, y + .5 + ny * .55]); }
      else if (area !== 'stone') { if (r < .34) face[x + ',' + y + ',' + nx + ',' + ny] = 'wall2'; continue; }  // 石のダンジョン以外は、2種類の壁を混ぜる
      else if (r < .16) { face[x + ',' + y + ',' + nx + ',' + ny] = 'wall2'; continue; }
      else if (r < .26) {
        const useNew = typeof PROPS !== 'undefined' && hash(x, y, floor + 77) < .55;
        const k = useNew ? (floor >= 6 && hash(y, x, floor + 5) < .5 ? WALL_SET_B : WALL_SET_A) : DECO_NAMES.filter(n => n !== 'torch');
        v = k[Math.floor(hash(x, y, nx * 3 + ny + 40 + floor) * k.length)];
      }
      if (v) face[x + ',' + y + ',' + nx + ',' + ny] = v + (hash(y, x, nx + ny + 9) < .5 ? 0 : 1);
    }
  }
  // たいまつの明かりを、1マス4分割の細かさで先に計算しておく（iPhoneで軽くするため）
  const G = N * 4, wm = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = (i + .5) / 4, y = (j + .5) / 4; let w = 0;
    for (const [tx, ty] of torches) { const d2 = (x - tx) ** 2 + (y - ty) ** 2; if (d2 < 30) w += 1 / (1 + d2 * 3.5); }
    wm[j * G + i] = Math.min(1, w * .5);
  }
  // 鉱脈: 部屋や通路に面した壁のところどころ（外周と節目の階はなし）
  const vein = {};
  if (typeof PROPS !== 'undefined' && floor !== 10) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (M[y][x] !== 1 || !([[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => M[y + b][x + a] === 0)) || R() > .04) continue;
    const sum = VEINS_STONE.reduce((s, v) => s + v[1], 0); let q = R() * sum;
    for (const [n, w] of VEINS_STONE) if ((q -= w) < 0) { vein[x + ',' + y] = n; break; }
  }
  // 床の小物: 部屋のふち（外側が壁で、出入り口でないマス）に置く。通れなくなる（M=6）。調べられる
  const props = [];
  const used = new Set(); used.add(sx + ',' + sy); used.add(up[2] + ',' + up[3]);
  // 部屋のふちのマス（外側がすべて壁で、となりに置いた物がない）を探す
  // 通れるマス（床と扉）が、ぜんぶ下り階段の前からつながっているか
  const allReach = () => {
    let total = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = M[j][i]; if (v === 0 || v === 4 || v === 5) total++; }
    const seen = new Uint8Array(N * N), q = [sx + sy * N]; seen[q[0]] = 1; let n = 0;
    while (q.length) { const k = q.pop(), x = k % N, y = (k - x) / N; n++;
      for (const [a, b] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x + a, Y = y + b; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const v = M[Y][X], kk = X + Y * N; if (!seen[kk] && (v === 0 || v === 4 || v === 5)) { seen[kk] = 1; q.push(kk); } } }
    return n === total;
  };
  const edgeCell = r => {
    for (let tries = 0; tries < 14; tries++) {
      const x = r.x + Math.floor(R() * r.w), y = r.y + Math.floor(R() * r.h); if (used.has(x + ',' + y) || M[y][x] !== 0) continue;
      const edgeDirs = [[1,0],[-1,0],[0,1],[0,-1]].filter(([a, b]) => { const X = x + a, Y = y + b; return !(X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h); });
      if (!edgeDirs.length || edgeDirs.some(([a, b]) => M[y + b][x + a] !== 1)) continue;
      if ([[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => used.has((x + a) + ',' + (y + b)))) continue;
      if (x === sx && y === sy) continue;
      M[y][x] = 6; const ok = allReach(); M[y][x] = 0; if (!ok) continue;  // 置くと行けない場所ができるなら置かない
      return [x, y];
    }
    return null;
  };
  for (const r of rooms.slice(1)) if (R() < (TODAY.chest || .35)) { const c = edgeCell(r); if (c) { chests.push({ x: c[0], y: c[1], gold: R() < .15, open: false }); M[c[1]][c[0]] = 6; used.add(c[0] + ',' + c[1]); } }
  if (typeof PROPS !== 'undefined') {
    const own = (AREA_PROPS[area] || []).map((p, k) => [`${area}_p${k + 1}`, p[1], area === 'stone' ? 6 : 10]);
    const table = (area === 'stone' ? own.concat(FLOOR_PROPS_STONE, floor >= 6 ? FLOOR_PROPS_DEEP : []) : own).concat(AREA_EXTRA[area] || []), tw = table.reduce((s, p) => s + p[2], 0);
    // 古い森: 部屋のふちに大きな木の幹を立てる（天井まで届く）。小物は少しだけ
    const nt = AREA_TRUNKS[area] || 0;
    if (nt) for (const r of rooms) {
      const m = r.w * r.h >= 16 ? 2 + (R() < .5) : r.w * r.h >= 9 ? 1 + (R() < .5) : (R() < .5 ? 1 : 0);
      for (let k = 0, tries = 0; k < m && tries < 6; tries++) {
        const c = edgeCell(r); if (!c) continue; const [x, y] = c;
        props.push({ key: `${area}_t${1 + Math.floor(R() * nt)}`, size: .94, x: x + .5, y: y + .5, cx: x, cy: y }); M[y][x] = 6; used.add(x + ',' + y); k++;
      }
    }
    for (const r of rooms) {
      const n = (r.w >= 4 && r.h >= 4 && R() < .35 ? 2 : 1) * (R() < (nt ? .35 : .45) ? 1 : 0);
      for (let k = 0, tries = 0; k < n && tries < 4; tries++) {
        const c = edgeCell(r); if (!c) continue; const [x, y] = c;
        let q = R() * tw, pick = table[0]; for (const p of table) if ((q -= p[2]) < 0) { pick = p; break; }
        props.push({ key: pick[0], size: pick[1], x: x + .5, y: y + .5, cx: x, cy: y }); M[y][x] = 6; used.add(x + ',' + y); k++;
      }
    }
  }
  return { N, M, vein, props, start: [sx, sy], startDir: [down[4], down[5]], upFront: [up[2], up[3]], upDir: [up[4], up[5]], face, torches, wm, G, chests, seen: Array.from({ length: N }, () => Array(N).fill(0)) };
}

// ---------- 描画 ----------
const VIEW = { buf: null, img: null };
// 遠くほど空のかすみ色に近づける（外のエリア）
function fogC(col, h, f) {
  if (f <= 0) return col; const g = 1 - f;
  return 0xff000000 | ((((col >> 16) & 255) * g + ((h >> 16) & 255) * f) << 16) | ((((col >> 8) & 255) * g + ((h >> 8) & 255) * f) << 8) | ((col & 255) * g + (h & 255) * f);
}
function shadeW(col, k, w) {
  const r = col & 255, g = (col >> 8) & 255, b = (col >> 16) & 255;
  return 0xff000000 | (Math.min(255, b * (k * .82 + w * .28)) << 16) | (Math.min(255, g * (k * .9 + w * .62)) << 8) | Math.min(255, r * (k + w * 1.05));
}
function lightAt(d, t) { const f = 1 + Math.sin(t / 90) * .04 + Math.sin(t / 37) * .03; return Math.max(LIGHT_MIN / (1 + d * .06), Math.min(1.25, 1.35 * f / (1 + d * d * .09))); }
let FLICK = 1;
function warmAt(F, x, y) { const i = Math.floor(x * 4), j = Math.floor(y * 4); if (i < 0 || j < 0 || i >= F.G || j >= F.G) return 0; return F.wm[j * F.G + i] * FLICK; }

function renderView(ctx, F, P, t, dim) {
  if (!VIEW.img) { VIEW.img = ctx.createImageData(VW, VH); VIEW.buf = new Uint32Array(VIEW.img.data.buffer); }
  const buf = VIEW.buf, M = F.M, N = F.N;
  const dx = Math.cos(P.a), dy = Math.sin(P.a), px = -dy * .66, py = dx * .66;
  const D = dim || 1; FLICK = 1 + Math.sin(t / 70) * .06 + Math.sin(t / 29) * .04;
  const OUT = !!SKY[TEX.area], HZ = TEX.haze || 0xffcccccc;
  // 外のエリア: 空は天井ではなく、遠くに広がる空として描く（向きに合わせて横に流れる）。地平線に近いほどかすむ
  if (OUT) {
    for (let x = 0; x < VW; x++) {
      const cam = 2 * x / VW - 1, a = P.a + Math.atan(cam * .66), u = (Math.floor(a / (Math.PI * 2) * 256 * 3) % 256 + 256) % 256;
      for (let y = 0; y <= VH / 2; y++) { const v = Math.floor(y / (VH / 2) * 210); const f = Math.max(0, (y - VH * .3) / (VH * .2)); buf[y * VW + x] = fogC(TEX.ceil[v * 256 + u], HZ, f * f * .85); }
    }
  }
  // 床と天井
  for (let y = VH / 2 + 1; y < VH; y++) {
    const rd = (VH / 2) / (y - VH / 2), lx = dx - px, ly = dy - py, rx = dx + px, ry = dy + py;
    const sx = rd * (rx - lx) / VW, sy = rd * (ry - ly) / VW; let fx = P.x + rd * lx, fy = P.y + rd * ly;
    const L = lightAt(rd, t) * D;
    for (let x = 0; x < VW; x++) {
      const W = warmAt(F, fx, fy) * D;
      const u = (fx * 128) & 255, v = (fy * 128) & 255;
      const fc = TEX.floor[v * 256 + u];
      if (OUT) { buf[y * VW + x] = fogC(shadeW(fc, L * .92, W), HZ, Math.min(.8, rd / 14)); }
      else { buf[y * VW + x] = shadeW(fc, L * .92, W); buf[(VH - y) * VW + x] = shadeW(TEX.ceil[v * 256 + u], L, W * .8); }
      fx += sx; fy += sy;
    }
  }
  // 壁
  for (let x = 0; x < VW; x++) {
    const cam = 2 * x / VW - 1, rx = dx + px * cam, ry = dy + py * cam;
    let mx = Math.floor(P.x), my = Math.floor(P.y);
    const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry); let sx, sy, sdx, sdy, side = 0, hit = false;
    if (rx < 0) { sx = -1; sdx = (P.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - P.x) * ddx; }
    if (ry < 0) { sy = -1; sdy = (P.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - P.y) * ddy; }
    for (let i = 0; i < 64; i++) { if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; } if (mx < 0 || my < 0 || mx >= N || my >= N || SOLID(M[my][mx])) { hit = true; break; } }
    if (!hit) { ZB[x] = 99; continue; }
    const dist = side ? (my - P.y + (1 - sy) / 2) / ry : (mx - P.x + (1 - sx) / 2) / rx, lh = VH / Math.max(.05, dist);
    let wx = side ? P.x + dist * rx : P.y + dist * ry; wx -= Math.floor(wx);
    let tx = Math.floor(wx * TS); if ((!side && rx < 0) || (side && ry > 0)) tx = TS - 1 - tx;
    const nx = side ? 0 : -sx, ny = side ? -sy : 0, fk = F.face[mx + ',' + my + ',' + nx + ',' + ny];
    const cell = (M[my] && M[my][mx]) || 1;
    const vk = cell === 1 && F.vein ? F.vein[mx + ',' + my] : null;
    const tex = cell === 2 ? TEX.stairs_up : cell === 3 ? TEX.stairs_down : cell === 4 ? TEX.door_wood : cell === 5 ? TEX.door_iron : vk && TEX.vein[vk] ? TEX.vein[vk] : fk === 'wall2' ? TEX.wall2 : fk && TEX.deco[fk] ? TEX.deco[fk] : TEX.wall;
    ZB[x] = dist;
    const ck = cell === 1 && F.crack ? F.crack[mx + ',' + my] : 0, cm = ck ? TEX.crack[ck] : null;
    const isT0 = cell === 1 && !vk && fk && fk.startsWith('torch'), isT = isT0, tip = isT ? TORCH_TIP[+fk.endsWith('1')] : 0;
    // 外のエリアの壁は崖のように高く、上のふちはでこぼこにして、遠いほどかすむ
    const jag = OUT ? (Math.sin((mx * 7.1 + my * 3.7) + tx * .035) * .6 + Math.sin(tx * .09 + mx + my * 2) * .4) : 0;
    const top = OUT ? VH / 2 - lh * (1.15 + jag * .12) : VH / 2 - lh / 2, fogF = OUT ? Math.min(.8, dist / 14) : 0;
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(VH, Math.ceil(VH / 2 + lh / 2));
    const L = lightAt(dist, t) * (side ? .78 : 1) * D;
    const W = warmAt(F, P.x + dist * rx - nx * .02, P.y + dist * ry - ny * .02) * (side ? .8 : 1) * D;
    for (let y = y0; y < y1; y++) {
      const above = y < VH / 2 - lh / 2, ty = Math.floor((y - (VH / 2 - lh / 2)) / lh * TS) & (TS - 1);
      if (isT && ty > 14 && ty < 42) { // たいまつの炎
        const fx2 = (tx - tip) / 7, fy2 = (42 - ty) / 26, fl = Math.sin(t / 60 + ty * .7) * .25 + Math.sin(t / 23 + ty) * .15, wd = (1 - fy2) * (1 + fl * .6);
        if (fy2 > 0 && Math.abs(fx2 + fl * fy2 * 1.2) < wd) {
          const core = 1 - Math.abs(fx2) / wd, gg = Math.min(255, 120 + core * 120 + (1 - fy2) * 60) * D, bb = Math.min(255, 30 + core * core * 150 * (1 - fy2)) * D;
          buf[y * VW + x] = 0xff000000 | (bb << 16) | (gg << 8) | (255 * D); continue;
        }
      }
      if (OUT) {
        // 扉や階段の上は、ふつうの壁。上のふちに近いほど、空のかすみに溶ける
        const t2 = above ? (fk === 'wall2' ? TEX.wall2 : TEX.wall) : tex, edge = Math.max(0, 1 - (y - top) / (lh * .45));
        buf[y * VW + x] = fogC(shadeW(!above && cm && cm[ty * TS + tx] ? 0xff141210 : t2[ty * TS + tx], L * (above ? .95 : 1), W), HZ, Math.min(.9, fogF + edge * edge * .55));
        continue;
      }
      buf[y * VW + x] = shadeW(cm && cm[ty * TS + tx] ? 0xff141210 : tex[ty * TS + tx], L, W);
    }
  }
  // 宝箱（床に置く絵）
  const list = (F.chests || []).map(ch => ({ key: (ch.gold ? 'chest_gold' : 'chest') + (ch.open ? '_open' : ''), size: .42 * TEX.sprite[ch.gold ? 'chest_gold' : 'chest'].h / 90, x: ch.x + .5, y: ch.y + .5 }));
  for (const p of F.props || []) list.push({ key: p.key, size: p.size, x: p.x, y: p.y });
  const sprites = list.map(o => ({ ...o, d: (o.x - P.x) ** 2 + (o.y - P.y) ** 2 })).sort((a, b) => b.d - a.d);
  const inv = 1 / (px * dy - dx * py);
  for (const o of sprites) {
    const rxs = o.x - P.x, rys = o.y - P.y, tX = inv * (dy * rxs - dx * rys), tY = inv * (-py * rxs + px * rys);
    if (tY < .2) continue;
    const S = TEX.sprite[o.key]; if (!S) continue;
    const scrX = Math.floor(VW / 2 * (1 + tX / tY)), cellH = VH / tY, h = cellH * o.size, w = h * S.w / S.h;
    const yb = VH / 2 + cellH / 2 - cellH * .06, yt = yb - h, x0 = Math.floor(scrX - w / 2);
    const L = lightAt(tY, t) * D, W = warmAt(F, o.x, o.y) * D;
    for (let x = Math.max(0, x0); x < Math.min(VW, x0 + w); x++) {
      if (ZB[x] < tY) continue; const u = Math.floor((x - x0) / w * S.w);
      for (let y = Math.max(0, Math.floor(yt)); y < Math.min(VH, yb); y++) {
        const v = Math.floor((y - yt) / h * S.h), col = S.px[v * S.w + u];
        if ((col >>> 24) < 128) continue; buf[y * VW + x] = shadeW(col, L, W);
      }
    }
  }
  ctx.putImageData(VIEW.img, 0, 0);
}
const ZB = new Float32Array(VW);

// ---------- オートマップ ----------
function renderMap(ctx, F, P) {
  const N = F.N, s = Math.floor(64 / N) || 1, o = Math.floor((64 - s * N) / 2);
  ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!F.seen[y][x]) continue; const c = F.M[y][x];
    ctx.fillStyle = c === 1 ? '#5a4a3c' : c === 2 ? '#ffc069' : c === 3 ? '#5fb0e6' : c === 4 || c === 5 ? '#c07a3a' : c === 6 ? '#3f6a32' : '#b8a68c';
    ctx.fillRect(o + x * s, o + y * s, s, s);
  }
  for (const ch of F.chests || []) if (F.seen[ch.y][ch.x] && !ch.open) { ctx.fillStyle = '#ffe14a'; ctx.fillRect(o + ch.x * s, o + ch.y * s, s, s); }
  const cx = o + (P.x) * s, cy = o + (P.y) * s, a = P.a;
  ctx.fillStyle = '#ff5a3d'; ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * s * 1.2, cy + Math.sin(a) * s * 1.2);
  ctx.lineTo(cx + Math.cos(a + 2.5) * s * .8, cy + Math.sin(a + 2.5) * s * .8);
  ctx.lineTo(cx + Math.cos(a - 2.5) * s * .8, cy + Math.sin(a - 2.5) * s * .8); ctx.fill();
}
function reveal(F, x, y) { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (F.seen[y + j] && F.seen[y + j][x + i] !== undefined) F.seen[y + j][x + i] = 1; }
