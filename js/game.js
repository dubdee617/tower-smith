// 塔の鍛冶屋 — ゲーム本体（町・探索・戦闘・セーブ）

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), mapCv = $('map'), mapCtx = mapCv.getContext('2d');
const R = Math.random;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const SKILL_MAX = 6;  // 塔に持ち込める技の数（2026-11-24 に10個から変更）

// ---------- 状態 ----------
const NEW_GAME = () => ({
  lv: 1, exp: 0, hp: 40, mhp: 40, atk: 3, def: 2,
  gold: 30, bank: 0,
  carry: {},           // 塔の中で持っている素材（倒れると失う）
  store: {},           // 工房に置いてある素材（安全）
  raw: {},             // 持ち帰った戦利品（まだ加工していない。ギルドで加工＋報酬）
  injuries: [],        // ケガ（治療院でしか治らない）
  bless: null,         // 治療院の祝福（次の1回の挑戦だけ）
  treated: 0,          // エリーにケガを治してもらった回数
  aff: { jenny: 0, elly: 0, ria: 0, fuuka: 0, jin: 0 },  // 親密度
  talkIdx: {},         // 次に話す話題
  talkRun: {},         // 最後に話した回（塔から戻るたびに1回話せる）
  runs: 0,             // 塔に挑んだ回数
  seen: {},            // 一度起きた親密度イベント
  ally: null,          // 一緒に戦ってくれる人 { id, left }
  castle: false,       // お城に行けるか（50階に着いて生きて戻ると手紙が届く）
  warps: [],           // 女神の像からワープできる階（女神に会ったエリアの最初の階）
  als: false,          // アルスを冒険に誘ったか（1〜10階だけ一緒に来て、たまに攻撃してくれる）
  bandaged: [],        // 包帯で一時的に治しているケガ（町に戻ると元に戻る）
  enc: null,           // 魔除け・魔寄せ { k, floors }
  items: { herb: 3, herb_m: 0, herb_l: 0, wing: 1, bandage: 0, bird: 0, ward: 0, lure: 0, guide: 0 },
  gear: [{ uid: 1, id: 'old_hammer', name: '古い槌', type: 'hammer', atk: 4 }],
  equip: { r: 1, l: null, armor: null, tool: null },  // tool: 地形を変えるツール（1つだけ）
  uidNext: 2,
  maxFloor: 1,
  bossDown: false,
  prof: {},            // 武器の熟練度（その武器を持って勝った回数）
  jobWins: {},         // ジョブごとの勝利数（技を覚える）
  learned: [],         // 覚えた技とパッシブ
  loadout: { skills: [], passives: [] }, // 塔に持ち込む技（6個まで）とパッシブ（3つまで）
  runHp: 0,
  upperPick: {},      // 同じ武器で上級職が2つ以上あるとき、どれになるか
});
let G = load() || NEW_GAME();
{ const d = NEW_GAME(); for (const k of ['prof', 'jobWins', 'learned', 'loadout', 'runHp', 'upperPick', 'raw', 'injuries', 'bless', 'treated', 'aff', 'talkIdx', 'talkRun', 'runs', 'ally', 'castle', 'bandaged', 'enc', 'als', 'warps', 'seen']) if (G[k] === undefined) G[k] = d[k]; }
for (const k of Object.keys(ITEMS)) if (G.items[k] === undefined) G.items[k] = 0;
if (G.equip.tool === undefined) G.equip.tool = null;
// 古いセーブの読み替え（ワンド→魔導書、なくなった技やジョブ）
for (const x of G.gear) if (x.type === 'wand') { x.type = 'book'; x.name = x.name.replace('ワンド', '魔導書'); }
if (G.prof.wand) { G.prof.book = (G.prof.book || 0) + G.prof.wand; delete G.prof.wand; }
G.learned = G.learned.filter(id => SKILLS[id] || PASSIVES[id]);
G.loadout.skills = G.loadout.skills.filter(id => SKILLS[id]); G.loadout.passives = G.loadout.passives.filter(id => PASSIVES[id]);
if (!G.rumor) G.rumor = 'normal';
let mode = 'town', sub = 'main';
let F = null, floorNo = 1, P = { x: 0, y: 0, a: 0 }, T = { x: 0, y: 0, a: 0 }, dir = 0, busy = false, steps = 0;
let B = null; // 戦闘
let fx = { shake: 0, flash: 0, hit: 0 };

// ---------- 設定とセーブ（2026-11-24） ----------
// オートセーブ: tower_smith_v2（いつも最新）。手動のセーブ: スロット1〜3
const OPT_DEF = { bgm: 1, sfx: 1, text: 1, shake: 2, auto: true, lang: I18N.on ? 1 : 0 };
let OPTS = (() => { try { return Object.assign({}, OPT_DEF, JSON.parse(localStorage.getItem('tower_opts') || '{}')); } catch (e) { return { ...OPT_DEF }; } })();
function saveOpts() { try { localStorage.setItem('tower_opts', JSON.stringify(OPTS)); } catch (e) {} }
function save() {
  if (OPTS.auto === false) return;
  try { localStorage.setItem('tower_smith_v2', JSON.stringify(G)); } catch (e) {}
  // 町に戻ったときなど、ときどき「オートセーブ」と小さく出す
  const now = Date.now(); if (mode === 'town' && now - (save.shown || 0) > 20000) { save.shown = now; const e = document.createElement('div'); e.className = 'autosaved'; e.textContent = 'オートセーブ'; document.body.appendChild(e); setTimeout(() => e.remove(), 1800); }
}
const SLOT_KEY = n => 'tower_smith_slot' + n;
function slotInfo(n) { try { const s = JSON.parse(localStorage.getItem(n === 0 ? 'tower_smith_v2' : SLOT_KEY(n)) || 'null'); if (!s) return null; const g = s.G || s; return { g, at: s.at || 0 }; } catch (e) { return null; } }
function slotText(n) { const i = slotInfo(n); if (!i) return 'からっぽ'; const g = i.g, d = i.at ? new Date(i.at) : null; return `${g.name && g.name !== '鍛冶屋' ? g.name + '・' : ''}Lv${g.lv}・最高${g.maxFloor || 0}階・${g.gold}G${d ? `　${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : ''}`; }
function load() { try { const s = localStorage.getItem('tower_smith_v2'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// ---------- 計算 ----------
const gearBy = uid => G.gear.find(g => g.uid === uid);
const has = p => G.loadout.passives.includes(p);
// ジョブ: 持っている武器（右手。なければ左手の武器）で基本職。
// 上級職: その武器の熟練＋別の武器の熟練（経験）が足りると進化する
function mainWeapon() { const r = gearBy(G.equip.r), l = gearBy(G.equip.l); if (r && r.type !== 'shield') return r; if (l && l.type !== 'shield' && l.type !== 'armor') return l; return null; }
function hasShield() { const l = gearBy(G.equip.l), r = gearBy(G.equip.r); return (l && l.type === 'shield') || (r && r.type === 'shield'); }
function upperReady(u) { return (G.prof[u.hold] || 0) >= UPPER_NEED.hold && (G.prof[u.exp] || 0) >= UPPER_NEED.exp; }
function uppersFor(type) { return UPPERS.filter(u => u.hold === type && upperReady(u)); }
function topReady(u) {
  if ((G.prof[u.hold] || 0) < u.prof) return false;
  if (u.wins && Object.entries(u.wins).some(([j, n]) => (G.jobWins[j] || 0) < n)) return false;
  if (u.uppers && UPPERS.filter(x => (G.jobWins[x.job] || 0) >= 30).length < u.uppers) return false;
  return true;
}
function job() {
  const w = mainWeapon(); if (!w) return '素手';
  { const tp = TOPS.find(u => u.hold === w.type && topReady(u)); if (tp && G.upperPick[w.type] !== '-top') return tp.job; }
  const ups = uppersFor(w.type);
  if (ups.length) { const pick = ups.find(u => u.job === G.upperPick[w.type]); return (pick || ups.sort((a, b) => (G.prof[b.exp] || 0) - (G.prof[a.exp] || 0))[0]).job; }
  return WEAPON_TYPES[w.type].job;
}
const isHeavy = () => { const w = mainWeapon(); return !!(w && WEAPON_TYPES[w.type].heavy); };
const canOneHand = t => (G.prof[t] || 0) >= ONE_HAND_NEED;
// 名品の効果: 持っている装備（右手・左手・鎧）の効果を合わせる
function MK() { const o = {}; for (const k of ['r', 'l', 'armor']) { const g = gearBy(G.equip[k]); if (g && g.mk) for (const [a, v] of Object.entries(g.mk)) o[a] = typeof v === 'number' && typeof o[a] === 'number' ? o[a] + v : v; } return o; }
// 属性の相性: 炎→氷・毒（草木） 氷→炎 雷→鳥や水・竜 聖→闇 闇→精霊
const ELEM_WEAK = { fire: ['ice', 'poison'], ice: ['fire', 'breath'], bolt: ['bite', 'breath'], holy: ['dark'], dark: ['magic'] };
const isDarkMon = m => monAtkKind(m) === 'dark' || /skeleton|ghost|zombie|mummy|lich|bone|undead|wraith/.test(m.id);
function weaponMult(m) {
  const k = MK(); let x = 1;
  if (k.elem && (ELEM_WEAK[k.elem] || []).includes(monAtkKind(m))) x *= 1.5;
  if (k.slay === 'dark' && isDarkMon(m)) x *= k.slayMul; if (k.slay === 'dragon' && /dragon|wyvern|drake/.test(m.id)) x *= k.slayMul;
  if (k.moon && G.hp < G.mhp / 2) x *= 1.5;
  return x;
}
function atkPower() {
  let a = G.atk; const r = gearBy(G.equip.r), l = gearBy(G.equip.l);
  if (r && r.atk) a += r.atk;
  if (l && l.atk) a += l.type === 'shield' ? l.atk : Math.ceil(l.atk * .5); // 左手の武器は半分
  if (has('p_atk')) a += 3;
  if (hurt('arm')) a = Math.floor(a * .8);
  return a;
}
function defPower() { let d = G.def; for (const k of ['r', 'l', 'armor']) { const g = gearBy(G.equip[k]); if (g && g.def) d += g.def; } if (has('p_def')) d += 3; return d; }
// そのジョブで覚える技のうち、勝利数が足りたものを覚える
// 勝ち数はもう足りているのに覚えていない技（あとから足した技など）を、まとめて覚える
function relearnAll(quiet) {
  const got = []; for (const j of Object.keys(G.jobWins || {})) got.push(...checkLearn(j, true));
  if (got.length && !quiet) log(`新しく覚えた: ${got.map(id => (SKILLS[id] || PASSIVES[id]).name).join('・')}`);
  if (got.length) save(); return got;
}
function checkLearn(j, quiet) {
  const J = JOBS[j]; if (!J) return [];
  const got = [];
  for (const [n, id] of J.learn) if ((G.jobWins[j] || 0) >= n && !G.learned.includes(id)) {
    G.learned.push(id); got.push(id);
    if (SKILLS[id] && G.loadout.skills.length < SKILL_MAX) G.loadout.skills.push(id);
    if (PASSIVES[id] && G.loadout.passives.length < PASSIVE_SLOTS) G.loadout.passives.push(id);
  }
  if (got.length && !quiet) log(`${j}の${got.map(id => (SKILLS[id] || PASSIVES[id]).name).join('・')}を覚えた！`);
  return got;
}
checkLearn(job(), true);
const expNeed = () => Math.floor(10 * Math.pow(G.lv, 2));  // 2026-11-25: 1.5乗→2乗（レベルが上がりすぎた）
const matText = o => Object.entries(o).filter(([, n]) => n > 0).map(([k, n]) => NAMES[k] + n).join(' ') || 'なし';
function add(o, k, n) { o[k] = (o[k] || 0) + n; if (o === G.carry && n > 0 && mode !== 'town') gotToast(k, n); }
// ---------- アイテムのアイコン（2026-11-24。assets/icon） ----------
const ICON_KEYS = new Set(['silver', 'mithril', 'orichalcum', 'ore_silver', 'ore_mithril', 'ore_orichalcum', 'darksteel', 'dragonbone', 'dragon_bone'].concat(["bandage", "beast_fang", "beast_pelt", "bird", "bone", "copper", "cursed_bone", "cursed_gold", "dark_steel", "dim_stone", "ember_stone", "feather", "golem_core", "hard_shell", "herb", "herb_l", "herb_m", "ice_shard", "iron", "iron_shell", "leather", "log", "lure", "old_cloth", "old_wood", "ore_copper", "ore_iron", "rat_hide", "raw_gem", "rock_core", "rubble", "sand_find", "scale", "spider_silk", "spore", "star_dust", "stone", "w_armor", "w_axe", "w_book", "w_bow", "w_dagger", "w_greatsword", "w_hammer", "w_katana", "w_pick", "w_shield", "w_shovel", "w_staff", "w_sword", "ward", "wing", "wood", "worm_gem"]));
const TOOL_ICON = { pick: 'w_pick', axe: 'w_axe', shovel: 'w_shovel' };
function iconOf(k) {
  if (k === 'gold') return typeof UI_ICON !== 'undefined' ? UI_ICON.coin : '';
  if (ICON_KEYS.has(k)) return `assets/icon/${k}.webp`;
  const r = RECIPES.find(x => x.id === k); if (r) return iconOfType(r);
  return '';
}
// 装備ひとつずつの絵（assets/gear）があれば、それを使う
const GEAR_IMG = new Set(["bone_bow", "bone_dagger", "bone_staff", "copper_axe", "copper_hammer", "copper_pick", "copper_shield", "copper_sword", "darksteel_armor", "darksteel_axe", "darksteel_book", "darksteel_bow", "darksteel_dagger", "darksteel_greatsword", "darksteel_hammer", "darksteel_katana", "darksteel_shield", "darksteel_staff", "darksteel_sword", "dragon_armor", "dragon_axe", "dragon_book", "dragon_bow", "dragon_dagger", "dragon_greatsword", "dragon_hammer", "dragon_katana", "dragon_shield", "dragon_staff", "dragon_sword", "iron_armor", "iron_axe", "iron_great", "iron_hammer", "iron_katana", "iron_shield", "iron_sword", "leather_armor", "lumber_axe", "mithril_armor", "mithril_axe", "mithril_book", "mithril_bow", "mithril_dagger", "mithril_greatsword", "mithril_hammer", "mithril_katana", "mithril_shield", "mithril_staff", "mithril_sword", "mk_blood_dagger", "mk_bolt_dagger", "mk_charge_great", "mk_cleaver", "mk_crescent", "mk_cursed_katana", "mk_dark_great", "mk_dragon_spear", "mk_earth_hammer", "mk_exec_axe", "mk_fists", "mk_flame_sword", "mk_frost_bow", "mk_g_desert", "mk_g_druid", "mk_g_forest", "mk_g_ice", "mk_g_mountain", "mk_gale_katana", "mk_giant_axe", "mk_gold_axe", "mk_guard_great", "mk_heal_hammer", "mk_holy_staff", "mk_ice_katana", "mk_judge_great", "mk_lava_axe", "mk_life_book", "mk_light_dagger", "mk_luck_staff", "mk_mirror_shield", "mk_moon_katana", "mk_nameless", "mk_oni_club", "mk_rock_armor", "mk_rusty_sword", "mk_shadow_knife", "mk_smith_hammer", "mk_snake_sword", "mk_snipe_bow", "mk_soul_staff", "mk_star_sword", "mk_storm_sword", "mk_sun_great", "mk_swallow_bow", "mk_thief_knife", "mk_thunder_halberd", "mk_time_book", "mk_treasure_pick", "mk_tree_shield", "mk_twin_sword", "mk_venom_fang", "mk_wind_bow", "mk_wood_katana", "orichalcum_armor", "orichalcum_axe", "orichalcum_book", "orichalcum_bow", "orichalcum_dagger", "orichalcum_greatsword", "orichalcum_hammer", "orichalcum_katana", "orichalcum_shield", "orichalcum_staff", "orichalcum_sword", "royal_armor", "royal_axe", "royal_book", "royal_bow", "royal_dagger", "royal_greatsword", "royal_hammer", "royal_katana", "royal_shield", "royal_staff", "royal_sword", "shovel", "silver_armor", "silver_axe", "silver_book", "silver_bow", "silver_dagger", "silver_greatsword", "silver_hammer", "silver_katana", "silver_shield", "silver_staff", "silver_sword", "stone_book", "treasure_axe", "treasure_book", "treasure_bow", "treasure_dagger", "treasure_greatsword", "treasure_hammer", "treasure_katana", "treasure_staff", "treasure_sword"]);
function iconOfType(r) {
  if (GEAR_IMG.has(r.id)) return `assets/gear/${r.id}.webp`; const k = r.type === 'tool' ? TOOL_ICON[r.tool] : 'w_' + r.type; return ICON_KEYS.has(k) ? `assets/icon/${k}.webp` : ''; }
// 手に入れたとき、絵の上にアイコン付きの札をぽんと出す
function gotToast(k, n) {
  const st = $('stage'); if (!st) return;
  let box = $('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; st.appendChild(box); }
  const name = k === 'gold' ? `${n}G` : (NAMES[k] || (ITEMS[k] || {}).name || k) + (n > 1 ? ` ×${n}` : '');
  const e = document.createElement('div'); e.className = 'toast';
  const src = iconOf(k); e.innerHTML = (src ? `<img src="${src}" alt="">` : '') + `<span></span>`; e.lastChild.textContent = name;
  const delay = box.children.length * 140; e.style.animationDelay = delay + 'ms'; box.appendChild(e);
  if (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => e.remove(), 2200 + delay);
}

// ---------- 画面の文字 ----------
let logLines = [];
let logFace = null;
// セリフ欄の顔は主人公だけ。町の人が話すときは、セリフ欄の外に枠なしで顔を出す（#spk）
let spkFace = null;
function drawLog(cont) {
  drawLog.cur = cont; const el = $('log'); el.innerHTML = ''; el.classList.toggle('hasface', !!logFace);
  if (logFace) { const i = document.createElement('img'); i.className = 'face'; i.src = `assets/jobs/face_${logFace}.png`; i.alt = ''; el.appendChild(i); }
  const s = document.createElement('div'); el.appendChild(s);
  // 話している人の名前は、名札にして上にのせる
  const L = I18N.on ? logLines.map(x => tr(x, 1)) : logLines.slice(), pm = (I18N.on ? /^([^「」\n（）]{1,18}?)「/ : /^([^\s「」\n（）]{1,8})「/).exec(L[0] || '');
  if (pm) { const p = document.createElement('span'); p.className = 'plate'; p.textContent = pm[1]; s.appendChild(p); s.appendChild(document.createElement('br')); L[0] = L[0].slice(pm[1].length); }
  if (I18N.on) for (let i = 0; i < L.length; i++) L[i] = I18N.quote(L[i]);  /* 英語: 「」を "" に */
  // 最後の行だけ、1文字ずつ出す（押すと全部出る）。続きのページ（cont）は、そのページ全体を出す
  let last = cont !== undefined ? cont : (L.pop() || ''), pre = cont !== undefined ? '' : (L.length ? L.join('\n') + '\n' : '');
  const pn = document.createTextNode(pre); s.appendChild(pn);
  const tx = document.createTextNode(last); s.appendChild(tx);
  // 2026-11-25: 欄に入りきらないときは、ページに分ける（押すと続きが出る）
  drawLog.rest = '';
  const over = () => el.scrollHeight > el.clientHeight + 2;
  if (el.clientHeight > 20 && over()) {
    const whole = pre + last; pn.textContent = '';
    let lo = 1, hi = whole.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; tx.textContent = whole.slice(0, mid) + ' ▼'; if (over()) hi = mid - 1; else lo = mid; }
    let cut = lo; const seg = whole.slice(0, cut), m = Math.max(seg.lastIndexOf('\n'), seg.lastIndexOf('。'), seg.lastIndexOf('」'), seg.lastIndexOf('、'), seg.lastIndexOf('！'), seg.lastIndexOf('？'), I18N.on ? Math.max(seg.lastIndexOf('. '), seg.lastIndexOf('! '), seg.lastIndexOf('? '), seg.lastIndexOf(' ')) : -1);
    if (m > cut * .5) cut = m + 1;
    pre = ''; last = whole.slice(0, cut); drawLog.rest = whole.slice(cut).replace(/^\n+/, '');
  }
  tx.textContent = '';
  clearInterval(drawLog.tm); const chars = [...last]; let k = 0;
  const more = () => { if (drawLog.rest) { const mk = document.createElement('span'); mk.className = 'more'; mk.textContent = '▼'; s.appendChild(mk); } };
  const speed = (mode === 'battle' ? 2 : 1) * [1, 1, 2, 999][OPTS.text], done = () => { clearInterval(drawLog.tm); drawLog.tm = 0; tx.textContent = last; if (!s.querySelector('.more')) more(); };
  drawLog.skip = done;
  if (!chars.length || document.body.classList.contains('story') && document.body.classList.contains('intro')) done();
  else if (OPTS.text === 3) done();
  else drawLog.tm = setInterval(() => { k += speed; tx.textContent = chars.slice(0, k).join(''); if (k >= chars.length) done(); }, OPTS.text === 0 ? 48 : 26);
  drawSpk();
}
// ボタンが並んで台詞の欄が狭くなったら、ページを分け直す
function refitLog() { const el = $('log'); if (!el || el.clientHeight < 20 || (!drawLog.rest && el.scrollHeight <= el.clientHeight + 2)) return; const typing = drawLog.tm; drawLog(drawLog.cur); if (!typing && drawLog.skip) drawLog.skip(); }
// 続きのページを出す（台詞の欄を押したとき）
function nextLogPage() { if (!drawLog.rest) return false; const r = drawLog.rest; drawLog.rest = ''; drawLog(r); return true; }
// ダメージ・回復の数字を、絵の上に飛び出させる
function popNum(n, who, kind, m) {
  const v = $('view'); if (!v || v.style.display === 'none') return;
  const e = document.createElement('div'); e.className = 'pop ' + (kind || '') + (who === 'me' ? ' me' : '');
  e.textContent = kind === 'heal' ? '+' + n : kind === 'miss' ? 'MISS' : n;
  e.style.left = (who === 'me' ? 50 + (R() - .5) * 20 : (m && m.cx !== undefined ? m.cx / VW * 100 : 50) + (R() - .5) * 10) + '%'; e.style.top = (who === 'me' ? 70 : 34 + (R() - .5) * 8) + '%';
  v.appendChild(e); setTimeout(() => e.remove(), 1100);
}
function drawSpk() {
  const sp = $('spk'); if (!sp) return;
  const evOn = document.querySelector('#town .portrait.ev') || ($('meet') && $('meet').classList.contains('ev') && $('meet').style.display === 'flex');
  if (!spkFace || evOn || document.body.classList.contains('title')) { sp.className = ''; sp.removeAttribute('src'); return; }
  const f = document.querySelector('.fig'), side = f && f.classList.contains('L') ? 'R' : 'L';
  const src = `assets/face/${spkFace.replace(/^npc\//, '')}.webp`;
  if (sp.getAttribute('src') !== src || !sp.classList.contains('on')) { sp.className = ''; void sp.offsetWidth; sp.src = src; }
  sp.className = 'on ' + side;
}
// 店の人: セリフが「名前「…」」で始まると、その人の顔が出る。名前[表情]「…」で表情を選べる
// 表情: normal smile laugh shock angry happy think（シートの番号）
const NPCS = {
  'ジェニー': { id: 'weapon', think: 11, shy: 'shy', happy: 'happy', inlove: 'inlove', worried: 'worried' },
  'エリー': { id: 'clinic', think: 11, shy: 'shy', happy: 'happy', inlove: 'happy', worried: 'worried' },
  'リア': { id: 'guild', think: 13, shy: 'shy', happy: 'happy', inlove: 'happy', worried: 'worried' },
  'フウカ': { id: 'fuuka', laugh: 2, shy: 'shy', pout: 'pout', love: 'love' },
  'ダン': { id: 'dan', laugh: 2 }, 'グルガモ': { id: 'gurugamo', laugh: 2 }, 'ジン': { id: 'jin', laugh: 2, think: 13 },
  '王様': { id: 'king', laugh: 2 }, '大臣': { id: 'minister', laugh: 2 }, 'ギャバン': { id: 'gaban', laugh: 2 },
  'ドーラ': { id: 'item', think: 10 }, 'ベルナルド': { id: 'bank', think: 10 }, 'ガストン': { id: 'inn', think: 10 },
  'アルス': { id: 'als', smile: 1, laugh: 2, shock: 11, think: 13 },  // 工房の弟子
  'ルゥ': { id: 'apprentice', laugh: 3, smile: 1, shock: 9 },  // 工房の見習い（ただのNPC）
  'ブッパ': { id: 'buppa', normal: 'sleep', sleep: 'sleep', shock: 'shock', laugh: 'laugh', angry: 'grumpy', grumpy: 'grumpy', eat: 'eat', tired: 'tired' },  // たまにいる居候
  '砂の女神': { id: 'desert', laugh: 4 }, '森の女神': { id: 'forest', laugh: 4 }, '花の女神': { id: 'druid', laugh: 3 }, '山の女神': { id: 'mountain', laugh: 5, smile: 1, angry: 11, think: 12 }, '氷の女神': { id: 'ice', laugh: 4 },
  'チッチ': { id: 'chicchi', smile: 1, laugh: 3, shock: 18, angry: 7, think: 15, shy: 11 },  // 工房の居候
  '客': { id: 'bar', noFace: true },  // 酒場の客（顔はなく、立ち絵だけ）
  'ボルツ': { id: 'craft', smile: 2, laugh: 1, shock: 12, angry: 3, think: 5 },  // ギルドの加工職人
};
const NPC_FACE = { normal: 0, smile: 1, laugh: 3, shock: 5, angry: 6, think: 11 };
const HEROINE = { 'ジェニー': 'jenny', 'エリー': 'elly', 'リア': 'ria', 'フウカ': 'fuuka' };
const BLUSH = { happy: 'smile', shy: 'think', inlove: 'smile', worried: 'think', love: 'smile', pout: 'angry' };
// 主人公の名前（2026-11-25）。ふだんは誰も名前で呼ばない。鏡との対峙と、ヒロインが初めて名前を呼ぶ場面でだけ使う。{name} と書くと入る
const heroName = () => (G && G.name) || '鍛冶屋';
function log(t, clear) {
  if (typeof t === 'string' && t.includes('{name}')) t = t.replace(/\{name\}/g, heroName());
  if (clear) { logLines = []; logFace = null; spkFace = null; }
  const m = /^([^\s「\[]+)(?:\[(\w+)\])?「/.exec(t);
  if (m && NPCS[m[1]] && NPCS[m[1]].noFace) { /* 顔なし */ }
  else if (m && NPCS[m[1]]) { const n = NPCS[m[1]]; let e = m[2] || 'normal';
    // ヒロインの照れ顔（頬が赤い絵）は、親密度が上がってから。それまではふつうの表情にする
    { const who = HEROINE[m[1]]; if (who && BLUSH[e] && !perk(who) && !(G.seen || {})[who]) e = BLUSH[e]; } t = t.replace(/^([^\[「]+)\[\w+\]/, '$1'); if (clear || !spkFace) { const v = n[e] !== undefined ? n[e] : NPC_FACE[e] || 0; spkFace = `npc/${n.id}_${typeof v === 'string' ? v : String(v).padStart(2, '0')}`; logFace = null; } figSwap(n.id); figTalk(n.id); leanFig(m[1], e); }
  else if (clear) spkFace = null;
  t = t.replace(/(^|\n)([^\s「\[\n]+)\[\w+\]「/g, '$1$2「');  // 2行目以降の表情タグも消す
  for (const [re, k, mx] of LOG_SFX) if (re.test(t)) { sfx(k, { max: mx }); break; }
  logLines.push(t); logLines = logLines.slice(-4); drawLog();
}
// 主人公のセリフ（表情つき）。face: normal serious resolve lookup calm laugh shout angry shock worry wince smile grin doubt smug sad content sly tired sigh
function say(face, t, clear) { log(t, clear); logFace = face; spkFace = null; drawLog(); }
// ジョブの立ち絵（町の絵の右側に重ねる）。上級職でまだ絵がないときは、持つ武器の基本職の絵を使う
function jobScene(j) {
  const t = $('town'); if (!t || t.style.display === 'none') return;
  const old = document.getElementById('portrait'); if (old) old.remove();
  let img = JOBS[j] && JOBS[j].img;
  if (!img) { const u = UPPERS.find(x => x.job === j); if (u) img = JOBS[WEAPON_TYPES[u.hold].job].img; }
  if (!img) return;
  showFig(`assets/jobs/job_${img}.webp`, { who: 'hero', label: j });
}
// ステータス画面: 主人公（今のジョブの姿）を真ん中に、左右に強さのバー。装備やジョブを変えるとバーが動き、増減が出る
function jobImg(j) { let img = JOBS[j] && JOBS[j].img; if (!img) { const u = UPPERS.find(x => x.job === j); if (u) img = JOBS[WEAPON_TYPES[u.hold].job].img; } return img ? `assets/jobs/job_${img}.webp` : null; }
function statNow() {
  return { hp: G.mhp, atk: atkPower(), def: defPower(), ap: apBase(), eva: Math.round(evade() * 100), crit: hurt('head') ? 0 : 8 + (has('p_crit') ? 15 : 0) };
}
const STAT_DEF = [['hp', '最大HP', l => 40 + l * 12, '#d9553f'], ['atk', '攻撃', l => 14 + l * 4, '#ff8a3d'], ['def', '防御', l => 10 + l * 3, '#8fb3d9'],
  ['ap', 'AP', () => 6, '#5fb0e6'], ['eva', '回避', () => 30, '#9ad97a'], ['crit', '会心', () => 40, '#ffd75a']];
function statusView() {
  const t = $('town'); if (!t || t.style.display === 'none') return;
  const now = statNow(), prev = statusView.prev || now, j = job(), src = jobImg(j);
  let v = t.querySelector('.status'); if (v) delete v.dataset.stale;
  if (!v) {
    v = document.createElement('div'); v.className = 'status';
    const col = side => `<div class="scol ${side}">` + STAT_DEF.filter((_, i) => side === 'L' ? i < 3 : i >= 3).map(([k, name, , c]) =>
      `<div class="srow" data-k="${k}"><div class="sl"><span>${name}</span><b></b><em></em></div><div class="sbar"><i style="background:${c}"></i></div></div>`).join('') + '</div>';
    v.innerHTML = col('L') + `<div class="shero"><img alt=""><div class="sjob"></div></div>` + col('R');
    t.appendChild(v);
  }
  const im = v.querySelector('.shero img');
  if (src && im.getAttribute('src') !== src) { im.classList.remove('in'); void im.offsetWidth; im.src = src; im.classList.add('in'); }
  v.querySelector('.sjob').textContent = `Lv${G.lv}　${j}`;
  for (const [k, , mx] of STAT_DEF) {
    const row = v.querySelector(`.srow[data-k="${k}"]`), val = now[k], d = val - prev[k];
    row.querySelector('b').textContent = k === 'eva' || k === 'crit' ? val + '%' : val;
    const em = row.querySelector('em'); em.textContent = d ? (d > 0 ? '+' : '') + d : ''; em.className = d > 0 ? 'up' : d < 0 ? 'down' : '';
    requestAnimationFrame(() => { row.querySelector('i').style.width = Math.min(100, 100 * val / mx(G.lv)) + '%'; });
  }
  statusView.prev = now;
}
function statusMenu(back) {
  statusView.prev = null; clearFig();
  const r = gearBy(G.equip.r), l = gearBy(G.equip.l), a = gearBy(G.equip.armor);
  buttons([{ title: `右 ${r ? r.name : 'なし'}／左 ${l ? l.name : 'なし'}／鎧 ${a ? a.name : 'なし'}` },
    { t: '装備を変える', s: job(), hot: true, f: () => equipMenu(back) }, { t: 'ジョブ', s: '一覧', f: () => jobList(back) }, { t: '戻る', f: back }]);
  statusView();
  log(`経験値 ${G.exp}/${expNeed()}${G.injuries.length ? '\nケガ: ' + G.injuries.map(k => INJURIES[k].name).join('・') : ''}`, true);
}
// 立ち絵を出す。左右と「全身／腰から上」を毎回選び直して、入ってくる動きをつける
// opt: who(話したとき弾ませる相手のid) side('L'|'R') mode('full'|'bust'|'wide') label
function showFig(src, opt) {
  opt = opt || {};
  const host = mode === 'town' ? $('town') : $('view'); if (!host) return;
  const old = host.querySelector('.fig');
  if (old && old.dataset.src === src) { delete old.dataset.stale; return; }
  const lastSide = showFig.side;
  if (old) old.remove();
  const side = opt.side || 'L';  // 立ち絵はみんな右を向いているので、左に立たせる
  const m = opt.mode || (R() < .45 ? 'bust' : 'full');
  const d = document.createElement('div'); d.className = `fig ${m === 'wide' ? 'wide C' : side} ${m === 'bust' ? 'bust' : ''}`;
  d.dataset.src = src; d.dataset.who = opt.who || '';
  d.innerHTML = `<img src="${src}" alt="">` + (opt.label ? `<span>${opt.label}</span>` : '');
  host.appendChild(d); showFig.side = side; drawSpk();
}
function clearFig() { for (const f of document.querySelectorAll('.fig')) f.remove(); }
// ジェニーは60階を越えると、照れ・笑顔・心配の顔のとき、立ち絵も前屈みの絵になる（それ以外の顔で元に戻る）
const LEAN = { 'ジェニー': { id: 'weapon', floor: 60, faces: ['happy', 'inlove', 'shy', 'worried'] } };
function leanFig(name, e) {
  const L = LEAN[name]; if (!L || (G.maxFloor || 0) < L.floor) return;
  const f = document.querySelector(`.fig[data-who="${L.id}"] img`); if (!f) return;
  const want = `assets/npc/${L.faces.includes(e) ? L.id + '_' + e : L.id}.webp`;
  if (!f.src.endsWith(want)) { f.src = want; f.parentNode.dataset.src = want; }
}
// 話している人と立ち絵が違うときは、話している人の立ち絵に替える（ギルドでガンターの絵が残ったままリアが話す、など）
const FIG_IDS = new Set(['als', 'apprentice', 'bank', 'bar', 'chicchi', 'clinic', 'craft', 'dan', 'drunks', 'fuuka', 'gaban', 'gate', 'guild', 'gunther', 'gurugamo', 'inn', 'item', 'jin', 'king', 'minister', 'weapon']);
function figSwap(id) {
  if (mode !== 'town' || !FIG_IDS.has(id) || document.querySelector('#town .portrait.ev')) return;
  const f = document.querySelector('#town .fig'); if (!f || f.dataset.who === id) return;
  npcFig(id);
}
function figTalk(id) {
  const f = document.querySelector(`.fig[data-who="${id}"]`); if (!f) return;
  f.classList.remove('talk'); void f.offsetWidth; f.classList.add('talk'); clearTimeout(figTalk.t); figTalk.t = setTimeout(() => f.classList.remove('talk'), 450);
}
function hud() {
  $('who').textContent = `Lv${G.lv} ${job()}　攻${atkPower()} 守${defPower()}　${G.gold}G${G.injuries.length ? '　ケガ' + G.injuries.length : ''}`;
  $('where').textContent = document.body.classList.contains('story') ? 'Tower of Hope' : mode === 'town' ? (place ? (place === 'tower' ? '塔の入口' : (PLACES[place] || { name: 'お城' }).name) : 'エルディアの町') : `塔 ${floorNo}階`;
  $('hpb').style.width = (100 * G.hp / G.mhp) + '%'; $('hpt').textContent = `${G.hp}/${G.mhp}`;
  const ap = B ? B.ap : 0, apMax = 4;
  $('apb').style.width = (100 * ap / apMax) + '%'; $('apt').textContent = B ? `${ap}` : '-';
  for (const id of ['apl', 'apbar', 'apt']) $(id).style.visibility = mode === 'battle' ? 'visible' : 'hidden';
  // HPが3割以下: 画面のふちが赤く脈打つ
  { const dz = $('danger'); if (dz) dz.classList.toggle('on', mode !== 'town' && G.hp > 0 && G.hp <= G.mhp * .3); }
}
// ボタン: 「戻る」系はいつも右下。見出しが2つ以上ある長い一覧はタブに分け、多すぎるときはページ送り
const TAIL_T = ['戻る', 'やめる', '外に出る'];
buttons.tab = {}; buttons.pg = {}; buttons.lp = {};  // lp: 一覧（list）の1ページの数を、画面の高さごとに覚えておく
function buttons(list, cls) {
  buttons.cur = list;
  { const o = document.querySelector('.fcmp'); if (o) o.remove(); }
  const box = $('ctl'); box.innerHTML = '';
  // 主人公の立ち絵は、その画面で jobScene がもう一度呼ばれなければ消す
  for (const f of document.querySelectorAll('.fig[data-who="hero"], .status')) { f.dataset.stale = '1'; setTimeout(() => { if (f.dataset.stale) f.remove(); }, 0); }
  const isTail = b => !b.title && (b.tail || TAIL_T.includes(b.t));
  const tail = list.filter(isTail), body = list.filter(b => !isTail(b));
  const top = [], secs = []; let lead = null;
  for (const b of body) { if (b.title) secs.push({ title: b.title, titleHtml: b.titleHtml, items: [] }); else if (secs.length) secs[secs.length - 1].items.push(b); else top.push(b); }
  if (!secs.length && top.length === 0) lead = null;
  const nItems = top.length + secs.reduce((a, x) => a + x.items.length, 0);
  const tabbed = secs.length >= 2 && nItems > 6 && secs.filter(x => x.items.length).length >= 2;
  const label = t => t.split(/[（(:：／]/)[0].trim();
  const key = secs.map(x => label(x.title)).join('|');
  let shown, head = null;
  if (tabbed) {
    let k = buttons.tab[key] || 0; if (k >= secs.length) k = 0;
    const row = document.createElement('div'); row.className = 'tabs';
    secs.forEach((x, i) => { const tb = document.createElement('button'); tb.textContent = label(x.title); if (i === k) tb.className = 'on';
      tb.onclick = () => { sfx('select', { vol: .4 }); buttons.tab[key] = i; buttons(list, cls); }; row.appendChild(tb); });
    box.appendChild(row); head = secs[k].titleHtml || secs[k].title; shown = [...top, ...secs[k].items];
  } else { shown = []; for (const b of body) shown.push(b); }
  const n = shown.filter(b => !b.title).length;
  if (!cls) cls = n > 6 ? 'three small' : n === 3 ? 'three' : n === 1 ? 'one' : '';
  if (cls === 'list') cls = 'list';
  const per = cls === 'list' ? (buttons.lp[innerHeight] || 6) : cls.includes('three') ? 9 : 6, pk = key + '#' + (tabbed ? buttons.tab[key] || 0 : '') + '#' + shown.length;
  let pages = 1, pg = 0, items = shown;
  if (n > per + (tail.length ? 0 : 1)) {
    const flat = shown.filter(b => !b.title); pages = Math.ceil(flat.length / per); pg = Math.min(buttons.pg[pk] || 0, pages - 1);
    items = flat.slice(pg * per, pg * per + per); if (!head) { const t = shown.find(b => b.title); if (t) head = t.titleHtml || t.title; }
  }
  const mk = (b, wrap) => {
    const el = document.createElement('button'); el.innerHTML = b.t + (b.s ? `<small>${b.s}</small>` : '');
    el.addEventListener('click', () => sfx('select', { vol: .5 }), { capture: true });
    if (b.off) el.disabled = true; if (b.hot) el.className = 'hot'; if (b.cls) el.classList.add(b.cls);
    const move = !b.stay && (b.go || b.f === townMap || ['入る', '外に出る', '町へ', '工房へ'].includes(b.t));
    el.onclick = () => { if (move) fadeGo(() => b.f()); else { b.f(); hud(); } }; wrap.appendChild(el); return el;
  };
  if (head) { const h = document.createElement('h2'); if (/^<|</.test(head)) h.innerHTML = head; else h.textContent = head; box.appendChild(h); }
  const wrap = document.createElement('div'); wrap.className = 'btns' + (cls ? ' ' + cls : '');
  for (const b of items) {
    if (b.title) { const h = document.createElement('h2'); if (b.titleHtml) h.innerHTML = b.titleHtml; else h.textContent = b.title; h.style.gridColumn = '1/-1'; wrap.appendChild(h); continue; }
    mk(b, wrap);
  }
  box.appendChild(wrap);
  if (tail.length || pages > 1) {
    const tr = document.createElement('div'); tr.className = 'btns tail';
    if (pages > 1) {
      const pb = (t, d) => { const el = document.createElement('button'); el.className = 'pg'; el.textContent = t; el.disabled = pg + d < 0 || pg + d >= pages; el.onclick = () => { buttons.pg[pk] = pg + d; buttons(list, cls); }; tr.appendChild(el); };
      pb('◀', -1); const c = document.createElement('div'); c.style.cssText = 'flex:0 0 auto;align-self:center;font-size:13px;color:var(--dim)'; c.textContent = `${pg + 1}/${pages}`; tr.appendChild(c); pb('▶', 1);
    }
    for (const b of tail) mk(b, tr);
    box.appendChild(tr);
  }
  fitStage();
  // 2026-11-25: 一覧が画面からはみ出したら（小さい画面・作れる物が多いとき）、1ページの数を減らして並べ直す。戻るボタンが見切れないように
  if (cls === 'list' && per > 2) { const r = box.getBoundingClientRect(); if (r.bottom > innerHeight + 2) { buttons.lp[innerHeight] = per - 2; buttons(list, cls); return; } }
  /* 絵の大きさが決まったあと（fitStage・タブの切り替え）に、はみ出すこともある。少し待ってもう一度確かめる */
  if (cls === 'list' && per > 2) { buttons.cur = list; clearTimeout(buttons.chk); buttons.chk = setTimeout(() => { if (buttons.cur !== list) return; fitStage(); const r = box.getBoundingClientRect(); if (!box.isConnected || r.bottom <= innerHeight + 2) return; const d = Math.ceil(r.bottom - innerHeight) + 4, st = $('stage'), el = mode === 'town' ? $('town') : $('view'), h = st.offsetHeight;
    /* はみ出しが小さければ、絵を少し小さくして収める。大きいときは1ページの数を減らす */
    if (per > 2) { buttons.lp[innerHeight] = per - 2; buttons(list, cls); } }, 90); }
  setTimeout(refitLog, 0);  // ボタンで台詞の欄が狭くなったら、ページを分け直す
}
// 暗転: 画面を一度黒くしてから切り替える。場所が変わるとき・工房で何かを作るとき
// o.text: 黒い画面に出す文字（「制作中」など） o.hold: 黒いままにする時間 o.walk: 町を歩く足音 o.sfx: [[音, 遅らせるms]]
// 2026-11-25: 自宅で眠る演出。夜（星・月・Zzz）→ 朝の光と回復の光（回復の音と同時）→ 戻る
function sleepScene(then) {
  if (sleepScene.busy) return; sleepScene.busy = true;
  const o = document.createElement('div'); o.id = 'sleep';
  let h = '<div class="dawn"></div><div class="moon"></div>';
  for (let i = 0; i < 26; i++) h += `<i class="st" style="left:${(R() * 100).toFixed(1)}%;top:${(R() * 60).toFixed(1)}%;animation-delay:${(R() * 1.6).toFixed(2)}s"></i>`;
  h += '<div class="z" style="animation-delay:.5s">Z</div><div class="z" style="animation-delay:1s;font-size:20px">z</div><div class="z" style="animation-delay:1.4s;font-size:16px">z</div><div class="msg">HP MAX</div>';
  o.innerHTML = h; document.body.appendChild(o); void o.offsetWidth; o.classList.add('on');
  SND.bgmDuck && SND.bgmDuck(true);
  setTimeout(() => {
    o.classList.add('day'); sfx('heal', { max: 2.2 });
    for (let i = 0; i < 22; i++) { const p = document.createElement('i'); p.className = 'hp'; p.style.left = (8 + R() * 84).toFixed(1) + '%'; p.style.animationDelay = (R() * .9).toFixed(2) + 's'; const z = 6 + R() * 10; p.style.width = p.style.height = z.toFixed(0) + 'px'; o.appendChild(p); }
    try { then && then(); hud(); } catch (e) { console.error(e); }
  }, 2100);
  setTimeout(() => { o.classList.remove('on'); SND.bgmDuck && SND.bgmDuck(false); }, 4200);
  setTimeout(() => { o.remove(); sleepScene.busy = false; }, 4750);
}
function fadeGo(fn, o) {
  o = o || {}; const f = $('fade');
  if (fadeGo.busy || !f) { fn(); hud(); return; }
  fadeGo.busy = true; f.innerHTML = o.text ? `<div>${o.text.replace(/\n/g, '<br>')}<i></i></div>` : ''; f.classList.toggle('txt', !!o.text); f.classList.toggle('floor', !!o.floor); f.classList.add('on');
  if (o.walk) sfx('walk_town', { vol: .8, max: 1.4 });
  for (const [k, d] of o.sfx || []) sfx(k, { delay: d, vol: .8 });
  setTimeout(() => {
    try { fn(); hud(); } catch (e) { console.error(e); }
    setTimeout(() => { f.classList.remove('on'); fadeGo.busy = false; }, o.hold || 80);
  }, 240);
}
// 階の移動: 暗転 →「3F」と場所の名前 → 足音 → 塔の中へフェードイン
function goFloor(n, fromAbove) {
  const ar = areaOf(n), st = (n >= 6 && n <= 9 ? 'step_wet' : STEP_SFX[ar[1]] || 'step_stone');
  fadeGo(() => enterFloor(n, fromAbove), { text: `${n}F\n${n % 10 === 0 ? '主の間' : ar[2]}`, floor: true, hold: 1250,
    sfx: [['stairs', 0], [st + '_1', 450], [st + '_2', 800], [st + '_3', 1150]] });
}
// その場で黒から明ける（すぐに切り替わる処理のあとに使う）
function flashIn() {
  const f = $('fade'); if (!f || fadeGo.busy) return;
  f.innerHTML = ''; f.classList.remove('txt'); f.style.transition = 'none'; f.classList.add('on'); void f.offsetWidth; f.style.transition = '';
  setTimeout(() => f.classList.remove('on'), 60);
}
// 画面（町の絵・ダンジョン）を、残りの高さに収まる大きさにする
// 絵は上に寄せる。COVER の画面（店の中・町の景色など）は余った高さいっぱいに広げ、切れた分は絵の端を落とす
let ASPECT = 2 / 3, COVER = false;
const LOG_MIN = 120;
function fitStage() {
  const s = $('stage'), main = s.parentNode, el = mode === 'town' ? $('town') : $('view');
  const dg = mode !== 'town'; document.body.classList.toggle('dg', dg);
  const ctl = $('ctl'); if (dg) ctl.style.flex = 'none';
  const cs = getComputedStyle(main), W = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const logOn = getComputedStyle($('log')).display !== 'none';
  let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 6 * 4 + (logOn ? LOG_MIN : -6);
  for (const c of main.children) if (c !== s && c.id !== 'log' && getComputedStyle(c).display !== 'none') used += c.offsetHeight;
  const H = Math.max(120, main.clientHeight - used); if (!W) return;
  // 塔の中は、十字キーと戦闘のボタンで高さが変わらないように、ボタン用の高さを決めておく（敵が出たときに絵がずれない）
  const Hdg = Math.max(120, main.clientHeight - used + (dg ? ctl.offsetHeight - Math.max(268, ctl.offsetHeight) : 0));
  let w = W, h;
  if (COVER) h = document.body.classList.contains('intro') || document.body.classList.contains('big') ? H : Math.min(H, W * 1.25);
  else if (dg) h = Math.min(H, Hdg, W * .98);  // 塔の中: 4:3の絵の左右を少し落として、縦を大きく見せる
  else { h = w / ASPECT; if (h > H) { h = H; w = h * ASPECT; } }
  el.style.width = Math.floor(w) + 'px'; el.style.height = Math.floor(h) + 'px'; s.style.height = Math.floor(h) + 'px';
  ctl.style.flex = '';
  /* 2026-11-25: それでも画面からはみ出すとき（ボタンの一覧が多いなど）は、そのぶん絵を小さくする */
  if (!dg && !document.body.classList.contains('intro')) { const over = main.scrollHeight - main.clientHeight; if (over > 1 && h - over >= 120) { h -= over; if (!COVER) w = h * ASPECT; el.style.width = Math.floor(w) + 'px'; el.style.height = Math.floor(h) + 'px'; s.style.height = Math.floor(h) + 'px'; } }
}
new ResizeObserver(() => fitStage()).observe(document.querySelector('main'));
new ResizeObserver(() => { if (fitStage.ch !== $('ctl').offsetHeight) { fitStage.ch = $('ctl').offsetHeight; fitStage(); } }).observe($('ctl'));  /* ボタンの高さがあとから変わったとき（アイコンの読み込みなど）も、絵の大きさを合わせ直す */

// ---------- 町 ----------
// 地図を押す → 施設の外観（入る／戻る） → 中に入ると内装とメニュー
const TOWN_IMG = 'assets/town/';
const PLACES = {
  home:   { name: '工房（自宅）', box: [168,  468,  302,  560], hello: ['アルス「師匠、おかえりなさい！ 今日の名言、まだですか」', 'チッチ「掃除しといたっす。あ、炉の火は落としてないっす」', 'チッチ[laugh]「親方の剣、磨いといたっす！ ……盗んでないっすよ？」', 'チッチ[shy]「アルス君に『チッチさんの料理、最高です』って言われたっす。……照れるっす」', 'チッチ[think]「鍵なら開けられるっす。心の鍵？ ……知らないっす」', '床に獲物が置いてある。オルグだろう。'] },
  weapon: { name: '武具屋', box: [321,  410,  445,  490], hello: ['ジェニー「打ったの見せて。値段は私が決める」', 'ジェニー[laugh]「叩けば直る。人生以外は」',
    'ジェニー「また来たの？ ……別に、待ってないけど」\n「そうか。じゃあ売ったらすぐ帰る」', 'ジェニー[angry]「塔で死んだら、誰が私の店に武器を卸すのよ。……そういう意味だからね」\n「ああ、商売の話か。分かってる」'] },
  clinic: { name: '治療院', box: [312,  242,  413,  325], hello: ['エリー[smile]「あ、おかえりなさい！ 今日はケガしてませんか？」', 'エリー「神様はちゃんと聞いてますよ。……たまに返事が遅いだけで」',
    'エリー[smile]「これ、お守りです。手作りなんですけど……」\n「ありがとう。治療院の新しい商品か？」', 'エリー「無茶しないでくださいね。……私、毎晩お祈りしてるんですから」\n「神様も忙しいだろうに、悪いな」'] },
  guild:  { name: 'ギルド', box: [25,  325,  149,  407], hello: ['ジロ「ゴローが、今日の塔は機嫌が悪いって言ってる」', 'リア「最高到達記録は86階。近衛兵長のギャバンさんの記録です」', 'リア[smile]「依頼はまだ準備中です。……もう少し待っててくださいね」',
    'リア「鍛冶屋さんの到達記録は、毎回私が書いてます。……ほかの人のは新人に任せてますけど」\n「そうか、大変だな」', 'リア[smile]「記録を更新したら、お祝いしましょうか。……ふたりで」\n「いいな。ギルドのみんなも呼ぼう」', 'ボルツ[laugh]「旦那！ 戦利品があるなら奥に回してくれ。加工は俺の仕事だ」'] },
  item:   { name: '道具屋', box: [324,  325,  445,  407], hello: ['ドーラ「薬草は多めに持っていきな。塔の中じゃ買えないよ」', 'ドーラ[laugh]「若いの、いや若くもないか。死ぬんじゃないよ」'] },
  bank:   { name: '銀行', box: [54,  245,  162,  325], hello: ['ベルナルド「お預かりしたお金は、塔の中で倒れても無事です」', 'ベルナルド[think]「お金は裏切りません。人と違って」'] },
  inn:    { name: '宿屋', box: [22,  410,  146,  490], hello: ['ガストン「素材を持ってきな。うまく料理してやるよ」'] },
  tower:  { name: '塔', box: [184,  127,  283,  248], hello: ['門番「塔へ行くのかい。86階より上には、誰も行ったことがないよ」', '見上げても、てっぺんは雲の中だ。'] },
  statue: { name: '剣士の像', box: [184,  331,  280,  420], hello: ['広場の真ん中に、旗を掲げた剣士の像が立っている。', '像の足元で、子どもたちが「塔ごっこ」をして遊んでいる。'] },
  south:  { name: '街の門', box: [153,  585,  312,  694], hello: ['門番「外の国へ行くのかい？ ……いや、あんたの用は塔だろう」'] },
};
// 町の人の反応は、主人公が登った高さで変わっていく（2026-11-23）
// はじめ:「あの鍛冶屋が塔に！？」と驚く → 登るにつれて「やっぱりこの人ならやっちゃうか」
// [その階以上, セリフ]。今の最高到達階で一番上の段のセリフが選ばれやすい
const STAGE = {
  home: [
    [0, ['アルス「師匠が塔に……。町じゅう、その話でもちきりですよ」', 'チッチ「親方、ほんとに行くんすか。鍛冶屋っすよね？」', 'アルス[smile]「今朝も素振り500回、終わりました！ 師匠、いつでも冒険に誘ってください！」', 'アルス「チッチさん、倉庫の整理、手伝いますよ」\nチッチ「アルス君は真面目っすねぇ……。眩しいっす」']],
    [5, ['アルス「5階ですって！ ……今の、日記に書いておきます」', 'チッチ「近所の人が、親方は昔冒険者だったのかって聞いてきたっす」']],
    [10, ['アルス「10階の主を倒したって、ギルドで大騒ぎです。……まあ、師匠ならって思ってましたけど」', 'チッチ[laugh]「親方、近所から差し入れが山ほど届いてるっす！ 食べきれないっす！」']],
  ],
  weapon: [
    [0, ['ジェニー[shock]「は？ 塔に登る？ あんた鍛冶屋でしょ！？」', 'ジェニー[angry]「職人が自分で素材取りに行くなんて、聞いたことないわよ」']],
    [5, ['ジェニー「5階……。まぐれよ、まぐれ。……ケガは？」']],
    [10, ['ジェニー[laugh]「10階の主ねぇ。……ま、あんたならやると思ってたわ」', 'ジェニー「お客さんがね、『あの鍛冶屋の武器なら登れる』って買っていくのよ。商売上がったり……じゃないわね」']],
  ],
  clinic: [
    [0, ['エリー[shock]「えっ、塔に行くんですか！？ 町いちばんの鍛冶屋さんが……？」']],
    [5, ['エリー「5階まで行ったって聞きました。……本当に、無茶しないでくださいね」']],
    [10, ['エリー[smile]「10階の主を……！ みんな驚いてましたけど、私は信じてましたよ」']],
  ],
  guild: [
    [0, ['リア[shock]「鍛冶屋さんが冒険者登録……？ 前例がありません。……書類、探してきます」', '冒険者たちが、主人公を見てひそひそ話している。']],
    [5, ['リア「5階到達、記録しました。冒険者さんたちが、急に静かになりましたね」']],
    [10, ['リア[smile]「10階の主、撃破。……町じゅうが『やっぱりあの人か』って顔をしてます」', '冒険者「あの鍛冶屋、また登ったらしいぞ」「そりゃそうだろ」']],
  ],
  item: [
    [0, ['ドーラ[shock]「あんたが塔に？ ……年を考えな、年を」']],
    [5, ['ドーラ「薬草、また減ってるね。生きて帰ってくるなら文句はないよ」']],
    [10, ['ドーラ[laugh]「10階の主だって？ はっ、昔からしぶといと思ってたよ」']],
  ],
  bank: [
    [0, ['ベルナルド[think]「塔へ……？ 職人の方は、普通もっと堅実なのですが」']],
    [5, ['ベルナルド「お預かり金が少し増えましたね。……悪くない投資先です、あなたは」']],
    [10, ['ベルナルド[smile]「10階の主を。……ええ、あなたならやると、帳簿が言っていました」']],
  ],
  inn: [
    [0, ['ガストン[shock]「あの鍛冶屋が塔に行ったって？ 酒場じゃ賭けになってるぞ。何階で帰ってくるか」']],
    [5, ['ガストン[laugh]「5階に賭けたやつが大損だ。わはは」']],
    [10, ['ガストン[laugh]「10階の主だと！ 今夜はあんたの話で店が回る」', '客「あの鍛冶屋なら、まあやるよな」']],
  ],
};
// ブッパ: たまに勝手に工房に入ってきて寝ている居候（塔から戻るたびに3割くらい）
const buppaHere = () => ((G.runs * 7 + 3) % 10) < 3;
const BUPPA = ['ブッパ「……ぐう……ぐう……」', 'ブッパ[eat]「お、親方。台所にあった肉……もう食べちまった」', 'ブッパ[laugh]「がっはっは！ 今日も平和だなぁ」', 'ブッパ[shock]「うおっ！ ……なんだ、親方か。寝てた寝てた」', 'ブッパ[tired]「……ここ、寝心地いいんだよなぁ」', 'ブッパ[grumpy]「……起こすなよぉ」'];
const HELPER = ['ルゥ[smile]「親方、炉の温度、上げておきました！」', 'ルゥ[laugh]「見てください、初めて釘がまっすぐ打てました！」', 'ルゥ「チッチさんに、鍵の開け方を教わってます。……鍛冶に関係ないですけど」', 'ルゥ[laugh]「アルスさん、また素振りしてますね。すごいなぁ」'];
function greet(id) {
  { const r = RUN_WHO[id] && typeof runLine === 'function' ? runLine(RUN_WHO[id]) : null; if (r && !(id === 'home' && G.visit && G.visit.run === G.runs && G.visit.who.length)) return r; }
  if (id === 'home') { const v = homeVisit(); if (v) return v; if (buppaHere() && R() < .6) return pick(BUPPA); if (R() < .3) return pick(HELPER); }
  { const w = SHOP_WHO[id]; if (w && (G.seen || {})[w] && R() < .35) return pick(CLOSE_GREET[w]); }
  const st = STAGE[id], base = PLACES[id].hello;
  if (!st) return pick(base);
  let tier = st[0][1]; for (const [n, L] of st) if (n === 'clear' ? G.cleared : G.maxFloor >= n && (n < 10 || G.bossDown)) tier = L;  // 10階の段は、10階の主を倒してから
  return R() < (G.maxFloor >= 20 ? .75 : .6) ? pick(tier) : pick(base);
}
const MAT_PRICE = { copper: 6, iron: 15, bone: 4, leather: 5, stone: 12, wood: 7, silver: 45, mithril: 110, orichalcum: 240, darksteel: 160, dragonbone: 380 };
const MAT_SELL = Object.fromEntries(Object.entries(MAT_PRICE).map(([k, p]) => [k, Math.max(1, Math.round(p * ({ silver: .3, mithril: .25, darksteel: .2, orichalcum: .2, dragonbone: .2 }[k] || .5)))]));  // 素材の売値も半分（2026-11-25）。買うときは MAT_PRICE の3倍
const pick = a => a[Math.floor(R() * a.length)];
let place = null;

function showTown(on, aspect) { document.body.classList.remove('story', 'title', 'intro', 'big'); if ($('town')) $('town').onclick = null; $('town').style.display = on ? 'block' : 'none'; $('view').style.display = on ? 'none' : 'block'; ASPECT = aspect || (on ? 2 / 3 : 4 / 3); COVER = on && (aspect === 4 / 3 || aspect === 0); spkFace = null; drawSpk(); fitStage(); }
function rollRumor() { const k = Object.keys(RUMORS); G.rumor = k[Math.floor(R() * k.length)]; }
function startRun(n) { G.runHp = has('p_hp') ? 20 : 0; G.mhp += G.runHp; G.hp += G.runHp; G.cur = { start: n || 1, top: n || 1, before: G.maxFloor || 0, boss: 0, kills: 0 }; }
// 塔から戻ったとき（倒れたときも）、今回の塔のぼりを G.last に残す。町の人のあいさつに使う
function finishRun(lost) { const c = G.cur || { start: 1, top: floorNo || 1, before: G.maxFloor, boss: 0, kills: 0 }; G.last = { ...c, lost: !!lost, run: G.runs, told: [] }; G.cur = null; }
function endRun() { G.mhp -= G.runHp || 0; G.hp = Math.min(G.hp, G.mhp); G.runHp = 0; }
function endMeal() { if (G.meal === 'stew') { G.mhp -= 10; G.hp = Math.min(G.hp, G.mhp); } G.meal = null; }
function toTown(msg, fromTower, then) {
  mode = 'town'; B = null; F = null; FLOORS = {};
  let letter = false;
  if (fromTower) { endMeal(); endRun(); rollRumor(); G.bless = null; G.runs++; finishRun(false); G.ally = null; G.bandaged = []; G.enc = null; G.als = false; if (G.maxFloor >= 50 && !G.castle) { G.castle = true; letter = true; } }
  const brought = matText(G.carry);
  for (const [k, n] of Object.entries(G.carry)) add(RAW[k] ? G.raw : G.store, k, n);
  G.carry = {}; save();
  if (fromTower && then) { then(); return; }
  if (fromTower) { returnScreen(msg, brought, letter); return; }
  townMap(); if (msg) log(msg, true); hud();
}
// 町の外観の絵（タイトル・はじめの説明・塔から戻ったとき）
function viewScreen(caption, story, big) {
  place = null; showTown(true, big ? 0 : 941 / 1672); if (story) document.body.classList.add('story'); if (big) { document.body.classList.add('big'); fitStage(); }
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}town_view.jpg" alt="塔の国の町">` + (caption ? `<div class="caption">${caption}</div>` : '');
}
// 塔から戻ったら、まずギルドへ。リアが出迎える
function guildWelcome(has) {
  { const r = typeof runLine === 'function' ? runLine('ria') : null; if (r) return r; }
  const close = (G.seen || {}).ria;
  const L = has ? [
    'リア[smile]「おかえりなさい！ 無事でよかった。\n……戦利品、ボルツさんに回しますね」',
    'リア[smile]「おかえりなさい。到達記録、書いておきますね。\n持ち込みはそちらでどうぞ」',
    'リア「おかえりなさい。……ケガはないですか？\nあ、戦利品はこちらです」',
    'リア[smile]「おかえりなさい。今日はどこまで行きました？\n……あとで、ゆっくり聞かせてくださいね」',
  ] : [
    'リア[smile]「おかえりなさい。……今日は手ぶら、ですか？\n生きて帰ってくるのが一番です」',
    'リア「おかえりなさい。記録だけ、書いておきますね」',
    'リア[smile]「おかえりなさい。また明日がありますよ」',
  ];
  if (close) L.push(has ? 'リア[happy]「おかえりなさい。……待ってました。\nほんとに、待ってたんですから」' : 'リア[happy]「おかえりなさい。手ぶらでも、\n顔を見せてくれるだけでうれしいです」');
  return pick(L);
}
function returnScreen(msg, brought, letter) {
  viewScreen('帰還', false, true);
  // セリフ欄には短いことばだけ。持ち帰った物はボタンの上に出す（セリフ欄からはみ出さないように）
  say(brought === 'なし' ? 'tired' : 'content', `${msg ? msg + '\n' : ''}「……ふう、戻ったか」`, true);
  if (letter) log('お城から手紙が届いていた。\n町の門の下から、お城へ行けるようになった。');
  buttons([{ title: `持ち帰った戦利品: ${brought}` }, { t: 'ギルドへ', s: brought === 'なし' ? '到達記録を書いてもらう' : '戦利品を素材にしてもらう', hot: true, go: true, f: () => evReady('jenny', .35) ? jennyEvent() : inside('guild', guildWelcome(brought !== 'なし')) }]); hud();
}
// オープニング（2026-11-24 Daichiさんの文章）。bg: 背景の絵 face: 主人公のセリフのときの表情
const INTRO = [
  { y: 0, t: 'エルディア王国の真ん中に、\n天まで届く大きな塔がある。\nその頂を見た者は、誰もいない。' },
  { y: 45, t: '人々は塔で鉱石を掘り、\n魔物を狩り、食べ、売って暮らす。\n塔の恵みが、この国を支えていた。' },
  { y: 100, t: 'やがて塔を目指す人が増え、\n素材は高く、質も落ちていった。\n鍛冶屋にとっては、頭の痛い話だ。' },
  { y: 85, x: 15, t: '町に、一人の鍛冶屋がいた。\n齢四十。腕は確かな職人だが、\n性格はいたってのんびり屋。' },
  { y: 100, x: 55, t: '誰かのために剣を打ち、\n帰らぬ人を待つ日もあった。\nそれでも今日も、鉄を打つ。' },
  { y: 70, x: 50, face: 'lookup', t: 'ある日、鍛冶屋はふと思った。\n「材料が高いなら……\n自分で採りに行けばいいか」' },
  { y: 60, x: 45, t: '町の人々は目を丸くした。\n近衛兵長ギャバンの記録は八十六階。\nその先は、誰も知らない。' },
  { y: 0, z: 1.05, face: 'smile', t: '鍛冶屋は大きな塔を見上げた。\n「まぁ〜、どうにかなるんじゃないか」' },
];
function titleScreen() {
  SND_INDOOR = false;
  mode = 'town'; place = null; showTown(true, 2 / 3); document.body.classList.add('story', 'title');
  const t = $('town'); t.className = 'box town'; t.innerHTML = `<img src="${TOWN_IMG}title.jpg" alt="Tower of Hope">`;
  const anySlot = [1, 2, 3].some(n => slotInfo(n));
  const L = [{ t: 'はじめから', hot: !load(), f: () => load() ? resetGame() : (G = NEW_GAME(), save(), intro(0)) }, { t: 'ロード', s: anySlot ? 'セーブしたデータから' : 'オートセーブ', off: !load() && !anySlot, f: () => openMenu('load') }, { t: '設定', s: '音・文字の速さ・揺れ', f: () => openMenu('opt') }];
  if (load()) L.unshift({ t: 'つづきから', hot: true, f: () => { G = load(); townMap(); say('normal', '「さて、今日も行くか」\n工房の火はまだ温かい。', true); } });
  // iPhoneは最初のタップまで音が出せないので、まず「タップしてはじめる」でタイトルの曲を鳴らす
  if (!SND.unlocked) buttons([{ t: 'タップしてはじめる', hot: true, f: () => buttons(L) }]); else buttons(L);
  log('', true); hud();
  { const v = document.createElement('div'); v.textContent = 'ver 121'; v.style.cssText = 'position:absolute;right:6px;bottom:4px;font-size:10px;color:#fff8;text-shadow:0 0 3px #000'; t.appendChild(v); }
}
// オープニング: 絵を画面いっぱいに出し、文章を真ん中に1行ずつ浮かべて、自動で次へ進む（画面を押すと早送り）
function intro(i) {
  const I = INTRO[i], t = $('town');
  if (i === 0 || !document.body.classList.contains('intro')) {
    viewScreen('', true); document.body.classList.add('intro');
    t.innerHTML = `<img class="intro" src="${TOWN_IMG}intro_tower.jpg" alt=""><div class="cine"></div>`;
    t.onclick = () => { if (document.body.classList.contains('intro')) introNext(); };
    log('', true); buttons([{ t: 'とばす', stay: true, f: () => introEnd() }]); fitStage();
  }
  intro.i = i;
  const c = t.querySelector('.cine');
  c.classList.remove('out');
  c.innerHTML = I.t.split('\n').map((l, k) => `<span class="${/[「」]/.test(l) ? 'q' : ''}" style="animation-delay:${.3 + k * .7}s">${l}</span>`).join('');
  clearTimeout(intro.tm); intro.tm = setTimeout(introNext, 2600 + I.t.length * 85);
}
function introNext() {
  clearTimeout(intro.tm); const i = intro.i, c = $('town').querySelector('.cine');
  if (i >= INTRO.length - 1) { introEnd(); return; }
  if (c) c.classList.add('out');
  intro.tm = setTimeout(() => intro(i + 1), 500);
}
function introEnd() {
  clearTimeout(intro.tm); if (!document.body.classList.contains('intro')) return;
  $('town').onclick = null;
  fadeGo(() => { document.body.classList.remove('intro'); nameScreen(prologue); }, { hold: 500 });
}
// 町の地図の印
function townMark(id) {
  const rawN = Object.values(G.raw || {}).reduce((a, b) => a + b, 0);
  if (id === 'guild' && rawN) return 'new';
  if (id === 'south' && G.castle && !G.castleSeen) return 'new';
  const who = { weapon: 'jenny', clinic: 'elly', guild: 'ria' }[id];
  if (who && G.runs > 0 && canTalk(who)) return 'talk';
  return '';
}
// 次の目標（10階ごとの主を順に）
function nextGoal() {
  if (!G.maxFloor) return '塔に入ってみる';
  for (let f = 10; f < TOP_FLOOR; f += 10) if (!bossBeat(f)) { const lv = Math.round(3 + f * .7); /* 2026-11-25: レベルの上がり方（2乗）に合わせた目安 */ return (G.maxFloor < f ? `${f}階を目指す` : `${f}階の主を倒す`) + `（目安Lv${lv}${f === 10 ? '・鉄の装備' : ''}）`; }
  return G.cleared ? '塔のてっぺんに立った。……また登るのも、悪くない' : '100階へ。てっぺんで、何かが待っている';
}
function townMap() {
  place = null; showTown(true, 2 / 3);
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}map.jpg" alt="塔の国の町">`;
  for (const [id, p] of Object.entries(PLACES)) {
    const [x0, y0, x1, y1] = p.box, b = document.createElement('button');
    b.className = 'hot'; b.setAttribute('aria-label', p.name);
    Object.assign(b.style, { left: (x0 / 466 * 100) + '%', top: (y0 / 700 * 100) + '%', width: ((x1 - x0) / 466 * 100) + '%', height: ((y1 - y0) / 700 * 100) + '%' });
    b.onclick = () => fadeGo(() => outside(id), { walk: true }); t.appendChild(b);
    // 「！」＝やること・新しいこと、吹き出し＝話せる人がいる
    const mk = townMark(id); if (mk) { const e = document.createElement('div'); e.className = 'mark ' + mk; e.textContent = mk === 'new' ? '！' : '…'; Object.assign(e.style, { left: ((x0 + x1) / 2 / 466 * 100) + '%', top: ((id === 'south' ? (y0 + y1) / 2 + 20 : y0) / 700 * 100) + '%' }); t.appendChild(e); }
  }
  { const g = document.createElement('div'); g.className = 'goal'; g.innerHTML = `<small>目標</small>${nextGoal()}`; t.appendChild(g); }
  buttons([]);
  log('行きたい場所を押してね。', true); hud();
}
function outside(id) {
  const p = PLACES[id], t = $('town');
  if (id === 'south') { gateScreen(); return; }
  place = id; SND_INDOOR = false;
  if (id === 'tower') { towerScreen(); return; }
  if (id === 'statue') { statueScreen(); return; }
  showTown(true, 4 / 3); t.className = 'box town';
  t.innerHTML = `<img class="bg" src="${TOWN_IMG}map.jpg" alt=""><img class="fg" src="${TOWN_IMG}${id}_out.png" alt="${p.name}の外観"><div class="name">${p.name}</div>`;
  buttons([{ t: '入る', hot: true, f: () => inside(id) }, { t: '戻る', f: townMap }]);
  log(`${p.name}の前に来た。`, true); hud();
}
function inside(id, msg) {
  place = id; SND_INDOOR = true; SND.lost = false; sfx('door'); showTown(true, 4 / 3); const p = PLACES[id], t = $('town');
  t.className = 'box town'; t.innerHTML = `<img src="${TOWN_IMG}${id}_in.jpg" alt="${p.name}の中"><div class="name">${p.name}</div>` ; if (id !== 'home') npcFig(id);
  if (id === 'home' && !msg && typeof jennyHomeEv === 'function' && jennyHomeEv()) return;  // ジェニー専用イベント
  if (id === 'home' && !msg && homeCallReady()) { homeCall(); return; }
  if (id === 'weapon' && !msg && typeof jennyStoryKey === 'function' && jennyStoryKey()) { const k = jennyStoryKey(); jennySeq(k, () => inside('weapon', k === 's1' ? 'ジェニー「……さ、仕事仕事。何か用？」' : 'ジェニー[shy]「……で、今日は何を買うの？」')); return; }
  const lastSaid = msg || greet(id); log(lastSaid, true);
  { const sp = /^([^\s「\[]+)(?:\[(\w+)\])?/.exec(lastSaid || ''); if (sp && sp[1] === 'ブッパ') npcFig('buppa_' + (NPCS['ブッパ'][sp[2] || 'normal'] || 'sleep')); else if (sp && NPCS[sp[1]] && ['ボルツ', 'アルス', '客', 'チッチ', 'ルゥ'].includes(sp[1])) npcFig(NPCS[sp[1]].id); }
  if (id === 'inn') inn.first = lastSaid;
  ({ home: homeMenu, weapon: shop, clinic: clinic, guild: guild, item: itemShop, bank: bank, inn: inn })[id](); hud();
}
const leave = { t: '外に出る', tail: true, f: () => townMap() };
// ---------- 親密度と会話 ----------
const WHO_NAME = { jenny: 'ジェニー', elly: 'エリー', ria: 'リア', fuuka: 'フウカ', jin: 'ジン' };
const perk = who => (G.aff[who] || 0) >= AFF_NEED;
// 親密度は、塔をどこまで登ったかで上限がある（2026-11-25）。〜19階: 4まで／20階〜: 9まで（個別のイベント）／40階〜: 好意と特典／60階〜: 家に来る
const HEROINES = ['jenny', 'elly', 'ria', 'fuuka'];
const AFF_STEP = [[20, 4], [40, AFF_NEED - 1]];
const affCap = who => { if (!HEROINES.includes(who)) return Infinity; for (const [f, c] of AFF_STEP) if ((G.maxFloor || 0) < f) return c; return Infinity; };
const affNext = () => { for (const [f] of AFF_STEP) if ((G.maxFloor || 0) < f) return f; return 0; };
function affAdd(who, pt) { const b = G.aff[who] || 0, c = affCap(who); G.aff[who] = pt > 0 && b + pt > c ? Math.max(b, c) : b + pt; return pt > 0 && b + pt > c; }
const canTalk = who => G.talkRun[who] !== G.runs;
function talkBtn(who, back) { return { t: '話す', tail: true, s: canTalk(who) ? WHO_NAME[who] : 'また今度', off: !canTalk(who), f: () => talkTo(who, back) }; }
function talkTo(who, back) {
  // 塔を登るほど話が変わる: 今の段階（なければ前の段階）で、まだ聞いていない話を先に出す
  const st = typeof TALKS_ST !== 'undefined' && TALKS_ST[who], used = (G.talkUsed = G.talkUsed || {})[who] = G.talkUsed[who] || [];
  let stKey = null, stT = null;
  if (st) { const now = talkStage(), order = ['clear'].concat(TALK_STAGES.slice().reverse()).filter(k => k === now || (now === 'clear' ? true : k !== 'clear' && k <= now));
    for (const k of order) { const L = st[k] || []; const j = L.findIndex((_, n) => !used.includes(k + '-' + n)); if (j >= 0) { stKey = k + '-' + j; stT = L[j]; break; } } }
  const close = (G.seen || {})[who] && TALKS_CLOSE[who], key = close ? who + '_close' : who;
  // 親密度ごとの話（まだ聞いていないもの優先。全部聞いたら、前からの会話と交互に）
  let tr = null; if (!stT && typeof TALKS_TIER !== 'undefined' && TALKS_TIER[who]) { const P = TALKS_TIER[who][affTier(who)], fresh = P.some((_, n) => !used.includes(`${affTier(who)}-${n}`)); if (fresh || R() < .5) tr = tierTalk(who); }
  const list = close || TALKS[who], i = (G.talkIdx[key] || 0) % list.length, T = stT || (tr && tr.T) || list[i];
  log(T.q, true);
  buttons(T.a.map(([ans, pt, reply]) => ({ t: ans, f: () => {
    const before = G.aff[who] || 0, capped = affAdd(who, pt); if (stKey) used.push(stKey); else if (tr) { G.talkUsed[who].push(tr.key); (G.tierLast = G.tierLast || {})[who] = tr.key; } else G.talkIdx[key] = i + 1; G.talkRun[who] = G.runs; save();
    log(reply + (capped ? `\n（……今はまだ、これ以上は近づけない気がする。${affNext()}階まで登れば、何か変わるだろうか）` : ''), true);
    const done = () => buttons([{ t: '戻る', hot: true, f: back }]);
    if (before < AFF_NEED && G.aff[who] >= AFF_NEED) { buttons([{ t: '……', hot: true, f: () => { affEvent(who); buttons([{ t: '……！', hot: true, f: () => { log(`親密度の特典: ${AFF_PERKS[who]}`, true); done(); } }]); } }]); return; }
    done();
  } })), 'three');
}
// 親密度が届いたとき: 向こうから好意を示してくる＋特典
function affEvent(who) {
  const L = {
    jenny: (G.seen || {}).jenny ? 'ジェニー[inlove]「……あの雨の夜から、私、もう隠すのやめたの。\n……覚悟しなさいよね」' : 'ジェニー[inlove]「ねえ……あんたって、誰にでもそんなに優しいの？\n……私にだけなら、いいのに」',
    elly:  'エリー[happy]「今日は怪我ではないんですね。……よかった。\n……いえ、その……お顔が見られて、嬉しかったので」',
    ria:   'リア[happy]「鍛冶屋さんとお話ししてると、なんだか安心するんです。\n……仕事中でも、つい、扉のほうを見ちゃうんですよ」',
    fuuka: 'フウカ[love]「……あなたといると、時々、自分が忍びであることを忘れそうになります。\n……忘れはしませんが。……少しだけ、です」',
    jin:   'ジン[laugh]「お主には、いずれ教えたいことがある。……その時が来たらな」',
  };
  if (who === 'jenny') npcFig('weapon_inlove');
  if (who === 'forest') setTimeout(() => godBp('forest'), 1200);
  log(L[who] || `${TOWER_NPCS[who].name}[laugh]「あなたのこと、気に入ったわ。……また会いに来なさい」\n「ああ。また寄らせてもらう」`, true);
}
// 店の中の立ち絵を入れ替える（ギルドの加工職人など）
function npcFig(id) {
  const who = id.split('_')[0];
  showFig(`assets/npc/${id}.webp`, { who, mode: id === 'bar' ? 'wide' : id.startsWith('buppa') ? 'full' : undefined });
}

function homeMenu() {
  buttons([{ title: `工房の素材: ${matText(G.store)}` },
    ...((G.visit && G.visit.run === G.runs ? G.visit.who : []).map(w => ({ t: `${VNAME[w]}と話す`, s: '遊びに来ている', hot: true, f: () => { npcFig(VISIT_FIG[w]); talkTo(w, () => inside('home')); } }))),
    typeof banterBtn === 'function' ? banterBtn() : null,
    { t: '鍛冶をする', s: '武具を打つ', hot: true, f: forge },
    { t: '休む', s: 'HP全回復', f: () => { if (G.hp >= G.mhp) { say('doubt', '「……まだ眠くないな」', true); return; } G.hp = G.mhp; save(); sleepScene(() => say('calm', `自分のベッドで眠った。炉の音が子守唄だ。\nHPが回復した。${G.injuries.length ? '\n……ケガは、寝ても治らない。治療院に行こう。' : ''}`, true)); } },
    { t: 'ステータス', s: `Lv${G.lv} ${job()}`, f: () => statusMenu(homeMenu) },
    { t: '書棚', s: `図鑑・武器の手引き`, f: () => { sfx('page', { vol: .6 }); openMenu('dex'); } },
    { t: '装備を変える', s: job(), f: () => equipMenu(homeMenu) },
    { t: 'ツール', s: toolName(), f: () => toolMenu(homeMenu) },
    { t: '技を選ぶ', s: `${Math.min(G.loadout.skills.length, SKILL_MAX)}/${SKILL_MAX}`, f: () => skillMenu(homeMenu) },
    { t: 'パッシブ', s: `${G.loadout.passives.length}/${PASSIVE_SLOTS}`, f: () => passiveMenu(homeMenu) },
    { t: G.als ? 'アルスと行く' : 'アルスを誘う', s: G.als ? '準備できてる' : `1〜${ALS_TOP}階`, off: G.als, f: () => { G.als = true; save(); npcFig('als'); homeMenu(); log(pick(['アルス[laugh]「本当ですか！ 師匠と一緒に塔へ……！ すぐ準備します！」', 'アルス[smile]「はい！ 足手まといにはなりません。特訓の成果、見ててください！」']), true); } },
    leave].filter(Boolean));
}
// 塔の入口: 塔の大きさを見せる。コマンドは 入る／準備する／戻る
function towerScreen(msg) {
  place = 'tower'; showTown(true, 941 / 1672);
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}tower.jpg" alt="塔の入口"><div class="name">塔</div>`;
  buttons([{ t: '入る', hot: true, stay: true, f: () => (G.maxFloor >= 90 && !(G.jstory || {}).s3 && !G.cleared) ? jennySeq('s3', () => towerScreen('「……行ってくる」')) : G.sentOff ? enterMenu() : sendOff() }, { t: '女神の像', s: G.warps.length ? `ワープ ${G.warps.length}か所` : 'まだ光っていない', f: warpMenu }, { t: '準備する', f: prepMenu }, { t: '戻る', f: townMap }]);
  if (msg) say('resolve', msg, true); else log(pick(PLACES.tower.hello), true);
  if (!msg && G.gold > 0) log(`手持ちの${G.gold}Gは、倒れるとなくなる。`);
  if (!msg && G.injuries.length) say('tired', `${G.injuries.map(k => INJURIES[k].name).join('・')}が痛む。\n「……まぁ〜、どうにかなるんじゃないか」`);
  hud();
}
// ---------- ジン（設定資料 Ver.1.0 / 2026-11-25） ----------
// いつ来ても像の前にいる老人。実は像の剣士本人。塔の意志を感じ取った人で、女神や鏡のことは知らない
// 流れ: 初めて会う（像は強そうか？）→ 塔の進み具合で話が変わる → 親密度が届き50階に着くと正体を明かす → 稽古で「無心」と奥義「一閃」→ 90階で「流水」
const JIN_HELLO = {
  early: ['ジン「ほっほっほ。また塔へ行くのか？」', 'ジン「お主、鍛冶屋じゃったな？ 剣を作る者が、自分で振るうとは面白いのう」', 'ジン[smile]「今日もよい日和じゃ。像も、気持ちよさそうじゃろ？」', 'ジン[laugh]「四十から冒険を始めるとは、なかなかやるのう。ほっほっほ」'],
  mid: ['ジン[think]「ふむ……お主、少し腕を上げたようじゃな」', 'ジン「じゃが、まだ肩に力が入りすぎておる。剣は、力任せに振ればよいというものではないぞ」', 'ジン[smile]「しくじったか？ ほっほっほ。しくじった日は、学ぶことが多い日じゃ」', 'ジン「急がんでよい。塔は、逃げはせんよ」'],
  late: ['ジン[think]「……ほう。あそこまで登ったか」', 'ジン[think]「お主、塔の中で何か感じたことはないか？ ……そうか。ほっほっほ。いや、何でもない」', 'ジン「上のほうは、空気が違うじゃろう。……ゆっくり息をするんじゃぞ」'],
  known: ['ジン[laugh]「ほっほっほ。今日も像を磨いておいたぞ。……自分で自分を磨くのは、妙な気分じゃがな」', 'ジン「本当に難しいのは、誰かに勝つことではない。自分自身と、うまく付き合っていくことじゃよ」', 'ジン[smile]「まあ、人生、どうにかなるものじゃよ」', 'ジン「ほっほっほ。また会ったのう、鍛冶屋の」'],
  clear: ['ジン[laugh]「ほっほっほ。帰ってきたか。……てっぺんで何を見たか？ いや、言わんでよい。顔に書いてある」', 'ジン[smile]「強くなったのう。……いや、強さの話ではない。いい顔になった、ということじゃ」'],
};
function jinHello() {
  if (G.cleared) return pick(JIN_HELLO.clear);
  if (G.jinReveal) return pick(JIN_HELLO.known);
  const f = G.maxFloor || 0; return pick(f >= 50 ? JIN_HELLO.late : f >= 20 ? JIN_HELLO.mid : JIN_HELLO.early);
}
// 初めて会ったとき
function jinFirst() {
  const after = (pt, line) => { G.jinMet = true; affAdd('jin', pt); save(); log(line, true); buttons([{ t: '次へ', hot: true, f: () => { log('ジン[smile]「わしはジン。この像の前で日向ぼっこをするのが、仕事みたいなものじゃ。\n……また来るとよい、鍛冶屋の」', true); statueButtons(); } }]); };
  log('ジン[smile]「ほっほっほ。見事な銅像じゃろ？\n昔、この国には、たいそう腕の立つ剣士がおったそうじゃ。\n……どうじゃ？ 強そうに見えるかの？」', true);
  buttons([
    { t: '「ああ、強そうだ」', hot: true, f: () => after(2, 'ジン[laugh]「ほっほっほ！ そうじゃろ、そうじゃろ！\nなかなか見る目があるのう！」') },
    { t: '「格好つけすぎじゃないか」', f: () => after(1, 'ジン[laugh]「ほっほっほ！ 手厳しいのう！\nまあ、銅像というものは、少々格好よく作りすぎるものじゃからな」') },
    { t: '「それより腹が減った」', f: () => after(1, 'ジン[smile]「ほっほっほ。そうか、そうか。\nまあ、昔の英雄より、今日の飯のほうが大事じゃな」') },
  ], 'one');
}
// 正体・稽古・流水（順番に、一度ずつ）
function jinTeach() {
  const k = !G.jinReveal ? (perk('jin') && G.maxFloor >= 50 ? 'reveal' : null) : !G.learned.includes('jin1') ? 'jin1' : G.maxFloor >= 90 && !G.learned.includes('jin2') ? 'jin2' : null;
  if (!k) return null;
  const T = { reveal: ['話を聞く', 'ジンが何か言いたそうだ'], jin1: ['稽古をつけてもらう', '奥義を教わる'], jin2: ['技を教わる', 'ジンから'] }[k];
  return { t: T[0], s: T[1], hot: true, f: () => {
    const L = k === 'reveal' ? [
      { fig: 'jin', t: 'ジン[think]「……鍛冶屋の。お主には、そろそろ話してもよいかもしれんのう」' },
      { fig: 'jin', t: 'ジン「この銅像の男じゃがな……」' },
      { fig: 'jin', t: 'ジン[smile]「実は、わしなんじゃよ」' },
      { hero: 'shock', t: '「……え？」' },
      { fig: 'jin', t: 'ジン[laugh]「ほっほっほ！ 信じられんか？\nまあ、無理もない。わしも、ずいぶん老けたからのう」' },
      { fig: 'jin', t: 'ジン「若い頃は、誰よりも強くなりたいと思っておった。\n強い敵を倒して、誰よりも高く登る。……それが強さじゃと、信じておった」' },
      { fig: 'jin', t: 'ジン[think]「じゃが、塔の上のほうでな。妙な感じがしたんじゃ。\n……塔が、わしらを見ておる、とな」' },
      { fig: 'jin', t: 'ジン「怖くはなかった。子どもが、知らん大人をじっと見つめるような……そんな目じゃった」' },
      { fig: 'jin', t: 'ジン[think]「塔は生きておる。そして、人間を知ろうとしておる。\n……わしにわかったのは、そこまでじゃ」' },
      { fig: 'jin', t: 'ジン[smile]「強さとは何か。長いこと考えて、ようやく答えらしきものに辿り着いた。\n真の強さとは、自分自身を知ることじゃ」' },
      { fig: 'jin', t: 'ジン[laugh]「それがわかったら、もう剣はいらんようになってのう。\n……ほっほっほ。それで、ここで日向ぼっこじゃ」' },
    ] : k === 'jin1' ? [
      { fig: 'jin', t: 'ジン[smile]「さて、少しばかり稽古をつけてやろうかの」\nジンは木の枝を一本拾って、こちらに向き直った。' },
      { fig: 'jin', t: 'ジン「遠慮はいらん。好きなように打ち込んでみい」' },
      { fig: 'jin', sfx: 'swing', t: '打ち込んだ。……当たらない。\nもう一度。……当たらない。ジンは、ほとんど動いていない。' },
      { fig: 'jin', t: 'ジン[laugh]「ほっほっほ。まだまだじゃな。\nお主は、相手ばかり見ておる」' },
      { fig: 'jin', t: 'ジン「まずは、自分の心を見つめてみい。\n恐れも、焦りも、欲も、すべてお主自身じゃ。それを無理に消そうとする必要はない」' },
      { fig: 'jin', t: 'ジン[think]「ただ、心を静かにするのじゃ」' },
      { fig: 'jin', t: '炉の前に立つときのように、息をととのえた。\n……槌を振り下ろす、あの一瞬のように。' },
      { fig: 'jin', sfx: 'slash', t: '枝が、ジンの袖をかすめた。' },
      { fig: 'jin', t: 'ジン[smile]「ほっほっほ。ようやく掴んだようじゃな。\nそれが『無心』。……そこから放つ一太刀を、わしは『一閃』と呼んでおった」' },
      { fig: 'jin', t: 'ジン「忘れるでないぞ。\nどれほど強い敵と向き合おうとも……己を見失わぬことじゃ」' },
      { fig: 'jin', t: 'ジン[smile]「……そうじゃ、これも渡しておこう。昔使っておった剣の、作り方じゃ」\n（名品「名もなき剣」の設計図をもらった）' },
    ] : [
      { fig: 'jin', t: 'ジン[think]「……ほう。そこまで登ったか」' },
      { fig: 'jin', t: 'ジン「塔の目は、まだお主を見ておるか？ ……そうか。\nあやつも、ずいぶんお主が気に入ったようじゃな」' },
      { fig: 'jin', t: 'ジン「最後に、もうひとつだけ教えよう。『流水』。\n受けるのではない。流して、返すのじゃ」' },
      { fig: 'jin', t: 'ジン[smile]「上で何が待っておるか、わしは知らん。\nじゃが……己を見失わなければ、大丈夫じゃ」' },
    ];
    runSeq(L, 0, () => {
      if (k === 'reveal') { G.jinReveal = true; save(); statueScreen('ジン[laugh]「ほっほっほ。じゃが、明日からも、わしはただの日向ぼっこのじいさんじゃ。よろしくのう」'); return; }
      G.learned.push(k); if (k === 'jin1') { G.bp = G.bp || []; if (!G.bp.includes('mk_nameless')) G.bp.push('mk_nameless'); } if (G.loadout.skills.length < SKILL_MAX) G.loadout.skills.push(k); save(); sfx('levelup', { vol: .8 }); bigFx(`<b>技を覚えた</b><em>${SKILLS[k].name}</em><small>${SKILLS[k].desc}（どのジョブでも使える）</small>`); statueScreen('ジン[smile]「さて、わしは昼寝の時間じゃ」'); });
  } };
}
function statueButtons() {
  const L = [{ t: '碑文を読む', f: () => { log('「剣士ジン　塔に挑み、多くの民を救いし者」\n……台座の文字は、少しすり減っている。', true); if (G.jinMet && !G.jinReveal) setTimeout(() => { log('「ジン……。あのじいさんと、同じ名前だな」'); log('ジン[laugh]「ほっほっほ。よくある名前じゃよ」'); }, 900); } }];
  L.push(talkBtn('jin', () => statueScreen(byeLine('jin')))); const tj = jinTeach(); if (tj) L.push(tj);
  L.push({ t: '戻る', f: townMap });
  buttons(L); hud();
}
function statueScreen(msg) {
  place = 'statue'; showTown(true, 0);
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}statue.jpg" alt="剣士の像"><div class="name">剣士の像</div>`;
  npcFig('jin');  // ジンは、いつ来ても像の前にいる
  if (!G.jinMet && (G.aff.jin || 0) > 0) G.jinMet = true;  // 前の版で、もう話したことがある
  if (!G.jinMet) { hud(); jinFirst(); return; }
  statueButtons();
  log(msg || jinHello(), true);
}
// ---------- お城（50階に着いて生きて戻ると行ける） ----------
function castleScreen() {
  place = 'castle'; G.castleSeen = true; showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}castle_out.jpg" alt="お城"><div class="name">お城</div>`;
  buttons([{ t: '入る', hot: true, f: () => castleHall() }, { t: '戻る', f: townMap }]);
  log('門兵[smile]「鍛冶屋殿、どうぞ。王がお待ちです」', true); hud();
}
const CASTLE_TALK = {
  king: [[50, ['王様[laugh]「おお、来たか鍛冶屋！ 50階だと？ わっはっは、たいしたもんだ！」', '王様「わしの若い頃より強いんじゃないか？ ……いや、わしは登ったことないがな！」']],
         [70, ['王様[laugh]「70階か！ 国じゅうがお前の話をしておる。期待しとるぞ！」']],
         [86, ['王様「ギャバンの記録に並んだか……。いや、越えてくれ。この国の夢だ」']],
         [87, ['王様[laugh]「越えたか！ ギャバンの記録を、越えおったか！ わっはっは、今夜は祝いじゃ！」', '王様「誰も見たことのない階か……。土産話を、楽しみにしておるぞ」']]],
  minister: [[50, ['大臣「よくぞご無事で。何か困ったことがあれば、何でも言ってください」', '大臣[smile]「陛下はああ見えて、毎晩あなたの記録を読んでおられます」']],
             [70, ['大臣「塔の情報で必要なものがあれば、王宮の書庫を開けましょう」']],
             [87, ['大臣[smile]「87階……。王宮の書庫にも、そこから先の記録はございません。あなたが最初の一行です」']]],
  gaban: [[50, ['ギャバン[laugh]「鍛冶屋殿！ お会いしたかった！ その剣、自分で打ったのですか！？」', 'ギャバン「自分は2年前、86階で引き返しました。……敵が強すぎたのです」']],
          [70, ['ギャバン「70階……！ 自分は、あなたなら越えられると信じています！」']],
          [86, ['ギャバン[laugh]「86階……自分の記録です。ここから先は、あなたの道です！」']],
          [87, ['ギャバン「……っ、87階……。鍛冶屋殿……自分は……自分は……！」\n近衛兵長は、目元を袖でぬぐった。', 'ギャバン[laugh]「2年間、ずっと、誰かに越えてほしかったのです。……ありがとうございます！」']]],
};
// 王様からの褒美: 50・60・70・80・87階を越えるたびに1つずつ
const GIFTS = [
  { floor: 50, say: '王様[laugh]「50階を越えた祝いじゃ！ 王家の宝物庫から、お前の得物と同じ種類のを持ってこさせた。使え！」', give: () => royalWeapon('royal') },
  { floor: 60, say: '王様「60階か。近衛の鎧をやろう。ギャバンと同じ鎧じゃ。……ちと重いがな！」', give: () => royalItem('royal_armor') },
  { floor: 70, say: '王様[laugh]「70階！ 王家の盾じゃ。わしの爺さんの、そのまた爺さんの盾じゃ。大事にせい」', give: () => royalItem('royal_shield') },
  { floor: 80, say: '王様「80階……。薬と金じゃ。足りなくなったら、また来い」', give: () => { G.items.herb_l += 3; G.items.wing += 2; G.gold += 1000; return '大薬草3つ、帰還の羽2つ、1000G'; } },
  { floor: 87, say: '王様「……ギャバンの記録を越えたな。これは、この国でいちばんの宝じゃ。お前に託す」', give: () => royalWeapon('treasure') },
];
function royalItem(id) { const r = RECIPES.find(x => x.id === id); G.gear.push(newGear(r)); return r.name; }
function royalWeapon(kind) { const w = mainWeapon(), t = w && w.type !== 'shield' ? w.type : 'sword'; return royalItem(kind + '_' + t); }
function giftBtn() {
  G.gifts = G.gifts || []; const g = GIFTS.find(x => G.maxFloor >= x.floor && !G.gifts.includes(x.floor));
  if (!g) return { t: '褒美', s: 'もらった', off: true, f: () => {} };
  return { t: '褒美をもらう', s: `${g.floor}階を越えた祝い`, hot: true, f: () => {
    G.gifts.push(g.floor); const what = g.give(); save(); npcFig('king'); sfx('chest', { vol: .8 }); playFx('sparkle', { x: VW / 2, y: VH / 2, size: .8 });
    bigFx(`<b>王様からの褒美</b><em>${what}</em><small>${g.floor}階を越えた祝い（装備は工房の「装備を変える」から）</small>`, 'levelup');
    castleHall(g.say);
  } };
}
const castleLine = who => { let L = CASTLE_TALK[who][0][1]; for (const [n, l] of CASTLE_TALK[who]) if (G.maxFloor >= n) L = l; return pick(L); };
function castleHall(msg) {
  place = 'castle'; showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}castle_in.jpg" alt="謁見の間"><div class="name">謁見の間</div>`;
  npcFig('king');
  const talk = who => () => { npcFig(who); log(castleLine(who), true); };
  buttons([{ t: '王様と話す', hot: true, f: talk('king') }, { t: '大臣と話す', f: talk('minister') }, { t: 'ギャバンと話す', f: talk('gaban') },
    giftBtn(), { t: '戻る', f: castleScreen }]);
  log(msg || castleLine('king'), true); hud();
}
// 女神の像: 触ると、女神に会ったエリアの最初の階へワープできる
function warpMenu() {
  // 4人の女神の像を並べて出す。加護を受けた像だけが光る
  showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  const lit = id => G.warps.some(n => GOD_OF_AREA[n] === id);
  t.innerHTML = `<div class="statues">${['forest', 'desert', 'mountain', 'ice', 'druid'].map(id => `<img class="${lit(id) ? 'lit' : ''}" src="${TOWN_IMG}gstatue_${id}.png" alt="${TOWER_NPCS[id].name}の像">`).join('')}</div><div class="name">女神の像</div>`;
  if (!G.warps.length) { buttons([{ t: '戻る', f: () => towerScreen() }]); log('塔の入口に、5人の女神の像が並んでいる。\nまだどれも光っていない。……塔の中で、女神に会えたら。', true); return; }
  const L = G.warps.map(n => ({ t: `${n}階へ`, s: `${TOWER_NPCS[GOD_OF_AREA[n]].name}・${areaOf(n)[2]}`, f: () => { log(`${TOWER_NPCS[GOD_OF_AREA[n]].name}の像に触れた。光に包まれて……`, true); setTimeout(() => goFloor(n), 400); } }));
  L.push({ t: 'やめる', f: () => towerScreen() });
  buttons(L, L.length > 6 ? 'three small' : ''); log('女神の像が、やさしく光っている。どこへ行く？', true);
}
function enterMenu() {
  if (G.maxFloor < 5) { goFloor(1); return; }
  const opts = [{ t: '1階から', hot: true, f: () => goFloor(1) }, { t: '5階から', s: '昇降機', f: () => goFloor(5) }];
  if (G.maxFloor >= 10) opts.push({ t: '10階から', s: '昇降機', f: () => goFloor(10) });
  opts.push({ t: 'やめる', f: () => towerScreen('「……どうしようか」') });
  buttons(opts); log('どこから登る？', true);
}
// ツール: 1回の塔のぼりに1つだけ持っていける。塔の中では「ツール」のコマンドで使う
const toolName = () => { const t = gearBy(G.equip.tool); return t ? `${t.name} ${t.dur}/${t.maxDur}` : 'なし'; };
function toolMenu(back) {
  const tools = G.gear.filter(g => g.type === 'tool');
  const L = [{ title: '持っていくツール（1回に1つだけ）' }];
  if (!tools.length) L.push({ t: 'ツールがない', s: '工房で打てる', off: true, f: () => {} });
  for (const g of tools) { const on = G.equip.tool === g.uid;
    L.push({ t: g.name + (on ? ' ✓' : ''), s: `耐久${g.dur}/${g.maxDur}`, hot: on, f: () => { G.equip.tool = on ? null : g.uid; sfx('equip'); save(); toolMenu(back); } }); }
  L.push({ t: '戻る', f: back });
  buttons(L);
  log('ツールは、正面の壁に向かって「ツール」で使う。\n石の壁はツルハシ、木は木こりの斧、砂はシャベルが得意。', true);
}
// 塔の中の「ツール」コマンド
function useTool() {
  const t = gearBy(G.equip.tool);
  if (!t) { log('ツールを持ってきていない。\n（塔の入口の「準備する」で選べる）', true); return; }
  const d = digInfo();
  if (!d) { log(`${t.name}は、正面の壁に向かって使う。`, true); return; }
  if (!d.ok) { log(d.label === '塔の骨' ? 'この壁は「塔の骨」だ。掘れない。' : `${t.name}が壊れている。工房で直そう。`, true); return; }
  dig();
}
function prepMenu() {
  const back = () => prepMenu();
  buttons([{ t: 'ステータス', s: `Lv${G.lv} ${job()}`, f: () => statusMenu(back) }, { t: '装備を変える', s: job(), f: () => equipMenu(back) },
    { t: 'ツールを選ぶ', s: toolName(), hot: !G.equip.tool && G.gear.some(g => g.type === 'tool'), f: () => toolMenu(back) },
    { t: '技を選ぶ', s: `${Math.min(G.loadout.skills.length, SKILL_MAX)}/${SKILL_MAX}`, f: () => skillMenu(back) },
    { t: 'パッシブ', s: `${G.loadout.passives.length}/${PASSIVE_SLOTS}`, f: () => passiveMenu(back) },
    { t: '持ち物を見る', f: () => log(`${Object.entries(ITEMS).filter(([k]) => G.items[k] > 0).map(([k, it]) => it.name + G.items[k]).join(' ')}／手持ち ${G.gold}G${G.injuries.length ? '\nケガ: ' + G.injuries.map(k => INJURIES[k].name + '（' + INJURIES[k].desc + '）').join('、') : ''}${G.bless ? '\n祝福: ' + BLESSINGS[G.bless].name : ''}`, true) },
    { t: '戻る', f: () => towerScreen('「よし、準備はいい」') }]);
  log('出発の前に、装備と持ち物を確かめる。', true);
}
function newGear(r, forged) {
  const x = { uid: G.uidNext++, id: r.id, name: r.name, type: r.type, atk: r.atk || 0, def: r.def || 0 }; if (r.crit) x.crit = r.crit; if (r.fire) x.fire = true; if (r.mk) x.mk = r.mk; if (r.type === 'tool') { x.tool = r.tool; x.dur = x.maxDur = r.dur; }
  if (G) dexGear(r.id);
  const a = forged && r.type !== 'tool' ? upLv('anvil') : 0;  // 金床の強化ぶん、自分で打った武具は強くなる
  if (a) { if (x.atk) x.atk += a; if (x.def) x.def += a; x.name += `+${a}`; }
  return x;
}
// 2026-11-25: 打つ前に、今の装備と比べる（武器は今の武器、盾は左手の盾、鎧は今の鎧と）
function cmpNow(r) {
  if (r.type === 'tool') return null;
  const a = upLv('anvil'), atk = (r.atk || 0) + (r.atk ? a : 0), def = (r.def || 0) + (r.def ? a : 0);
  let cur = null;
  if (r.type === 'armor') cur = gearBy(G.equip.armor) || null;
  else if (r.type === 'shield') { const l = gearBy(G.equip.l); cur = l && l.type === 'shield' ? l : null; }
  else cur = mainWeapon();
  return { cur, atk, def, da: atk - (cur ? cur.atk || 0 : 0), dd: def - (cur ? cur.def || 0 : 0) };
}
const dTag = (n, l) => n ? `<b class="${n > 0 ? 'up' : 'dn'}">${l}${n > 0 ? '▲' + n : '▼' + (-n)}</b>` : '';
function cmpText(r) {
  const c = cmpNow(r); if (!c) return '';
  const sgn = n => n > 0 ? `▲${n}` : n < 0 ? `▼${-n}` : '±0';
  const cs = c.cur ? `${c.cur.name}（${c.cur.atk ? '攻' + c.cur.atk : ''}${c.cur.atk && c.cur.def ? ' ' : ''}${c.cur.def ? '守' + c.cur.def : ''}${!c.cur.atk && !c.cur.def ? '－' : ''}）` : 'なし';
  let t = `今の装備: ${cs}\n打つと: ${c.atk || r.atk ? `攻${c.atk}（${sgn(c.da)}）` : ''}${(c.atk || r.atk) && (c.def || r.def) ? ' ' : ''}${c.def || r.def ? `守${c.def}（${sgn(c.dd)}）` : ''}`;
  if (!['armor', 'shield'].includes(r.type) && WEAPON_TYPES[r.type]) { const w = mainWeapon(); if (!w || w.type !== r.type) t += `\n持つと、ジョブは${WEAPON_TYPES[r.type].job}系になる`; }
  return t;
}
// 打つ前の比べを、絵の上に大きく出す（今の装備 → 打つ物）
function cmpCard(r) {
  const c = cmpNow(r), st = $('stage'); if (!c || !st) return;
  const row = (l, a, b, d) => (a || b) ? `<tr><th>${l}</th><td>${a}</td><td class="ar">→</td><td><b>${b}</b></td><td class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '±0'}</td></tr>` : '';
  const ca = c.cur ? c.cur.atk || 0 : 0, cd = c.cur ? c.cur.def || 0 : 0;
  let jobs = '';
  if (!['armor', 'shield'].includes(r.type) && WEAPON_TYPES[r.type]) { const w = mainWeapon(); if (!w || w.type !== r.type) jobs = `<p class="jb">持つと、ジョブは「${WEAPON_TYPES[r.type].job}」の系統になる</p>`; }
  const o = document.createElement('div'); o.className = 'fcmp';
  o.innerHTML = `<div class="in"><p class="hd">今の装備と比べる</p><div class="nm"><span>${c.cur ? c.cur.name : 'なし'}</span><span class="ar">→</span><b>${r.name}${upLv('anvil') && r.type !== 'tool' ? '+' + upLv('anvil') : ''}</b></div>
    <table>${row('攻撃', ca, c.atk, c.da)}${row('守り', cd, c.def, c.dd)}</table>${r.desc ? `<p class="ds">${r.desc}</p>` : ''}${jobs}</div>`;
  st.appendChild(o);
}
const gearKind = t => t === 'armor' ? '鎧' : t === 'tool' ? 'ツール' : WEAPON_TYPES[t].name;
// 工房の鍛冶: まず「武器・防具・ツール・手入れ」を選んで、その中の一覧へ。
// 一覧の各行に「必要な素材（今の数）」を出す。足りない物を押すと、何が足りないかを教える
const FORGE_CAT = { weapon: ['武器', r => !['armor', 'shield', 'tool'].includes(r.type)], armor: ['防具', r => r.type === 'armor' || r.type === 'shield'], tool: ['ツール', r => r.type === 'tool'] };
for (const k of Object.keys(FORGE_CAT)) { const f = FORGE_CAT[k][1]; FORGE_CAT[k][1] = r => !r.royal && !r.meika && f(r); }  // 王家の褒美は打てない。名品は別の棚
FORGE_CAT.meika = ['名品', r => r.meika && (G.bp || []).includes(r.id)];
// 一覧を分ける棚: 武器・防具は素材の段階ごと、名品は種類ごと
const TIER_OF = r => r.meika ? 0 : /^(dragon)/.test(r.id) ? 6 : /^orichalcum/.test(r.id) ? 5 : /^darksteel/.test(r.id) ? 4 : /^mithril/.test(r.id) ? 3 : /^silver/.test(r.id) ? 2 : 1;
const SHELF = {
  weapon: [['銅・鉄', r => TIER_OF(r) === 1], ['銀', r => TIER_OF(r) === 2], ['ミスリル', r => TIER_OF(r) === 3], ['黒鋼', r => TIER_OF(r) === 4], ['オリハルコン', r => TIER_OF(r) === 5], ['竜', r => TIER_OF(r) === 6]],
  armor: [['銅・鉄', r => TIER_OF(r) <= 1], ['銀', r => TIER_OF(r) === 2], ['ミスリル・黒鋼', r => TIER_OF(r) === 3 || TIER_OF(r) === 4], ['オリハルコン・竜', r => TIER_OF(r) >= 5]],
  meika: [['剣・刀', r => ['sword', 'katana'].includes(r.type)], ['大剣・斧・槌', r => ['greatsword', 'axe', 'hammer'].includes(r.type)], ['短剣・弓', r => ['dagger', 'bow'].includes(r.type)], ['魔導書・杖', r => ['book', 'staff'].includes(r.type)], ['盾・鎧', r => ['shield', 'armor'].includes(r.type)]],
};
// ---------- 名品の設計図（2026-11-25） ----------
function bpDrop(chance, why) {
  G.bp = G.bp || []; if (R() >= chance) return '';
  const can = MEIKA.filter(x => x[0] !== 'mk_nameless' && !Object.values(GOD_MK).includes(x[0]) && !G.bp.includes(x[0]) && MK_TIER[x[3]].floor <= floorNo);
  if (!can.length) return '';
  const w = can.map(x => 1 + x[3]), sum = w.reduce((a, b) => a + b, 0); let q = R() * sum, x = can[0];
  for (let i = 0; i < can.length; i++) if ((q -= w[i]) < 0) { x = can[i]; break; }
  G.bp.push(x[0]); const r = RECIPES.find(y => y.id === x[0]);
  sfx('item', { delay: 300 }); setTimeout(() => bigFx(`<img class="gearimg" src="${iconOfType(r)}" alt=""><b>設計図を手に入れた</b><em>${r.name}</em><small>${r.desc}（工房の「名品」で打てる${upLv('furnace') < needFurnace(r) ? `。炉Lv${needFurnace(r)}が必要` : ''}）</small>`, 'levelup', 'reward', 3200), 400);
  return `\n${why || ''}名品「${r.name}」の設計図を見つけた！`;
}
// ---------- 工房の強化（お金の使い道） ----------
// 炉: 打てる金属が増える（1で鉄）。金床: 打った武具の攻撃・守りが段階ぶん上がる。作業台: 使う素材が減る
const UPG = {
  furnace: { name: '炉', max: 4, price: [300, 1500, 4000, 9000], eff: ['鉄が打てるようになる', '銀が打てるようになる', 'ミスリルが打てるようになる', 'オリハルコンが打てるようになる'], now: l => ['銅・骨・革・魔石だけ', '鉄まで打てる', '銀まで打てる', 'ミスリルまで打てる', 'オリハルコンまで打てる'][l] },
  anvil:   { name: '金床', max: 5, price: [200, 500, 1000, 2000, 4000], eff: l => `打った武器の攻撃・防具の守り +${l}`, now: l => l ? `打つ武具 +${l}` : '強化なし' },
  bench:   { name: '作業台', max: 3, price: [300, 900, 2500], eff: ['一番多い素材が1つ減る（3つ以上のとき）', '一番多い素材が1つ減る（2つ以上のとき）', 'さらに、二番目に多い素材も1つ減る'], now: l => l ? ['', '素材を少し節約', '素材を節約', '素材をかなり節約'][l] : '節約なし' },
};
const upLv = k => (G.forgeUp || {})[k] || 0;
const needFurnace = r => { const c = Object.keys(r.cost); return c.includes('dragonbone') || c.includes('orichalcum') ? 4 : c.includes('darksteel') ? 3 : c.includes('mithril') ? 3 : c.includes('silver') ? 2 : c.includes('iron') ? 1 : 0; };
// 作業台の段階に合わせて、必要な素材を減らす
function costOf(r) {
  const c = { ...r.cost }, b = upLv('bench'); if (!b) return c;
  const ks = Object.keys(c).sort((x, y) => c[y] - c[x]);
  if (c[ks[0]] >= (b >= 2 ? 2 : 3)) c[ks[0]]--;
  if (b >= 3 && ks[1] && c[ks[1]] >= 2) c[ks[1]]--;
  return c;
}
const canMake = r => upLv('furnace') >= needFurnace(r) && Object.entries(costOf(r)).every(([k, n]) => (G.store[k] || 0) >= n);
const lackText = r => Object.entries(costOf(r)).filter(([k, n]) => (G.store[k] || 0) < n).map(([k, n]) => `${MATS[k]}あと${n - (G.store[k] || 0)}`).join('・');
const needText = r => Object.entries(costOf(r)).map(([k, n]) => `${MATS[k]}${n}(${G.store[k] || 0})`).join(' ');
// 必要な素材をアイコンで（足りない物は赤く）
const icoImg = (k, cls) => { const s = iconOf(k); return s ? `<img class="${cls || 'mi'}" src="${s}" alt="${NAMES[k] || ''}">` : (NAMES[k] || k); };
const needHtml = r => Object.entries(costOf(r)).map(([k, n]) => `<span class="need${(G.store[k] || 0) < n ? ' short' : ''}">${icoImg(k)}${n}</span>`).join('');
function upgradeMenu(msg) {
  if (!G.forgeUp) G.forgeUp = {};
  const L = [{ title: `工房の強化（手持ち ${G.gold}G）` }];
  for (const [k, u] of Object.entries(UPG)) {
    const l = upLv(k), done = l >= u.max, p = done ? 0 : u.price[l], eff = done ? '' : (typeof u.eff === 'function' ? u.eff(l + 1) : u.eff[l]);
    L.push({ t: `${u.name} Lv${l}${done ? '（最大）' : ` → ${l + 1}`}`, s: done ? u.now(l) : `${p}G：${eff}`, off: done, cls: !done && G.gold < p ? 'dim' : '', f: () => {
      if (G.gold < p) { log(`${u.name}を強くするには${p}G要る。あと${p - G.gold}G。`, true); return; }
      buttons([{ title: `${p}Gで${u.name}をLv${l + 1}にする？` }, { t: '強くする', s: eff, hot: true, f: () => {
        G.gold -= p; G.forgeUp[k] = l + 1; save();
        fadeGo(() => upgradeMenu(`${u.name}がLv${l + 1}になった！\n${eff}。`), { text: `${u.name}を改装中`, hold: 1500, sfx: [['forge1', 250], ['forge2', 700], ['forge1', 1150], ['register', 1500]] });
      } }, { t: 'やめる', f: () => upgradeMenu() }]);
    } });
  }
  L.push({ t: '戻る', f: () => forge() });
  buttons(L, 'one');
  if (msg) say('grin', msg, true); else log('お金をかけて、工房を強くする。\nいい工房から、いい武具が生まれる。', true);
}
function forge(msg, face) {
  const L = [{ title: `工房の素材: ${matText(G.store)}` }];
  for (const [k, [name, f]] of Object.entries(FORGE_CAT)) { const rs = RECIPES.filter(f), n = rs.filter(canMake).length;
    L.push({ t: name, s: k === 'meika' ? `設計図 ${rs.length}/${MEIKA.length}${n ? `・作れる${n}` : ''}` : n ? `作れる ${n}/${rs.length}` : `作れる物なし（${rs.length}種）`, hot: n > 0, f: () => forgeList(k) }); }
  const worn = G.gear.filter(x => x.type === 'tool' && x.dur < x.maxDur);
  L.push({ t: '工房の強化', s: `炉${upLv('furnace')} 金床${upLv('anvil')} 作業台${upLv('bench')}`, f: () => upgradeMenu() });
  L.push({ t: '手入れ', s: worn.length ? `ツール${worn.length}本（銅1）` : '直す物なし', off: !worn.length, f: forgeFix });
  L.push({ t: '戻る', f: homeMenu });
  buttons(L);
  if (face) say(face, msg, true); else say('serious', msg || (Object.keys(G.raw).some(k => G.raw[k]) ? '「戦利品は、まずギルドで加工してもらわないとな」' : '「何を打とうか」'), true);
}
function forgeList(cat, msg, face) {
  const [name, f] = FORGE_CAT[cat], rs = RECIPES.filter(r => f(r) && (cat === 'meika' || needFurnace(r) <= upLv('furnace') + 1))  // 名品は、見つけた設計図を全部出す（炉が足りなくても）.sort((a, b) => canMake(b) - canMake(a) || needFurnace(b) - needFurnace(a));  // 炉の次の段階までを出す
  const have = `<span class="have">${Object.keys(MATS).filter(k => G.store[k] || ['copper', 'iron', 'bone', 'leather', 'stone', 'wood'].includes(k)).map(k => `<span>${icoImg(k)}${G.store[k] || 0}</span>`).join('')}</span>`;
  const shelves = (SHELF[cat] || [[name, () => true]]).map(([n, g]) => [n, rs.filter(g)]).filter(x => x[1].length);
  const L = [];
  if (cat === 'meika' && !rs.length) L.push({ title: name, titleHtml: `${name}${have}` }, { t: '設計図がまだない', s: '宝箱・主・ミミックから、まれに見つかる', off: true, f: () => {} });
  // いちばん新しい段階の棚を、はじめに開く
  { const key = shelves.map(x => x[0]).join('|'); if (shelves.length > 1 && !buttons.keepTab) buttons.tab[key] = cat === 'meika' ? (buttons.tab[key] || 0) : shelves.length - 1; buttons.keepTab = false; }
  for (const [sn, list] of shelves) { L.push({ title: shelves.length > 1 ? sn : name, titleHtml: `${shelves.length > 1 ? sn : name}${have}` });
  for (const r of list) {
    const ok = canMake(r), stat = (r.type === 'tool' ? `${TOOL_NAMES[r.tool]}・耐久${r.dur}` : `${gearKind(r.type)}${r.atk ? ' 攻' + r.atk : ''}${r.def ? ' 守' + r.def : ''}`) + (r.desc ? `<em class="mkd">${r.desc}</em>` : '');
    const lock = upLv('furnace') < needFurnace(r);
    const cm = cmpNow(r);
    L.push({ t: r.name + (ok ? '' : `<i class="lack">${lock ? `炉Lv${needFurnace(r)}が必要` : '素材不足'}</i>`), s: `${stat}${upLv('anvil') && r.type !== 'tool' ? ` (+${upLv('anvil')})` : ''}${cm ? ` <span class="gcmp">${dTag(cm.da, '攻')}${dTag(cm.dd, '守')}</span>` : ''}<span class="sellp">売値${sellPrice(r)}G</span><br>${needHtml(r)}`, cls: ok ? '' : 'dim', f: () => {
      if (lock) { log(`${['', '鉄', '銀', 'ミスリル', 'オリハルコン'][needFurnace(r)]}を打つには、炉を強くしないと。\n（鍛冶 →「工房の強化」で炉をLv${needFurnace(r)}に）`, true); return; }
      if (!canMake(r)) { log(`${r.name}を打つには、${lackText(r)}が足りない。\n必要: ${matText(costOf(r))}`, true); return; }
      forgeConfirm(cat, r);
    } });
  }
  }
  L.push({ t: '戻る', f: () => forge() });
  buttons(L, 'list');
  if (face) say(face, msg, true); else log(msg || '上に並んでいるのが、工房にある素材。足りない素材は赤く出る。', true);
}
// 2026-11-25: 打つ前に確認する。素材があれば、一度に何本も打てる
function forgeConfirm(cat, r) {
  const c = costOf(r), max = Math.min(10, ...Object.entries(c).map(([k, n]) => Math.floor((G.store[k] || 0) / n)));
  const back = () => { buttons.keepTab = true; forgeList(cat); };
  const qs = [...new Set([1, 2, 3, 5, max].filter(q => q >= 1 && q <= max))];
  const mul = q => Object.fromEntries(Object.entries(c).map(([k, n]) => [k, n * q]));
  const stat = r.type === 'tool' ? `${TOOL_NAMES[r.tool]}・耐久${r.dur}` : `${gearKind(r.type)}${r.atk ? ' 攻' + (r.atk + upLv('anvil')) : ''}${r.def ? ' 守' + (r.def + upLv('anvil')) : ''}`;
  buttons([{ title: `${r.name}を打つ？（${stat}）` },
    ...qs.map((q, i) => ({ t: q === max && q > 1 && !([1, 2, 3, 5].includes(q)) ? `作れるだけ打つ（${q}本）` : `${q}本打つ`, s: matText(mul(q)), hot: i === 0, f: () => forgeMake(cat, r, q) })),
    { t: 'やめる', f: back }], 'one');
  say('serious', `「${r.name}か……」\n1本につき: ${matText(c)}${max > 1 ? `\n素材は${max}本ぶんある。何本打とうか。` : ''}`, true);
  cmpCard(r);
}
function forgeMake(cat, r, q) {
  for (let i = 0; i < q; i++) { if (!canMake(r)) { q = i; break; } for (const [k, n] of Object.entries(costOf(r))) G.store[k] -= n; G.gear.push(newGear(r, true)); }
  G.forged = (G.forged || 0) + q; save();
  const hits = [['forge1', 250], ['forge1', 700], ['forge1', 1150]]; if (q > 1) hits.push(['forge1', 1600], ['forge1', 2050]); hits.push(['forge2', q > 1 ? 2500 : 1600]);
  fadeGo(() => { buttons.keepTab = true; forgeList(cat, q > 1 ? `「${r.name}を${q}本。……腕が鳴ったな」` : `「${r.name}、できた。悪くない」`, 'grin'); const src = iconOfType(r); if (src) bigFx(`<img class="gearimg" src="${src}" alt=""><b>${r.name}${q > 1 ? ` ×${q}` : ''}</b><small>${gearKind(r.type)}${r.atk ? ' 攻' + r.atk : ''}${r.def ? ' 守' + r.def : ''}</small>`, 'equip', 'reward', 2400); }, { text: `${r.name}${q > 1 ? ` ×${q}` : ''}\n制作中`, hold: q > 1 ? 2400 : 1500, sfx: hits });
}
function forgeFix() {
  const L = [{ title: '手入れ（銅1で新品同様に）' }];
  for (const t of G.gear.filter(x => x.type === 'tool' && x.dur < x.maxDur)) {
    const ok = (G.store.copper || 0) >= 1;
    L.push({ t: `${t.name}を直す`, s: `耐久${t.dur}/${t.maxDur}／銅1(${G.store.copper || 0})`, off: !ok, f: () => { G.store.copper--; t.dur = t.maxDur; save(); fadeGo(() => forge(`${t.name}を研ぎ直した。新品同様だ。`, 'grin'), { text: `${t.name}\n手入れ中`, hold: 900, sfx: [['forge1', 250], ['forge1', 700]] }); } });
  }
  L.push({ t: '戻る', f: () => forge() });
  buttons(L);
}
// 装備: 武器を押すたびに 右手 → 左手 → 外す と切り替わる（盾は左手だけ、両手武器は右手だけ）
function equipMenu(back) {
  back = back || homeMenu; if (equipMenu.back !== back) { equipMenu.last = null; statusView.prev = null; } equipMenu.back = back;
  const r = gearBy(G.equip.r), l = gearBy(G.equip.l), a = gearBy(G.equip.armor);
  const tl = gearBy(G.equip.tool);
  const L = [{ title: `右 ${r ? r.name : 'なし'}／左 ${l ? l.name : 'なし'}／鎧 ${a ? a.name : 'なし'}` }];
  for (const g of G.gear.filter(x => x.type !== 'tool')) {
    const where = G.equip.r === g.uid ? '（右手）' : G.equip.l === g.uid ? '（左手）' : G.equip.armor === g.uid || G.equip.tool === g.uid ? '（装備中）' : '';
    const kind = g.type === 'tool' ? `${TOOL_NAMES[g.tool]} 耐久${g.dur}/${g.maxDur}` : gearKind(g.type);
    L.push({ t: g.name + where, s: `${kind}${g.atk ? ' 攻' + g.atk : ''}${g.def ? ' 守' + g.def : ''}`, hot: !!where, f: () => { const before = JSON.stringify(G.equip), jb = job(); equipItem(g); if (JSON.stringify(G.equip) !== before) { if (job() !== jb) { sfx('change'); sfx('equip', { vol: .5, delay: 350 }); } else sfx('equip'); } equipMenu(back); checkLearn(job()); save(); } });
  }
  L.push({ t: '戻る', f: back });
  buttons(L);
  const j = job(), w = mainWeapon();
  let note = '';
  if (w) { const t = w.type, next = UPPERS.filter(u => u.hold === t && !upperReady(u)).map(u => `${u.job}(${WEAPON_TYPES[u.exp].name}${G.prof[u.exp] || 0}/${UPPER_NEED.exp})`); if (next.length) note = `\n進化(${WEAPON_TYPES[t].name}${G.prof[t] || 0}/${UPPER_NEED.hold}): ` + next.join(' '); }
  if (equipMenu.last && equipMenu.last !== j) say('smug', `「${j}か。悪くない」${note}`, true); else log(`今のジョブ: ${j}（押すたびに 右手→左手→外す）${note}`, true);
  equipMenu.last = j; clearFig(); statusView();
}
function equipItem(g) {
  const E = G.equip, r = gearBy(E.r);
  const twoR = r && WEAPON_TYPES[r.type] && WEAPON_TYPES[r.type].twoHand && !canOneHand(r.type);
  if (g.type === 'armor') { E.armor = E.armor === g.uid ? null : g.uid; save(); return; }
  if (g.type === 'tool') { E.tool = E.tool === g.uid ? null : g.uid; save(); return; }
  if (g.type === 'shield') {
    if (E.l === g.uid) E.l = null;
    else { if (twoR) { log(`${r.name}は両手で持つ武器。盾は持てない（${WEAPON_TYPES[r.type].name}の熟練${ONE_HAND_NEED}で片手持ち）。`, true); return; } E.l = g.uid; }
    save(); return;
  }
  const two = WEAPON_TYPES[g.type].twoHand && !canOneHand(g.type);
  if (E.r === g.uid) { E.r = null; if (!two && !twoR) E.l = g.uid; }   // 右手 → 左手（両手持ちの武器は外す）
  else if (E.l === g.uid) { E.l = null; }                            // 左手 → 外す
  else { E.r = g.uid; if (two) E.l = null; }                         // 持っていない → 右手
  save();
}
// 塔に持ち込む技（6個まで）
function skillMenu(back) {
  relearnAll(true);
  if (G.loadout.skills.length > SKILL_MAX) G.loadout.skills = G.loadout.skills.slice(0, SKILL_MAX);
  const mine = G.learned.filter(id => SKILLS[id]);
  const L = [{ title: `持ち込む技 ${G.loadout.skills.length}/${SKILL_MAX}（攻撃・守る・道具・逃げるは いつでも使える）` }];
  for (const id of mine) { const s = SKILLS[id], on = G.loadout.skills.includes(id);
    L.push({ t: s.name + (on ? ' ✓' : ''), s: `AP${s.ap}・${s.desc}`, hot: on, f: () => {
      if (on) G.loadout.skills = G.loadout.skills.filter(x => x !== id);
      else if (G.loadout.skills.length < SKILL_MAX) G.loadout.skills.push(id); else { log(`持ち込める技は${SKILL_MAX}個まで。`, true); return; }
      save(); skillMenu(back); } }); }
  L.push({ t: '戻る', f: back });
  buttons(L); if (!mine.length) log('まだ技を覚えていない。ジョブで戦って勝つと覚える。', true); else log('押して選ぶ／外す。', true);
}
// パッシブ（3つまで。覚えたジョブ以外でも付けられる）
function passiveMenu(back) {
  const mine = G.learned.filter(id => PASSIVES[id]);
  const L = [{ title: `パッシブ ${G.loadout.passives.length}/${PASSIVE_SLOTS}（どのジョブでも効く）` }];
  for (const id of mine) { const p = PASSIVES[id], on = G.loadout.passives.includes(id);
    L.push({ t: p.name + (on ? ' ✓' : ''), s: p.desc, hot: on, f: () => {
      if (on) G.loadout.passives = G.loadout.passives.filter(x => x !== id);
      else if (G.loadout.passives.length < PASSIVE_SLOTS) G.loadout.passives.push(id); else { log(`パッシブは${PASSIVE_SLOTS}つまで。`, true); return; }
      save(); passiveMenu(back); } }); }
  L.push({ t: '戻る', f: back });
  buttons(L); log(mine.length ? '押して付ける／外す。' : 'まだパッシブを覚えていない。ジョブで何度も勝つと覚える。', true);
}
// ジョブの一覧（基本職の勝利数、上級職の条件）。解放した上級職を押すと、その武器を持ったときにそのジョブになる
function jobList(back) {
  const L = [], cur = job();
  for (const t of ['hammer', 'sword', 'book', 'staff', 'dagger', 'axe', 'katana', 'greatsword', 'bow']) {
    const j = WEAPON_TYPES[t].job, w = G.jobWins[j] || 0;
    L.push({ t: j + (j === cur ? ' ◀' : ''), s: `${WEAPON_TYPES[t].name}・熟練${G.prof[t] || 0}・勝${w}`, hot: j === cur, f: () => { jobScene(j); log(`${j}: ${WEAPON_TYPES[t].name}を持つ。${WEAPON_TYPES[t].twoHand ? '両手武器。' : '片手武器（盾を持てる）。'}`, true); } });
  }
  for (const u of UPPERS) {
    const ok = upperReady(u);
    L.push({ t: (ok ? u.job : '？？？') + (u.job === cur ? ' ◀' : ''), s: `${WEAPON_TYPES[u.hold].name}${G.prof[u.hold] || 0}/${UPPER_NEED.hold}＋${WEAPON_TYPES[u.exp].name}${G.prof[u.exp] || 0}/${UPPER_NEED.exp}`, hot: u.job === cur, f: () => {
      if (!ok) { log('まだ知らないジョブ。持つ武器と、経験する武器の熟練度が条件。', true); return; }
      G.upperPick[u.hold] = u.job; save(); jobList(back); jobScene(u.job); log(`${WEAPON_TYPES[u.hold].name}を持ったときは${u.job}になる。`, true); } });
  }
  for (const u of TOPS) { const ok = topReady(u); L.push({ t: (ok ? u.job : '？？？') + (u.job === cur ? ' ◀' : ''), s: `最上級職・${WEAPON_TYPES[u.hold].name}`, hot: u.job === cur, f: () => { if (ok) jobScene(u.job); log(ok ? `${u.job}: ${WEAPON_TYPES[u.hold].name}を持つと、この姿になる。` : `まだ知らないジョブ。\n条件: ${u.hint}`, true); } }); }
  L.push({ t: '戻る', f: back });
  buttons(L, 'three small'); jobScene(cur); log('熟練度は、その武器を持って勝つと上がる。', true);
}
// 武具屋: まず「買う／売る／話す／外に出る」。押してから、それぞれの一覧を出す
function shop(msg) {
  buttons([{ t: '買う', s: '自分で打つより高い', hot: true, f: () => shopBuy() }, { t: '売る', s: G.gear.length ? `持ち物${G.gear.length}個` : '売る物がない', f: () => shopSell() },
    typeof jennyDressReady === 'function' && jennyDressReady() ? { t: 'お城に誘う', s: 'ジェニーを', hot: true, f: jennyDressEv } : null,
    talkBtn('jenny', () => inside('weapon', byeLine('jenny'))), leave].filter(Boolean));
  if (msg) log(msg, true);
}
// 売る: 同じ物はまとめて1行に。押すと「1つ／全部」を選べる。装備していない物をまとめて全部売ることもできる
const sellPrice = g => { const rec = RECIPES.find(r => r.id === g.id); const k = rec ? [.3, .5, .5, .4, .3, .3, .3][TIER_OF(rec)] : .5; return Math.max(1, Math.floor((rec ? rec.price : 10) * k * (perk('jenny') ? 1.25 : 1))); };  /* 上の段階ほど売値の割合を下げる（名品も3割） */  // 売値は定価の半分（2026-11-25）
const isEquipped = g => [G.equip.r, G.equip.l, G.equip.armor, G.equip.tool].includes(g.uid);
// 帰還の羽: 青い光の柱に包まれて、白く飛んで、暗転して町へ
function warpOut() {
  B = null; mode = 'dungeon'; busy = true; $('ctl').innerHTML = '';
  log('帰還の羽が、青く光りはじめた……。', true);
  sfx('magic', { vol: .8 }); sfx('holy', { delay: 500, vol: .7 });
  playFx('warp', { self: true, size: 1.4 }); playFx('magic_circle', { y: VH * .8, size: .9, parts: 20 });
  codeFx(0, 1500, k => { ctx.globalCompositeOperation = 'lighter'; const a = Math.min(1, k / .6);
    const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, `rgba(120,190,255,${a * .15})`); g.addColorStop(1, `rgba(90,160,255,${a * .5})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 18; i++) { const x = (i * 53 + k * 40) % VW, y = VH - ((i * 37 + k * VH * 1.6) % VH); ctx.globalAlpha = a * .8; ctx.fillStyle = '#cfe6ff'; ctx.fillRect(x, y, 2, 6); }
    if (k > .75) { ctx.globalAlpha = (k - .75) / .25; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(0, 0, VW, VH); } });
  setTimeout(() => { busy = false; fadeGo(() => toTown('', true), { text: 'エルディア', hold: 1400, walk: true }); }, 1450);
}
// 売り買いの確認: 「はい」で決まり、お金の音
function deal(q, yes, no) { buttons([{ title: q }, { t: 'はい', hot: true, f: () => { sfx('register', { vol: .9 }); yes(); } }, { t: 'やめる', f: no }]); }
function sellGear(list) {
  const sum = list.reduce((a, g) => a + sellPrice(g), 0);
  G.gold += sum; G.gear = G.gear.filter(x => !list.includes(x)); save(); return sum;
}
function shopSell(msg) {
  const free = G.gear.filter(g => !isEquipped(g)), groups = {};
  for (const g of free) (groups[g.name] = groups[g.name] || []).push(g);
  const L = [{ title: `売る（手持ち ${G.gold}G）` }];
  if (free.length > 1) L.push({ t: '全部売る', s: `装備していない${free.length}個／${free.reduce((a, g) => a + sellPrice(g), 0)}G`, hot: true, f: () => {
    buttons([{ title: `装備していない物を${free.length}個、全部売る？` }, { t: '売る', hot: true, f: () => { sfx('register', { vol: .9 }); const n = free.length, sum = sellGear(free); shopSell(`${n}個まとめて${sum}Gで売った。\nジェニー[laugh]「まとめて持ってくるなんて、気が利くじゃない」`); } }, { t: 'やめる', f: () => shopSell() }]); } });
  for (const [id, gs] of Object.entries(groups)) { const p = sellPrice(gs[0]);
    L.push({ t: `${gs[0].name}${gs.length > 1 ? ` ×${gs.length}` : ''}`, s: `1つ${p}G`, f: () => {
      if (gs.length === 1) { deal(`${gs[0].name}を${p}Gで売る？`, () => { sellGear(gs); shopSell(`ジェニー「${gs[0].name}、${p}Gね。……もっと高く売れるのに」`); }, () => shopSell()); return; }
      buttons([{ title: `${gs[0].name}（${gs.length}個）をいくつ売る？` }, { t: '1つ', s: `${p}G`, f: () => deal(`${gs[0].name}を1つ、${p}Gで売る？`, () => { sellGear([gs[0]]); shopSell(`${gs[0].name}を${p}Gで売った。`); }, () => shopSell()) },
        { t: `全部（${gs.length}個）`, s: `${p * gs.length}G`, hot: true, f: () => deal(`${gs[0].name}を${gs.length}個、${p * gs.length}Gで売る？`, () => { sellGear(gs); shopSell(`${gs[0].name}を${gs.length}個、${p * gs.length}Gで売った。`); }, () => shopSell()) }, { t: '戻る', f: () => shopSell() }]); } });
  }
  if (!free.length) L.push({ t: '売る物がない', s: '装備中の物は売れない', off: true, f: () => {} });
  L.push({ t: '戻る', f: () => shop() });
  buttons(L); log(msg || 'ジェニー「何を売るの？ 自分で打ったのも買い取るわよ」', true);
}
function shopBuy(msg) {
  const L = [{ title: `買う（手持ち ${G.gold}G）` }];
  for (const id of SHOP) { const r = RECIPES.find(x => x.id === id), p = Math.floor(r.price * 1.8);
    L.push({ t: r.name, s: `${p}G`, off: G.gold < p, f: () => deal(`${r.name}を${p}Gで買う？（手持ち${G.gold}G）`, () => { G.gold -= p; G.gear.push(newGear(r)); save(); shopBuy(`${r.name}を買った。\nジェニー「毎度。……あんたが打った方が、いい物なんだけどね」`); }, () => shopBuy()) }); }
  L.push({ t: '戻る', f: () => shop() });
  buttons(L); log(msg || 'ジェニー「うちの品よ。自分で打つより高いけど、急ぎならね」', true);
}
function itemShop(msg) {
  const L = Object.entries(ITEMS).map(([k, it]) => ({ t: `${it.name}<small>${it.price}G・持${G.items[k] || 0}</small>`, s: it.short, off: G.gold < it.price, f: () => deal(`${it.name}を${it.price}Gで買う？（手持ち${G.gold}G）`, () => { G.gold -= it.price; G.items[k] = (G.items[k] || 0) + 1; save(); itemShop(`${it.name}を買った。${it.desc}。`); }, () => itemShop()) }));
  L.push(leave); buttons(L, 'three small');
  if (msg) log(msg, true);
}
function bank() {
  buttons([{ title: `手持ち ${G.gold}G／預け ${G.bank}G` },
    { t: '全部預ける', hot: true, f: () => { G.bank += G.gold; G.gold = 0; save(); bank(); } },
    { t: '全部引き出す', f: () => { G.gold += G.bank; G.bank = 0; save(); bank(); } },
    leave]);
}
// 宿屋＝酒場と食堂: 料理（次の挑戦だけ効く）と、今日の塔の噂
function inn(msg) {
  const L = [{ t: '噂を聞く', s: '今日の塔', f: innRumor }];
  if (drunksHere()) L.push({ t: 'のんだくれと話す', s: 'ドルフたち', f: () => { npcFig('drunks'); log(stLine(DRUNK_TALK), true); } });
  for (const [id, m] of Object.entries(MEALS)) {
    const ok = !G.meal && Object.entries(m.cost).every(([k, n]) => (G.store[k] || 0) >= n);
    L.push({ t: m.name, s: `${m.desc}／${matText(m.cost)}`, off: !ok, f: () => {
      for (const [k, n] of Object.entries(m.cost)) G.store[k] -= n;
      G.meal = id; if (id === 'stew') { G.mhp += 10; G.hp += 10; }
      save(); inn(`ガストン[laugh]「${m.name}、お待ち！」\n${m.say}（次に塔から戻るまで効く）`);
    } });
  }
  L.push(leave); buttons(L);
  log(msg || inn.first || (G.meal ? `今は${MEALS[G.meal].name}を食べたところ。次に塔から戻るまで効く。` : 'ガストン「素材を持ってきな。うまく料理してやるよ」'), true); inn.first = null;
}
// 治療院: ケガを治す（ベッドでは治らない）／祝福を受ける（次の1回の挑戦だけ効く守り）
// お代は手持ちから。足りなければ銀行から引き落とし。それでも足りなければ出世払い
function payClinic(p) {
  if (G.gold >= p) { G.gold -= p; return ''; }
  if (G.gold + G.bank >= p) { G.bank -= p - G.gold; G.gold = 0; return '\n（足りない分は銀行から引き落とされた）'; }
  G.gold = 0; G.bank = 0; return '\nエリー[smile]「足りない分は、出世払いで。……ちゃんと出世してくださいね」';
}
function clinic(msg) {
  const L = [{ title: G.injuries.length ? `ケガ: ${G.injuries.map(k => INJURIES[k].name).join('・')}` : 'ケガはない' }];
  const half = perk('elly') ? .5 : 1, cost = Math.floor(G.injuries.length * INJURY_PRICE * half);
  L.push({ t: 'ケガを治す', s: G.injuries.length ? `${cost}G` : 'ケガなし', hot: G.injuries.length > 0, off: !G.injuries.length, f: () => {
    const note = payClinic(cost); G.injuries = []; G.hp = G.mhp; G.treated++; save();
    const t = G.treated, line = t >= 6 ? 'エリー[angry]「もう！ 私、本気で怒ってるんですからね！」' : t >= 3 ? 'エリー[think]「……また、ですか。次は、もっと気をつけてください」' : 'エリー[smile]「はい、もう大丈夫です。無理はしないでくださいね」';
    clinic(`${line}${note}\n「助かったよ」`); } });
  L.push({ title: G.bless ? `祝福: ${BLESSINGS[G.bless].name}（次の挑戦で効く）` : '祝福（次の1回の挑戦だけ。どれか1つ）' });
  for (const [id, b] of Object.entries(BLESSINGS)) { const bp = Math.floor(b.price * half); L.push({ t: b.name, s: `${b.desc}／${bp}G`, off: !!G.bless || G.gold < bp, f: () => {
    G.gold -= bp; G.bless = id; save(); clinic(`エリー[smile]「神様、この人をお守りください。……はい、${b.name}です」`); } }); }
  L.push(talkBtn('elly', () => inside('clinic', byeLine('elly'))), leave); buttons(L);
  if (msg) log(msg, true);
}
// ギルドに戦利品を持ち込む → 鍛冶の素材に加工＋報酬。ここに来ないと鍛冶ができない
// 持ち込みの絵: 戦利品 → 素材 を1行ずつ
function convHtml(rows) {
  rows.sort((a, b) => b[1] - a[1]);
  const show = rows.slice(0, 6), rest = rows.slice(6).reduce((s, r) => s + r[1], 0);
  return '<ul class="conv">' + show.map(([k, c], i) => `<li style="animation-delay:${300 + i * 140}ms">${icoImg(k, 'ci')}<i>×${c}</i><b>→</b>${Object.entries(RAW[k].to).map(([m, v]) => icoImg(m, 'ci') + `<i>×${v * c}</i>`).join('')}</li>`).join('') + (rest ? `<li class="more" style="animation-delay:${300 + show.length * 140}ms">ほか ${rest}個</li>` : '') + '</ul>';
}
function turnIn() {
  const got = {}; let gold = 0, n = 0;
  const rows = [];
  for (const [k, c] of Object.entries(G.raw)) { if (!c || !RAW[k]) continue; n += c; gold += RAW[k].reward * c * ECON.guild * goldArea(G.maxFloor); rows.push([k, c]); for (const [m, v] of Object.entries(RAW[k].to)) add(got, m, v * c); }
  if (!n) return;
  // 持ち込みが多いと、ギルドからおまけの素材も出る
  const bonus = {}; for (let i = 0; i < Math.floor(n / 6); i++) add(bonus, pick(['copper', 'leather', 'bone', 'iron']), 1);
  for (const [m, v] of Object.entries(got)) add(G.store, m, v); for (const [m, v] of Object.entries(bonus)) add(G.store, m, v);
  gold = Math.round(gold); if (perk('ria')) gold = Math.floor(gold * 1.15);
  G.gold += gold; G.raw = {}; save();
  setTimeout(() => bigFx(`<b class="gold">+${gold}G</b><em>ギルドの報酬</em>${convHtml(rows)}${Object.keys(bonus).length ? `<small>おまけ: ${Object.entries(bonus).map(([k, v]) => icoImg(k, 'ci') + '×' + v).join(' ')}</small>` : ''}`, 'register', 'reward', 3800), 350);
  const lines = ['ボルツ[laugh]「おう旦那！ 使える形にしといたぜ」', 'ボルツ[smile]「いい戦利品だ。腕が鳴るねぇ」', 'ボルツ[think]「ふむ……。ま、俺にかかれば素材よ」', 'ボルツ「はいよ、加工済みだ。工房に届けとくぜ」', 'ボルツ[smile]「毎度！ 次も頼むぜ、旦那」'];
  guild(`${n >= 40 ? pick(['ボルツ[shock]「こりゃ大量だ！ 旦那、ほんとに鍛冶屋か？」', 'ボルツ[shock]「おいおい、荷車ごと持ってきたのか！？」']) : n >= 20 ? pick(['ボルツ[laugh]「お、今日はなかなかの量だな！」', 'ボルツ[smile]「いい稼ぎじゃねえか、旦那」']) : pick(lines)}\n報酬${gold}G／工房へ: ${matText(got)}${Object.keys(bonus).length ? `＋おまけ ${matText(bonus)}` : ''}`);
  npcFig('craft');
  if (evReady('ria', .4)) buttons([{ t: '次へ', hot: true, f: riaEvent }]);
}
// ギルド: まず「持ち込む／素材を売る／素材を買う／話す／到達記録／外に出る」
function guild(msg, face) {
  const rawN = Object.values(G.raw).reduce((a, b) => a + b, 0), have = Object.values(G.store).reduce((a, b) => a + b, 0);
  buttons([{ t: '持ち込む', s: rawN ? `戦利品${rawN}個→素材＋報酬` : '戦利品なし', hot: rawN > 0, off: !rawN, f: turnIn },
    { t: '素材を売る', s: have ? `工房の素材${have}個` : '素材がない', f: () => guildSell() },
    { t: '素材を買う', s: '値上がり中', f: () => guildBuy() },
    { t: '到達記録', s: `${heroName()} ${G.maxFloor}階`, f: () => log(`最高到達: 近衛兵長ギャバン 86階／${heroName()} ${G.maxFloor}階${G.bossDown ? '（10階の主を倒した）' : ''}`, true) },
    guestBtn(), talkBtn('ria', () => inside('guild', byeLine('ria'))), leave].filter(Boolean));
  if (msg) { if (face) say(face, msg, true); else log(msg, true); }
}
function guildSell(msg) {
  const L = [{ title: `素材を売る（工房の素材）` }];
  if (!Object.values(G.store).some(n => n > 0)) L.push({ t: '売る素材がない', off: true, f: () => {} });
  for (const [k, n] of Object.entries(G.store)) if (n > 0) L.push({ t: `${MATS[k]} ×${n}`, s: `1つ${MAT_SELL[k]}G`, f: () => {
    if (n === 1) { deal(`${MATS[k]}を${MAT_SELL[k]}Gで売る？`, () => { G.store[k]--; G.gold += MAT_SELL[k]; save(); guildSell(`${MATS[k]}を${MAT_SELL[k]}Gで売った。`); }, () => guildSell()); return; }
    buttons([{ title: `${MATS[k]}（${n}個）をいくつ売る？` }, { t: '1つ', s: `${MAT_SELL[k]}G`, f: () => deal(`${MATS[k]}を1つ、${MAT_SELL[k]}Gで売る？`, () => { G.store[k]--; G.gold += MAT_SELL[k]; save(); guildSell(`${MATS[k]}を${MAT_SELL[k]}Gで売った。`); }, () => guildSell()) },
      { t: `半分（${Math.floor(n / 2)}個）`, s: `${MAT_SELL[k] * Math.floor(n / 2)}G`, off: n < 2, f: () => { const m = Math.floor(n / 2); deal(`${MATS[k]}を${m}個、${MAT_SELL[k] * m}Gで売る？`, () => { G.store[k] -= m; G.gold += MAT_SELL[k] * m; save(); guildSell(`${MATS[k]}を${m}個、${MAT_SELL[k] * m}Gで売った。`); }, () => guildSell()); } },
      { t: `全部（${n}個）`, s: `${MAT_SELL[k] * n}G`, f: () => deal(`${MATS[k]}を${n}個、${MAT_SELL[k] * n}Gで売る？`, () => { G.store[k] = 0; G.gold += MAT_SELL[k] * n; save(); guildSell(`${MATS[k]}を${n}個、${MAT_SELL[k] * n}Gで売った。`); }, () => guildSell()) }, { t: '戻る', f: () => guildSell() }]); } });
  L.push({ t: '戻る', f: () => guild() });
  buttons(L); log(msg || 'リア「工房の素材を買い取ります。まとめてでも大丈夫ですよ」', true);
}
function guildBuy(msg, face) {
  const L = [{ title: `素材を買う（手持ち ${G.gold}G）` }];
  for (const [k, p] of Object.entries(MAT_PRICE)) { const bp = p * 3; L.push({ t: `${MATS[k]}を1つ買う`, s: `${bp}G`, off: G.gold < bp, f: () => deal(`${MATS[k]}を1つ、${bp}Gで買う？（手持ち${G.gold}G）`, () => { G.gold -= bp; add(G.store, k, 1); save(); guildBuy(`${MATS[k]}を${bp}Gで買った。\n「……高い。だから自分で取りに行くんだ」`, 'angry'); }, () => guildBuy()) }); }
  L.push({ t: '戻る', f: () => guild() });
  buttons(L); if (msg) { if (face) say(face, msg, true); else log(msg, true); } else log('リア「塔の素材は値上がりしていて……。すみません」', true);
}
// タイトルの設定: 音とデータ消去（町の地図から移した）
function settings() { openMenu(); }
// ---------- テストモード（2026-11-25）: 設定の「Tower of Hope」の文字を5回押すと出る。確認用 ----------
function testMenu(msg) {
  if (mode !== 'town' || document.body.classList.contains('story')) { log('テストモードは、町にいるときに使える。', true); return; }
  place = null; showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}tower.jpg" alt="" style="filter:brightness(.5) saturate(.6)"><div class="name">テストモード</div>`; clearFig();
  const done = m => { save(); hud(); testMenu(m); };
  buttons([
    { t: '好きな階へ行く', s: '1〜100階', hot: true, f: testFloors },
    { t: '強さを階に合わせる', s: `今 Lv${G.lv}`, f: testPower },
    { t: 'お金と素材', s: '+20000G・素材+30', f: () => { G.gold += 20000; for (const k of Object.keys(MATS)) G.store[k] = (G.store[k] || 0) + 30; done('お金と素材を増やした。'); } },
    { t: '工房を最大まで強化', f: () => { G.forgeUp = {}; for (const [k, u] of Object.entries(UPG)) G.forgeUp[k] = u.max; done('炉・金床・作業台を最大にした。'); } },
    { t: '名品の設計図を全部', f: () => { G.bp = MEIKA.map(x => x[0]); done(`名品の設計図を${G.bp.length}枚すべて手に入れた。`); } },
    { t: '親密度を最大に', s: 'ヒロイン4人・ジン', f: () => { for (const w of [...HEROINES, 'jin']) G.aff[w] = Math.max(G.aff[w] || 0, AFF_NEED + 2); G.jinMet = true; done('ヒロイン4人とジンの親密度を最大にした。\n（イベントは、それぞれの場所で起きる）'); } },
    { t: '鏡と戦う', s: '100階', f: () => { testUnlock(100); goFloor(100); setTimeout(() => { if (mode === 'dungeon') mirrorScene(); }, 1600); } },
    { t: 'エンディングを見る', f: () => { closeMenu(); ending(); } },
    { t: 'テストモードを終える', tail: true, f: townMap },
  ], 'three small');
  log(msg || 'テストモード。ここで変えたことは、今のセーブにそのまま記録される。\n試すときは、別のスロットにセーブしてから使うと安心。', true);
}
// その階まで登ったことにする（下の階の主は倒したことに）
function testUnlock(n) {
  G.maxFloor = Math.max(G.maxFloor || 0, n); G.bosses = G.bosses || {};
  for (let f = 10; f < n; f += 10) G.bosses[f] = true; if (n > 10) G.bossDown = true;
  if (n > 5 && !G.bosses[5]) for (let f = 5; f < n; f += 10) G.bosses[f] = true;
  if (G.maxFloor >= 50) G.castle = true;
  save();
}
function testFloors() {
  const L = [1, 5, 11, 21, 31, 41, 51, 61, 71, 81, 86, 91, 95, 99, 100].map(n => ({ t: `${n}階`, s: areaOf(n)[2], f: () => { testUnlock(n); goFloor(n); } }));
  L.push({ t: '戻る', f: () => testMenu() });
  buttons(L, 'three small'); log('どの階へ行く？（そこまで登ったことになる）', true);
}
// 階に合ったレベルと装備にする（目安）
function testPower() {
  const L = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => ({ t: `${n}階向け`, f: () => {
    const lv = Math.round(3 + n * .7); /* 目安: 10階でLv10、50階でLv38、100階でLv73 */
    while (G.lv < lv) { G.lv++; const g = (JOBS[job()] || JOBS['素手']).grow; G.mhp += g.hp; G.atk += g.atk; G.def += g.def; } G.exp = 0; G.hp = G.mhp;
    const tier = n <= 20 ? 1 : n <= 40 ? 2 : n <= 60 ? 3 : n <= 80 ? 5 : 6, w = mainWeapon(), type = w ? w.type : 'sword';
    const best = list => list.sort((a, b) => (b.atk || 0) + (b.def || 0) - (a.atk || 0) - (a.def || 0))[0];
    const rw = best(RECIPES.filter(r => r.type === type && !r.meika && !r.royal && TIER_OF(r) === tier)), ra = best(RECIPES.filter(r => r.type === 'armor' && !r.meika && !r.royal && TIER_OF(r) === tier));
    const got = []; if (rw) { const g = newGear(rw, true); G.gear.push(g); G.equip.r = g.uid; got.push(g.name); } if (ra) { const g = newGear(ra, true); G.gear.push(g); G.equip.armor = g.uid; got.push(g.name); }
    testUnlock(Math.max(1, n - 9)); save(); hud();
    testMenu(`Lv${G.lv}にした。${got.length ? `\n装備: ${got.join('・')}` : ''}`);
  } }));
  L.push({ t: '戻る', f: () => testMenu() });
  buttons(L, 'three small'); log('どの階に合わせる？（レベルと、その段階の武器・鎧）', true);
}
// 設定・セーブ・ロードの画面（どこからでも開ける。下のボタンは変えない）
// ---------- 図鑑（2026-11-25）: 装備・名品・魔物、それと武器の手引き。メニューの「図鑑」と工房の「書棚」から ----------
// 手に入れた装備・会った魔物を G.dex に記録していく。知らない物は影だけ出る
function dexInit() {
  if (G.dex) return G.dex; G.dex = { g: {}, m: {} };
  for (const g of G.gear || []) G.dex.g[g.id] = 1;                                   // 前からのセーブ: 持っている装備
  for (const m of MONSTERS) if (m.from <= (G.maxFloor || 0)) G.dex.m[m.id] = 0;       // 行った階の魔物は「見た」ことにする
  return G.dex;
}
const dexGear = id => { dexInit().g[id] = 1; };
const dexMon = (m, kill) => { if (!m || m.mirror || !m.id) return; const id = m.id.replace(/_gold$/, ''); const d = dexInit().m; d[id] = (d[id] || 0) + (kill ? 1 : 0); };
const DEX_BOSS = () => Object.entries(BOSSES).sort((a, b) => a[0] - b[0]).map(([f, b]) => ({ ...b, from: +f, to: +f }));
const DEX_MONS = () => MONSTERS.slice().sort((a, b) => a.from - b.from).concat(DEX_BOSS());
const DEX_GEARS = () => RECIPES.filter(r => !r.meika).sort((a, b) => (a.type === 'tool') - (b.type === 'tool') || (a.royal ? 7 : TIER_OF(a)) - (b.royal ? 7 : TIER_OF(b)) || ['sword', 'katana', 'greatsword', 'axe', 'hammer', 'dagger', 'bow', 'book', 'staff', 'shield', 'armor', 'tool'].indexOf(a.type) - ['sword', 'katana', 'greatsword', 'axe', 'hammer', 'dagger', 'bow', 'book', 'staff', 'shield', 'armor', 'tool'].indexOf(b.type));
const DEX_MEIKA = () => RECIPES.filter(r => r.meika);
const monSrc = m => m.file ? `assets/monsters/${m.id}_idle.webp` : (MON_IMG[m.id + '_idle'] || {}).src || '';
// 魔物の攻め方 → 効く属性
const ELEM_JP = { fire: '炎', ice: '氷', bolt: '雷', holy: '聖', dark: '闇' };
const KIND_JP = { breath: '竜の息', heavy: '怪力', bolt: '雷', fire: '炎', ice: '氷', dark: '呪い', magic: '魔法', poison: '毒', weapon: '武器', bite: '牙', claw: '爪' };
function weakOf(m) { const k = monAtkKind(m), w = Object.entries(ELEM_WEAK).filter(([, v]) => v.includes(k)).map(([e]) => ELEM_JP[e]); if (isDarkMon(m) && !w.includes('聖')) w.push('聖'); return w; }
// 武器の種類ごとの特徴
const W_GUIDE = {
  sword:      ['斬る', '片手で扱いやすい。盾と一緒に持てる、いちばん素直な武器。'],
  katana:     ['斬る', '両手で持つ重い武器。会心と居合の一撃が持ち味。'],
  greatsword: ['斬る', '両手で持つ重い武器。攻めも守りも厚い騎士の剣。'],
  axe:        ['叩き割る', '両手で持つ重い武器。とにかく一撃が重く、群れをまとめて薙ぎ払う。'],
  hammer:     ['叩く', '鍛冶屋の相棒。片手。守りを崩す「叩き割り」が得意。'],
  dagger:     ['突く', '片手で軽い。身のこなしが良くなり、敵の攻撃を避けやすい（回避+5%）。'],
  bow:        ['射る', '両手で持つが、重くはない。離れて狙い撃つ。'],
  book:       ['魔法', '攻撃の数字は低いが、魔法は敵の守りを無視して当たる。'],
  staff:      ['叩く', '癒しの祈りを覚える。長く戦うほど頼りになる。'],
  shield:     ['守る', '左手に持つ。両手武器とは一緒に持てない（熟練で片手持ちにすれば持てる）。'],
};
function gearTrait(r) {
  const t = [];
  if (r.desc) t.push(r.desc);
  if (r.crit) t.push(`会心が出やすい（+${Math.round(r.crit * 100)}%）`);
  if (r.def < 0) t.push(`持つと守り${r.def}`);
  if (r.fire) t.push('攻撃に炎が乗る');
  if (r.type === 'tool') t.push({ pick: '岩・鉱脈を掘る', axe: '木を切る', shovel: '砂や土を掘る' }[r.tool] + `。使うたびに減る（耐久${r.dur}）`);
  else if (WEAPON_TYPES[r.type] && WEAPON_TYPES[r.type].heavy && !r.desc) t.push('重い：ふつうの攻撃にAP2');
  return t.join('。');
}
function gearHow(r) {
  if (r.meika) return `名品・設計図から打つ（${MK_TIER[r.tier].floor}階〜で見つかる）`;
  if (r.royal) return r.id.startsWith('treasure') ? 'お城の褒美（王家の宝）' : 'お城の褒美';
  if (r.type === 'tool') return '工房で打つ・道具屋';
  const f = needFurnace(r); return `工房で打つ${f ? `（炉Lv${f}）` : ''}`;
}
let DEX = { cat: 'guide', page: 0, sel: -1, ch: 0 };
const DEX_PER = 25;
function dexBody() {
  dexInit();
  const sub = `<div class="seg dexcat">${[['guide', '手引き'], ['gear', '装備'], ['meika', '名品'], ['mon', '魔物']].map(([k, l]) => `<button data-dex="${k}" class="${DEX.cat === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (DEX.cat === 'guide') return sub + dexGuide();
  const list = DEX.cat === 'gear' ? DEX_GEARS() : DEX.cat === 'meika' ? DEX_MEIKA() : DEX_MONS();
  const known = x => DEX.cat === 'mon' ? G.dex.m[x.id] !== undefined : DEX.cat === 'meika' ? !!(G.dex.g[x.id] || (G.bp || []).includes(x.id)) : !!G.dex.g[x.id];
  const got = list.filter(known).length, pages = Math.ceil(list.length / DEX_PER);
  DEX.page = Math.max(0, Math.min(DEX.page, pages - 1));
  const sel = list[DEX.sel], card = sel ? dexCard(sel, known(sel)) : `<div class="dexcard empty"><span>${DEX.cat === 'mon' ? '会った魔物' : DEX.cat === 'meika' ? '設計図を見つけた名品' : '手に入れた装備'}が、ここに載っていく。<br>絵を押すと、くわしく読める。</span></div>`;
  const cells = list.slice(DEX.page * DEX_PER, DEX.page * DEX_PER + DEX_PER).map((x, j) => { const i = DEX.page * DEX_PER + j, k = known(x), src = DEX.cat === 'mon' ? monSrc(x) : iconOfType(x);
    return `<button class="dexcell${k ? '' : ' unk'}${i === DEX.sel ? ' on' : ''}${x.boss ? ' boss' : ''}" data-sel="${i}">${src ? `<img src="${src}" alt="" loading="lazy">` : ''}<i>${i + 1}</i></button>`; }).join('');
  return sub + card + `<div class="dexgrid">${cells}</div><div class="dexpage"><button data-pg="-1" ${DEX.page ? '' : 'disabled'}>◀</button><span>${DEX.page + 1}/${pages}　<b>${got}</b>/${list.length}</span><button data-pg="1" ${DEX.page < pages - 1 ? '' : 'disabled'}>▶</button></div>`;
}
function dexCard(x, k) {
  if (DEX.cat === 'mon') {
    const src = monSrc(x); if (!k) return `<div class="dexcard"><div class="pic unk">${src ? `<img src="${src}" alt="">` : ''}</div><div class="txt"><b>？？？</b><small>${x.from}階${x.boss ? 'の主' : 'あたりにいる'}。まだ会っていない。</small></div></div>`;
    const w = weakOf(x), drop = Object.keys(x.drop || {}).map(d => `<span class="need">${icoImg(d)}${NAMES[d] || d}</span>`).join('');
    return `<div class="dexcard"><div class="pic">${src ? `<img src="${src}" alt="">` : ''}</div><div class="txt"><b>${x.name}${x.boss ? '<em class="tag">主</em>' : ''}</b><small>${x.boss ? `${x.from}階の主` : `${x.from}〜${x.to || 10}階`}　HP${x.hp} 攻${x.atk} 守${x.def}</small><small>攻め方：${KIND_JP[monAtkKind(x)]}　${w.length ? `弱点：<em class="wk">${w.join('・')}</em>` : '弱点：なし'}</small><small>倒した数：${G.dex.m[x.id] || 0}</small><div class="drops">${drop}</div></div></div>`;
  }
  const src = iconOfType(x), made = !!G.dex.g[x.id];
  if (!k) return `<div class="dexcard"><div class="pic unk">${src ? `<img src="${src}" alt="">` : ''}</div><div class="txt"><b>？？？</b><small>${gearKind(x.type)}。売値${sellPrice(x)}G。${DEX.cat === 'meika' ? '設計図がまだない。宝箱・ミミック・主から、まれに見つかる。' : `まだ手に入れていない。${gearHow(x)}。`}</small></div></div>`;
  const tr = gearTrait(x), stat = x.type === 'tool' ? `耐久${x.dur}` : `${x.atk ? '攻' + x.atk : ''}${x.def ? ' 守' + x.def : ''}`;
  return `<div class="dexcard"><div class="pic">${src ? `<img src="${src}" alt="">` : ''}</div><div class="txt"><b>${x.name}</b><small>${gearKind(x.type)}　${stat}${WEAPON_TYPES[x.type] && WEAPON_TYPES[x.type].twoHand ? '　両手' : ''}</small>${tr ? `<small class="mkd">${tr}</small>` : ''}<small>売値：<em class="wk">${sellPrice(x)}G</em>　入手：${gearHow(x)}${DEX.cat === 'meika' && !made ? '　（まだ打っていない）' : ''}</small></div></div>`;
}
// 手引き: 章を選んで読む
const DEX_CH = [['武器の種類', 'w_sword'], ['素材の段階', 'iron'], ['属性と弱点', 'ember_stone'], ['名品と設計図', 'w_book'], ['ジョブと進化', 'w_staff'], ['女神の話', 'star_dust']];
function dexGuide() {
  const tabs = `<div class="dexch">${DEX_CH.map(([n, ic], i) => `<button data-ch="${i}" class="${DEX.ch === i ? 'on' : ''}">${icoImg(ic)}<span>${n}</span></button>`).join('')}</div>`;
  let h = '';
  if (DEX.ch === 0) h = `<div class="dexw">${Object.entries(W_GUIDE).map(([t, [how, d]]) => { const W = WEAPON_TYPES[t]; return `<div><b>${icoImg('w_' + t)}${W.name}<em>${how}${W.twoHand ? '・両手' : ''}${W.heavy ? '・重い' : ''}</em></b><small>${d}</small></div>`; }).join('')}</div><p class="note">重い武器はふつうの攻撃にAP2。両手武器も熟練${ONE_HAND_NEED}で片手で持てる。</p>`;
  if (DEX.ch === 1) h = `<table class="dext"><tr><th>素材</th><th>炉</th><th>見つかる所</th><th>持ち味</th></tr>${[
    ['copper', '銅・骨・革', 0, '1〜10階', 'はじめの武具'], ['iron', '鉄', 1, '5階〜・ゴーレム', '一人前の武具'], ['silver', '銀', 2, '銀の鉱石 21階〜', '鉄の1.6倍'], ['mithril', 'ミスリル', 3, 'ミスリル鉱石 41階〜', '鉄の2.3倍'],
    ['darksteel', '黒鋼', 3, '黒い鋼の欠片 61階〜', '会心+10%・守り-3'], ['orichalcum', 'オリハルコン', 4, '原石 71階〜', '鉄の3.7倍'], ['dragonbone', '竜骨', 4, '竜の魔物・85階〜', 'いちばん強い・炎']].map(([k, n, f, w, s]) => `<tr><td>${icoImg(k)}${n}</td><td>${f || '-'}</td><td>${w}</td><td>${s}</td></tr>`).join('')}</table><p class="note">鉱石や欠片は、ギルドで加工してから打つ。金床を強くすると、打った武具の数字が上がる。</p>`;
  if (DEX.ch === 2) h = `<table class="dext"><tr><th>属性</th><th>よく効く相手</th><th>おもな使い手</th></tr>${[
    ['fire', '炎', '氷・毒の魔物（虫・草木）', '炎の魔法・竜の武器・炎の剣'], ['ice', '氷', '炎・竜の魔物', '氷の魔法・氷の刀・霜の弓'], ['bolt', '雷', '獣・竜の魔物', '雷の魔法・雷の槍斧・嵐の剣'], ['holy', '聖', '亡霊・不死の魔物', '聖光・聖なる杖・太陽の大剣'], ['dark', '闇', '魔法を使う魔物（精霊など）', '闇の魔法・闇の大剣']].map(([k, n, a, b]) => `<tr><td><em class="el ${k}">${n}</em></td><td>${a}</td><td>${b}</td></tr>`).join('')}</table><p class="note">弱点を突くと1.5倍。魔物の弱点は「魔物」の頁に載る（会った魔物だけ）。魔法は守りを無視する。</p>`;
  if (DEX.ch === 3) { const n = DEX_MEIKA().length, b = (G.bp || []).length; h = `<div class="dexw one"><div><b>${icoImg('w_book')}名品とは<em>${b}/${n}</em></b><small>ふつうの武具にない特徴を持つ、名のある武具。2回攻撃、属性、HPを吸う、会心が出やすい、お金が増える……など。</small></div><div><b>設計図<em>見つけると工房へ</em></b><small>宝箱 6%・豪華な宝箱 18%・ミミック 50%・各階の主 60%で見つかる。高い階ほど強い名品の設計図が出る（1・11・31・51・71階から）。</small></div><div><b>打ち方<em>工房 →「名品」</em></b><small>段階に合った金属と魔石で打つ。名もなき剣だけは、ジンに一閃を教わるとき一緒に渡される。</small></div></div>`; }
  if (DEX.ch === 4) h = `<div class="dexw">${Object.entries(WEAPON_TYPES).filter(([, W]) => W.job).map(([t, W]) => { const J = JOBS[W.job], ups = UPPERS.filter(u => u.hold === t).map(u => `${u.job}(+${WEAPON_TYPES[u.exp].name})`); return `<div><b>${icoImg('w_' + t)}${W.job}<em>${W.name}</em></b><small>${J.learn.map(([n, s]) => (SKILLS[s] || PASSIVES[s] || {}).name).filter(Boolean).join('・')}${ups.length ? `<br>進化：${ups.join('・')}` : ''}</small></div>`; }).join('')}</div><p class="note">右手の武器でジョブが決まる。別の武器を使い込んでおくと、上級職に進化する。</p>`;
  if (DEX.ch === 5) h = dexGodLore() + '<p class="note">女神に初めて会ったとき（1周目は11〜50階、2周目は51〜90階）に聞ける。</p>';
  return tabs + `<div class="dexread">${h}</div>`;
}
function dexBind(m) {
  m.querySelectorAll('[data-dex]').forEach(b => b.onclick = () => { DEX = { cat: b.dataset.dex, page: 0, sel: -1, ch: DEX.ch }; sfx('page', { vol: .5 }); openMenu('dex'); });
  m.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { DEX.ch = +b.dataset.ch; sfx('page', { vol: .5 }); openMenu('dex'); });
  m.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { DEX.sel = +b.dataset.sel; sfx('select', { vol: .4 }); openMenu('dex'); });
  m.querySelectorAll('[data-lore]').forEach(b => b.onclick = () => { DEX.lore = +b.dataset.lore; sfx('page', { vol: .5 }); openMenu('dex'); });
  m.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { DEX.page += +b.dataset.pg; DEX.sel = -1; sfx('page', { vol: .5 }); openMenu('dex'); });
}
function openMenu(tab) {
  let m = $('menu'); if (!m) { m = document.createElement('div'); m.id = 'menu'; document.body.appendChild(m); m.onclick = e => { if (e.target === m) closeMenu(); }; }
  tab = tab || 'opt'; const inTown = mode === 'town' && !document.body.classList.contains('story') && !document.body.classList.contains('intro');
  const seg = (key, labels) => `<div class="seg">${labels.map((l, i) => `<button data-k="${key}" data-v="${i}" class="${OPTS[key] === i ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const vol = key => `<div class="seg vol">${[0, .25, .5, .75, 1].map(v => `<button data-k="${key}" data-v="${v}" class="${Math.abs(OPTS[key] - v) < .01 ? 'on' : ''}">${v === 0 ? '切' : '▮'.repeat(v * 4)}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'opt') body = `<dl>
    <dt>言語 / Language</dt><dd><div class="seg"><button data-k="lang" data-v="0" class="${OPTS.lang === 0 ? 'on' : ''}" translate="no">日本語</button><button data-k="lang" data-v="1" class="${OPTS.lang === 1 ? 'on' : ''}">English</button></div></dd>
    <dt>音楽</dt><dd>${vol('bgm')}</dd><dt>効果音</dt><dd>${vol('sfx')}</dd>
    <dt>文字の速さ</dt><dd>${seg('text', ['ゆっくり', 'ふつう', 'はやい', '一瞬'])}</dd>
    <dt>画面の揺れ</dt><dd>${seg('shake', ['なし', '弱い', 'ふつう', '強い'])}</dd>
    <dt>名前</dt><dd><div class="seg"><button data-act="name">${heroName()}（変える）</button></div></dd>
    <dt>オートセーブ</dt><dd><div class="seg"><button data-k="auto" data-v="1" class="${OPTS.auto ? 'on' : ''}">オン</button><button data-k="auto" data-v="0" class="${!OPTS.auto ? 'on' : ''}">オフ</button></div></dd></dl>
    <p class="note">オートセーブは、町に戻ったときや階を移ったときに自動で記録します。</p><p class="note" data-act="ver" style="text-align:right;opacity:.45">Tower of Hope</p>`;
  if (tab === 'save') body = (inTown ? '' : '<p class="note warn">セーブは町にいるときだけできます。</p>') + [1, 2, 3].map(n => `<button class="slot" data-save="${n}" ${inTown && G ? '' : 'disabled'}><b>スロット${n}</b><small>${slotText(n)}</small></button>`).join('');
  if (tab === 'load') body = [0, 1, 2, 3].map(n => `<button class="slot" data-load="${n}" ${slotInfo(n) ? '' : 'disabled'}><b>${n ? 'スロット' + n : 'オートセーブ'}</b><small>${slotText(n)}</small></button>`).join('') + '<p class="note">ロードすると、町から始まります。</p>';
  if (tab === 'dex') body = dexBody();
  m.innerHTML = `<div class="panel${tab === 'dex' ? ' dex' : ''}"><div class="tabs2">${[['opt', '設定'], ['save', 'セーブ'], ['load', 'ロード'], ['dex', '図鑑']].filter(x => x[0] !== 'dex' || G).map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="body">${body}</div>
    <div class="foot">${document.body.classList.contains('title') ? '' : '<button data-act="title">タイトルへ</button>'}<button data-act="close" class="hot">閉じる</button></div></div>`;
  m.classList.add('on'); if (tab === 'dex') dexBind(m);
  m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { sfx('select', { vol: .5 }); openMenu(b.dataset.tab); });
  m.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k; OPTS[k] = k === 'auto' ? b.dataset.v === '1' : +b.dataset.v; saveOpts(); applyOpts(); sfx('select', { vol: .5 }); if (k === 'lang') { I18N.setLang(OPTS.lang === 1); if (typeof drawLog === 'function' && logLines.length) drawLog(); }
    if (k === 'auto' && OPTS.auto && G) save(); openMenu('opt');
  });
  m.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const n = +b.dataset.save; try { localStorage.setItem(SLOT_KEY(n), JSON.stringify({ G, at: Date.now() })); sfx('chest', { vol: .7 }); } catch (e) {}
    openMenu('save'); const e = m.querySelector(`[data-save="${n}"]`); if (e) e.classList.add('done');
  });
  m.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
    const n = +b.dataset.load, i = slotInfo(n); if (!i) return;
    b.outerHTML = `<div class="confirm"><span>${n ? 'スロット' + n : 'オートセーブ'}をロードする？ 今の進み具合は、セーブしていなければ消えます。</span><button data-yes="${n}" class="hot">ロードする</button><button data-no>やめる</button></div>`;
    m.querySelector('[data-no]').onclick = () => openMenu('load');
    m.querySelector('[data-yes]').onclick = () => { G = Object.assign(NEW_GAME(), i.g); FLOORS = {}; B = null; closeMenu(); document.body.classList.remove('story', 'title', 'intro'); fadeGo(() => { townMap(); say('normal', '「さて、続きといくか」', true); save(); }, { hold: 400 }); };
  });
  { const vb = m.querySelector('[data-act="ver"]'); if (vb) vb.onclick = () => { openMenu.tap = (openMenu.tap || 0) + 1; if (openMenu.tap >= 5) { openMenu.tap = 0; closeMenu(); testMenu(); } }; }  // 5回押すとテストモード
  { const nb = m.querySelector('[data-act="name"]'); if (nb) nb.onclick = () => { closeMenu(); const back = ['home', 'weapon', 'clinic', 'guild', 'item', 'bank', 'inn'].includes(place) ? (() => { const p = place; return () => inside(p); })() : townMap; if (mode === 'dungeon' || mode === 'battle') { log('名前は、町にいるときに変えられる。', true); return; } nameScreen(back, true); }; }
  m.querySelector('[data-act="close"]').onclick = closeMenu;
  { const t = m.querySelector('[data-act="title"]'); if (t) t.onclick = () => { t.outerHTML = `<button data-act="title2" class="hot">${OPTS.auto ? 'タイトルへ戻る' : 'セーブせずに戻る'}</button>`; m.querySelector('[data-act="title2"]').onclick = () => { save(); closeMenu(); FLOORS = {}; B = null; titleScreen(); }; }; }
}
function closeMenu() { const m = $('menu'); if (m) m.classList.remove('on'); }
function applyOpts() { if (SND.setVol) SND.setVol(OPTS.bgm, OPTS.sfx); }
function resetGame() { buttons([{ title: 'はじめからにする？（オートセーブは上書き。スロットのセーブは残る）' }, { t: 'はじめる', f: () => { G = NEW_GAME(); save(); intro(0); } }, { t: 'やめる', f: titleScreen }]); }

// ---------- 探索 ----------
// 塔にいる間は、一度行った階の様子（開けた扉・宝箱・地図）を覚えておく。町に戻るとリセット
let FLOORS = {};
function enterFloor(n, fromAbove) {
  showTown(false, 4 / 3);
  if (!G.rumor) rollRumor(); TODAY = RUMORS[G.rumor].mod;
  if (!Object.keys(FLOORS).length) startRun(n);
  if (G.cur) G.cur.top = Math.max(G.cur.top, n);
  // 魔除け・魔寄せは、使ってから3フロアで切れる（階が変わるたびに1減る）
  let encEnd = false; if (G.enc && n !== floorNo) { G.enc.floors--; if (G.enc.floors <= 0) { G.enc = null; encEnd = true; } }
  { const ar = areaOf(n)[1]; if (TEX.area !== ar) loadTextures(ar); }  // エリアが変わったら絵を読み替える（読み終わるまで暗いまま）
  floorNo = n; F = FLOORS[n] || (FLOORS[n] = genFloor(n, n % 10 === 0 ? 0 : 1 + Math.floor(R() * 1e6))); mode = 'dungeon'; B = null;
  // 上の階から下りてきたときは上り階段の前、それ以外は下り階段の前から始める（どちらも部屋の方を向く）
  const [sx, sy] = fromAbove ? F.upFront : F.start, sd = fromAbove ? F.upDir : F.startDir;
  P = { x: sx + .5, y: sy + .5, a: 0 };
  dir = DIRS.findIndex(([a, b]) => a === sd[0] && b === sd[1]); if (dir < 0) dir = 0;
  P.a = dir * Math.PI / 2; T = { ...P }; steps = 0; reveal(F, sx, sy);
  G.maxFloor = Math.max(G.maxFloor, n); save();
  dungeonUI(); log(`${n}階。うしろに${fromAbove ? '上り' : '下り'}階段がある。`, true); hud();
  if (encEnd) log('焚いていた香の効き目が切れた。');
  if (n === 99 && !G.lastGoddess) setTimeout(() => { if (mode === 'dungeon' && floorNo === 99) lastGoddess(); }, 700);
  if (n === 100) log(G.cleared ? '100階。塔のいちばん上。……鏡は、まだそこにある。' : '100階。空気が、しんと静まりかえっている。\nこの階の上り階段の先に、何かがいる。', true);
  if (G.als && n > ALS_TOP) { G.als = false; save(); log('アルス「ここから先は、まだ僕には……。師匠、先に町へ戻ってます！ ご無事で！」', true); }
}
function dungeonUI() {
  if ($('meet')) $('meet').style.display = 'none';
  clearFig(); spkFace = null; drawSpk();
  const box = $('ctl'); box.innerHTML = '';
  const pad = document.createElement('div'); pad.className = 'pad';
  for (const [t, a, label] of [['↰', 'tl', '左を向く'], ['▲', 'f', '前へ'], ['↱', 'tr', '右を向く'], ['◀', 'sl', '左へ'], ['▼', 'b', '後ろへ'], ['▶', 'sr', '右へ']]) {
    const b = document.createElement('button'); b.textContent = t; b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', e => { e.preventDefault(); act(a); }); pad.appendChild(b);
  }
  box.appendChild(pad);
  const row = document.createElement('div'); row.className = 'btns three'; row.style.marginTop = '6px';
  // ボタンはいつも同じ3つ（ツール・調べる・道具）。階段は正面に進めば上り下りする（ボタンが増えて絵が小さくならないように）
  const [fdx, fdy] = DIRS[dir], here = cellTo(fdx, fdy);
  const chest = chestHere(), p = propAhead();
  const mk = (t, s, f, hot, off) => { const b = document.createElement('button'); b.innerHTML = t + (s ? `<small>${s}</small>` : ''); if (hot) b.className = 'hot'; if (off) b.disabled = true; b.onclick = () => { f(); hud(); }; row.appendChild(b); };
  { const dg = digInfo(), tl = gearBy(G.equip.tool); mk('ツール', dg ? dg.label : tl ? `${tl.name} ${tl.dur}/${tl.maxDur}` : 'なし', useTool, !!(dg && dg.ok)); }
  { const what = chest ? (chest.gold ? '豪華な宝箱' : '宝箱') : p && PROP_INFO[p.key] ? (p.searched ? '調べた' : PROP_INFO[p.key][0]) : here === 2 ? '上り階段' : here === 3 ? '下り階段' : '';
    mk('調べる', what, inspect, !!chest || !!(p && PROP_INFO[p.key] && !p.searched)); }
  mk('道具', G.enc ? `${ITEMS[G.enc.k].name} 残${G.enc.floors}` : '薬草・羽など', itemMenu);
  box.appendChild(row);
  const n = document.createElement('div'); n.className = 'note'; n.textContent = `持っている戦利品: ${matText(G.carry)}（倒れるとなくなる）`; box.appendChild(n);
  fitStage();
}
function cellAt(x, y) { return F.M[y] && F.M[y][x] !== undefined ? F.M[y][x] : 1; }
// 階段は正面（部屋の側）からだけ。横や裏から向かうと、ただの壁
function stairFront(c, dx, dy) { const fr = c === 2 ? F.upDir : c === 3 ? F.startDir : null; return !fr || (dx === -fr[0] && dy === -fr[1]); }
function cellTo(dx, dy) { const c = cellAt(Math.floor(T.x) + dx, Math.floor(T.y) + dy); return (c === 2 || c === 3) && !stairFront(c, dx, dy) ? 1 : c; }
function act(a) {
  if (mode !== 'dungeon' || busy || document.querySelector('#view .fig')) return;  // 人と会っている間は歩かない（絵を押しても進まない）
  const cx = Math.floor(T.x), cy = Math.floor(T.y);
  if (a === 'tl' || a === 'tr') { dir = (dir + (a === 'tl' ? 3 : 1)) % 4; T.a += (a === 'tl' ? -1 : 1) * Math.PI / 2; busy = true; setTimeout(() => { facingNote(); dungeonUI(); }, 180); return; }
  const o = { f: 0, b: 2, sl: 3, sr: 1 }[a], [ddx, ddy] = DIRS[(dir + o) % 4], c = cellTo(ddx, ddy);
  if (c === 4 || c === 5) { F.M[cy + ddy][cx + ddx] = 0; reveal(F, cx + ddx, cy + ddy); log(c === 5 ? '重い鉄の扉を押し開けた。' : '扉を開けた。'); dungeonUI(); return; }
  if (c === 2 || c === 3) { if (o === 0) stairs(); else log('階段は正面から使う。'); return; }
  if (c === 1) { fx.shake = 3; sfx('wallhit', { vol: .7 }); log('壁だ。'); return; }
  if (c === 6) { fx.shake = 2; const ch = F.chests.find(q => q.x === cx + ddx && q.y === cy + ddy); log(ch ? (ch.open ? '開けた宝箱だ。' : '宝箱がある。開けてみよう。') : propAt(cx + ddx, cy + ddy) ? 'じゃまな物がある。' : '木が立ちふさがっている。'); return; }
  T.x += ddx; T.y += ddy; busy = true; steps++; stepSfx(floorNo);
  reveal(F, cx + ddx, cy + ddy);
  setTimeout(afterStep, 200);
}
// 宝箱は通れない。正面にあるときに開けられる
function chestAhead(any) { if (!F) return null; const [fdx, fdy] = DIRS[dir], x = Math.floor(T.x) + fdx, y = Math.floor(T.y) + fdy; return F.chests.find(ch => (any || !ch.open) && ch.x === x && ch.y === y); }
const chestHere = () => chestAhead();
function facingNote() {
  const [fdx, fdy] = DIRS[dir], c = cellTo(fdx, fdy);
  if (c === 2) log(BOSSES[floorNo] && (!bossBeat(floorNo) || midAgain(floorNo)) ? '上り階段。上から重い足音がする……。\n（▲で上る）' : '上り階段がある。（▲で上る）');
  else if (c === 3) log(floorNo === 1 ? '下り階段。町に戻れる。（▲で下りる）' : '下り階段がある。（▲で下りる）');
  else if (c === 1 && F.vein && F.vein[(Math.floor(T.x) + fdx) + ',' + (Math.floor(T.y) + fdy)]) log({ v_copper: '銅', v_iron: '鉄', v_stone: '魔石', v_gems: '宝石', v_orichalcum: 'オリハルコン' }[F.vein[(Math.floor(T.x) + fdx) + ',' + (Math.floor(T.y) + fdy)]] + 'の鉱脈が見える。ツールで掘れそうだ。');
  else if (c === 6) { const ch = chestAhead(true), p = propAhead(); if (ch) log(ch.open ? '開けた宝箱がある。' : ch.gold ? '豪華な宝箱がある！' : '宝箱がある。'); else if (p && PROP_INFO[p.key]) log(`${PROP_INFO[p.key][0]}がある。${p.searched ? '（調べた）' : ''}`); }
}
function afterStep() {
  if (mode !== 'dungeon') return;
  if (steps > 4 && R() < (TODAY.enc || .075) * (G.bless === 'calm' ? .6 : 1) * (G.enc ? (G.enc.k === 'ward' ? .7 : 1.4) : 1)) { startBattle(); return; }
  else if (steps > 6 && !F.met && R() < .025) { const who = meetCandidates(); if (who.length) { F.met = true; meetApproach(pick(who)); return; } }
  facingNote(); dungeonUI();
}
// ---------- 塔でたまに会う人 ----------
function meetCandidates() {
  return Object.entries(TOWER_NPCS).filter(([id, n]) => {
    const inRange = n.ranges ? n.ranges.some(([a, b]) => floorNo >= a && floorNo <= b) : floorNo >= n.from && (floorNo <= n.to || (id === 'fuuka' && perk('fuuka')));
    if (id === 'dan' && G.danRun === G.runs) return false;  // ダンは1回の塔で一度だけ
    if (n.battles && (G.allyGone || {})[id] === G.runs) return false;  // 一度別れた仲間は、その回の塔ではもう来ない
    return inRange && !(n.battles && G.ally);
  }).map(([id]) => id);
}
// 2026-11-25: いきなり出てこない。通路の先に黒い影が見えて、近づくと話しかけてくる
function meetApproach(id) {
  const god = !!TOWER_NPCS[id].god;
  showFig(`assets/npc/${id}.webp`, { who: id, mode: 'full' });
  const f = document.querySelector('#view .fig'); if (f) f.classList.add('shadow', god ? 'glow' : 'dark');
  log(god ? '通路の先が、ほのかに光っている。\n……光の中に、誰かが立っている。' : pick(['通路の先に、人影が見える……。', '暗がりの奥に、誰かが立っている。', '……足音。通路の先に、黒い影がある。']), true);
  buttons([{ t: '近づく', hot: true, f: () => {
    stepSfx(floorNo); setTimeout(() => stepSfx(floorNo), 330); const g = document.querySelector('#view .fig'); if (g) g.classList.add('near');
    buttons([]); setTimeout(() => { const h = document.querySelector('#view .fig'); if (h) h.classList.remove('shadow', 'dark', 'glow', 'near'); meetNpc(id); }, 750);
  } }, { t: '離れる', f: () => { clearFig(); log(god ? '光から目をそらして、先へ進んだ。' : '人影を避けて、別の道を行くことにした。', true); dungeonUI(); hud(); } }]);
}
function meetShow(id) { showFig(`assets/npc/${id}.webp`, { who: id }); }
function meetNpc(id) {
  meetShow(id); const go = () => { $('meet').style.display = 'none'; clearFig(); dungeonUI(); hud(); };
  if (id === 'dan') {
    G.danRun = G.runs;
    const k = pick(['herb', 'herb', 'herb_m', 'wing', 'bandage']), n = k === 'herb' ? 2 : 1; G.items[k] += n; save();
    log(pick(['ダン「なんだ、鍛冶屋がこんな所で何してる。……ほら、余ったからやるよ。捨てるとこだっただけだ」', 'ダン[laugh]「まだ生きてたのか。しぶといな。……これ持ってけ。死なれると寝覚めが悪い」', 'ダン「勘違いするなよ。荷物が重いだけだ」']), true);
    log(`${ITEMS[k].name}を${n}個もらった。`);
    buttons([{ t: '「ありがとう」', hot: true, f: () => { log('ダン「……礼なんかいらねえよ」', true); go(); } }]); return;
  }
  if (TOWER_NPCS[id].god) { meetGod(id, go); return; }
  if (id === 'gaban') {
    G.hp = G.mhp; G.items.herb_l++; if (!G.ally) G.ally = { id, left: TOWER_NPCS.gaban.battles }; save();
    log(pick(['ギャバン[laugh]「鍛冶屋殿！ こんな上で会えるとは！ さあ、近衛兵の秘薬です。遠慮なく！」', 'ギャバン「自分も、ここまでは来られたのです。……鍛冶屋殿なら、その先へ行けます！」']), true);
    log(`HPが全回復した。大薬草をもらった。${G.ally && G.ally.id === 'gaban' ? `\nギャバンが一緒に戦ってくれる（${G.ally.left}回）。` : ''}`);
    buttons([{ t: '「ありがとう、ギャバン」', hot: true, f: () => { log('ギャバン[laugh]「はっ！ ご武運を！」', true); go(); } }]); return;
  }
  if (id === 'gurugamo') {
    G.ally = { id, left: TOWER_NPCS.gurugamo.battles }; save();
    log('グルガモ[laugh]「おう、鍛冶屋！ ちょうど暇してたんだ。ちょっと付き合うぜ」', true);
    log(`グルガモが一緒に戦ってくれる（${G.ally.left}回）。`);
    buttons([{ t: '「頼もしいな」', hot: true, f: go }]); return;
  }
  // 2026-11-25: フウカと初めて会うとき。影の中から手裏剣が飛んで、背後の魔物を倒す → 名乗る
  if (id === 'fuuka' && !(G.met || {}).fuuka && !((G.aff || {}).fuuka > 0) && !(G.allyGone || {}).fuuka) { fuukaFirst(go); return; }
  if (id === 'fuuka' && evReady('fuuka', .6)) { fuukaEvent(go); return; }
  if (id === 'fuuka' && !meetNpc.fr) { const rl = typeof runLine === 'function' ? runLine('fuuka') : null; if (rl) { log(rl, true); buttons([{ t: '次へ', hot: true, f: () => { meetNpc.fr = true; meetNpc(id); meetNpc.fr = false; } }]); return; } }
  if (id === 'fuuka') {
    talkTo('fuuka', () => {
      G.ally = { id, left: perk('fuuka') ? 12 : TOWER_NPCS.fuuka.battles }; save();
      log(`フウカ「……しばらく、ご一緒します」\nフウカが一緒に戦ってくれる（${G.ally.left}回）。`, true);
      buttons([{ t: '先へ進む', hot: true, f: go }]);
    });
  }
}
function fuukaFirst(go) {
  clearFig(); buttons([]);
  const next = (t, f) => buttons([{ t: t || '次へ', hot: true, f }]);
  sfx('swing', { vol: .9 }); log('――ヒュッ。\n頭のすぐ上を、何かがかすめていった。', true);
  next('「……！？」', () => {
    sfx('hit', { vol: .8 }); shakeAt(0, 4);
    log('ドサッ。\n振り返ると、背後に迫っていた魔物が、手裏剣を受けて倒れていた。', true);
    next(null, () => {
      sfx('dash', { vol: .6 }); meetShow('fuuka'); const f = document.querySelector('#view .fig'); if (f) { f.style.opacity = 0; f.style.transition = 'opacity .9s'; requestAnimationFrame(() => { f.style.opacity = 1; }); }
      log('影の中から、黒装束の少女が音もなく降り立った。', true);
      next(null, () => {
        log('フウカ「……お怪我は、ありませんか」', true);
        next('「助かった。……あんたは？」', () => {
          log('フウカ「フウカと申します。……この塔で、ある任務についている者です」', true);
          next(null, () => {
            log('フウカ[think]「あなたは……冒険者には見えませんね。その手……職人の手です」', true);
            next('「鍛冶屋だ。材料を採りに来た」', () => {
              log('フウカ[laugh]「……鍛冶屋が、自分で。……ふふ。変わった方ですね」', true);
              next(null, () => {
                G.met = G.met || {}; G.met.fuuka = true;
                G.ally = { id: 'fuuka', left: perk('fuuka') ? 12 : TOWER_NPCS.fuuka.battles }; save();
                log(`フウカ「この先は、魔物が多い。……しばらく、ご一緒します」\nフウカが一緒に戦ってくれる（${G.ally.left}回）。`, true);
                buttons([{ t: '先へ進む', hot: true, f: go }]);
              });
            });
          });
        });
      });
    });
  });
}
// 女神: 会話（親密度）→ 戦利品をもらう／回復してもらう（親密度が上がると選べる）
function meetGod(id, go0, after) {
  SND.goddess = true; const go = () => { SND.goddess = false; go0(); };
  if (!after && godStory(id, () => meetGod(id, go0, true), go)) return;
  const name = TOWER_NPCS[id].name, start = areaOf(floorNo)[0];
  if (start > 1 && !G.warps.includes(start)) { G.warps.push(start); G.warps.sort((a, b) => a - b); save(); setTimeout(() => log(`（${name}の加護を受けた。塔の入口の女神像から、${start}階へ来られるようになった）`), 0); }
  talkTo(id, () => {
    const aff = G.aff[id] || 0;
    log(`${name}[smile]「さあ、どうしてほしい？」`, true);
    buttons([
      { t: '戦利品をもらう', hot: true, f: () => {
        const pool = monPool(floorNo).flatMap(m => Object.keys(m.drop)), got = {};
        for (let i = 0; i < 3; i++) add(got, pick(pool), 1);
        if (aff >= GOD_RARE_NEED) add(got, pick(RARE_RAW), 1);
        for (const [k, v] of Object.entries(got)) add(G.carry, k, v); save();
        log(`${name}[laugh]「持っていきなさい」\n${matText(got)}をもらった。${aff >= GOD_RARE_NEED ? '（めずらしい物もある！）' : ''}`, true);
        buttons([{ t: '先へ進む', hot: true, f: go }]); } },
      { t: '回復してもらう', s: aff >= GOD_HEAL_NEED ? 'HP全回復' : `親密度${GOD_HEAL_NEED}から`, off: aff < GOD_HEAL_NEED, f: () => {
        G.hp = G.mhp; save(); log(`${name}[smile]「少し、休んでいきなさい」\nHPが全回復した。`, true);
        buttons([{ t: '先へ進む', hot: true, f: go }]); } },
    ]);
  });
}
const ALS_TOP = 4;  // アルスは4階まで（2026-11-25）
// 一緒に戦ってくれる人の番（主人公のターンの後、敵の前）
// 2026-11-25: 仲間の攻撃の数字はオレンジ色。攻撃のたびに、顔つきで一言しゃべる（同じ言葉が続かないように）
const ALLY_LINES = {
  fuuka: ['フウカ[angry]「……参ります」', 'フウカ「背中は、お任せを」', 'フウカ[smile]「傷は、浅いです。……すぐに塞ぎます」', 'フウカ「影より、一閃」', 'フウカ[think]「動きは、見切りました」', 'フウカ[shy]「……あなたの隣は、戦いやすいです」', 'フウカ[angry]「その方には、触れさせません」', 'フウカ[smile]「少し、休んでください。私が出ます」'],
  gurugamo: ['グルガモ[laugh]「どっせぇい！」', 'グルガモ[angry]「斧の錆にしてくれるわ！」', 'グルガモ[laugh]「がっはっは！ 腕がなまってなくて安心したぜ！」', 'グルガモ「鍛冶屋、右は任せな！」', 'グルガモ[smile]「いい斧だろ？ ……お前に研いでもらったやつだ」', 'グルガモ[angry]「おらぁっ！ まとめてかかってこい！」'],
  gaban: ['ギャバン[angry]「近衛兵長の剣、受けてみよ！」', 'ギャバン「鍛冶屋殿、お下がりを！」', 'ギャバン[laugh]「はっはっは！ これが王国の剣です！」', 'ギャバン[smile]「鍛冶屋殿の打った剣、実によく斬れる！」', 'ギャバン[angry]「でやぁっ！」', 'ギャバン「86階で学んだこと、ここで活かします！」'],
  als: ['アルス[angry]「やあっ！」', 'アルス[laugh]「師匠、見ててください！」', 'アルス「特訓の成果です！」', 'アルス[smile]「師匠の背中は、僕が守ります！」', 'アルス[shock]「う、うわっ……でも、負けません！」', 'アルス[angry]「師匠の剣で……斬る！」'],
};
function allyLine(id) {
  const L = ALLY_LINES[id]; if (!L) return;
  const last = (allyLine.last = allyLine.last || {}); let t; do t = pick(L); while (L.length > 1 && t === last[id]); last[id] = t;
  spkFace = null; logFace = null; log(t);
}
function allyHit(m, power, delay) { B.ally = true; const keep = B.hitDelay; B.hitDelay = delay; const d = dmgTo(m, power); B.hitDelay = keep; B.ally = false; return d; }
function allyTurn() {
  if (B.over) return false; const m = target();
  if (G.als && floorNo <= ALS_TOP && R() < .5) { allyLine('als'); playFx('slash', { delay: 200, size: .8 }); const d = allyHit(m, atkPower() * .6, 320); log(`アルスの斬撃！ ${d}のダメージ。`); if (allDead()) { win(); return true; } }
  const a = G.ally; if (!a) return false;
  const m2 = target(); if (!m2) { if (allDead()) { win(); return true; } return false; }
  allyLine(a.id);
  if (a.id === 'fuuka') { playFx('thrust', { delay: 200 }); playFx('heal_leaf', { self: true, delay: 420, size: .8 }); const d = allyHit(m2, atkPower() * .7, 320), h = Math.ceil(G.mhp * .15); healMe(h); log(`フウカの攻撃！ ${d}のダメージ。HPを${h}回復してくれた。`); }
  if (a.id === 'gurugamo') { playFx('impact_heavy', { delay: 200 }); const d = allyHit(m2, atkPower(), 340); log(`グルガモの斧！ ${d}のダメージ。`); }
  if (a.id === 'gaban') { FX_AT = m2; playFx('slash_x', { delay: 200, size: 1.1 }); FX_AT = null; const d = allyHit(m2, atkPower() * 1.1, 340); log(`ギャバンの剣！ ${d}のダメージ。`); }
  if (allDead()) { win(); return true; }
  return false;
}
// 戦闘が1回終わるたびに、残りの回数を減らす
function allyTick() {
  const a = G.ally; if (!a) return; a.left--;
  if (a.left > 0) return;
  G.ally = null; (G.allyGone = G.allyGone || {})[a.id] = G.runs; save();
  log(a.id === 'gaban' ? 'ギャバン[laugh]「自分はここまでです！ 鍛冶屋殿、その先を……どうか！」' : a.id === 'gurugamo' ? 'グルガモ「おっと、そろそろ帰らねえと、かみさんに怒られる！ じゃあな！」' : 'フウカ[shy]「……そろそろ、任務に戻ります。……また、お会いできますね」');
}
// ---------- 調べる（床の小物） ----------
const propAt = (x, y) => (F.props || []).find(p => p.cx === x && p.cy === y);
function propAhead() { const [fdx, fdy] = DIRS[dir], x = Math.floor(T.x) + fdx, y = Math.floor(T.y) + fdy; return (F.props || []).find(p => p.cx === x && p.cy === y); }
function rollLoot(table) { const sum = table.reduce((s, r) => s + r[2], 0); let q = R() * sum; for (const r of table) if ((q -= r[2]) < 0) return r; return table[table.length - 1]; }
function giveLoot([kind, v]) {
  if (kind === 'raw') { add(G.carry, v, 1); return `${NAMES[v]}を見つけた。`; }
  if (kind === 'item') { G.items[v] = (G.items[v] || 0) + 1; gotToast(v, 1); return `${ITEMS[v].name}を見つけた。`; }
  if (kind === 'gold') { const n = Math.ceil(v * (.6 + R() * .8) * (1 + floorNo * .1) * ECON.prop * goldArea(floorNo)); G.gold += n; gotToast('gold', n); return `${n}Gを見つけた。`; }
  return '';
}
// 調べる: 正面の宝箱を開ける／床の物を調べる／階段なら行き方を教える
function inspect() {
  if (chestHere()) { openChest(); return; }
  const p = propAhead(); if (p && PROP_INFO[p.key]) { if (p.searched) log(`${PROP_INFO[p.key][0]}。もう調べた。`, true); else searchProp(); return; }
  const [fdx, fdy] = DIRS[dir], c = cellTo(fdx, fdy);
  if (c === 2) log(`上り階段だ。前に進むと${floorNo + 1}階へ上る。`, true);
  else if (c === 3) log(`下り階段だ。前に進むと${floorNo === 1 ? '町に戻る' : (floorNo - 1) + '階へ下りる'}。`, true);
  else log(pick(['特に何もない。', '……何もないようだ。', '足元を見回した。何もない。']), true);
}
function searchProp() {
  const p = propAhead(); if (!p || p.searched) return; p.searched = true;
  const [name, grp] = PROP_INFO[p.key]; let msg;
  if (grp === 'feather') { G.items.wing++; gotToast('wing', 1); F.props = F.props.filter(q => q !== p); F.M[p.cy][p.cx] = 0; msg = `${name}を拾った。……帰還の羽だ！`; }
  else if (grp === 'mimic') {
    const d = Math.max(1, Math.ceil(G.mhp * .2)); G.hp = Math.max(1, G.hp - d); fx.flash = .8; fx.shake = 6;
    const gold = Math.round((30 + floorNo * 8) * ECON.prop * goldArea(floorNo)), raw = pick(['ore_iron', 'raw_gem', 'dim_stone']); G.gold += gold; add(G.carry, raw, 1);
    p.key = p.key === 'f_mimic' ? 'chest_open' : 'chest_gold_open'; p.size = .42;
    msg = `ガブッ！ ${name}にかみつかれた！ ${d}のダメージ。\nミミックは中身を吐き出して逃げていった。${gold}Gと${NAMES[raw]}を手に入れた。`;
  }
  else if (grp === 'view') { p.searched = false; msg = PROP_LOOK[p.key] || `${name}がある。`; }
  else if (grp === 'berry') {
    if (R() < .5) { G.items.herb++; gotToast('herb', 1); msg = '茂みの中に、薬草がまじっていた。薬草を手に入れた。'; }
    else msg = '赤い木の実がなっている。……すっぱい。何もなかった。';
  }
  else if (grp === 'mushroom') {
    if (R() < .6) { G.items.herb++; gotToast('herb', 1); msg = 'キノコの根元に、薬草が生えていた。'; }
    else { const d = Math.ceil(G.mhp * .08); G.hp = Math.max(1, G.hp - d); msg = `……かじってみたら、毒キノコだった。${d}のダメージ。`; }
  }
  else { const got = giveLoot(rollLoot(SEARCH_LOOT[grp])); msg = got ? `${name}を調べた。${got}` : `${name}を調べた。……何もない。`; }
  save(); log(msg, true); dungeonUI(); hud();
}
// ---------- 採掘（ツールで壁を掘る） ----------
const areaOf = n => { let a = AREAS[0]; for (const x of AREAS) if (n >= x[0]) a = x; return a; };
const MARK = { 3: '◎', 2: '◯', 1: '△' };
const VEIN_RAW = { v_copper: 'ore_copper', v_iron: 'ore_iron', v_stone: 'dim_stone', v_gems: 'raw_gem', v_orichalcum: 'ember_stone' };
// 目の前の壁が掘れるか。掘れないときは null（ボタンを出さない）
function digInfo() {
  const t = gearBy(G.equip.tool); if (!t) return null;
  const [fdx, fdy] = DIRS[dir], x = Math.floor(T.x) + fdx, y = Math.floor(T.y) + fdy;
  if (cellAt(x, y) !== 1) return null;
  const edge = x <= 0 || y <= 0 || x >= F.N - 1 || y >= F.N - 1, bone = NO_DIG_FLOORS.includes(floorNo);
  const area = areaOf(floorNo)[1], eff = TOOL_EFF[t.tool][area] || 1, need = DIG_HITS[eff], done = (F.dmg && F.dmg[x + ',' + y]) || 0;
  return { t, x, y, eff, need, done, ok: !edge && !bone && t.dur > 0, label: bone || edge ? '塔の骨' : t.dur <= 0 ? '壊れている' : `${TOOL_NAMES[t.tool]}${MARK[eff]} ${done}/${need}` };
}
function dig() {
  const d = digInfo(); if (!d || !d.ok) return;
  F.dmg = F.dmg || {}; const k = d.x + ',' + d.y;
  F.dmg[k] = (F.dmg[k] || 0) + 1; d.t.dur--; fx.shake = 3;
  // 音: シャベル＝穴掘り（3種類）、ツルハシ・斧＝打撃。崩れたら岩が割れる音
  if (d.t.tool === 'shovel') sfx('shovel_' + (1 + Math.floor(R() * 3))); else sfx('hit');
  if (F.dmg[k] >= d.need) sfx('rockbreak', { delay: 200, vol: .8, max: 1.6 });
  F.crack = F.crack || {}; F.crack[k] = Math.min(3, Math.ceil(F.dmg[k] / d.need * 3));
  if (F.dmg[k] < d.need) {
    log(`カン！ ${['ヒビが入った。', 'ヒビが広がった。', 'もう少しで崩れそうだ。'][Math.min(2, Math.floor(F.dmg[k] / d.need * 3))]}${d.t.dur <= 5 ? `（${d.t.name}の耐久 残り${d.t.dur}）` : ''}`, true);
  } else {
    F.M[d.y][d.x] = 0; delete F.dmg[k]; delete F.crack[k]; reveal(F, d.x, d.y);
    const vk = F.vein && F.vein[k]; if (vk) delete F.vein[k];
    const digX = MK().dig ? 2 : 1;
    const vRaw = vk === 'v_iron' && floorNo >= 31 && R() < .45 ? 'ore_silver' : vk === 'v_orichalcum' ? (floorNo >= 71 && R() < .55 ? 'ore_orichalcum' : 'ore_mithril') : VEIN_RAW[vk];
    const table = vk ? [[vRaw, 1]] : DIG_YIELD[areaOf(floorNo)[1]] || DIG_YIELD.stone, sum = table.reduce((s, [, w]) => s + w, 0), got = {};
    const n = ((d.eff === 3 ? 2 : 1) + (vk ? 1 : 0)) * digX;
    for (let i = 0; i < n; i++) { let r = R() * sum; for (const [id, w] of table) { if ((r -= w) < 0) { add(got, id, 1); break; } } }
    if (!vk && d.eff === 1 && R() < .4) for (const id in got) delete got[id];
    for (const [id, v] of Object.entries(got)) add(G.carry, id, v);
    log(`ガラガラッ……壁が崩れた！${Object.keys(got).length ? `\n${matText(got)}を手に入れた。` : '\n……何も出てこなかった。'}`, true);
    if (d.t.dur <= 0) log(`${d.t.name}が壊れてしまった。工房で直そう。`);
  }
  save();
  // 掘る音で魔物が寄ってくる
  if (R() < .1) { log('……物音を聞きつけて、魔物がやってきた！'); setTimeout(() => startBattle(), 350); return; }
  dungeonUI(); hud();
}
// ミミック（2026-11-24）: 宝箱のふりをした魔物。開けると戦闘になり、倒すと中身が手に入る
function mimicOf(ch) {
  const pool = monPool(floorNo), base = pool[Math.floor(R() * pool.length)], k = 1 + (floorNo - base.from) * .15, g = ch.gold ? 1.3 : 1;
  return { id: ch.gold ? 'mimic_gold' : 'mimic', name: ch.gold ? '豪華なミミック' : 'ミミック', size: .62, hp: Math.round(base.hp * k * 1.7 * g), atk: Math.round(base.atk * k * 1.35 * g), def: Math.round(base.def * k * 1.2),
    exp: Math.round(base.exp * k * 2.2 * g), gold: Math.round(base.gold * k * 2 * g), drop: {}, chest: ch };
}
function openChest() {
  const ch = chestHere(); if (!ch) return;
  // 3階から、宝箱の1割ほど（豪華な宝箱は2割）がミミック。一度決まったら変わらない
  if (ch.mimic === undefined) ch.mimic = floorNo >= 3 && R() < (ch.gold ? .2 : .1);
  if (ch.mimic) { sfx('bite', { vol: .8 }); fx.shake = 6; log(ch.gold ? '豪華な宝箱が、ガバッと口を開けた！ ミミックだ！' : '宝箱が、ガバッと口を開けた！ ミミックだ！', true); setTimeout(() => startBattle(mimicOf(ch)), 500); return; }
  chestLoot(ch);
}
// 宝箱の中身（ミミックを倒したときは少し多め）
function chestLoot(ch, beat) {
  ch.open = true;
  const pool = monPool(floorNo).flatMap(m => Object.keys(m.drop));
  const got = {}; const n = ch.gold ? 5 : 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) add(got, pool[Math.floor(R() * pool.length)], 1);
  if (ch.gold) add(got, R() < .5 ? 'ore_iron' : 'dim_stone', 2);
  const gold = Math.max(1, Math.floor((ch.gold ? 40 : 8) * (1 + floorNo * .12) * (.7 + R() * .6) * ECON.chestG * goldArea(floorNo)));
  if (beat) for (const k of Object.keys(got)) got[k]++;
  for (const [k, v] of Object.entries(got)) add(G.carry, k, v); G.gold += gold; gotToast('gold', gold);
  const bp = bpDrop(beat ? .5 : ch.gold ? .18 : .06, '宝箱の底に、');
  if (beat) return `ミミックが守っていた宝箱の中身: ${matText(got)}、${gold}G。${bp}`;
  log(`宝箱を開けた！ ${matText(got)}、${gold}G。${bp}`, true); dungeonUI(); hud();
}
function stairs() {
  sfx('stairs', { max: 1.6 });
  const [fdx, fdy] = DIRS[dir], c = cellTo(fdx, fdy);
  if (c === 3) { if (floorNo === 1) fadeGo(() => toTown('塔から出た。', true)); else goFloor(floorNo - 1, true); }
  else if (c === 2) {
    if (floorNo === 100) { mirrorScene(); return; }
    if (BOSSES[floorNo] && (!bossBeat(floorNo) || midAgain(floorNo))) { startBattle(BOSSES[floorNo]); return; }
    if (floorNo >= TOP_FLOOR) { log(`${TOP_FLOOR + 1}階から上は、まだ作っていない。`, true); return; }
    goFloor(floorNo + 1);
  }
}
// 道具を使う。戻り値: 使えたか
function useItem(k) {
  if (!G.items[k]) return false;
  if (k === 'herb' || k === 'herb_m' || k === 'herb_l') {
    if (G.hp >= G.mhp) return false;
    const base = k === 'herb' ? 25 + G.lv * 3 : k === 'herb_m' ? 60 + G.lv * 5 : G.mhp;
    G.items[k]--; sfx(k === 'herb_l' ? 'heal3' : k === 'herb_m' ? 'heal' : 'heal1', { vol: .8 }); const h = healMe(Math.round(base * (has('p_herb') && k !== 'herb_l' ? 1.5 : 1))); log(`${ITEMS[k].name}を使った。HPが${h}回復した。`); save(); return true;
  }
  if (k === 'bandage') {
    const x = G.injuries.find(i => !G.bandaged.includes(i)); if (!x) { log('包帯を巻くようなケガはない。'); return false; }
    G.items[k]--; sfx('equip', { vol: .7 }); sfx('heal1', { delay: 350, vol: .5 }); G.bandaged.push(x); log(`包帯を巻いた。${INJURIES[x].name}が、ひとまず楽になった。\n（町に戻ったら治療院へ）`); save(); return true;
  }
  if (k === 'bird') {
    if (!Object.values(G.carry).some(n => n > 0)) { log('運んでもらう戦利品がない。'); return false; }
    G.items[k]--; sfx('dash', { vol: .8 }); sfx('item', { delay: 500, vol: .6 }); const t = matText(G.carry);
    for (const [m, n] of Object.entries(G.carry)) add(RAW[m] ? G.raw : G.store, m, n); G.carry = {}; save();
    log(`鳥が戦利品を足につかんで、窓の外へ飛んでいった。\n工房へ: ${t}`, true); return true;
  }
  if (k === 'ward' || k === 'lure') { G.items[k]--; sfx(k === 'ward' ? 'holy' : 'dark', { vol: .75 }); sfx('ignite', { vol: .4 }); G.enc = { k, floors: 3 }; save(); log(k === 'ward' ? '魔除けを焚いた。魔物の気配が遠のく。（3フロア）' : '魔寄せを焚いた。魔物の気配が近づいてくる……。（3フロア）', true); return true; }
  if (k === 'wing') { G.items[k]--; warpOut(); return true; }
  if (k === 'guide') {  // 導きの灯: この階の階段が地図に出て、方角と歩数を教えてくれる（2026-11-25）
    if (!F) return false; const px = Math.floor(T.x), py = Math.floor(T.y), found = [];
    for (let y = 0; y < F.M.length; y++) for (let x = 0; x < F.M[y].length; x++) if (F.M[y][x] === 2 || F.M[y][x] === 3) { reveal(F, x, y); found.push([F.M[y][x], x, y]); }
    if (!found.length) { log('灯は、ゆらゆら揺れるだけだった。'); return false; }
    G.items[k]--; sfx('magic', { vol: .5, max: 1.2 }); F.guide = true; save();
    const dirName = (dx, dy) => { const a = Math.atan2(dy, dx); return ['東', '南東', '南', '南西', '西', '北西', '北', '北東'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; };
    const say = ([c, x, y]) => `${c === 2 ? '上り' : '下り'}階段は${dirName(x - px, y - py)}の方、およそ${Math.abs(x - px) + Math.abs(y - py)}歩。`;
    log(`導きの灯をともした。炎が、すっと階段のほうへ傾いた。\n${found.sort((a, b) => a[0] - b[0]).map(say).join('\n')}\n（地図に階段が出た）`, true); return true;
  }
  return false;
}
// 塔の中の道具メニュー
function itemMenu() {
  const L = Object.entries(ITEMS).filter(([k]) => G.items[k] > 0).map(([k, it]) => ({ t: it.name, s: `${G.items[k]}個・${it.short}`, f: () => itemConfirm(k) }));
  if (!L.length) L.push({ title: '道具を持っていない' });
  L.push({ t: '戻る', hot: true, f: () => { facingNote(); dungeonUI(); } });
  buttons(L); log(G.enc ? `${ITEMS[G.enc.k].name}: あと${G.enc.floors}フロア` : 'どれを使う？', true);
}
// 2026-11-25: 使う前に確認する
function itemConfirm(k) {
  const it = ITEMS[k];
  buttons([{ title: `${it.name}を使う？（残り${G.items[k]}個）` },
    { t: '使う', s: it.short, hot: true, f: () => { const ok = useItem(k); if (mode === 'dungeon' && k !== 'wing') { if (ok) dungeonUI(); else { const msg = k.startsWith('herb') && G.hp >= G.mhp ? 'HPは減っていない。今は使わなくていい。' : logLines[logLines.length - 1]; itemMenu(); log(msg, true); } } } },
    { t: 'やめる', f: itemMenu }], 'one');
  log(`${it.name}: ${it.desc || it.short}`, true);
}
// 戦闘中の道具（AP1）
function battleItems() {
  const L = battleItemList().map(([k, it]) => ({ t: it.name, s: `残り${G.items[k] - B.plan.filter(p => p.id === 'item' && p.k === k).length}個`, f: () => { if (B.ap < apCost('herb')) return; B.ap -= apCost('herb'); B.plan.push({ id: 'item', k }); battleUI(); hud(); } }));
  if (!L.length) L.push({ title: '戦闘で使える道具がない' });
  L.push({ t: '戻る', f: () => battleUI() });
  buttons(L); log('使う道具を選ぶ（AP1）。', true);
}
function useHerb() { if (!G.items.herb || G.hp >= G.mhp) return false; G.items.herb--; const h = healMe(Math.round((25 + G.lv * 3) * (has('p_herb') ? 1.5 : 1))); log(`薬草を使った。HPが${h}回復。`); return true; }

// ---------- 戦闘（AP制） ----------
// その階に出る魔物（出る最初の階〜そのエリアの最後の階）
const monPool = n => { const L = MONSTERS.filter(m => m.from <= n && n <= m.to); return L.length ? L : MONSTERS.filter(m => m.from <= n); };
// 中盤から強く（2026-11-25）: 21階から少しずつ上がり、60階で HP1.5倍・攻撃1.35倍・守り1.25倍。経験値とお金も少し増える
function midPow(f) { const r = Math.max(0, Math.min(1, (f - 20) / 40)); return { hp: 1 + .5 * r, atk: 1 + .35 * r, def: 1 + .25 * r, rew: 1 + .2 * r }; }
// 強さの調整（2026-11-25）: エリアごと（10階ごと）の魔物と、階ごとのボスに掛ける倍率 [HP, 攻撃]。シミュレーションで合わせた値は data.js の BAL_MON・BAL_BOSS
const balMon = f => (typeof BAL_MON !== 'undefined' && BAL_MON[Math.floor((f - 1) / 10)]) || [1, 1, 1];
const balBoss = f => (typeof BAL_BOSS !== 'undefined' && BAL_BOSS[f]) || [1, 1, 1];
function pickMonster() {
  const pool = monPool(floorNo);
  if (TODAY.goblin && floorNo >= 3) pool.push(MONSTERS.find(m => m.id === 'goblin'), MONSTERS.find(m => m.id === 'goblin'));
  const base = pool[Math.floor(R() * pool.length)], k = 1 + (floorNo - base.from) * .15, dz = (TODAY.danger ? 1.2 : 1) * (floorNo >= 6 && floorNo <= 10 ? 1.12 : 1), rw = TODAY.danger ? 1.4 : 1;  // 6〜10階は少し強く
  // 2026-11-24: 全体に少し強く（HP×1.2・攻撃×1.12）
  const M = midPow(floorNo);
  const Q = balMon(floorNo);
  return { ...base, hp: Math.round(base.hp * k * dz * 1.2 * M.hp * Q[0]), atk: Math.round(base.atk * k * dz * 1.12 * M.atk * Q[1]), def: Math.round(base.def * k * M.def * (Q[2] || 1)), exp: Math.round(base.exp * k * rw * M.rew), gold: Math.round(base.gold * k * rw * M.rew) };
}
// 何体で出てくるか（低い階は1体。上ほど群れる。最大4体）
function groupSize() {
  const r = R(), f = floorNo;
  const T = f <= 3 ? [1] : f <= 10 ? [.6, 1] : f <= 30 ? [.35, .8, 1] : f <= 60 ? [.2, .6, .88, 1] : [.15, .5, .8, 1];
  return T.findIndex(x => r < x) + 1;
}
const alive = () => B.ms.filter(x => x.hp > 0);
const allDead = () => B.ms.every(x => x.hp <= 0);
// 狙っている敵（倒れていたら、次の生きている敵に移る）
function target() { let m = B.ms[B.ti]; if (!m || m.hp <= 0) { B.ti = B.ms.findIndex(x => x.hp > 0); m = B.ms[B.ti]; } return m || B.ms[0]; }
function apBase() { return 3 + (has('p_ap') ? 1 : 0) + (MK().ap || 0) - (hurt('rib') ? 1 : 0); }
const hurt = k => G.injuries.includes(k) && !G.bandaged.includes(k);
// ケガをする（すでに全部のケガをしていたら何もしない）
function injure() { const k = Object.keys(INJURIES).filter(x => !hurt(x)); if (!k.length) return null; const x = pick(k); G.injuries.push(x); return x; }
function startBattle(boss) {
  const n = boss ? 1 : groupSize(), ms = [];
  const BM = boss && !boss.chest && !boss.mirror && !boss.trial ? midPow(floorNo) : { hp: 1, atk: 1, def: 1 };
  const QB = !boss || boss.mirror ? [1, 1, 1] : boss.chest || boss.trial ? balMon(floorNo) : balBoss(floorNo);
  for (let i = 0; i < n; i++) { const m = boss ? { ...boss, hp: Math.round(boss.hp * (boss.chest ? 1 : 1.1) * BM.hp * QB[0]), atk: Math.round(boss.atk * BM.atk * QB[1]), def: Math.round(boss.def * BM.def * (QB[2] || 1)) } : pickMonster(); if (n > 1) m.hp = Math.round(m.hp * .8); m.mhp = m.hp; ms.push(m); }
  // 同じ魔物が2体以上なら A・B… と呼ぶ
  const cnt = {}; for (const m of ms) cnt[m.id] = (cnt[m.id] || 0) + 1;
  const seen = {}; for (const m of ms) if (cnt[m.id] > 1) { seen[m.id] = (seen[m.id] || 0) + 1; m.name += 'ABCD'[seen[m.id] - 1]; }
  B = { ms, ti: 0, ap: apBase() + (G.meal === 'spark' ? 1 : 0), cut: 1, counter: null, dodge: 0, boost: 1, broken: 0, turn: 1, over: false };
  Object.defineProperty(B, 'm', { get: target });
  for (const x of ms) dexMon(x);
  const m = ms[0];
  mode = 'battle'; encounterFx(m, ms);
  setTimeout(() => { if (B && B.m) { if (B.m.boss) sfx('bossstep'); sfx(CRY_SFX[B.m.id] || 'swing', { delay: B.m.boss ? 500 : 0 }); } }, 150);
  checkLearn(job());
  log(ms.length > 1 ? `${ms.map(x => x.name).join('・')}が現れた！\n（魔物を押すと、狙う相手を選べる）` : `${m.name}が現れた！`, true);
  if (G.ally) log(`${TOWER_NPCS[G.ally.id].name}が一緒に戦ってくれる（あと${G.ally.left}回）。`);
  if (G.als && floorNo <= ALS_TOP) log('アルスも剣を構えた。');
  // 70〜95階: ジンの影が現れて、一閃して去っていく
  if (!boss && floorNo >= 70 && floorNo <= 95 && R() < .04) { playFx('jin', { x: VW / 2, y: VH / 2 }); for (const x of ms) x.hp = 0; win(); log('……どこからか、杖をついた老人の影が現れた。\n一閃。魔物は倒れ、影はもういない。'); return; }
  if (has('p_first') || MK().first) { const d = dmgTo(target(), atkPower() * .8); log(`先制！ ${d}のダメージ。`); if (allDead()) { win(); return; } }
  battleUI(); hud();
}
// レベルアップ: 画面全体に大きく出す（押すか2.4秒で消える）
function levelUpFx(lv, up) {
  bigFx(`<b>LEVEL UP!</b><em>Lv ${lv}</em><span>最大HP +${up.hp}　攻 +${up.atk}　守 +${up.def}</span><small>${job()}の伸び方</small>`, 'levelup');
}
// 画面全体に大きく出す（レベルアップ・ギルドの報酬）。押すか2.4秒で消える
function bigFx(html, snd, cls, ms) {
  let d = $('lvup'); if (!d) { d = document.createElement('div'); d.id = 'lvup'; document.body.appendChild(d); d.onclick = () => d.classList.remove('on'); }
  d.innerHTML = `<div>${html}</div>`; d.className = cls || '';
  void d.offsetWidth; d.classList.add('on'); if (snd) sfx(snd, { vol: 1 });
  clearTimeout(bigFx.t); bigFx.t = setTimeout(() => d.classList.remove('on'), ms || 2600);
}
// 遭遇の演出: 画面全体が黄色く光る → 揺れる →「遭遇！」の帯と魔物の名前。少しの間ボタンは押せない
function encounterFx(m, ms) {
  const fl = $('flash'); if (fl) { fl.className = ''; void fl.offsetWidth; fl.className = m.boss ? 'on boss' : 'on'; }
  const v = $('view'); v.classList.remove('quake'); void v.offsetWidth; v.classList.add('quake'); setTimeout(() => v.classList.remove('quake'), 500);
  const old = v.querySelector('.enc'); if (old) old.remove();
  const e = document.createElement('div'); e.className = 'enc' + (m.boss ? ' boss' : '');
  e.innerHTML = `<b>${m.boss ? '強敵' : '遭遇'}！</b><span>${ms && ms.length > 1 ? (new Set(ms.map(x => x.id)).size === 1 ? m.name.replace(/[A-D]$/, '') + ' ×' + ms.length : ms.length + '体の魔物') : m.name}</span>`; v.appendChild(e); setTimeout(() => e.remove(), 1500);
  sfx('encounter', { vol: 1 });  // enemy_contact（頭と終わりの無音を切った）
  const c = $('ctl'); c.classList.add('wait'); setTimeout(() => c.classList.remove('wait'), 750);
}
// 戦闘: 技を押して「行動の予定」に並べる（APはその場で減る）→「行動」で順番に実行 → 敵の番
// 予定は押すと取り消せる。予定が空のまま押すと、そのままターン終了（APを持ち越す）
const FIXED_CMD = ['attack', 'guard', 'herb', 'flee'];
const battleSkills = () => [...new Set([...G.loadout.skills.filter(id => G.learned.includes(id) && SKILLS[id]).slice(0, SKILL_MAX), ...(hasShield() ? ['counter', 'wall', 'shieldbash'] : [])])].filter(id => !FIXED_CMD.includes(id));
const canPlan = id => !B.over && !B.running && B.ap >= apCost(id) && !(id === 'flee' && B.ms.some(x => x.boss)) && (id !== 'herb' || battleItemList().length > 0) && !B.plan.some(p => p.id === 'flee');
const whyNot = id => B.ap < apCost(id) ? 'APが足りない' : id === 'flee' && B.ms.some(x => x.boss) ? 'ボスからは逃げられない' : B.plan.some(p => p.id === 'flee') ? '逃げる予定' : '';
// 戦闘: 下に「攻撃・守る・道具・逃げる」と持ち込んだ技を全部並べる（1回押せば予定に入る）。
// 技の説明は、押したときにセリフ欄に出す
function battleUI() {
  if (!B) return; if (!B.plan) B.plan = [];
  const box = $('ctl'); box.innerHTML = '';
  const mk = (wrap, html, cls, off, f) => { const el = document.createElement('button'); el.innerHTML = html; if (cls) el.className = cls; el.disabled = !!off;
    el.addEventListener('click', () => sfx('select', { vol: .5 }), { capture: true }); el.onclick = () => { f(); hud(); }; wrap.appendChild(el); return el; };
  const plan = document.createElement('div'); plan.className = 'plan';
  plan.innerHTML = `<span class="ap">AP ${B.ap}</span>`;
  if (!B.plan.length) plan.insertAdjacentHTML('beforeend', `<span class="hint">${B.running ? '行動中……' : '選んで「行動！」'}</span>`);
  B.plan.forEach((p, i) => { const c = document.createElement('button'); c.className = 'chip'; c.textContent = `${i + 1}.${p.id === 'item' ? ITEMS[p.k].name : SKILLS[p.id].name} ✕`;
    c.onclick = () => { if (B.running) return; unplan(i); battleUI(); hud(); }; plan.appendChild(c); });
  box.appendChild(plan);
  const row = document.createElement('div'); row.className = 'btns four';
  for (const id of FIXED_CMD) mk(row, `${SKILLS[id].name}<small>AP${apCost(id)}</small>`, '', !canPlan(id), () => planAdd(id));
  box.appendChild(row);
  const sk = battleSkills();
  if (sk.length) { const g = document.createElement('div'); g.className = 'btns three sk';
    for (const id of sk) mk(g, `${SKILLS[id].name}<small>AP${apCost(id)}</small>`, '', !canPlan(id), () => planAdd(id));
    box.appendChild(g); }
  const tail = document.createElement('div'); tail.className = 'btns tail';
  const keep = Math.min(carryMax(), B.ap);
  mk(tail, '取り消す', 'undo', !B.plan.length || B.running || B.over || B.auto, () => { unplan(B.plan.length - 1); battleUI(); });
  mk(tail, B.auto ? 'オート<small>止める</small>' : 'オート<small>攻撃で戦う</small>', B.auto ? 'auto on' : 'auto', B.over, toggleAuto);
  mk(tail, B.plan.length ? `行動！<small>${B.plan.length}つ実行${keep ? `・AP${keep}持ち越し` : ''}</small>` : `ターン終了<small>${keep ? `AP${keep}を持ち越す` : 'なにもしない'}</small>`, 'hot', B.over || B.running, runPlan);
  box.appendChild(tail);
  fitStage();
}
// スキルの一覧（塔の絵の上に重ねる）
function skillPanel() {
  const v = $('view'); let p = v.querySelector('.skp');
  if (!B || !B.skillOpen || B.over || B.running) { if (p) p.remove(); return; }
  if (!p) { p = document.createElement('div'); p.className = 'skp'; v.appendChild(p); }
  p.innerHTML = `<div class="skh"><span>スキル　AP ${B.ap}</span><button class="x">✕</button></div>`;
  p.querySelector('.x').onclick = () => { B.skillOpen = false; battleUI(); };
  for (const id of battleSkills()) {
    const s = SKILLS[id], ok = canPlan(id), why = ok ? '' : whyNot(id);
    const b = document.createElement('button'); b.className = 'skr'; b.disabled = !ok;
    b.innerHTML = `<span class="nm">${s.name}</span><span class="apv">AP${apCost(id)}</span><small>${s.desc}${why ? `（${why}）` : ''}</small>`;
    b.onclick = () => { sfx('select', { vol: .5 }); planAdd(id); hud(); };
    p.appendChild(b);
  }
}
// オート: 毎ターン、APを全部「攻撃」に使って自動で行動する。HPが3割を切ったら先に薬草。薬草がなければ止める
function toggleAuto() { B.auto = !B.auto; if (B.auto) { log('オートで戦う。（もう一度押すと止まる）', true); autoTurn(); } else battleUI(); }
function autoTurn() {
  if (!B || !B.auto || B.over || B.running) return;
  while (B.plan.length) unplan(B.plan.length - 1);
  if (G.hp <= G.mhp * .3) {
    const it = battleItemList().find(([k]) => k.startsWith('herb'));
    if (it && B.ap >= apCost('herb')) { B.ap -= apCost('herb'); B.plan.push({ id: 'item', k: it[0] }); }
    else { B.auto = false; log('HPが危ない！ オートを止めた。', true); battleUI(); return; }
  }
  if (B.ms.some(x => x.charge && x.hp > 0) && G.hp <= G.mhp * .7 && B.ap >= apCost('guard')) { B.ap -= apCost('guard'); B.plan.push({ id: 'guard' }); }
  while (B.ap >= apCost('attack')) { B.ap -= apCost('attack'); B.plan.push({ id: 'attack' }); }
  battleUI(); runPlan();
}
function battleItemList() {
  const used = {}; for (const p of B.plan || []) if (p.id === 'item') used[p.k] = (used[p.k] || 0) + 1;
  return Object.entries(ITEMS).filter(([k, it]) => it.battle && (G.items[k] || 0) - (used[k] || 0) > 0);
}
function planAdd(id) {
  if (B.over || B.running) return;
  const cost = apCost(id); if (B.ap < cost) return;
  if (id === 'herb') { battleItems(); return; }
  B.ap -= cost; B.plan.push({ id }); log(`${SKILLS[id].name}（AP${cost}）：${SKILLS[id].desc}`, true); battleUI();
}
function unplan(i) { if (i < 0) return; const p = B.plan.splice(i, 1)[0]; if (p) B.ap += p.id === 'item' ? apCost('herb') : apCost(p.id); }
// 予定を順番に実行する
function runPlan() {
  if (!B || B.over || B.running) return;
  const list = B.plan.slice(); B.plan = [];
  if (!list.length) { endTurn(); return; }
  B.running = true; battleUI();
  let i = 0;  // 「行動！」を押してから一拍おいて始める
  const step = () => {
    if (!B || B.over) return;
    const a = list[i++], r = a.id === 'item' ? doItem(a.k) : doSkill(a.id);
    hud();
    if (r === 'end' || !B || B.over) { if (B) B.running = false; return; }
    const extra = a.id !== 'item' && SKILL_SHOW[a.id] ? SKILL_SHOW[a.id].len || 0 : 0;  // 長い技は、終わるまで次を待つ
    if (i < list.length) setTimeout(step, 750 + extra); else setTimeout(() => { if (!B || B.over) return; B.running = false; endTurn(); }, 700 + extra);
  };
  setTimeout(step, 450);
}
function doItem(k) {
  if (useItem(k)) playFx(k === 'bandage' ? 'heal_leaf' : 'heal', { self: true, size: .9, snd: null });  // 音は useItem で鳴らす
  else log(`${ITEMS[k].name}は使わなかった。`);
  return 'ok';
}
// 重い武器（斧・刀・大剣）は、ふつうの攻撃にAPが2かかる。軽い武器ほど回避しやすい
const apCost = id => id === 'attack' && (isHeavy() || MK().heavy) ? 2 : SKILLS[id].ap;
const evade = () => hurt('leg') ? 0 : (isHeavy() ? .03 : .10) + (mainWeapon() && mainWeapon().type === 'dagger' ? .05 : 0);
const carryMax = () => 1 + (has('p_carry') ? 1 : 0) + (MK().carry || 0);
function dmgTo(m, power, pierce, critBonus) {
  const K = MK(), def = Math.max(0, m.def - B.broken) * (K.melt ? .5 : 1);
  let d = Math.max(1, Math.round((power - (pierce ? 0 : def)) * (.85 + R() * .3) * weaponMult(m)));
  const crit = !hurt('head') && (K.alwaysCrit && B.basic || R() < .08 + (critBonus || 0) + (has('p_crit') ? .15 : 0) + ((mainWeapon() || {}).crit || 0) + (K.crit || 0));  // 黒鋼・名品は会心が出やすい
  const dl = B.hitDelay || 0;  // 技の当たる瞬間に合わせて、数字や揺れを遅らせる
  if (crit) { d = Math.round(d * (K.critMul || 1.8)); B.lastCrit = true; playFx('crit', { delay: dl, size: .7 }); /* 会心の光と音も、当たる瞬間に */ } else B.lastCrit = false;
  m.hp -= d; if (m.hp <= 0 && !m.dying) m.dying = performance.now() + dl;
  const ally = B.ally, show = () => { popNum(d, 'mon', (crit ? 'crit' : '') + (ally ? ' ally' : ''), m); fx.hit = .6; m.anim = { kind: 'hit', t0: performance.now() }; fx.shake = Math.max(fx.shake || 0, Math.min(8, 2 + d / 6)); };
  if (dl) setTimeout(show, dl); else show();
  return d;
}
// 名品: 攻撃が当たったあとの効果
function mkAfterHit(K, m, total) {
  let t = '';
  if (K.drain) { const h = healMe(Math.ceil(total * K.drain)); if (h) t += `HPを${h}吸った。`; }
  if (K.healHit) { const h = healMe(Math.ceil(G.mhp * K.healHit)); if (h) t += `HPが${h}回復。`; }
  if (K.freeze && m.hp > 0 && !m.boss && R() < K.freeze) { m.stun = true; t += `${m.name}は凍りついた！`; playFx('ice_burst', { size: .6 }); }
  if (K.stun && m.hp > 0 && !m.boss && R() < K.stun) { m.stun = true; t += `${m.name}はひるんだ！`; }
  if (K.brk) B.broken += K.brk;
  if (K.poison && m.hp > 0 && !m.poison) { m.poison = Math.max(2, Math.round(atkPower() * .15)); t += `${m.name}は毒をうけた。`; playFx('poison_bubble', { size: .6 }); }
  if (K.steal && m.hp > 0 && R() < .5) { const g = Math.ceil(m.gold * .3) + 1; G.gold += g; t += `${g}G盗んだ。`; }
  if (K.splash && B.ms.length > 1) for (const x of alive()) if (x !== m) dmgTo(x, total * K.splash, true);
  if (K.exec && m.hp > 0 && !m.boss && m.hp < m.mhp * .25 && R() < K.exec) { m.hp = 0; m.dying = performance.now(); t += `${m.name}を断罪した！`; }
  if (K.guard) B.cut = Math.min(B.cut, K.guard);
  if (K.selfCut) { const c = Math.ceil(G.mhp * K.selfCut); G.hp = Math.max(1, G.hp - c); t += `HPを${c}削った。`; }
  if (K.cure && G.injuries.length && R() < K.cure) { const x = G.injuries.shift(); t += `${INJURIES[x].name}が治った！`; }
  return t;
}
function healMe(n) { const h = Math.min(G.mhp - G.hp, n); G.hp += h; if (h > 0 && mode === 'battle') popNum(h, 'me', 'heal'); return h; }
const PLANT_RE = /treant|vine|mushroom|tree|cactus|flower|plant|ent|moss|pixie|spore/;  // 薪割りが効く、木や草の魔物
function doSkill(id) {
  if (B.over) return 'end'; const s = SKILLS[id], m = target();
  const sh = SKILL_SHOW[id]; B.hitDelay = 0;
  FX_COLOR = SKILL_COLOR[id] || null;
  if (sh) { FX_AT = m; if (sh.pre) sh.pre(); FX_AT = null; } else { FX_AT = s.all ? null : m; if (MAGIC_HUE[id]) { FX_COLOR = MAGIC_HUE[id]; FX_COLOR_ALL = true; } skillFx(id); FX_COLOR_ALL = false; FX_AT = null; }
  // 振付のない技（魔法など）も、数字と揺れをエフェクトが当たる瞬間に合わせる（大きな魔法は画面が暗くなってから）
  if (!sh && id !== 'attack') { const f = (SKILL_FX[id] || [])[0], n = Array.isArray(f) ? f[0] : f, mv = n && FX_MOVE[n]; B.hitDelay = mv === 'big' ? 380 : mv === 'travel' ? 260 : n ? 120 : 0; }
  FX_COLOR = null;
  if (!sh) magicFlash(id, B.hitDelay);
  /* 1回ごとのエフェクトと、当たる瞬間（数字・揺れ）を合わせる */
  const hitAt = (i, tg) => { if (!sh) return; const dl = (sh.wait || 0) + i * (sh.gap || 0); FX_AT = tg; FX_COLOR = SKILL_COLOR[id] || null; sh.hit(i, dl, tg); FX_AT = null; FX_COLOR = null; B.hitDelay = dl + (sh.at || 0); };
  const K = MK(); B.basic = id === 'attack';
  const mult = (s.mult || 1) + (s.rageScale ? s.rageScale * (1 - G.hp / G.mhp) : 0), tgx = (s.bossx && m.boss ? s.bossx : 1) * (s.plantx && PLANT_RE.test(m.id || '') ? s.plantx : 1);
  const power = (atkPower() * mult * tgx * B.boost * (B.turn === 1 && has('p_focus') ? 1.5 : 1) + (s.magic ? G.lv * 2 : 0)) * (s.magic && K.magic ? K.magic : 1) * (id === 'jin1' && K.issen ? 1.5 : 1);
  switch (s.kind) {
    case 'atk': {
      if (s.kill && !m.boss && R() < s.kill) { m.hp = 0; m.dying = performance.now(); fx.hit = 1; m.anim = { kind: 'hit', t0: performance.now() }; log(`${s.name}！ ${m.name}の急所を貫いた。`); break; }
      const ds = []; let crit = false;
      if (B.basic && K.allHit) { for (const x of alive()) { ds.push(dmgTo(x, power * K.allHit)); crit = crit || B.lastCrit; } }   // 巨人の斧: 全体に
      else if (B.basic && K.hits) { for (let i = 0; i < K.hits; i++) { const tg = m.hp > 0 ? m : alive()[0]; if (!tg) break; B.hitDelay = i * 160; if (i) weaponFx((mainWeapon() || {}).type); ds.push(dmgTo(tg, power * K.per)); crit = crit || B.lastCrit; if (allDead()) break; } }   // 名品の連続攻撃
      else if (B.basic && (K.twice || K.thrice)) { const n = 1 + (R() < (K.twice || 0) ? 1 : 0) + (R() < (K.thrice || 0) ? 1 : 0); for (let i = 0; i < n; i++) { const tg = m.hp > 0 ? m : alive()[0]; if (!tg) break; B.hitDelay = i * 200; ds.push(dmgTo(tg, power)); crit = crit || B.lastCrit; if (allDead()) break; } }
      else if (s.all) { for (const x of alive()) { hitAt(0, x); ds.push(dmgTo(x, power, s.pierce, s.crit)); crit = crit || B.lastCrit; } }   // 全体に当たる
      else for (let i = 0; i < (s.hits || 1) + (s.twice && R() < s.twice ? 1 : 0); i++) {
        const tg = s.spread && i > 0 && alive().length ? pick(alive()) : m.hp > 0 ? m : alive()[0];   // 連続攻撃は、ほかの敵にも散る
        if (!tg) break; hitAt(i, tg); ds.push(dmgTo(tg, power, s.pierce, s.crit)); crit = crit || B.lastCrit; if (allDead()) break;
      }
      B.hitDelay = 0;
      let t = `${s.name}！ ${B.ms.length > 1 && !s.all && !s.spread ? m.name + 'に' : ''}${ds.join('と')}のダメージ。${crit ? '会心！' : ''}`;
      if (s.break) { B.broken += s.break; t += '守りが崩れた。'; }
      if (s.self) { const c = Math.ceil(G.mhp * s.self); G.hp = Math.max(1, G.hp - c); t += `HPを${c}削った。`; }
      if (s.heal) t += `HPが${healMe(s.heal + G.lv * 3)}回復。`;
      if (s.stun) for (const x of s.all ? alive() : [m]) if (x.hp > 0 && !x.boss && R() < s.stun) { x.stun = true; t += `${x.name}は動けない！`; }
      if (s.guardToo) B.cut = Math.min(B.cut, .5);
      if (s.cutToo) B.cut = Math.min(B.cut, s.cutToo);
      if (B.basic || !s.magic) t += mkAfterHit(K, m, ds.reduce((a, b) => a + b, 0));
      if (s.mine && m.hp <= 0) { m.mine = true; t += '峰打ちで仕留めた。戦利品が多く取れそうだ。'; }
      if (s.wood && m.hp <= 0) { add(G.carry, 'log', 2); t += '塔の丸太が2本取れた。'; }
      if (s.drain) { const h = healMe(Math.ceil(ds.reduce((a, b) => a + b, 0) * s.drain)); if (h) t += `HPを${h}吸った。`; }
      if (s.poisonHit && m.hp > 0) { m.poison = Math.max(m.poison || 0, Math.round(atkPower() * s.poisonHit)); t += `${m.name}は呪われた。`; }
      if (s.stealToo && m.hp > 0 && R() < (has('p_steal') ? .7 : .4)) { const k = Object.keys(m.drop)[0]; add(G.carry, k, 1); t += `${NAMES[k]}を奪った！`; }
      log(t); break;
    }
    case 'heal': log(`${s.name}。HPが${healMe(s.heal + G.lv * 4)}回復。`); break;
    case 'guard': B.cut = Math.min(B.cut, s.cut * (has('p_guard') ? .7 : 1)); log(`${s.name}。守りを固めた。${s.heal ? `HPが${healMe(s.heal + G.lv * 3)}回復。` : ''}`); break;
    case 'counter': B.counter = { cut: s.cut, back: s.back }; log(`${s.name}。次の攻撃に備えた。`); break;
    case 'buff': B.boost = s.boost; log(`${s.name}。このターンの攻撃が強くなる。${s.heal ? `HPが${healMe(s.heal + G.lv * 2)}回復。` : ''}`); break;
    case 'sleep': { let n = 0; for (const x of alive()) if (R() < (x.boss ? s.stun * .35 : s.stun)) { x.stun = true; x.charge = false; n++; } log(`${s.name}。${n ? `${n}体が眠った。` : '……効かなかった。'}`); break; }
    case 'dodge': B.dodge = s.dodge; log(`${s.name}！`); break;
    case 'steal': { const k = Object.keys(m.drop)[0]; if (R() < (has('p_steal') ? .8 : .5)) { add(G.carry, k, 1); log(`${NAMES[k]}を盗んだ！`); } else log('盗めなかった。'); break; }
    case 'flee': if (s.sure && B.ms.some(x => x.boss)) { log('主からは、逃げられない！'); break; }
      if (s.sure || R() < (hurt('leg') ? .25 : .5)) { allyTick(); log('逃げ出した！', true); B = null; mode = 'dungeon'; dungeonUI(); hud(); return 'end'; } log('逃げられない！'); break;
  }
  if (allDead()) { win(); return 'end'; }
  return 'ok';
}
function endTurn() {
  if (!B || B.over) return;
  if (allyTurn()) return;
  const carry = Math.min(carryMax(), B.ap);
  // 敵の番: 生きている敵が順に攻撃する（ボスは2回動くことがある）
  let order = 0;
  for (const m of alive()) {
    if (m.stun) { log(`${m.name}は動けない。${m.charge ? '構えがくずれた！' : ''}`); m.stun = false; m.charge = false; continue; }
    // 2026-11-25: 大技の予告。力をためた次のターンに、強い一撃が来る（守るか、先に倒すか）
    let big = false;
    if (m.charge) { big = true; m.charge = false; m.lastCharge = B.turn; }
    else if (chargeStart(m)) continue;
    const times = big ? 1 : m.boss && R() < .4 ? 2 : 1;
    for (let i = 0; i < times; i++) {
      m.anim = { kind: 'attack', t0: performance.now() + order * 220 }; order++;
      if ((B.dodge && R() < B.dodge) || (!big && R() < evade())) { playFx('afterimage', { self: true, size: .8 }); log(`${m.name}の攻撃。かわした！`); { const w = (order - 1) * 220; setTimeout(() => popNum(0, 'me', 'miss'), w); } continue; }
      let d = Math.max(1, Math.round((m.atk - defPower()) * (.85 + R() * .3)));
      if (big) { d = Math.round(Math.max(d, m.atk * .4) * (m.boss ? 1.6 : floorNo <= 5 ? 1.6 : 2)); /* 5階までは控えめ */ log(`${m.name}の${pick(['渾身の一撃', '強烈な一撃', '大技'])}！`); shakeAt((order - 1) * 220 + 60, 12); fxTint((order - 1) * 220, '#ff2010', .3); }
      if (m.mirror) {  // 鏡は、自分の技を使ってくる
        if (!m.said && m.hp < m.mhp * .5) { m.said = true; log('鏡の中の自分が、口をひらいた。\n「……{name}。どうして、登る？」'); }
        if (!m.mushin && G.learned.includes('jin1')) { m.mushin = true; log('ジンの声が、聞こえた気がした。\n「どれほど強い敵と向き合おうとも……己を見失わぬことじゃ」'); }  // 無心: 鏡に技を写されにくい（なくても勝てる）
        const sk = battleSkills().filter(id => SKILLS[id].kind === 'atk'); if (sk.length && R() < (m.mushin ? .15 : .35)) { const id = pick(sk); d = Math.round(d * 1.5); log(`鏡の中の自分は、${SKILLS[id].name}を使った！`); }
      }
      monAttackFx(m, B.counter || B.cut < 1, (order - 1) * 220);
      if (B.counter) { d = Math.ceil(d * B.counter.cut); const c = dmgTo(m, atkPower() * B.counter.back); log(`受け止めて反撃！ ${c}のダメージ。`); B.counter = null; }
      else d = Math.ceil(d * B.cut);
      if (m.boss && G.bless === 'ward') d = Math.ceil(d * .7);
      { const rf = MK().reflect; if (rf && m.hp > 0) { const back = dmgTo(m, d * rf, true); log(`鏡の盾が、${back}のダメージを返した。`); } }
      G.hp -= d; { const dd = d, w = (order - 1) * 220; setTimeout(() => { popNum(dd, 'me', 'hurt'); fx.flash = .8; fx.shake = Math.max(fx.shake || 0, 6); }, w); } log(`${m.name}の攻撃。${d}のダメージを受けた。`);
      // 大きな一撃（最大HPの35%以上）はケガが残ることがある
      if (G.hp > 0 && d >= G.mhp * .35 && R() < .25 && !MK().noInjury && !(big && floorNo <= 5)) { const x = injure(); if (x) log(`${INJURIES[x].name}をした！（${INJURIES[x].desc}）`); }
      if (allDead()) { win(); return; }
      if (m.hp <= 0) break;
      if (G.hp <= 0 && G.bless === 'stand' && !B.stood) { G.hp = 1; B.stood = true; G.bless = null; playFx('blessing', { self: true, size: 1.2 }); say('resolve', '「……まだだ！」\nエリーの祈りで、踏みとどまった！'); continue; }
      if (G.hp <= 0) { lose(); return; }
    }
  }
  if (has('p_regen')) healMe(3);
  { const K = MK(); if (K.regen) healMe(Math.ceil(G.mhp * K.regen)); if (K.curse) { G.hp = Math.max(1, G.hp - Math.ceil(G.mhp * K.curse)); log('呪いの刀が、HPを吸った。'); }
    for (const m of alive()) if (m.poison) { const d = dmgTo(m, m.poison, true); log(`${m.name}は毒で${d}のダメージ。`); }
    if (allDead()) { win(); return; } }
  { const c = B.ms.find(x => x.charge && x.hp > 0); if (c && (G.chargeTip || 0) < 3) { G.chargeTip = (G.chargeTip || 0) + 1; log('（次のターン、強い一撃が来る。「守る」で受けるか、先に倒してしまおう）'); } }
  B.cut = 1; B.boost = 1; B.dodge = 0; B.turn++; B.ap = apBase() + carry; B.plan = []; B.running = false; battleUI(); hud();
  if (B.auto) setTimeout(autoTurn, 550);
}
// 力をためるか決める。2階から。同時にためるのは1体だけ、続けてはためない。鏡はためない
function chargeStart(m) {
  if (floorNo < 2 || m.mirror || m.lastCharge >= B.turn - 1 || B.ms.some(x => x !== m && x.charge && x.hp > 0)) return false;
  if (R() >= (m.boss ? .22 : .16)) return false;
  m.charge = true; m.lastCharge = B.turn; m.anim = { kind: 'charge', t0: performance.now() };
  sfx('swing', { vol: .55, max: .8 });
  log(pick([`${m.name}が大きく振りかぶった！`, `${m.name}は力をためている……！`, `${m.name}が身構えた。何か来る！`]));
  return true;
}
function win() {
  // 倒した敵（群れ）の分をまとめてもらう
  const K = MK(), ms = B.ms, m = ms.find(x => x.boss) || ms[0], exp = ms.reduce((s, x) => s + x.exp, 0) * (K.expx || 1), gold = Math.round(ms.reduce((s, x) => s + x.gold, 0) * (K.goldx || 1) * ECON.mon * goldArea(floorNo)), drop = {};
  for (const x of ms) for (const [k, n] of Object.entries(x.drop)) if (x.boss || R() < Math.min(.98, (TODAY.drop || .8) + (has('p_loot') || K.loot ? .12 : 0))) add(drop, k, n * (x.mine ? 2 : 1));
  sfx('win', { delay: 300, max: G.exp + exp >= expNeed() ? .9 : 0 });
  B.over = true; for (const x of ms) { if (!x.dying) x.dying = performance.now(); dexMon(x, true); }
  G.exp += exp; G.gold += gold; allyTick();
  let mkMsg = '';
  if (K.killHeal) mkMsg += `魂を吸って、HPが${healMe(Math.ceil(G.mhp * K.killHeal * ms.length))}回復。`;
  if (K.cook && R() < .4) mkMsg += `魔物をさばいて、その場で焼いて食べた。HPが${healMe(Math.ceil(G.mhp * .2))}回復。`;
  if (K.rust) { const w = mainWeapon(); if (w && w.mk && w.mk.rust && (w.rust || 0) < 40) { w.rust = (w.rust || 0) + 1; w.atk++; if (w.rust % 10 === 0) mkMsg += `${w.name}の錆が、少し落ちた気がする。`; } }
  // 上の金属の鉱石は、上の階の魔物ほどよく持っている
  if (!ms.some(x => x.chest)) { if (floorNo >= 21 && R() < .22) add(drop, 'ore_silver', 1); if (floorNo >= 41 && R() < .16) add(drop, 'ore_mithril', 1); if (floorNo >= 71 && R() < .12) add(drop, 'ore_orichalcum', 1); if (floorNo >= 61 && R() < .12) add(drop, 'dark_steel', 1);
    for (const x of ms) if (/dragon|wyvern|drake/.test(x.id) && R() < (x.boss ? 1 : .35)) add(drop, 'dragon_bone', x.boss ? 3 : 1); if (floorNo >= 85 && R() < .07) add(drop, 'dragon_bone', 1); }
  for (const [k, n] of Object.entries(drop)) add(G.carry, k, n);
  if (G.meal === 'broth') { G.hp = Math.min(G.mhp, G.hp + 6); }
  let msg = `${ms.length > 1 ? ms.length + '体の魔物' : m.name}を倒した！ 経験値${exp}、${gold}G。${Object.keys(drop).length ? '素材: ' + matText(drop) : ''}`;
  if (G.exp >= expNeed()) setTimeout(() => playFx('levelup', { self: true, size: 1.2 }), 500);
  { const up = { hp: 0, atk: 0, def: 0 }, lv0 = G.lv;
    while (G.exp >= expNeed()) { G.exp -= expNeed(); G.lv++; const g = (JOBS[job()] || JOBS['素手']).grow; G.mhp += g.hp; G.hp += g.hp; G.atk += g.atk; G.def += g.def; up.hp += g.hp; up.atk += g.atk; up.def += g.def; }
    if (G.lv > lv0) { msg += `\nレベル${G.lv}になった！`; setTimeout(() => levelUpFx(G.lv, up), 900); } }
  { const mc = ms.find(x => x.chest); if (mc) { mc.chest.mimic = false; msg += '\n' + chestLoot(mc.chest, true); } }
  if (G.cur) { G.cur.kills += ms.length; if (m.boss && !m.trial && !m.mirror) G.cur.boss = floorNo; }
  if (m.trial) msg += '\n' + trialWon(m.trial);
  else if (m.boss && !m.mirror && !m.trial && bossBeat(floorNo) && floorNo % 10 === 5) { (G.midRun = G.midRun || {})[floorNo] = G.runs; m.again = true; msg += `\n${floorNo}階の番人を、また倒した。`; }
  else if (m.boss && !m.mirror) { G.bosses = G.bosses || {}; G.bosses[floorNo] = true; if (floorNo % 10 === 5) (G.midRun = G.midRun || {})[floorNo] = G.runs; if (floorNo === 10) G.bossDown = true; msg += `\n${floorNo}階の${floorNo % 10 === 5 ? '番人' : '主'}を倒した。上への道が開いた。`; }
  // ジョブの勝利数と武器の熟練度
  const j = job(), r = gearBy(G.equip.r), l = gearBy(G.equip.l);
  G.jobWins[j] = (G.jobWins[j] || 0) + 1;
  const readyBefore = UPPERS.filter(upperReady).map(u => u.job);
  for (const t of new Set([r && r.type, l && l.type].filter(x => x && x !== 'armor'))) G.prof[t] = (G.prof[t] || 0) + 1;
  log(msg, true);
  checkLearn(j);
  for (const u of UPPERS) if (upperReady(u) && !readyBefore.includes(u.job)) say('shock', `${WEAPON_TYPES[u.exp].name}の経験が生きてきた。${WEAPON_TYPES[u.hold].name}を持つと${u.job}になれる！`);
  const w1 = mainWeapon(); if (w1 && WEAPON_TYPES[w1.type].twoHand && G.prof[w1.type] === ONE_HAND_NEED) log(`${WEAPON_TYPES[w1.type].name}を片手で扱えるようになった！`);
  save();
  if (mkMsg) msg += '\n' + mkMsg;
  if (m.boss && !m.mirror && !m.trial && !m.again && !ms.some(x => x.chest)) msg += bpDrop(.6, '主の倒れたあとに、');
  if (ms.some(x => x.mirror)) { const first = !G.cleared; buttons([{ t: '……', hot: true, f: () => first ? ending() : (B = null, fadeGo(() => toTown('鏡は、また静かに光っていた。……塔は、今日も人を見ている。', true))) }]); return; }
  buttons([{ t: '先へ進む', hot: true, f: () => { B = null; mode = 'dungeon'; dungeonUI(); hud(); } }]);
  hud();
}
function lose() {
  sfx('fall'); SND.lost = true;
  B.over = true; let kept = '';
  if (has('p_keep')) { const k = {}; for (const [m, n] of Object.entries(G.carry)) { const h = Math.floor(n / 2); if (h) { k[m] = h; add(RAW[m] ? G.raw : G.store, m, h); G.carry[m] -= h; } } kept = matText(k); }
  const lost = matText(G.carry), lostG = G.gold;
  const inj = injure(); G.runs++; finishRun(true); G.ally = null; G.bandaged = []; G.enc = null; G.als = false;
  G.carry = {}; G.gold = 0; G.bless = null; endMeal(); endRun(); rollRumor(); G.hp = G.mhp; FLOORS = {}; save();
  say('sad', `倒れた……。素材（${lost}）と、手持ちの${lostG}Gはなくなった。${kept !== '' && kept !== 'なし' ? `\n持ち帰りのおかげで、${kept}は工房に残った。` : ''}`, true);
  buttons([{ t: '……', hot: true, f: () => { mode = 'town'; B = null; F = null; if (evReady('elly', .6)) { SND.lost = false; ellieEvent(inj); return; } fadeGo(() => {
      // 治療院のベッドで目を覚ます。エリーのひとことは、前回（倒れた）に合わせたもの
      const el = (typeof runLine === 'function' && runLine('elly')) || pick(['エリー[worried]「……よかった。目が覚めたんですね。丸一日、眠っていらしたんですよ」', 'エリー「運ばれてきたときは、本当にどうなるかと……。レベルと装備は、無事ですよ」']);
      inside('clinic', el); hud();
    }, { text: '……\n治療院のベッドで、目を覚ました', hold: 1800 }); } }]);
}

// ---------- 魔物の絵（待機・攻撃・攻撃を受けた の3枚＋コードの動き） ----------
const MON_IMG = {};
for (const [k, src] of Object.entries(ASSETS.mon || {})) { const i = new Image(); i.src = src; MON_IMG[k] = i; }
// ミミックの絵（床の小物の絵を使う）
if (typeof PROPS !== 'undefined') for (const [id, k] of [['mimic', 'f_mimic'], ['mimic_gold', 'f_mimic_gold']]) if (PROPS[k]) for (const pose of ['idle', 'attack', 'hit']) { const i = new Image(); i.src = PROPS[k]; MON_IMG[id + '_' + pose] = i; }
// 11階より上の魔物はファイルから読む（出会ったときに読み込む）
// 番人（5・15・25…階）は、塔に入るたびにまた出てくる（2026-11-25）。2回目からは設計図は出ない
const midAgain = n => n % 10 === 5 && (G.midRun || {})[n] !== G.runs;
const bossBeat = n => n === 10 ? G.bossDown || (G.bosses || {})[10] : !!(G.bosses || {})[n];
function monImg(m, pose) {
  const k = m.id + '_' + pose;
  if (!MON_IMG[k] && m.file) { const i = new Image(); i.src = `assets/monsters/${k}.webp`; MON_IMG[k] = i; }
  return MON_IMG[k];
}
function drawMonster(m, t, i) {
  const idle = monImg(m, 'idle'); monImg(m, 'attack'); monImg(m, 'hit');
  if (idle && idle.complete && idle.naturalWidth) { drawMonsterImg(m, t, i); return; }
  if (m.file) return;  // ファイルの絵は読み込み中
  drawMonsterShape(m, t);
}
// ---------- 戦闘エフェクト ----------
// 絵（fx.js）を1コマもらい、動きはコードでつける。絵と同じ色の光と粒を重ねて、切り口をなじませる
const FXI = {}; if (typeof FX_IMG !== 'undefined') for (const [k, s] of Object.entries(FX_IMG)) { const i = new Image(); i.src = s; FXI[k] = i; }
let fxList = [], fxParts = [], FX_AT = null;  // FX_AT: 技のエフェクトを出す敵（群れのとき）
// 5属性×小・中・大の魔法（ファイルから読む）
const MAGIC_C = { fire:'#ff8a3d', ice:'#8fd8ff', bolt:'#ffe14a', holy:'#fff0b0', dark:'#b45cff' };
for (const [el, c] of Object.entries(MAGIC_C)) for (let k = 1; k <= 3; k++) { const n = `m_${el}${k}`, i = new Image(); i.src = `assets/fx/${n}.webp`; FXI[n] = i; if (typeof FX_META !== 'undefined') FX_META[n] = { c, add: el !== 'dark' }; }
// 2026-11-25: 技の部品（assets/fx/s_*.webp）。白い部品は tint で色を付けて使う。[光の色, 加算で描くか]
const PART_META = {
  s_slash: ['#dce8ff', 1], s_flash: ['#dce8ff', 1], s_vslash: ['#dce8ff', 1], s_sweep: ['#ffe2b8', 1], s_thrust: ['#dce8ff', 1], s_arrow: ['#fff0c8', 1], s_sword: ['#cfe3ff', 1], s_needle: ['#8a5cff', 0],
  s_fireslash: ['#ff8a3d', 1], s_darkslash: ['#9a4cff', 0], s_ghost: ['#8fc8ff', 1], s_fist: ['#ffffff', 1],
  s_hit: ['#ffffff', 1], s_heavy: ['#cfe3ff', 0], s_shock: ['#ff5030', 1], s_holyhit: ['#ffe08a', 1], s_shield: ['#8fc8ff', 1], s_barrier: ['#6ab8ff', 1],
  s_water: ['#7fd8ff', 1], s_sparks: ['#ffb060', 1], s_sparkle: ['#ffe08a', 1], s_coins: ['#ffd24a', 0], s_boom: ['#ff9030', 0], s_blade: ['#cfe3ff', 1],
};
for (const [n, [c, add]] of Object.entries(PART_META)) { const i = new Image(); i.src = `assets/fx/${n}.webp`; FXI[n] = i; if (typeof FX_META !== 'undefined') FX_META[n] = { c, add: !!add }; }
// 白い部品に色を付けた絵（色ごとに一度だけ作る）
const TINT = {};
function tintOf(img, c, hue) {
  if (!img.complete || !img.naturalWidth) return img; const k = img.src.slice(-24) + c + (hue ? 'h' : ''); if (TINT[k]) return TINT[k];
  const o = document.createElement('canvas'); o.width = img.naturalWidth; o.height = img.naturalHeight; const g = o.getContext('2d');
  // hue: 色のある絵の明るさはそのまま、色だけ差し替える（2026-11-25）。そうでなければ白い部品に色をかける
  g.drawImage(img, 0, 0); g.globalCompositeOperation = hue ? 'color' : 'multiply'; g.fillStyle = c; g.fillRect(0, 0, o.width, o.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
  return (TINT[k] = o);
}
let fxDim = 0;  // 大きな魔法の前に、画面を暗くする
// 動き方: slash=さっと広がって消える burst=はじける travel=下から飛んでいって当たる rise=足元から昇る screen=画面全体に
const FX_MOVE = {
  slash_h:'slash', slash_v:'slash', slash_x:'slash', iai:'slash', tsubame:'slash', flurry:'slash', claw:'slash', bite:'burst', dark_blade:'slash',
  impact:'burst', impact_heavy:'burst', crit:'burst', spark:'burst', thunder:'burst', thunder_ball:'burst', ice_burst:'burst', explosion:'burst', holy_cross:'burst', dark_mist:'burst', poison:'burst', rocks:'burst', fire_l:'burst', wind:'burst', magic_circle:'burst', smoke:'burst', sparkle:'burst', stun:'burst', paralyze:'burst', poison_bubble:'burst', sleep:'burst',
  thrust:'travel', arrow:'travel', magic_arrow:'travel', fire_s:'travel', ice_spear:'travel',
  heal:'rise', heal_leaf:'rise', holy_pillar:'rise', barrier:'rise', power:'rise', speed:'rise', pray:'rise', levelup:'rise', blessing:'rise', warp:'rise', bunshin:'rise', afterimage:'rise',
  jin:'screen',
  m_fire1:'travel', m_ice1:'travel', m_dark1:'travel', m_bolt1:'burst', m_holy1:'burst', m_fire2:'burst', m_ice2:'burst', m_bolt2:'burst', m_holy2:'burst', m_dark2:'burst',
  m_fire3:'big', m_ice3:'big', m_bolt3:'big', m_holy3:'big', m_dark3:'big',
};
const FX_DUR = { slash: 380, burst: 520, travel: 520, rise: 900, screen: 700, big: 1100, drop: 620, fade: 650 };
Object.assign(FX_MOVE, { s_slash: 'slash', s_flash: 'slash', s_vslash: 'slash', s_sweep: 'slash', s_fireslash: 'slash', s_darkslash: 'slash', s_thrust: 'burst', s_arrow: 'travel', s_sword: 'drop', s_needle: 'burst', s_ghost: 'fade',
  s_fist: 'burst', s_hit: 'burst', s_heavy: 'burst', s_shock: 'burst', s_holyhit: 'burst', s_shield: 'burst', s_barrier: 'rise', s_water: 'rise', s_sparks: 'burst', s_sparkle: 'burst', s_coins: 'burst', s_boom: 'burst', s_blade: 'rise' });
// 回るエフェクト（1回の表示のあいだに回る角度）
const SPIN = { magic_circle: 2.2, dark_mist: 1.4, barrier: .5 };
// ばらばらに飛ぶエフェクト: n=数 up=上向きの強さ sp=速さ g=重さ spin=回転 flip=裏返り sz=大きさ dur=長さ fall=上から舞い落ちる tw=またたく keep=元の絵も出す
const DEBRIS = {
  rocks:     { n: 7, sp: 150, g: 420, spin: 14, flip: 10, sz: [.16, .32], dur: 750 },
  ice_burst: { n: 8, sp: 170, g: 300, spin: 10, flip: 14, sz: [.12, .24], dur: 700, keep: true, glint: true },
  heal_leaf: { n: 7, fall: true, g: 0, spin: 3, flip: 7, sz: [.14, .24], dur: 1100 },
  sparkle:   { n: 7, sp: 110, g: 0, spin: 2, flip: 0, sz: [.12, .24], dur: 650, tw: true },
};
function debrisFx(img, x, y, opt, D) {
  const n = D.n + Math.floor((opt.size || .8) * 3), t0 = performance.now() + (opt.delay || 0);
  for (let i = 0; i < n; i++) {
    const an = -Math.PI / 2 + (R() - .5) * 2.8, sp = (D.sp || 0) * (.6 + R() * .8), vx = D.fall ? (R() - .5) * 30 : Math.cos(an) * sp, vy = D.fall ? 30 + R() * 30 : Math.sin(an) * sp;
    const sx = D.fall ? x + (R() - .5) * VH * .5 : x, sy = D.fall ? y - VH * (.25 + R() * .2) : y;
    const spin = (R() - .5) * D.spin, flipSp = D.flip * (.6 + R() * .8), sz = VH * (opt.size || .8) * (D.sz[0] + R() * (D.sz[1] - D.sz[0])), ph = R() * 6, tw = R() * 6, del = D.fall ? R() * 300 : 0;
    fxList.push({ code: k => {
      const dt = k * D.dur / 1000, px = sx + vx * dt + (D.fall ? Math.sin(dt * 5 + ph) * 18 : 0), py = sy + vy * dt + D.g * dt * dt, a = k < .1 ? k / .1 : k < .7 ? 1 : 1 - (k - .7) / .3;
      ctx.globalAlpha = a * (D.tw ? .55 + .45 * Math.sin(tw + k * 25) : 1); if (D.tw || D.glint) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(px, py); ctx.rotate(spin * dt); if (D.flip) ctx.scale(Math.cos(ph + flipSp * dt), 1);
      const s2 = D.tw ? sz * (.6 + .4 * Math.sin(tw + k * 18)) : sz;
      ctx.drawImage(img, -s2 / 2, -s2 / 2 * img.height / img.width, s2, s2 * img.height / img.width);
    }, t0: t0 + del, dur: D.dur });
  }
}
// ---------- 魔物の攻撃のエフェクト（種類ごと） ----------
const MON_ATK = [
  [/dragon|wyvern|cloudragon|竜/, 'breath'],
  [/golem|mammoth|giant|troll|ogre|rhino|colossus|boulder|tortoise|whale|hand|obsidian|statue|yeti|ape|bear|巨/, 'heavy'],
  [/thunder|lightning|storm|雷|稲妻/, 'bolt'],
  [/fire|lava|magma|ember|frill|candle|炎|溶岩/, 'fire'],
  [/ice|snow|frost|yuki|glacier|blizzard|frozen|氷|雪|霜/, 'ice'],
  [/ghost|phantom|shadow|shaman|mage|grimoire|curse|cursed|tablet|mirror|portrait|jester|medusa|sealed|亡霊|影|呪/, 'dark'],
  [/sprite|pixie|kodama|angel|spirit|woodmask|mirage|精/, 'magic'],
  [/spider|scorpion|centipede|worm|slime|pitcher|maneater|mushroom|moth|frog|leech|slug|bee|swarm|snake|serpent|python|larva|vine|rose|cactus|beetle|scarab|毒|虫/, 'poison'],
  [/knight|armor|guard|bandit|orc|goblin|skeleton|warrior|chariot|dragoon|rider|thief|archer|graverobber|chain|gear|imp/, 'weapon'],
  [/rat|dog|wolf|jackal|lynx|leopard|fox|cat|croc|bat|lizard|boar|jaguar|camel|penguin|crab/, 'bite'],
];
function monAtkKind(m) { if (m.mirror) return 'weapon'; if (m.boss && !/golem|worm|king/.test(m.id)) return 'heavy'; const k = m.id + m.name; for (const [re, v] of MON_ATK) if (re.test(k)) return v; return 'claw'; }
function monAttackFx(m, blocked, dl) {
  dl = dl || 0;
  const y = VH * .62, o = { y, size: 1.1, mv: 'burst', x: VW / 2 + (R() - .5) * 40, delay: dl };
  if (blocked) { playFx('spark', o); return; }
  switch (monAtkKind(m)) {
    case 'breath': fxTint(dl, '#ff6a20', .35); playFx('fire_l', { ...o, size: 1.6 }); playFx('fire_s', { ...o, delay: dl + 120 }); shakeAt(dl + 100, 9); break;
    case 'heavy': playFx('impact_heavy', { ...o, size: 1.3 }); playFx('rocks', { ...o, delay: dl + 60, size: .8 }); fxTint(dl, '#ff2010', .2); shakeAt(dl + 60, 11); break;
    case 'bolt': playFx('m_bolt1', { ...o, size: .9 }); playFx('paralyze', { ...o, delay: dl + 120, size: .7 }); break;
    case 'fire': playFx('m_fire1', { ...o, size: .8 }); playFx('fire_s', { ...o, delay: dl + 100, size: .7 }); break;
    case 'ice': playFx('m_ice1', { ...o, size: .8 }); playFx('ice_burst', { ...o, delay: dl + 100, size: .6 }); break;
    case 'dark': playFx('dark_mist', { ...o, size: .9 }); playFx('m_dark1', { ...o, delay: dl + 120, size: .8 }); break;
    case 'magic': playFx('magic_arrow', { ...o, size: .8 }); playFx('sparkle', { ...o, delay: dl + 120, size: .6 }); break;
    case 'poison': playFx('poison_bubble', { ...o, size: .9 }); playFx('poison', { ...o, delay: dl + 120, size: .7 }); break;
    case 'weapon': playFx(R() < .5 ? 'slash_h' : 'slash_v', { ...o, mv: 'slash' }); shakeAt(dl + 40, 5); break;
    case 'bite': playFx('bite', o); break;
    default: playFx('claw', o);
  }
}
function playFx(name, opt = {}) {
  if (FX_COLOR && FX_COLOR_ALL && !opt.hue && !opt.noColor && !/^m_/.test(name)) opt = { ...opt, hue: FX_COLOR };  // 魔法の段階ごとの色
  else if (FX_COLOR && !opt.hue && !opt.noColor) {  // 技の色に染める
    if (PART_META[name] && PART_META[name][0] && (!opt.tint || NEUTRAL.has(opt.tint)) && ['s_slash', 's_flash', 's_vslash', 's_sweep', 's_thrust', 's_arrow', 's_sword', 's_fist', 's_hit'].includes(name)) opt = { ...opt, tint: FX_COLOR };
    else if (RECOLOR.has(name)) opt = { ...opt, hue: FX_COLOR };
  }
  const img = FXI[name], meta = (typeof FX_META !== 'undefined' && FX_META[name]) || { c: '#ffffff', add: true };
  if (!img) return;
  const mv = opt.mv || FX_MOVE[name] || 'burst', self = opt.self || mv === 'rise';
  // 音はエフェクトに合わせる（2026-11-25）: 大きな魔法は画面が暗くなってから出るので、音もそこに合わせる。長さはエフェクトが見えている間＋少し
  { const k = opt.snd !== undefined ? opt.snd : FX_SFX[name]; if (k) { const d = (opt.delay || 0) + (mv === 'big' ? 280 : 0), len = (FX_DUR[mv] || 500) * (opt.slow || 1) / 1000; sfx(k, { delay: d, max: Math.min(2.5, Math.max(.6, len + .45)), vol: opt.vol }); } }  // snd: 音を変える（null で鳴らさない）
  // 大きな魔法: 画面が暗くなってから、画面いっぱいに出る。強く揺れて、粒も多い
  if (mv === 'big') { fxDim = performance.now() + (opt.delay || 0); opt = { ...opt, delay: (opt.delay || 0) + 280, parts: 40, y: VH * .56 }; setTimeout(() => { fx.shake = Math.max(fx.shake || 0, 12); fx.flash = .5; }, opt.delay + 80); }
  if (/^m_\w+2$/.test(name)) setTimeout(() => { fx.shake = Math.max(fx.shake || 0, 6); }, (opt.delay || 0) + 60);
  const x = opt.x !== undefined ? opt.x : (FX_AT && FX_AT.cx !== undefined && !self && mv !== 'big' ? FX_AT.cx : VW / 2) + (self ? 0 : (R() - .5) * 20), y = opt.y !== undefined ? opt.y : self ? VH * .62 : VH * .52;
  // ばらばらに飛ぶ・舞うエフェクト（岩・氷・葉・きらめき）
  if (DEBRIS[name]) { debrisFx(img, x, y, opt, DEBRIS[name]); if (!DEBRIS[name].keep) return; }
  if (name === 'explosion') playFx('rocks', { delay: (opt.delay || 0) + 60, size: (opt.size || .9) * .8, x, y });
  fxList.push({ name, img, meta, mv, x, y, t0: performance.now() + (opt.delay || 0), dur: FX_DUR[mv] * (opt.slow || 1), size: opt.size || (mv === 'screen' ? 2.8 : self ? 1.05 : .95), rot: opt.rot !== undefined ? opt.rot : mv === 'slash' ? (R() - .5) * .5 : 0, flip: opt.flip !== undefined ? opt.flip : R() < .5 && mv === 'slash', spin: SPIN[name] || 0, wob: name === 'dark_mist', tint: opt.tint, hue: opt.hue });
  // 同じ色の粒
  const n = opt.parts !== undefined ? opt.parts : mv === 'rise' ? 18 : 14, pc = opt.hue || opt.tint || meta.c;
  for (let i = 0; i < n; i++) {
    const a = mv === 'rise' ? -Math.PI / 2 + (R() - .5) * 1.2 : R() * Math.PI * 2, sp = mv === 'rise' ? 20 + R() * 40 : 40 + R() * 110;
    fxParts.push({ x: x + (mv === 'rise' ? (R() - .5) * 70 : 0), y: y + (mv === 'rise' ? 30 : 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: pc, t0: performance.now() + (opt.delay || 0) + (mv === 'travel' ? 260 : 0), life: 380 + R() * 420, r: 1 + R() * 1.8, add: meta.add });
  }
}
function drawFx() {
  const t = performance.now();  // playFx と同じ時計を使う
  { const d = (t - fxDim) / 1400; if (fxDim && d >= 0 && d < 1) { ctx.fillStyle = `rgba(4,2,10,${(d < .2 ? d / .2 : 1 - (d - .2) / .8) * .62})`; ctx.fillRect(0, 0, VW, VH); } }
  if (!fxList.length && !fxParts.length) return;
  ctx.save();
  fxList = fxList.filter(e => t - e.t0 < e.dur);
  for (const e of fxList) {
    const k = (t - e.t0) / e.dur; if (k < 0) continue;
    if (e.code) { ctx.save(); e.code(k); ctx.restore(); continue; }  // コードで描くエフェクト
    const base = VH * .55 * e.size, w = base * e.img.width / Math.max(e.img.width, e.img.height), h = base * e.img.height / Math.max(e.img.width, e.img.height);
    let s = 1, a = 1, x = e.x, y = e.y;
    if (e.mv === 'slash') { s = .75 + k * .45; a = k < .2 ? k / .2 : 1 - (k - .2) / .8; }
    if (e.mv === 'burst') { s = .5 + Math.pow(k, .5) * .8; a = k < .15 ? k / .15 : 1 - (k - .15) / .85; }
    if (e.mv === 'travel') { const q = Math.min(1, k / .5); x = VW / 2 + (e.x - VW / 2) * q; y = VH * 1.05 + (e.y - VH * 1.05) * q; s = .6 + q * .5; a = k < .5 ? 1 : 1 - (k - .5) / .5; }
    if (e.mv === 'rise') { s = .9 + k * .15; y = e.y - k * 18; a = k < .2 ? k / .2 : 1 - (k - .2) / .8; }
    if (e.mv === 'screen') { s = 1 + k * .2; a = k < .1 ? k / .1 : 1 - (k - .1) / .9; }
    if (e.mv === 'drop') { const q = Math.min(1, k / .35); y = e.y - VH * .5 * (1 - q * q); a = k < .35 ? 1 : 1 - (k - .35) / .65; s = 1; }
    if (e.mv === 'fade') { s = 1 + k * .08; a = k < .2 ? k / .2 : 1 - (k - .2) / .8; }
    if (e.mv === 'big') { s = .75 + Math.pow(k, .35) * .45; a = k < .1 ? k / .1 : k < .7 ? 1 : 1 - (k - .7) / .3; }
    // うしろの光（絵と同じ色）
    ctx.globalCompositeOperation = e.meta.add ? 'lighter' : 'source-over';
    const r = Math.max(w, h) * s * .55, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    const gc = e.hue || e.tint || e.meta.c; gr.addColorStop(0, gc + (e.meta.add ? '66' : '33')); gr.addColorStop(1, gc + '00');
    ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.translate(x, y); ctx.rotate(e.rot + e.spin * k); if (e.flip) ctx.scale(-1, 1); if (e.wob) ctx.scale(1 + Math.sin(k * 9) * .08, 1 - Math.sin(k * 9) * .06);
    ctx.drawImage(e.hue ? tintOf(e.img, e.hue, true) : e.tint ? tintOf(e.img, e.tint) : e.img, -w * s / 2, -h * s / 2, w * s, h * s);
    if (e.tint && !e.hue) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * .3; ctx.drawImage(e.img, -w * s / 2, -h * s / 2, w * s, h * s); }  // 芯は白く
    if (e.meta.add && k < .35) { ctx.globalAlpha = a * .5; ctx.drawImage(e.img, -w * s / 2, -h * s / 2, w * s, h * s); } // 最初だけ強く光らせる
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  fxParts = fxParts.filter(p => t - p.t0 < p.life);
  for (const p of fxParts) {
    const dt = (t - p.t0) / 1000; if (dt < 0) continue; const k = dt * 1000 / p.life;
    ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; ctx.globalAlpha = (1 - k) * .9; ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x + p.vx * dt, p.y + p.vy * dt + 30 * dt * dt, p.r * (1 - k * .5), 0, 7); ctx.fill();
  }
  ctx.restore();
}
// 技 → エフェクト
const SKILL_FX = {
  double:['slash_x'], lunge:['thrust'], iai:['iai'], tsubame:['tsubame'], frenzy:['flurry'], flurry:['flurry'], cleave:['impact_heavy'], heavyslash:['slash_v','impact_heavy'], smash:['impact_heavy'], rage:['impact_heavy'],
  stab:['thrust'], assassin:['thrust','crit'], snipe:['arrow'], aim:['arrow'], volley:['arrow','arrow'], kagenui:['thrust','dark_mist'], plunder:['impact_heavy'], punch:['impact'], monkstrike:['impact','heal'],
  shieldbash:['impact'], sagefire:['fire_l',['heal',200]],
  // 魔法: 新しい絵（m_）に、前からあるエフェクトを重ねる。[名前, 遅れms, 大きさ]
  fire:['m_fire1',['fire_s',260,.5]], fire2:['fire_s','m_fire2',['fire_l',260,.8]], fire3:['m_fire3',['explosion',420,1.2],['fire_l',620,1.3]],
  ice:['m_ice1',['ice_burst',300,.45]], ice2:['ice_spear','m_ice2',['ice_burst',260,.9]], ice3:['m_ice3',['ice_burst',450,1.3],['ice_spear',650,1]],
  bolt:['m_bolt1',['spark',120,.5]], bolt2:['m_bolt2',['thunder_ball',220,.8]], bolt3:['m_bolt3',['thunder',380,1.3],['thunder_ball',560,1.1],['paralyze',760,.9]],
  holy:['m_holy1',['sparkle',140,.6]], holy2:['m_holy2',['holy_pillar',200,.9]], holy3:['m_holy3',['holy_cross',420,1.2],['blessing',640,1.1]],
  dark1:['m_dark1',['dark_mist',260,.5]], dark2:['dark_mist','m_dark2',['dark_blade',300,1]], dark3:['m_dark3',['dark_mist',420,1.4],['dark_blade',640,1.3]], magicblade:['slash_x','fire_s'], darkblade:['dark_blade','dark_mist'],
  arcanearrow:['magic_circle','magic_arrow'], bomb:['explosion'], heal:['heal'], guard:['barrier'], wall:['barrier'], holyguard:['barrier','pray'], counter:['barrier'], mikiri:['afterimage'],
  hone:['power'], bunshin:['bunshin'], steal:['sparkle'],
};
const WEAPON_FX = { sword:'slash_h', katana:'iai', axe:'impact_heavy', greatsword:'slash_v', hammer:'impact_heavy', dagger:'thrust', bow:'arrow', book:'magic_arrow', staff:'impact' };
// ---------- 技の見せ方（2026-11-24）: 技のイメージに合わせて、絵・コードの光・音を1回ずつ重ねる ----------
const shakeAt = (dl, n) => setTimeout(() => { fx.shake = Math.max(fx.shake || 0, n); }, dl);
// 画面を暗くする（ためる・闇）
function fxDark(dl, dur, al, c) { codeFx(dl, dur, k => { ctx.globalAlpha = (k < .25 ? k / .25 : 1 - (k - .25) / .75) * al; ctx.fillStyle = c || '#05030a'; ctx.fillRect(0, 0, VW, VH); }); }
// 横一閃の光（居合）
function fxBeam(dl, c) {
  const y = VH * .5;
  codeFx(dl, 380, k => { const w = k < .2 ? k / .2 : 1, a = k < .3 ? 1 : 1 - (k - .3) / .7; ctx.globalCompositeOperation = 'lighter';
    for (const [h, al, col] of [[18, .25, c], [7, .6, c], [2.5, 1, '#ffffff']]) { ctx.globalAlpha = a * al; ctx.fillStyle = col; ctx.fillRect(VW / 2 - VW * w / 2, y - h / 2 * (1 - k * .5), VW * w, h * (1 - k * .5)); } });
}
// 狙いの照準が絞られていく（弓）
function fxReticle(dl, dur, c) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .5;
  codeFx(dl, dur, k => { const r = VH * (.32 - .22 * easeOut(Math.min(1, k / .8))), a = k < .85 ? 1 : 1 - (k - .85) / .15; ctx.globalAlpha = a * .9; ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + k; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r * .6, y + Math.sin(an) * r * .6); ctx.lineTo(x + Math.cos(an) * r * 1.25, y + Math.sin(an) * r * 1.25); ctx.stroke(); }
    ctx.fillStyle = c; ctx.fillRect(x - 1, y - 1, 2, 2); });
}
// 集中線（踏み込む・突く）
function fxSpeed(dl, dur, c) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .52, seed = R() * 9;
  codeFx(dl, dur, k => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * .6; ctx.strokeStyle = c || '#ffffff'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 22; i++) { const an = seed + i * 2.399, r1 = VH * (.75 - .45 * k) * (0.7 + (i % 3) * .15), r2 = r1 + VH * .25; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); ctx.stroke(); } });
}
// 影の針（影縫い）
function fxPins(dl, c) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .82;
  codeFx(dl, 600, k => { const e = easeOut(Math.min(1, k / .3)), a = k < .6 ? 1 : 1 - (k - .6) / .4; ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 14, y - 40 * e); ctx.lineTo(x + i * 14, y); ctx.stroke(); } ctx.globalAlpha = a * .5; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, 46, 8, 0, 0, 7); ctx.fill(); });
}
const WHITE = '#ffffff';
// pre: 技の始まり（ため・照準など） wait: 1回目までの待ち gap: 2回目からの間隔 at: 絵が出てから当たるまで len: 技の長さ（次の行動を待つ）
// 技ごとの色（2026-11-25）: 白い部品と、前からある斬撃・打撃・突き・矢などの絵を、この色に染める。ジョブごとに色の系統をそろえ、技ごとに少しずつ変える
const SKILL_COLOR = {
  // 鍛冶屋・鍛冶師範＝炉の橙
  smash: '#ffb070', mine: '#ffd9a0', tettsui: '#ff9a40', temper: '#ff8a30', masterstrike: '#ff7a20',
  // 剣士＝青白
  double: '#a8d8ff', lunge: '#d0ecff', nagi: '#8fc8ff', kabuto: '#7ab0ff',
  // 侍＝水色、剣豪＝桜色
  iai: '#a0f0ff', zantetsu: '#c8f8ff', munen: '#e8fbff', tsubame: '#ffc0dc', ranbu: '#ffa8cc',
  // 騎士・聖騎士＝金
  heavyslash: '#ffe9a8', juji: '#ffd870', fudou: '#ffe08a', seiken: '#fff0b0', holyguard: '#fff0c0',
  // 山賊・狂戦士・略奪者＝赤と橙
  rage: '#ff5a30', cleave: '#ffb070', makiwari: '#d8a060', ikari: '#ff3a20', frenzy: '#ff8a50', daisenpu: '#ff7040', plunder: '#ffc040', bomb: '#ff9030', jiware: '#d0a070',
  // 盗賊＝若草、アサシン＝紅、忍者＝紫
  stab: '#ff8a8a', bundoru: '#c8ff70', assassin: '#ff3050', noroi: '#9a5aff', kagenui: '#a070ff', shuriken: '#c0b0ff', bunshin: '#b090ff',
  // アーチャー・狩人＝黄と緑、魔弓士＝青紫
  aim: '#fff0a0', volley: '#ffe680', midare: '#ffd060', senbon: '#fff6c0', snipe: '#ff9a7a', wana: '#a0e080', arcanearrow: '#b090ff', ryusei: '#a8a0ff',
  // 素手・僧兵＝白と橙
  punch: '#ffe0c0', mawashi: '#ffd0a0', flurry: '#fff0e0', hyaku: '#ffc890', kiai: '#ffb060', monkstrike: '#fff0a0', kongou: '#ffe08a',
  // 魔法剣士・黒騎士
  magicblade: '#ff9a4a', shigen: '#ffffff', darkblade: '#b040ff', kyuushu: '#c060ff',
  // 剣聖
  kensei: '#ffe08a', senken: '#e8f0ff', jin1: '#ffffff',
};
const RECOLOR = new Set(['slash_h', 'slash_v', 'slash_x', 'thrust', 'impact', 'impact_heavy', 'arrow', 'spark', 'crit', 'flurry', 'tsubame', 'iai', 'jin', 'afterimage', 'barrier', 'power']);
const NEUTRAL = new Set(['#ffffff', '#dce8ff', '#cfe3ff', '#fff0c8', '#ffe0c0', '#ffd8a0', '#ffe2b8', '#ffd8d8']);
let FX_COLOR = null, FX_COLOR_ALL = false;
// 魔法: 小・中・大で、重ねる絵の色を少しずつ変える（新しい魔法の絵 m_ はそのまま）
const MAGIC_HUE = { fire2: '#ff7a30', fire3: '#ff4a20', ice2: '#7ac8ff', ice3: '#c8f0ff', bolt2: '#ffe14a', bolt3: '#fff6b0', holy2: '#ffe08a', holy3: '#fffbe0', dark2: '#8a2cff', dark3: '#ff3a8a', sagefire: '#a0ffb0' };
const SKILL_SHOW = {
  // ---- 剣・刀・大剣・斧（2026-11-25: 部品の絵 s_* を、技ごとに回数・向き・色を変えて出す。音は絵が出る瞬間に鳴らす） ----
  double:   { gap: 280, at: 50, len: 250, hit: (i, dl) => { playFx('s_slash', { delay: dl, rot: i ? .2 : -.2, flip: !!i, size: 1.15, tint: '#dce8ff', snd: 'w_sword' }); fxSparks(dl + 50, WHITE, 8); if (i) fxTint(dl + 30, WHITE, .14); shakeAt(dl + 50, 4 + i * 2); } },
  frenzy:   { gap: 120, at: 30, len: 450, hit: (i, dl) => { const r = (R() - .5) * 2.6; playFx('s_slash', { delay: dl, rot: r, flip: R() < .5, size: .75, tint: i % 2 ? '#ffe0c0' : '#dce8ff', x: (FX_AT && FX_AT.cx || VW / 2) + (R() - .5) * 60, y: VH * (.42 + R() * .16), parts: 4, snd: 'w_sword' }); shakeAt(dl + 30, 3); } },
  iai:      { pre: () => { fxDark(0, 750, .6); sfx('swing', { vol: .5 }); }, wait: 380, at: 30, len: 450, hit: (i, dl) => { fxBeam(dl, '#cfe3ff'); playFx('s_flash', { delay: dl, rot: 0, flip: false, size: 1.9, tint: '#cfe3ff', snd: 'slash' }); playFx('iai', { delay: dl, rot: 0, size: 1.3, snd: null }); fxSparks(dl + 30, WHITE, 18); fxTint(dl + 20, '#cfe3ff', .35); shakeAt(dl + 30, 9); } },
  tsubame:  { gap: 250, at: 50, len: 300, hit: (i, dl) => { if (!i) playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.2, tint: '#cfe3ff', snd: 'w_katana' }); else playFx('s_slash', { delay: dl, rot: Math.PI - .4, flip: true, size: 1.2, tint: '#cfe3ff', snd: 'w_katana' }); fxSparks(dl + 50, WHITE, 10); if (i) fxTint(dl + 30, '#cfe3ff', .18); shakeAt(dl + 50, 6); } },
  lunge:    { pre: () => fxSpeed(0, 260), wait: 160, at: 60, len: 150, hit: (i, dl) => { playFx('s_thrust', { delay: dl, size: 1.15, tint: '#ffffff', snd: 'swing' }); playFx('impact', { delay: dl + 60, size: .55, parts: 6, snd: 'hit1' }); fxRing(dl + 60, WHITE, .22, 3); shakeAt(dl + 60, 5); } },
  heavyslash:{ at: 120, len: 300, hit: (i, dl) => { playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.6, slow: 1.2, tint: '#ffffff', snd: 'heavy' }); playFx('s_heavy', { delay: dl + 120, size: .9, snd: 'punch' }); fxTint(dl + 120, WHITE, .22); fxRing(dl + 130, WHITE, .36, 5); shakeAt(dl + 120, 11); } },
  smash:    { at: 60, len: 200, hit: (i, dl) => { playFx('s_heavy', { delay: dl, size: 1.35, snd: 'punch' }); playFx('rocks', { delay: dl + 60, size: .7, parts: 14, snd: 'rockbreak' }); fxRing(dl + 60, '#d9b07a', .34, 5); fxTint(dl + 40, '#ffd8a0', .15); shakeAt(dl + 60, 10); } },
  cleave:   { at: 60, len: 250, hit: (i, dl) => { const k = FX_AT; FX_AT = null; playFx('s_sweep', { delay: dl, rot: 0, flip: false, size: 1.9, x: VW / 2, tint: '#ffd8a0', snd: 'w_axe' }); fxArc(dl, '#ffd8a0', 6, Math.PI / 2 - .2, VH * .55); FX_AT = k; playFx('impact_heavy', { delay: dl + 120, size: .7, parts: 6, snd: 'punch' }); shakeAt(dl + 120, 9); } },
  rage:     { pre: () => fxTint(0, '#ff2010', .3), wait: 150, at: 40, len: 300, hit: (i, dl) => { playFx('s_shock', { delay: dl, size: 1.5, snd: 'w_axe' }); playFx('impact_heavy', { delay: dl + 40, size: 1, parts: 10, snd: 'punch' }); fxTint(dl + 40, '#ff3010', .38); fxRays(dl + 40, '#ff5030', 12, .6); shakeAt(dl + 40, 13); } },
  plunder:  { at: 60, len: 350, hit: (i, dl) => { playFx('impact_heavy', { delay: dl, size: 1.1, snd: 'w_axe' }); playFx('s_coins', { delay: dl + 140, size: .8, snd: 'register', vol: .55 }); fxSparks(dl + 140, '#ffd24a', 16); shakeAt(dl + 60, 7); } },
  magicblade:{ at: 60, len: 300, hit: (i, dl) => { playFx('s_fireslash', { delay: dl, size: 1.35, rot: 0, flip: false, snd: 'w_sword' }); playFx('fire_s', { delay: dl + 90, size: .8, snd: 'fire1' }); fxTint(dl + 60, '#ff8a3d', .22); fxSparks(dl + 90, '#ffb060', 14); shakeAt(dl + 60, 7); } },
  darkblade:{ pre: () => fxDark(0, 750, .55, '#12001a'), wait: 220, at: 60, len: 400, hit: (i, dl) => { playFx('s_darkslash', { delay: dl, size: 1.45, rot: 0, flip: false, snd: 'w_sword' }); playFx('dark_mist', { delay: dl + 120, size: .9, snd: 'dark' }); fxRing(dl + 120, '#b45cff', .4, 5); fxTint(dl + 60, '#7a2cff', .2); shakeAt(dl + 60, 9); } },
  kensei:   { pre: () => { fxDark(0, 950, .65); sfx('swing', { vol: .45 }); fxRing(120, '#ffe08a', .18, 2); }, wait: 440, at: 30, len: 650, hit: (i, dl) => { fxBeam(dl, '#ffe08a'); playFx('s_flash', { delay: dl, rot: 0, flip: false, size: 2.1, tint: '#ffe08a', snd: 'slash' }); playFx('s_holyhit', { delay: dl + 60, size: 1.1, snd: null }); fxTint(dl + 30, '#ffd060', .42); fxSparks(dl + 40, '#ffe08a', 26); fxRays(dl + 40, '#ffe08a', 14, .6); shakeAt(dl + 40, 13); } },
  senken:   { pre: () => { fxDark(0, 1400, .55, '#05081a'); for (let j = 0; j < 14; j++) { const t = 100 + j * 60, x = VW * (.14 + R() * .72), y = VH * (.45 + R() * .2); playFx('s_sword', { delay: t, size: .55, x, y, parts: 3, tint: j % 3 ? '#cfe3ff' : '#ffffff', snd: null }); if (j % 3 === 0) sfx('w_sword', { delay: t + 217, vol: .55, max: .5 }); fxSparks(t + 217, WHITE, 3); } },  // 剣が刺さる瞬間（落ちる動きの35%）に音
              wait: 1150, at: 40, len: 700, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; playFx('s_slash', { delay: dl, rot: -.2, size: 1.3, tint: '#ffffff', snd: first ? 'slash' : null }); playFx('s_slash', { delay: dl + 40, rot: .2, flip: true, size: 1.3, tint: '#ffffff', snd: null }); if (first) fxTint(dl + 20, WHITE, .4); fxSparks(dl + 40, WHITE, 14); shakeAt(dl + 40, 11); } },
  masterstrike:{ pre: () => { playFx('power', { self: true, size: .8, snd: null }); sfx('forge1', { vol: .7 }); fxSparks(120, '#ffb060', 10); }, wait: 420, at: 40, len: 450, hit: (i, dl) => { playFx('s_heavy', { delay: dl, size: 1.5, snd: 'punch' }); playFx('s_sparks', { delay: dl + 40, size: 1.2, snd: 'forge2', vol: .75 }); fxRing(dl + 40, '#ffb060', .45, 6); fxTint(dl + 30, '#ff9030', .32); shakeAt(dl + 40, 12); } },
  jin1:     { pre: () => { fxDark(0, 850, .68); sfx('swing', { vol: .4 }); }, wait: 460, at: 25, len: 500, hit: (i, dl) => { fxBeam(dl, WHITE); playFx('s_flash', { delay: dl, rot: 0, flip: false, size: 2, tint: '#ffffff', snd: 'slash' }); fxTint(dl + 20, WHITE, .45); fxSparks(dl + 25, WHITE, 20); shakeAt(dl + 25, 11); } },
  // ---- ダガー・弓 ----
  stab:     { at: 90, len: 120, hit: (i, dl) => { fxSpeed(dl, 180, '#ffcfcf'); playFx('s_thrust', { delay: dl, size: .95, tint: '#ffd8d8', snd: 'w_dagger' }); playFx('s_hit', { delay: dl + 90, size: .45, tint: '#ff6a5a', parts: 6, snd: 'hit' }); shakeAt(dl + 90, 5); } },
  assassin: { pre: () => { fxDark(0, 850, .62); playFx('dark_mist', { size: .7, snd: 'dark' }); }, wait: 380, at: 60, len: 500, hit: (i, dl) => { playFx('s_thrust', { delay: dl, size: 1.4, tint: '#ff5060', snd: 'w_dagger' }); playFx('s_flash', { delay: dl + 60, rot: -.5, size: 1.2, tint: '#ff4050', snd: 'hit' }); fxTint(dl + 60, '#ff2030', .4); fxRays(dl + 60, '#ff5060', 12, .5); shakeAt(dl + 60, 9); } },
  kagenui:  { at: 160, len: 450, hit: (i, dl) => { playFx('dark_mist', { delay: dl, size: .8, snd: 'dark' }); const x0 = FX_AT && FX_AT.cx || VW / 2; for (let j = 0; j < 5; j++) playFx('s_needle', { delay: dl + 120 + j * 45, size: .5, x: x0 + (j - 2) * 22, y: VH * .7, parts: 2, snd: j ? null : 'hit1' }); fxPins(dl + 160, '#8a5cff'); shakeAt(dl + 160, 4); } },
  aim:      { pre: () => fxReticle(0, 380, '#ffe08a'), wait: 300, at: 260, len: 450, hit: (i, dl) => { playFx('s_arrow', { delay: dl, size: .9, tint: '#fff0c8', snd: 'w_bow' }); playFx('s_hit', { delay: dl + 260, size: .55, tint: '#ffe08a', parts: 6, snd: 'hit' }); fxRing(dl + 260, '#ffe08a', .2, 3); shakeAt(dl + 260, 5); } },
  snipe:    { pre: () => { fxReticle(0, 520, '#ff7a5c'); fxDark(0, 650, .35); }, wait: 420, at: 260, len: 550, hit: (i, dl) => { playFx('s_arrow', { delay: dl, size: 1.1, tint: '#ff9a7a', snd: 'w_bow' }); playFx('s_hit', { delay: dl + 260, size: .75, tint: '#ff6a5a', snd: 'hit' }); fxTint(dl + 260, '#ff5030', .3); fxRays(dl + 260, '#ff7a5c', 10, .45); shakeAt(dl + 260, 7); } },
  volley:   { gap: 140, at: 260, len: 500, hit: (i, dl) => { playFx('s_arrow', { delay: dl, size: .8, tint: '#fff0c8', x: (FX_AT && FX_AT.cx || VW / 2) + (i - 1) * 24, snd: 'w_bow' }); playFx('s_hit', { delay: dl + 260, size: .4, parts: 4, snd: 'hit1', vol: .7 }); } },
  // ---- 格闘・杖・盾・道具 ----
  punch:    { at: 60, len: 120, hit: (i, dl) => { fxSpeed(dl, 200); playFx('s_fist', { delay: dl + 60, size: 1.15, snd: 'punch' }); fxRays(dl + 60, WHITE, 8, .35); fxTint(dl + 60, WHITE, .12); shakeAt(dl + 60, 7); } },
  flurry:   { gap: 130, at: 0, len: 400, hit: (i, dl) => { playFx('s_hit', { delay: dl, size: .5, x: (FX_AT && FX_AT.cx || VW / 2) + (R() - .5) * 50, y: VH * (.42 + R() * .18), parts: 4, snd: 'hit1' }); shakeAt(dl, 3); } },
  shieldbash:{ at: 60, len: 160, hit: (i, dl) => { fxSpeed(dl, 160); playFx('s_shield', { delay: dl + 60, size: 1.05, snd: 'punch' }); fxRing(dl + 60, '#cfe3ff', .3, 5); shakeAt(dl + 60, 7); } },
  monkstrike:{ at: 40, len: 320, hit: (i, dl) => { playFx('s_holyhit', { delay: dl, size: 1.1, snd: 'hit1' }); fxTint(dl + 40, '#ffe08a', .2); playFx('heal', { delay: dl + 240, self: true, size: .8, snd: 'heal1' }); shakeAt(dl + 40, 5); } },
  bomb:     { pre: () => fxTint(140, '#ff9030', .25), wait: 140, at: 40, len: 320, hit: (i, dl) => { playFx('s_boom', { delay: dl, size: 1.35, snd: 'explosion' }); playFx('rocks', { delay: dl + 70, size: .6, parts: 12, snd: null }); fxTint(dl + 30, '#ff9030', .38); shakeAt(dl + 40, 13); } },
  arcanearrow:{ pre: () => playFx('magic_circle', { y: VH * .78, size: .6, parts: 8 }), wait: 200, gap: 220, at: 260, len: 450, hit: (i, dl) => { playFx('magic_arrow', { delay: dl, size: .9 }); fxRing(dl + 260, '#c08cff', .2, 3); } },
  // ---- 2026-11-25 追加した技 ----
  mine:     { at: 50, len: 150, hit: (i, dl) => { playFx('s_heavy', { delay: dl, size: .9, snd: 'hit1' }); fxRing(dl + 50, '#ffe08a', .2, 3); shakeAt(dl + 50, 4); } },
  tettsui:  { pre: () => sfx('swing', { vol: .5 }), wait: 220, at: 50, len: 250, hit: (i, dl, tg) => { playFx('s_heavy', { delay: dl, size: 1.4, snd: 'punch' }); playFx('s_sparks', { delay: dl + 40, size: .9, snd: 'forge2', vol: .6 }); if (tg && tg.boss) fxTint(dl + 30, '#ffb060', .3); shakeAt(dl + 50, 11); } },
  nagi:     { at: 40, len: 250, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; if (first) { const k = FX_AT; FX_AT = null; playFx('s_sweep', { delay: dl, size: 1.8, x: VW / 2, rot: 0, flip: false, tint: '#dce8ff', snd: 'w_sword' }); FX_AT = k; } fxSparks(dl + 40, WHITE, 6); shakeAt(dl + 40, 6); } },
  kabuto:   { at: 70, len: 200, hit: (i, dl) => { playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.2, tint: '#ffffff', snd: 'w_sword' }); playFx('s_heavy', { delay: dl + 70, size: .8, snd: 'punch' }); fxRing(dl + 70, '#d9b07a', .3, 5); shakeAt(dl + 70, 8); } },
  nemuri:   { pre: () => { for (const x of alive()) { FX_AT = x; playFx('sleep', { delay: 120, size: .8, snd: x === alive()[0] ? 'magic' : null }); } FX_AT = null; fxTint(100, '#8a6cff', .18); } },
  maryoku:  { pre: () => { playFx('magic_circle', { self: true, y: VH * .78, size: .7, snd: 'magic' }); fxSparks(200, '#c08cff', 14); } },
  ooinori:  { pre: () => { playFx('pray', { self: true, size: .9, snd: 'magic' }); playFx('heal', { self: true, delay: 300, size: 1.2, snd: 'heal3' }); fxTint(300, '#a8ffb0', .25); } },
  hikari:   { pre: () => { playFx('s_shield', { self: true, size: .85, tint: '#fff0c0', snd: 'buff' }); playFx('heal', { self: true, delay: 200, size: .7, snd: 'heal1' }); } },
  nigeashi: { pre: () => { playFx('s_ghost', { self: true, size: .8, snd: 'dash' }); playFx('smoke', { self: true, delay: 100, size: .9, snd: null }); } },
  bundoru:  { at: 60, len: 250, hit: (i, dl) => { playFx('s_thrust', { delay: dl, size: 1, tint: '#ffe0c0', snd: 'w_dagger' }); playFx('s_sparkle', { delay: dl + 120, size: .55, snd: null }); fxSparks(dl + 120, '#ffd24a', 10); shakeAt(dl + 60, 5); } },
  makiwari: { pre: () => sfx('swing', { vol: .5 }), wait: 200, at: 50, len: 250, hit: (i, dl) => { playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.3, tint: '#ffe2b8', snd: 'w_axe' }); playFx('rocks', { delay: dl + 60, size: .6, parts: 10, snd: null }); fxSparks(dl + 60, '#c89a5a', 14); shakeAt(dl + 50, 9); } },
  ikari:    { pre: () => fxTint(0, '#ff2010', .25 + .3 * (1 - G.hp / G.mhp)), wait: 160, at: 40, len: 300, hit: (i, dl) => { playFx('s_shock', { delay: dl, size: 1.2 + .6 * (1 - G.hp / G.mhp), snd: 'w_axe' }); playFx('impact_heavy', { delay: dl + 40, size: 1, snd: 'punch' }); fxRays(dl + 40, '#ff5030', 12, .55); shakeAt(dl + 40, 12); } },
  zantetsu: { pre: () => { fxDark(0, 600, .45); sfx('swing', { vol: .45 }); }, wait: 320, at: 30, len: 350, hit: (i, dl) => { playFx('s_slash', { delay: dl, rot: -.1, size: 1.4, tint: '#cfe3ff', snd: 'w_katana' }); playFx('spark', { delay: dl + 30, size: .8, parts: 16, snd: 'hit' }); fxTint(dl + 30, '#cfe3ff', .25); shakeAt(dl + 30, 9); } },
  munen:    { pre: () => { fxDark(0, 1200, .7); sfx('swing', { vol: .35 }); fxRing(200, WHITE, .14, 2); fxRing(500, WHITE, .1, 2); }, wait: 700, at: 30, len: 700, hit: (i, dl) => { fxBeam(dl, WHITE); playFx('s_flash', { delay: dl, rot: -.35, size: 2.1, tint: '#ffffff', snd: 'slash' }); playFx('s_slash', { delay: dl + 60, rot: .2, size: 1.5, tint: '#cfe3ff', snd: null }); fxTint(dl + 30, WHITE, .5); fxSparks(dl + 40, WHITE, 26); shakeAt(dl + 40, 14); } },
  juji:     { gap: 220, at: 50, len: 250, hit: (i, dl) => { if (!i) playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.2, tint: '#dce8ff', snd: 'w_sword' }); else playFx('s_flash', { delay: dl, rot: 0, flip: false, size: 1.5, tint: '#dce8ff', snd: 'w_sword' }); fxSparks(dl + 50, WHITE, 8); if (i) fxTint(dl + 30, WHITE, .15); shakeAt(dl + 50, 6); } },
  fudou:    { pre: () => { playFx('s_barrier', { self: true, size: 1.3, tint: '#ffe08a', snd: 'buff' }); playFx('s_shield', { self: true, delay: 120, size: .8, snd: null }); fxTint(120, '#ffe08a', .2); } },
  midare:   { gap: 120, at: 260, len: 500, hit: (i, dl) => { playFx('s_arrow', { delay: dl, size: .7, tint: '#fff0c8', x: (FX_AT && FX_AT.cx || VW / 2) + (R() - .5) * 40, snd: 'w_bow' }); playFx('s_hit', { delay: dl + 260, size: .35, parts: 3, snd: 'hit1', vol: .6 }); } },
  senbon:   { pre: () => { fxDark(0, 1300, .45); for (let j = 0; j < 12; j++) { const t = 120 + j * 60; playFx('s_arrow', { delay: t, size: .5, rot: Math.PI / 2, x: VW * (.12 + R() * .76), y: VH * (.35 + R() * .3), parts: 2, tint: '#fff0c8', snd: j % 4 ? null : 'w_bow', vol: .6 }); } }, wait: 950, at: 40, len: 600, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; playFx('s_hit', { delay: dl, size: .7, snd: first ? 'hit' : null }); if (first) fxTint(dl + 20, '#fff0c8', .3); shakeAt(dl + 40, 9); } },
  mawashi:  { at: 50, len: 250, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; if (first) { const k = FX_AT; FX_AT = null; playFx('s_sweep', { delay: dl, size: 1.7, x: VW / 2, rot: 0, flip: true, tint: '#ffffff', snd: 'swing' }); FX_AT = k; } playFx('s_hit', { delay: dl + 50, size: .45, parts: 4, snd: first ? 'punch' : null }); shakeAt(dl + 50, 6); } },
  kiai:     { pre: () => { playFx('power', { self: true, size: .9, snd: 'buff' }); fxTint(100, '#ff9030', .18); fxRing(100, '#ffb060', .3, 3); } },
  hyaku:    { gap: 90, at: 0, len: 600, hit: (i, dl) => { playFx(i === 6 ? 's_fist' : 's_hit', { delay: dl, size: i === 6 ? 1 : .45, x: (FX_AT && FX_AT.cx || VW / 2) + (R() - .5) * 60, y: VH * (.4 + R() * .2), parts: 3, snd: i === 6 ? 'punch' : 'hit1', vol: i === 6 ? 1 : .6 }); shakeAt(dl, i === 6 ? 9 : 3); if (i === 6) fxTint(dl, WHITE, .2); } },
  shigen:   { pre: () => { fxDark(0, 700, .5); }, wait: 260, at: 60, len: 450, hit: (i, dl) => { playFx('s_slash', { delay: dl, rot: -.2, size: 1.5, tint: '#ffffff', snd: 'w_sword' }); ['m_fire1', 'm_ice1', 'm_bolt1', 'm_holy1'].forEach((n, j) => playFx(n, { delay: dl + 40 + j * 70, size: .5, vol: .45, snd: j ? null : undefined })); fxRays(dl + 60, '#ffe08a', 14, .5); fxTint(dl + 60, WHITE, .3); shakeAt(dl + 60, 10); } },
  kongou:   { pre: () => { playFx('s_shield', { self: true, size: .9, tint: '#ffe08a', snd: 'buff' }); fxRing(80, '#ffe08a', .3, 4); } },
  wana:     { at: 120, len: 350, hit: (i, dl) => { playFx('s_needle', { delay: dl, size: .6, y: VH * .7, snd: 'hit1' }); playFx('paralyze', { delay: dl + 120, size: .7, snd: null }); fxPins(dl + 120, '#c8a060'); shakeAt(dl + 120, 4); } },
  ryusei:   { pre: () => { playFx('magic_circle', { y: VH * .78, size: .7, parts: 8, snd: 'magic' }); for (let j = 0; j < 8; j++) playFx('magic_arrow', { delay: 200 + j * 70, size: .5, x: VW * (.15 + R() * .7), snd: null }); }, wait: 700, at: 40, len: 500, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; playFx('s_hit', { delay: dl, size: .6, tint: '#c08cff', snd: first ? 'shock1' : null, vol: .6 }); if (first) fxTint(dl, '#c08cff', .28); shakeAt(dl + 40, 8); } },
  jiware:   { pre: () => sfx('swing', { vol: .5 }), wait: 180, at: 60, len: 400, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; if (first) { playFx('s_heavy', { delay: dl, size: 1.5, x: VW / 2, y: VH * .7, snd: 'punch' }); playFx('rocks', { delay: dl + 60, size: 1, x: VW / 2, parts: 18, snd: 'rockbreak' }); fxTint(dl + 40, '#d9b07a', .25); } shakeAt(dl + 60, 13); } },
  daisenpu: { pre: () => fxTint(0, '#ff9050', .2), wait: 150, at: 40, len: 400, hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; if (first) { const k = FX_AT; FX_AT = null; playFx('s_sweep', { delay: dl, size: 2, x: VW / 2, rot: 0, flip: false, tint: '#ffd8a0', snd: 'w_axe' }); playFx('s_sweep', { delay: dl + 120, size: 1.8, x: VW / 2, rot: Math.PI, flip: true, tint: '#ffd8a0', snd: 'w_axe', vol: .7 }); FX_AT = k; } fxSparks(dl + 60, '#ffd8a0', 8); shakeAt(dl + 60, 10); } },
  seiken:   { pre: () => { fxDark(0, 600, .4); }, wait: 220, at: 50, len: 400, hit: (i, dl) => { playFx('s_vslash', { delay: dl, rot: 0, flip: false, size: 1.5, tint: '#fff0b0', snd: 'w_sword' }); playFx('holy_pillar', { delay: dl + 50, size: .9, snd: 'holy' }); fxTint(dl + 50, '#fff0b0', .32); playFx('heal', { self: true, delay: dl + 250, size: .7, snd: null }); shakeAt(dl + 50, 9); } },
  kyuushu:  { at: 60, len: 400, hit: (i, dl) => { playFx('s_darkslash', { delay: dl, size: 1.2, rot: 0, flip: false, snd: 'w_sword' }); playFx('dark_mist', { delay: dl + 80, size: .8, snd: 'dark' }); playFx('heal', { self: true, delay: dl + 260, size: .7, snd: 'heal1', vol: .6 }); fxTint(dl + 60, '#7a2cff', .2); shakeAt(dl + 60, 7); } },
  ranbu:    { gap: 130, at: 40, len: 550, hit: (i, dl) => { const r = (R() - .5) * 2.8; playFx('s_slash', { delay: dl, rot: r, flip: R() < .5, size: .85, tint: i % 2 ? '#cfe3ff' : '#ffe0c0', snd: 'w_katana' }); fxArc(dl, '#cfe3ff', 2, r * 1.5, VH * (.2 + R() * .12)); if (i === 4) fxTint(dl + 30, WHITE, .2); shakeAt(dl + 40, 4); } },
  shuriken: { gap: 90, at: 200, len: 300, hit: (i, dl) => { playFx('s_sparkle', { delay: dl, size: .35, tint: '#dce8ff', mv: 'travel', snd: 'swing', vol: .6 }); playFx('s_hit', { delay: dl + 200, size: .3, parts: 3, snd: 'hit1', vol: .5 }); } },
  noroi:    { at: 60, len: 400, hit: (i, dl) => { playFx('s_darkslash', { delay: dl, size: 1.1, rot: 0, flip: true, snd: 'w_dagger' }); playFx('poison', { delay: dl + 100, size: .8, snd: 'poison2' }); fxTint(dl + 60, '#5a2080', .25); shakeAt(dl + 60, 6); } },
  daimahou: { pre: () => { fxDark(0, 2000, .75, '#05030f'); playFx('magic_circle', { y: VH * .78, size: 1.1, parts: 20, snd: 'magic' }); fxRing(300, '#c08cff', .5, 3); fxRing(600, '#ffe08a', .6, 3); sfx('thunder3', { delay: 500, vol: .5, max: 1.5 }); }, wait: 1000, at: 300, len: 1000,
              hit: (i, dl, tg) => { const first = !tg || tg === alive()[0]; if (first) { ['m_fire3', 'm_bolt3', 'm_holy3'].forEach((n, j) => playFx(n, { delay: dl + j * 120, size: 1, snd: j ? null : undefined })); fxTint(dl + 300, WHITE, .6); fxRays(dl + 300, '#ffe08a', 20, .8); fxRing(dl + 300, WHITE, .7, 8); setTimeout(() => { fx.flash = Math.max(fx.flash || 0, .7); }, dl + 300); } shakeAt(dl + 300, 15); } },
  // ---- 守り・補助（自分に） ----
  guard:    { pre: () => playFx('s_shield', { self: true, size: .9, snd: 'buff' }) },
  wall:     { pre: () => { playFx('s_barrier', { self: true, size: 1.2, snd: 'buff' }); fxTint(80, '#6ab8ff', .15); } },
  holyguard:{ pre: () => { playFx('s_barrier', { self: true, size: 1.2, tint: '#fff0c0', snd: 'buff' }); playFx('pray', { self: true, delay: 160, size: .8, snd: 'magic' }); fxTint(160, '#ffe08a', .15); } },
  counter:  { pre: () => { playFx('s_water', { self: true, size: .9, snd: 'swing' }); fxRing(80, '#9fd8ff', .26, 3); } },
  jin2:     { pre: () => { playFx('s_water', { self: true, size: 1.05, snd: 'swing' }); fxRing(80, '#9fd8ff', .26, 3); fxRing(260, '#9fd8ff', .34, 2); } },
  mikiri:   { pre: () => { playFx('s_ghost', { self: true, size: .9, x: VW / 2 - 30, snd: 'miss' }); playFx('afterimage', { self: true, size: .8, snd: null }); } },
  bunshin:  { pre: () => { for (let j = 0; j < 3; j++) playFx('s_ghost', { self: true, delay: j * 90, size: .8, x: VW / 2 + (j - 1) * 70, snd: j ? null : 'dash' }); } },
  hone:     { pre: () => { playFx('s_blade', { self: true, size: .9, snd: 'buff' }); fxSparks(150, '#cfe3ff', 10); } },
  temper:   { pre: () => { playFx('s_blade', { self: true, size: .9, snd: null }); sfx('forge1', { vol: .7 }); playFx('s_sparks', { self: true, delay: 150, size: .7, snd: null }); fxTint(150, '#ff9030', .18); } },
  steal:    { pre: () => { playFx('afterimage', { size: .8, snd: 'dash' }); playFx('s_sparkle', { delay: 260, size: .6, snd: 'hit1', vol: .5 }); fxSparks(260, '#ffd24a', 10); } },
};
// 魔法は派手に（2026-11-25）: 当たる瞬間に、属性の色で画面を光らせる。中は光の筋、大は輪と白い閃光も
function magicFlash(id, dl) {
  const m = /^(fire|ice|bolt|holy|dark)(\d?)$/.exec(id); if (!m) return;
  const el = m[1], t = Number(m[2]) || 1, c = MAGIC_C[el];
  fxTint(dl, c, [.14, .24, .36][t - 1]);
  if (t >= 2) fxRays(dl + 20, c, 10 + t * 2, .45 + t * .08);
  if (t >= 3) { fxRing(dl + 40, c, .5, 6); fxSparks(dl + 40, c, 24); setTimeout(() => { fx.flash = Math.max(fx.flash || 0, .45); }, dl + 30); }
}
// ---------- 武器の強さで足すエフェクト（コードで描く） ----------
// 段階: 銅・骨・魔石=1、鉄=2、銀=3、ミスリル=4、オリハルコン・竜=5。金床の+2ごとに1段上がる
const W_COLOR = { darksteel: '#b45cff', dragon: '#ff5a2a', royal: '#ffd24a', treasure: '#ffe98a', copper: '#ff9a4a', bone: '#f0e2c0', stone: '#c08cff', iron: '#d6e8ff', silver: '#9ff6ff', mithril: '#7dffb0', orichalcum: '#ffd24a', dragon: '#ff5a5a' };
function weaponTier(w) {
  if (!w) return { tier: 0, c: '#ffffff' };
  const mat = Object.keys(W_COLOR).find(m => (w.id || '').startsWith(m)) || 'copper', base = { darksteel: 4, royal: 4, treasure: 5, copper: 1, bone: 1, stone: 1, iron: 2, silver: 3, mithril: 4, orichalcum: 5, dragon: 5 }[mat];
  const plus = +(((w.name || '').match(/\+(\d+)/) || [])[1] || 0);
  return { tier: Math.min(5, base + Math.floor(plus / 2)), c: W_COLOR[mat] };
}
function codeFx(dl, dur, fn) { fxList.push({ code: fn, t0: performance.now() + dl, dur }); }
const easeOut = k => 1 - Math.pow(1 - k, 3);
// 光る弧（斬る武器）
function fxArc(dl, c, w, rot, r0) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .5, r = r0 || VH * .32;
  codeFx(dl, 330, k => {
    const sweep = Math.min(1, k / .45), a = k < .45 ? 1 : 1 - (k - .45) / .55, a0 = rot - 1.1, a1 = a0 + 2.2 * easeOut(sweep);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [lw, al] of [[w * 3, .18], [w * 1.6, .35], [w, .9]]) { ctx.globalAlpha = a * al; ctx.strokeStyle = lw === w ? '#ffffff' : c; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke(); }
  });
}
// 広がる輪（打つ武器・衝撃）
function fxRing(dl, c, size, w) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .6;
  codeFx(dl, 480, k => { const e = easeOut(k); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * .85; ctx.strokeStyle = c; ctx.lineWidth = (w || 4) * (1 - k * .6);
    ctx.beginPath(); ctx.ellipse(x, y, VH * size * e, VH * size * e * .42, 0, 0, 7); ctx.stroke(); });
}
// 放射する光の筋
function fxRays(dl, c, n, len) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .5, off = R() * 6;
  codeFx(dl, 420, k => { const e = easeOut(k); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * .8; ctx.strokeStyle = c; ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2, r1 = VH * .06 + VH * len * e * .4, r2 = VH * .08 + VH * len * e; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke(); } });
}
// 画面全体の色の光
function fxTint(dl, c, al) { codeFx(dl, 260, k => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * al; ctx.fillStyle = c; ctx.fillRect(0, 0, VW, VH); }); }
// 火花（粒）
function fxSparks(dl, c, n) {
  const x = FX_AT && FX_AT.cx !== undefined ? FX_AT.cx : VW / 2, y = VH * .52;
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, sp = 60 + R() * 160; fxParts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, c, t0: performance.now() + dl, life: 300 + R() * 500, r: 1 + R() * 1.6, add: true }); }
}
// 武器の段階に合わせて、上に重ねる
function weaponTierFx(type, w) {
  const { tier, c } = weaponTier(w); if (tier < 2) return;
  const slash = ['sword', 'katana', 'greatsword', 'dagger', 'axe'].includes(type), hit = { katana: 200, greatsword: 140, bow: 270, book: 180 }[type] || 0;
  // 段階2（鉄）: 色の光る筋と火花
  if (slash) fxArc(hit, c, type === 'greatsword' || type === 'axe' ? 5 : 3, type === 'katana' ? 0 : R() < .5 ? -.6 : .6 + Math.PI);
  else fxRing(hit, c, .28, 3);
  fxSparks(hit, c, 10 + tier * 6);
  // 段階3（銀）: 衝撃の輪
  if (tier >= 3) fxRing(hit + 40, c, .4, 4);
  // 段階4（ミスリル）: 光の筋が放射し、二の太刀の残像
  if (tier >= 4) { fxRays(hit + 60, c, 10, .5); if (slash) fxArc(hit + 120, '#ffffff', 2, R() * Math.PI * 2, VH * .26); }
  // 段階5（オリハルコン・竜）: 画面が武器の色に光り、大きく揺れる
  if (tier >= 5) { fxTint(hit, c, .35); fxRing(hit + 80, '#ffffff', .6, 6); setTimeout(() => { fx.shake = Math.max(fx.shake || 0, 12); }, hit); }
}
// ふつうの攻撃: 武器の種類ごとに、絵の重ね方・大きさ・揺れで手ごたえを変える
function weaponFx(type) {
  weaponTierFx(type, mainWeapon());
  { const w = mainWeapon(); if (w && w.fire) { playFx('fire_s', { delay: 160, size: .75, vol: .6 }); fxSparks(160, '#ff8a3d', 14); } }  // 竜の武器は炎が乗る
  { const e = MK().elem; const E = { fire: ['m_fire1', '#ff8a3d'], ice: ['m_ice1', '#8fd8ff'], bolt: ['m_bolt1', '#ffe14a'], holy: ['m_holy1', '#fff0b0'], dark: ['m_dark1', '#b45cff'] }[e];
    if (E) { playFx(E[0], { delay: 150, size: .6, vol: .55 }); fxSparks(150, E[1], 12); } }  // 名品の属性
  const shake = (n, d) => setTimeout(() => { fx.shake = Math.max(fx.shake || 0, n); }, d || 0);
  // 音: 剣=剣で斬る 刀=刀で斬る 大剣・斧=大剣で斬る 槌=重いパンチ ダガー=素振り×2 弓=弓矢 魔導書=魔法陣 杖=打撃
  switch (type) {
    case 'sword': playFx(R() < .5 ? 'slash_h' : 'slash_v', { size: 1 }); shake(3); break;
    case 'katana': sfx('swing', { vol: .5 }); playFx('iai', { delay: 200, size: 1.25, rot: 0, snd: 'w_katana' }); playFx('spark', { delay: 300, size: .55, parts: 8, snd: null }); shake(5, 220); break;  // 一瞬ためて、横一閃
    case 'greatsword': playFx('slash_v', { size: 1.4, slow: 1.2, rot: 0, snd: 'heavy' }); playFx('impact_heavy', { delay: 140, size: .85, vol: .6 }); shake(10, 140); break;
    case 'axe': playFx('impact_heavy', { size: 1.3, snd: 'w_axe' }); playFx('rocks', { delay: 80, size: .7, vol: .5 }); shake(11); break;
    case 'hammer': playFx('impact_heavy', { size: 1.15 }); playFx('spark', { delay: 60, size: .8, parts: 22, vol: .7 }); shake(8); break;
    case 'dagger': playFx('slash_h', { size: .7, rot: -.6, snd: 'w_dagger' }); playFx('slash_h', { delay: 130, size: .7, rot: .6, parts: 6, snd: 'w_dagger' }); shake(2); shake(2, 130); break;
    case 'bow': playFx('arrow', { size: .85 }); playFx('impact', { delay: 270, size: .5, parts: 6, vol: .6 }); shake(3, 270); break;
    case 'book': playFx('magic_circle', { y: VH * .78, size: .55, parts: 6 }); playFx('magic_arrow', { delay: 180, size: .8, snd: null }); shake(3, 400); break;
    case 'staff': playFx('impact', { size: .95 }); playFx('sparkle', { delay: 90, size: .6, parts: 10, snd: null }); shake(4); break;
    default: playFx('impact', { size: .9, snd: 'punch' }); shake(4);
  }
}
function skillFx(id) {
  let list = SKILL_FX[id];
  if (id === 'attack') { const w = mainWeapon(); weaponFx(w ? w.type : null); return; }
  if (!list) return;
  const self = ['heal', 'guard', 'wall', 'holyguard', 'counter', 'mikiri', 'hone', 'bunshin'].includes(id);
  list.forEach((e, i) => {
    const [n, dl, sz] = Array.isArray(e) ? e : [e, i * 160];
    playFx(n, { delay: dl, self: self || (n === 'heal' || n === 'blessing'), size: sz || (/^m_\w+1$/.test(n) ? .7 : /^m_\w+2$/.test(n) ? 1.15 : /^m_\w+3$/.test(n) ? 1.75 : undefined) });
  });
}
// 群れの並び方: 横に並べて、数が多いほど小さく。真ん中は少し奥
// 絵の左右は画面からはみ出す（見えるのは横の真ん中 76% ほど）ので、その内側に並べる
const SLOT = { 1: [[.5, 1, 0]], 2: [[.36, .8, 0], [.64, .8, 0]], 3: [[.27, .66, .02], [.5, .62, -.05], [.73, .66, .02]], 4: [[.22, .54, .02], [.407, .5, -.05], [.593, .5, -.05], [.78, .54, .02]] };
function slotOf(i) { const L = SLOT[B.ms.length] || SLOT[1]; return L[i] || L[0]; }
function drawMonsterImg(m, t, i) {
  const A = m.anim || {}, dt = t - (A.t0 || -1e9), [px, sc, dy] = slotOf(i || 0);
  let pose = 'idle', sx = 1, sy = 1, ox = 0, oy = 0, white = 0, alpha = 1;
  // 待機: ゆっくり呼吸
  sy = 1 + Math.sin(t / 420) * .015; sx = 1 - Math.sin(t / 420) * .008;
  if (A.kind === 'attack' && dt < 480) { pose = 'attack'; const k = Math.sin(Math.min(1, dt / 480) * Math.PI); sx *= 1 + k * .14; sy *= 1 + k * .14; oy = k * 10; }
  if (A.kind === 'hit' && dt < 360) { pose = 'hit'; const k = 1 - dt / 360; ox = Math.sin(dt / 25) * 5 * k; oy = -4 * k; white = dt < 90 ? .75 : 0; }
  if (m.charge && !m.dying) { sy *= 1.04; oy -= 3 + Math.sin(t / 90) * 1.5; }
  if (m.dying && t >= m.dying) { const d = Math.min(1, (t - m.dying) / 700); pose = 'hit'; alpha = 1 - d; oy = d * 18; sy *= 1 - d * .25; white = d < .2 ? .6 : 0; }
  const img = (monImg(m, pose) && monImg(m, pose).complete && monImg(m, pose).naturalWidth ? monImg(m, pose) : null) || monImg(m, 'idle');
  // 大きさ（2026-11-25）: 10階ごとの主がいちばん大きい（足元は切れてよい）。番人などのボスは、ふつうの魔物よりひとまわり大きい。頭は名前の帯の下に収める
  const main = m.boss && !m.mirror && !m.trial && floorNo % 10 === 0, mid = m.boss && !m.mirror && !main;
  const by = VH * ((main ? 1.12 : mid ? .97 : .93) + dy) + oy, base = VH * (m.size || .7) * sc;
  const H = main ? Math.min(base * 1.3, by - oy - VH * .10, VW * 1.02 * img.height / img.width) : mid ? Math.min(base * .98, by - oy - VH * .14, VW * .9 * img.height / img.width) : base, W = H * img.width / img.height, cx = VW * px + ox; m.cx = VW * px; m.top = by - H;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, by - 2, W * .38, 8, 0, 0, 7); ctx.fill();
  ctx.imageSmoothingEnabled = true;
  if (m.mirror) {  // 鏡: 鏡の枠（assets/monsters/the_mirror）の中に、自分の姿を左右反転して青白く写す。ゆらゆら揺らぐ。鏡は割れない
    const fr = MIRROR_FRAME.complete && MIRROR_FRAME.naturalWidth ? MIRROR_FRAME : null;
    let ovx = cx, ovy = by - H * .5, orx = W * .4, ory = H * .5;
    if (fr) {
      const FH = VH * .96, FW = FH * fr.width / fr.height, fx = VW * px - FW / 2, fy = VH * .97 - FH;
      ovx = fx + FW * .5; ovy = fy + FH * .473; orx = FW * .241; ory = FH * .29;
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(VW * px, VH * .96, FW * .42, 9, 0, 0, 7); ctx.fill();
      ctx.drawImage(fr, fx, fy, FW, FH); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.ellipse(ovx, ovy, orx, ory, 0, 0, 7); ctx.clip();
      ctx.fillStyle = 'rgba(20,30,60,.55)'; ctx.fillRect(ovx - orx, ovy - ory, orx * 2, ory * 2);
    }
    // 写る姿は、鏡の楕円の中に収める
    const rH = ory * 1.9, rW = rH * img.width / img.height, rby = ovy + ory * .98; m.top = ovy - ory;
    if (!drawMonsterImg.mc) drawMonsterImg.mc = document.createElement('canvas');
    const o = drawMonsterImg.mc; o.width = img.width; o.height = img.height; const g = o.getContext('2d');
    g.clearRect(0, 0, o.width, o.height); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(120,170,255,.38)'; g.fillRect(0, 0, o.width, o.height); g.globalCompositeOperation = 'source-over';
    const wob = Math.sin(t / 260) * 2;
    ctx.save(); ctx.translate(cx + wob, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0);
    ctx.drawImage(o, cx - rW * sx / 2, rby - rH * sy, rW * sx, rH * sy);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (.15 + .1 * Math.sin(t / 180)); ctx.drawImage(o, cx - rW * sx / 2 + 3, rby - rH * sy, rW * sx, rH * sy);
    ctx.restore();
    if (fr) {  // ガラスのつや（鏡の絵を薄く重ねる）
      const FH = VH * .96, FW = FH * fr.width / fr.height, fx = VW * px - FW / 2, fy = VH * .97 - FH;
      ctx.globalAlpha = .28 + .06 * Math.sin(t / 700); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(fr, fx, fy, FW, FH); ctx.globalCompositeOperation = 'source-over'; ctx.restore();
    }
  } else ctx.drawImage(img, cx - W * sx / 2, by - H * sy, W * sx, H * sy);
  if (white > 0 && !m.mirror) { // 当たった瞬間に白く光らせる（鏡は枠ごと光らせない）
    if (!drawMonsterImg.c) drawMonsterImg.c = document.createElement('canvas');
    const o = drawMonsterImg.c; o.width = img.width; o.height = img.height; const g = o.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height);
    ctx.globalAlpha = white * alpha; ctx.drawImage(o, cx - W * sx / 2, by - H * sy, W * sx, H * sy);
  }
  if (m.charge && !m.dying && !m.mirror) {  // 力をためている: 赤く脈打って、頭の上に「！」
    if (!drawMonsterImg.rc) drawMonsterImg.rc = document.createElement('canvas');
    const o = drawMonsterImg.rc; o.width = img.width; o.height = img.height; const g = o.getContext('2d');
    g.clearRect(0, 0, o.width, o.height); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ff2a10'; g.fillRect(0, 0, o.width, o.height); g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = (.18 + .16 * (1 + Math.sin(t / 140)) / 2) * alpha; ctx.drawImage(o, cx - W * sx / 2, by - H * sy, W * sx, H * sy);
    ctx.globalAlpha = alpha; const fs = Math.round(Math.max(28, H * .17)), ey = Math.max(36 + fs, by - H * sy + fs * 1.1) + Math.sin(t / 160) * 3, ex = cx + W * sx * .3;
    ctx.font = `900 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#2a0500'; ctx.strokeText('！', ex, ey); ctx.fillStyle = '#ff5a2a'; ctx.fillText('！', ex, ey);
  }
  ctx.restore();
}
// 敵の名前とHP。1体なら上の真ん中、群れならそれぞれの上。狙っている敵には ▼
const MIRROR_FRAME = new Image(); MIRROR_FRAME.src = 'assets/monsters/the_mirror.webp';
function drawMonsterBars(t) {
  const n = B.ms.length, tg = target();
  B.ms.forEach((m, i) => {
    if (m.hp <= 0) return;
    const w = n === 1 ? 120 : n === 2 ? 76 : n === 3 ? 62 : 50, cx = n === 1 ? VW / 2 : VW * slotOf(i)[0], y = 6;
    const x = cx - w / 2;
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(x - 4, y - 2, w + 8, 24);
    if (n > 1 && m === tg && !B.over) { ctx.strokeStyle = '#ffc069'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 2, w + 8, 24); }
    ctx.fillStyle = '#efe3cc'; ctx.font = (n > 3 ? '8px' : n > 2 ? '9px' : '11px') + ' Dot, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tr(m.name), cx, y + 10);
    ctx.fillStyle = '#3a1410'; ctx.fillRect(x, y + 14, w, 5); ctx.fillStyle = '#d9553f'; ctx.fillRect(x, y + 14, w * Math.max(0, m.hp) / m.mhp, 5);
    if (n > 1 && m === tg && !B.over && m.top !== undefined) { const b = Math.sin(t / 180) * 2; ctx.fillStyle = '#ffc069'; ctx.beginPath(); ctx.moveTo(cx - 6, m.top - 10 + b); ctx.lineTo(cx + 6, m.top - 10 + b); ctx.lineTo(cx, m.top - 2 + b); ctx.fill(); }
  });
}
// 画像がないときの仮の形
function drawMonsterShape(m, t) {
  const cx = VW / 2, by = VH * .86, bob = Math.sin(t / 300) * 2, sc = m.boss ? 1.5 : 1;
  ctx.save(); ctx.translate(cx, by + bob); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 0, 50, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = m.color; ctx.strokeStyle = '#120c08'; ctx.lineWidth = 3;
  const eye = (x, y) => { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillStyle = m.color; };
  ctx.beginPath();
  if (m.id === 'rat') { ctx.ellipse(0, -22, 40, 22, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(34, -30, 16, 12, 0, 0, 7); ctx.fill(); ctx.stroke(); eye(40, -33); }
  else if (m.id === 'skeleton') { ctx.fillRect(-8, -110, 16, 80); ctx.strokeRect(-8, -110, 16, 80); ctx.beginPath(); ctx.arc(0, -125, 18, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#120c08'; ctx.fillRect(-9, -130, 6, 6); ctx.fillRect(3, -130, 6, 6); ctx.fillStyle = m.color; ctx.fillRect(-30, -100, 60, 8); ctx.fillRect(-14, -30, 8, 30); ctx.fillRect(6, -30, 8, 30); }
  else if (m.id === 'goblin') { ctx.ellipse(0, -45, 28, 40, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -98, 22, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-20, -104); ctx.lineTo(-44, -116); ctx.lineTo(-18, -94); ctx.moveTo(20, -104); ctx.lineTo(44, -116); ctx.lineTo(18, -94); ctx.fill(); eye(-8, -100); eye(8, -100); }
  else if (m.id === 'centipede') { for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-50 + i * 20, -20 - Math.sin(t / 200 + i) * 6 - i * 6, 14, 0, 7); ctx.fill(); ctx.stroke(); } eye(52, -58); }
  else { ctx.fillRect(-50, -150, 100, 110); ctx.strokeRect(-50, -150, 100, 110); ctx.fillRect(-80, -140, 30, 90); ctx.fillRect(50, -140, 30, 90); ctx.fillRect(-40, -40, 30, 40); ctx.fillRect(10, -40, 30, 40); ctx.fillStyle = '#ffb040'; ctx.fillRect(-25, -125, 14, 8); ctx.fillRect(11, -125, 14, 8); }
  ctx.restore();
  // HPバー
  const w = 120, x = cx - w / 2, y = 14;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 2, y - 2, w + 4, 10); ctx.fillStyle = '#d9553f'; ctx.fillRect(x, y, w * Math.max(0, m.hp) / m.mhp, 6);
  ctx.fillStyle = '#efe3cc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tr(m.name), cx, y + 20);
}

// ---------- 町の絵（仮） ----------
function drawTown(t) {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#2a3550'); g.addColorStop(.6, '#c98a5a'); g.addColorStop(1, '#3a2a20');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.moveTo(140, VH); ctx.lineTo(150, 10); ctx.lineTo(170, 10); ctx.lineTo(180, VH); ctx.fill();
  for (let i = 0; i < 9; i++) ctx.fillRect(130 + (i % 2) * 4, VH - 20 - i * 24, 60 - (i % 2) * 8, 3);
  ctx.fillStyle = '#120d0a'; for (let i = 0; i < 8; i++) { const x = i * 42 - 10, h = 40 + hash(i, 1, 3) * 40; ctx.fillRect(x, VH - h, 36, h); ctx.beginPath(); ctx.moveTo(x - 4, VH - h); ctx.lineTo(x + 18, VH - h - 18); ctx.lineTo(x + 40, VH - h); ctx.fill(); }
  ctx.fillStyle = '#ffb35a'; for (let i = 0; i < 8; i++) { if (hash(i, 2, 5) < .6) ctx.fillRect(i * 42 + 2, VH - 30, 6, 6 + Math.sin(t / 400 + i) * .5); }
  ctx.fillStyle = 'rgba(255,190,110,.85)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(tr('塔の国　鍛冶屋の工房'), 8, 18);
}

// ---------- ループ ----------
function loop(t) {
  if (mode === 'dungeon' || mode === 'battle') {
    const k = .2; P.x += (T.x - P.x) * k; P.y += (T.y - P.y) * k; P.a += (T.a - P.a) * k;
    if (busy && Math.abs(T.x - P.x) < .01 && Math.abs(T.y - P.y) < .01 && Math.abs(T.a - P.a) < .01) { P.x = T.x; P.y = T.y; P.a = T.a; busy = false; }
    if (TEX.ready && F) renderView(ctx, F, P, t, mode === 'battle' ? .5 : 1);
    if (mode === 'battle' && B && B.ms) { B.ms.forEach((m, i) => { if (m.hp > 0 || (m.dying && t - m.dying < 700)) drawMonster(m, t, i); }); drawMonsterBars(t); }
    if (mode === 'battle' || mode === 'dungeon') drawFx();
    if (F) { mapCv.style.display = mode === 'battle' ? 'none' : ''; renderMap(mapCtx, F, P); }
  } else { mapCv.style.display = 'none'; }
  if (fx.flash > .02) { ctx.fillStyle = `rgba(255,60,40,${fx.flash * .35})`; ctx.fillRect(0, 0, VW, VH); fx.flash *= .85; }
  if (fx.hit > .02) { ctx.fillStyle = `rgba(255,255,255,${fx.hit * .25})`; ctx.fillRect(0, 0, VW, VH); fx.hit *= .7; }
  if (fx.shake > .3) { const q = fx.shake * ([0, .5, 1, 1.4][OPTS.shake] ?? 1); cv.style.transform = q ? `translateX(-50%) translate(${(R() - .5) * q}px,${(R() - .5) * q}px)` : ''; fx.shake *= .8; } else cv.style.transform = '';
  requestAnimationFrame(loop);
}

// 戦闘: 魔物を押すと、狙う相手を変える（群れのとき）
$('view').addEventListener('click', e => {
  if (mode !== 'battle' || !B || !B.ms || B.ms.length < 2 || B.over) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * VW;
  let best = -1, bd = 1e9; B.ms.forEach((m, i) => { if (m.hp > 0 && m.cx !== undefined && Math.abs(m.cx - x) < bd) { bd = Math.abs(m.cx - x); best = i; } });
  if (best >= 0 && best !== B.ti) { B.ti = best; sfx('select', { vol: .5 }); log(`${B.ms[best].name}を狙う。`, true); }
});
// ---------- 入力 ----------
addEventListener('keydown', e => {
  const m = { ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'tl', ArrowRight: 'tr', a: 'sl', d: 'sr', w: 'f', s: 'b' }[e.key];
  if (m && mode === 'dungeon') { e.preventDefault(); act(m); }
});
let ts = null; const view = $('view');
view.addEventListener('pointerdown', e => { ts = e.target.id === 'map' ? null : [e.clientX, e.clientY]; });
view.addEventListener('pointerup', e => {
  if (!ts || mode !== 'dungeon') return; const dx = e.clientX - ts[0], dy = e.clientY - ts[1]; ts = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { if ($('map').classList.contains('big')) { $('map').classList.remove('big'); return; } act('f'); return; }
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'tr' : 'tl') : (dy < 0 ? 'f' : 'b'));
});

// ---------- 開始 ----------
loadTextures('stone').then(() => { hud(); });
titleScreen();
requestAnimationFrame(loop);

// 音のオンオフ（右上の♪）
applyOpts();
{ const c = document.getElementById('cfg'); if (c) c.addEventListener('click', e => { e.stopPropagation(); sfx('select', { vol: .5 }); openMenu(); }); }
{ const b = document.getElementById('snd'); if (b) { b.classList.toggle('off', !SND.on); b.addEventListener('click', e => { e.stopPropagation(); b.classList.toggle('off', !SND.toggle()); }); } }

// 塔の中: 地図を押すと大きくなる（もう一度押すか、画面を押すと戻る）
(() => {
  const mp = $('map');
  mp.addEventListener('click', e => { e.stopPropagation(); mp.classList.toggle('big'); });
})();
