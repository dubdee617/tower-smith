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
  items: { herb: 3, herb_m: 0, herb_l: 0, wing: 1, bandage: 0, bird: 0, ward: 0, lure: 0 },
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

function save() { try { localStorage.setItem('tower_smith_v2', JSON.stringify(G)); } catch (e) {} }
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
function job() {
  const w = mainWeapon(); if (!w) return '素手';
  const ups = uppersFor(w.type);
  if (ups.length) { const pick = ups.find(u => u.job === G.upperPick[w.type]); return (pick || ups.sort((a, b) => (G.prof[b.exp] || 0) - (G.prof[a.exp] || 0))[0]).job; }
  return WEAPON_TYPES[w.type].job;
}
const isHeavy = () => { const w = mainWeapon(); return !!(w && WEAPON_TYPES[w.type].heavy); };
const canOneHand = t => (G.prof[t] || 0) >= ONE_HAND_NEED;
function atkPower() {
  let a = G.atk; const r = gearBy(G.equip.r), l = gearBy(G.equip.l);
  if (r && r.atk) a += r.atk;
  if (l && l.atk) a += l.type === 'shield' ? l.atk : Math.ceil(l.atk * .5); // 左手の武器は半分
  if (has('p_atk')) a += 3;
  if (hurt('arm')) a = Math.floor(a * .8);
  return a;
}
function defPower() { let d = G.def; for (const k of ['l', 'armor']) { const g = gearBy(G.equip[k]); if (g && g.def) d += g.def; } if (has('p_def')) d += 3; return d; }
// そのジョブで覚える技のうち、勝利数が足りたものを覚える
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
const expNeed = () => Math.floor(10 * Math.pow(G.lv, 1.5));
const matText = o => Object.entries(o).filter(([, n]) => n > 0).map(([k, n]) => NAMES[k] + n).join(' ') || 'なし';
function add(o, k, n) { o[k] = (o[k] || 0) + n; }

// ---------- 画面の文字 ----------
let logLines = [];
let logFace = null;
// セリフ欄の顔は主人公だけ。町の人が話すときは、セリフ欄の外に枠なしで顔を出す（#spk）
let spkFace = null;
function drawLog() {
  const el = $('log'); el.innerHTML = ''; el.classList.toggle('hasface', !!logFace);
  if (logFace) { const i = document.createElement('img'); i.className = 'face'; i.src = `assets/jobs/face_${logFace}.png`; i.alt = ''; el.appendChild(i); }
  const s = document.createElement('div'); s.textContent = logLines.join('\n'); el.appendChild(s);
  drawSpk();
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
  '助手': { id: 'apprentice', laugh: 3, smile: 1, shock: 9 },  // 工房の見習い（ただのNPC）
  'ブッパ': { id: 'buppa', normal: 'sleep', sleep: 'sleep', shock: 'shock', laugh: 'laugh', angry: 'grumpy', grumpy: 'grumpy', eat: 'eat', tired: 'tired' },  // たまにいる居候
  '砂の女神': { id: 'desert', laugh: 4 }, '森の女神': { id: 'forest', laugh: 4 }, '花の女神': { id: 'druid', laugh: 3 }, '山の女神': { id: 'mountain', laugh: 5, smile: 1, angry: 11, think: 12 }, '氷の女神': { id: 'ice', laugh: 4 },
  'チッチ': { id: 'chicchi', smile: 1, laugh: 3, shock: 18, angry: 7, think: 15, shy: 11 },  // 工房の居候
  '客': { id: 'bar', noFace: true },  // 酒場の客（顔はなく、立ち絵だけ）
  'ボルツ': { id: 'craft', smile: 2, laugh: 1, shock: 12, angry: 3, think: 5 },  // ギルドの加工職人
};
const NPC_FACE = { normal: 0, smile: 1, laugh: 3, shock: 5, angry: 6, think: 11 };
function log(t, clear) {
  if (clear) { logLines = []; logFace = null; spkFace = null; }
  const m = /^([^\s「\[]+)(?:\[(\w+)\])?「/.exec(t);
  if (m && NPCS[m[1]] && NPCS[m[1]].noFace) { /* 顔なし */ }
  else if (m && NPCS[m[1]]) { const n = NPCS[m[1]], e = m[2] || 'normal'; t = t.replace(/^([^\[「]+)\[\w+\]/, '$1'); if (clear || !spkFace) { const v = n[e] !== undefined ? n[e] : NPC_FACE[e] || 0; spkFace = `npc/${n.id}_${typeof v === 'string' ? v : String(v).padStart(2, '0')}`; logFace = null; } figTalk(n.id); }
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
buttons.tab = {}; buttons.pg = {};
function buttons(list, cls) {
  const box = $('ctl'); box.innerHTML = '';
  // 主人公の立ち絵は、その画面で jobScene がもう一度呼ばれなければ消す
  for (const f of document.querySelectorAll('.fig[data-who="hero"], .status')) { f.dataset.stale = '1'; setTimeout(() => { if (f.dataset.stale) f.remove(); }, 0); }
  const isTail = b => !b.title && (b.tail || TAIL_T.includes(b.t));
  const tail = list.filter(isTail), body = list.filter(b => !isTail(b));
  const top = [], secs = []; let lead = null;
  for (const b of body) { if (b.title) secs.push({ title: b.title, items: [] }); else if (secs.length) secs[secs.length - 1].items.push(b); else top.push(b); }
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
    box.appendChild(row); head = secs[k].title; shown = [...top, ...secs[k].items];
  } else { shown = []; for (const b of body) shown.push(b); }
  const n = shown.filter(b => !b.title).length;
  if (!cls) cls = n > 6 ? 'three small' : n === 3 ? 'three' : n === 1 ? 'one' : '';
  if (cls === 'list') cls = 'list';
  const per = cls.includes('three') ? 9 : 6, pk = key + '#' + (tabbed ? buttons.tab[key] || 0 : '') + '#' + shown.length;
  let pages = 1, pg = 0, items = shown;
  if (n > per + (tail.length ? 0 : 1)) {
    const flat = shown.filter(b => !b.title); pages = Math.ceil(flat.length / per); pg = Math.min(buttons.pg[pk] || 0, pages - 1);
    items = flat.slice(pg * per, pg * per + per); if (!head) { const t = shown.find(b => b.title); if (t) head = t.title; }
  }
  const mk = (b, wrap) => {
    const el = document.createElement('button'); el.innerHTML = b.t + (b.s ? `<small>${b.s}</small>` : '');
    el.addEventListener('click', () => sfx('select', { vol: .5 }), { capture: true });
    if (b.off) el.disabled = true; if (b.hot) el.className = 'hot'; if (b.cls) el.classList.add(b.cls);
    const move = !b.stay && (b.go || b.f === townMap || ['入る', '外に出る', '町へ', '工房へ'].includes(b.t));
    el.onclick = () => { if (move) fadeGo(() => b.f()); else { b.f(); hud(); } }; wrap.appendChild(el); return el;
  };
  if (head) { const h = document.createElement('h2'); h.textContent = head; box.appendChild(h); }
  const wrap = document.createElement('div'); wrap.className = 'btns' + (cls ? ' ' + cls : '');
  for (const b of items) {
    if (b.title) { const h = document.createElement('h2'); h.textContent = b.title; h.style.gridColumn = '1/-1'; wrap.appendChild(h); continue; }
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
}
// 暗転: 画面を一度黒くしてから切り替える。場所が変わるとき・工房で何かを作るとき
// o.text: 黒い画面に出す文字（「制作中」など） o.hold: 黒いままにする時間 o.walk: 町を歩く足音 o.sfx: [[音, 遅らせるms]]
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
  if (COVER) h = document.body.classList.contains('intro') ? H : Math.min(H, W * 1.25);
  else if (dg) h = Math.min(H, Hdg, W * .98);  // 塔の中: 4:3の絵の左右を少し落として、縦を大きく見せる
  else { h = w / ASPECT; if (h > H) { h = H; w = h * ASPECT; } }
  el.style.width = Math.floor(w) + 'px'; el.style.height = Math.floor(h) + 'px'; s.style.height = Math.floor(h) + 'px';
  ctl.style.flex = '';
}
new ResizeObserver(() => fitStage()).observe(document.querySelector('main'));

// ---------- 町 ----------
// 地図を押す → 施設の外観（入る／戻る） → 中に入ると内装とメニュー
const TOWN_IMG = 'assets/town/';
const PLACES = {
  home:   { name: '工房（自宅）', box: [300, 45, 440, 160], hello: ['アルス「師匠、おかえりなさい！ 今日の名言、まだですか」', 'チッチ「掃除しといたっす。あ、炉の火は落としてないっす」', 'チッチ[laugh]「親方の剣、磨いといたっす！ ……盗んでないっすよ？」', 'チッチ[shy]「アルス君に『チッチさんの料理、最高です』って言われたっす。……照れるっす」', 'チッチ[think]「鍵なら開けられるっす。心の鍵？ ……知らないっす」', '床に獲物が置いてある。オルグだろう。'] },
  weapon: { name: '武具屋', box: [25, 180, 185, 275], hello: ['ジェニー「打ったの見せて。値段はあたしが決める」', 'ジェニー[laugh]「叩けば直る。人生以外は」',
    'ジェニー「また来たの？ ……別に、待ってないけど」\n「そうか。じゃあ売ったらすぐ帰る」', 'ジェニー[angry]「塔で死んだら、誰があたしの店に武器を卸すのよ。……そういう意味だからね」\n「ああ、商売の話か。分かってる」'] },
  clinic: { name: '治療院', box: [40, 45, 165, 145], hello: ['エリー[smile]「あ、おかえりなさい！ 今日はケガしてませんか？」', 'エリー「神様はちゃんと聞いてますよ。……たまに返事が遅いだけで」',
    'エリー[smile]「これ、お守りです。手作りなんですけど……」\n「ありがとう。治療院の新しい商品か？」', 'エリー「無茶しないでくださいね。……わたし、毎晩お祈りしてるんですから」\n「神様も忙しいだろうに、悪いな」'] },
  guild:  { name: 'ギルド', box: [20, 285, 195, 405], hello: ['ジロ「ゴローが、今日の塔は機嫌が悪いって言ってる」', 'リア「最高到達記録は86階。近衛兵長のギャバンさんの記録です」', 'リア[smile]「依頼はまだ準備中です。……もう少し待っててくださいね」',
    'リア「あなたの到達記録は、毎回わたしが書いてます。……ほかの人のは新人に任せてますけど」\n「そうか、大変だな」', 'リア[smile]「記録を更新したら、お祝いしましょうか。……ふたりで」\n「いいな。ギルドのみんなも呼ぼう」', 'ボルツ[laugh]「旦那！ 戦利品があるなら奥に回してくれ。加工は俺の仕事だ」'] },
  item:   { name: '道具屋', box: [295, 180, 440, 275], hello: ['ドーラ「薬草は多めに持っていきな。塔の中じゃ買えないよ」', 'ドーラ[laugh]「若いの、いや若くもないか。死ぬんじゃないよ」'] },
  bank:   { name: '銀行', box: [320, 285, 440, 395], hello: ['ベルナルド「お預かりしたお金は、塔の中で倒れても無事です」', 'ベルナルド[think]「お金は裏切りません。人と違って」'] },
  inn:    { name: '宿屋', box: [280, 400, 445, 520], hello: ['ガストン「素材を持ってきな。うまく料理してやるよ」'] },
  tower:  { name: '塔', box: [185, 0, 285, 66], hello: ['門番「塔へ行くのかい。86階より上には、誰も行ったことがないよ」', '見上げても、てっぺんは雲の中だ。'] },
  statue: { name: '剣士の像', box: [195, 250, 275, 345], hello: ['広場の真ん中に、旗を掲げた剣士の像が立っている。', '像の足元で、子どもたちが「塔ごっこ」をして遊んでいる。'] },
  south:  { name: '街の門', box: [150, 530, 320, 665], hello: ['門番「外の国へ行くのかい？ ……いや、あんたの用は塔だろう」'] },
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
    [10, ['エリー[smile]「10階の主を……！ みんな驚いてましたけど、わたしは信じてましたよ」']],
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
const HELPER = ['助手[smile]「親方、炉の温度、上げておきました！」', '助手[laugh]「見てください、初めて釘がまっすぐ打てました！」', '助手「チッチさんに、鍵の開け方を教わってます。……鍛冶に関係ないですけど」', '助手[laugh]「アルスさん、また素振りしてますね。すごいなぁ」'];
function greet(id) {
  if (id === 'home') { const v = homeVisit(); if (v && R() < .8) return v; if (buppaHere() && R() < .6) return pick(BUPPA); if (R() < .3) return pick(HELPER); }
  { const w = SHOP_WHO[id]; if (w && (G.seen || {})[w] && R() < .55) return pick(CLOSE_GREET[w]); }
  const st = STAGE[id], base = PLACES[id].hello;
  if (!st) return pick(base);
  let tier = st[0][1]; for (const [n, L] of st) if (G.maxFloor >= n && (n < 10 || G.bossDown)) tier = L;  // 10階の段は、10階の主を倒してから
  return R() < .6 ? pick(tier) : pick(base);
}
const MAT_PRICE = { copper: 6, iron: 15, bone: 4, leather: 5, stone: 12, wood: 7 };
const pick = a => a[Math.floor(R() * a.length)];
let place = null;

function showTown(on, aspect) { document.body.classList.remove('story', 'title', 'intro'); if ($('town')) $('town').onclick = null; $('town').style.display = on ? 'block' : 'none'; $('view').style.display = on ? 'none' : 'block'; ASPECT = aspect || (on ? 2 / 3 : 4 / 3); COVER = on && (aspect === 4 / 3 || aspect === 0); spkFace = null; drawSpk(); fitStage(); }
function rollRumor() { const k = Object.keys(RUMORS); G.rumor = k[Math.floor(R() * k.length)]; }
function startRun() { G.runHp = has('p_hp') ? 20 : 0; G.mhp += G.runHp; G.hp += G.runHp; }
function endRun() { G.mhp -= G.runHp || 0; G.hp = Math.min(G.hp, G.mhp); G.runHp = 0; }
function endMeal() { if (G.meal === 'stew') { G.mhp -= 10; G.hp = Math.min(G.hp, G.mhp); } G.meal = null; }
function toTown(msg, fromTower) {
  mode = 'town'; B = null; F = null; FLOORS = {};
  let letter = false;
  if (fromTower) { endMeal(); endRun(); rollRumor(); G.bless = null; G.runs++; G.ally = null; G.bandaged = []; G.enc = null; G.als = false; if (G.maxFloor >= 50 && !G.castle) { G.castle = true; letter = true; } }
  const brought = matText(G.carry);
  for (const [k, n] of Object.entries(G.carry)) add(RAW[k] ? G.raw : G.store, k, n);
  G.carry = {}; save();
  if (fromTower) { returnScreen(msg, brought, letter); return; }
  townMap(); if (msg) log(msg, true); hud();
}
// 町の外観の絵（タイトル・はじめの説明・塔から戻ったとき）
function viewScreen(caption, story) {
  place = null; showTown(true, 0); if (story) document.body.classList.add('story');
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}town_view.jpg" alt="塔の国の町">` + (caption ? `<div class="caption">${caption}</div>` : '');
}
// 塔から戻ったら、まずギルドへ。リアが出迎える
function guildWelcome(has) {
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
  viewScreen('');
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
  const L = [{ t: 'はじめから', hot: !load(), f: () => load() ? resetGame() : (G = NEW_GAME(), save(), intro(0)) }, { t: '設定', s: '音・データ', f: settings }];
  if (load()) L.unshift({ t: 'つづきから', hot: true, f: () => { G = load(); townMap(); say('normal', '「さて、今日も行くか」\n工房の火はまだ温かい。', true); } });
  // iPhoneは最初のタップまで音が出せないので、まず「タップしてはじめる」でタイトルの曲を鳴らす
  if (!SND.unlocked) buttons([{ t: 'タップしてはじめる', hot: true, f: () => buttons(L) }]); else buttons(L);
  log('', true); hud();
  { const v = document.createElement('div'); v.textContent = 'ver 24'; v.style.cssText = 'position:absolute;right:6px;bottom:4px;font-size:10px;color:#fff8;text-shadow:0 0 3px #000'; t.appendChild(v); }
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
  fadeGo(() => { document.body.classList.remove('intro'); prologue(); }, { hold: 500 });
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
  }
  if (G.castle) { const ar = document.createElement('button'); ar.className = 'arrow'; ar.textContent = '▼ お城'; ar.onclick = () => fadeGo(castleScreen, { walk: true }); t.appendChild(ar); }
  buttons([]);
  log('行きたい場所を押してね。', true); hud();
}
function outside(id) {
  const p = PLACES[id], t = $('town');
  if (id === 'south') { if (G.castle) { castleScreen(); return; } log(pick(p.hello), true); return; }
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
  const lastSaid = msg || greet(id); log(lastSaid, true);
  { const sp = /^([^\s「\[]+)(?:\[(\w+)\])?/.exec(lastSaid || ''); if (sp && sp[1] === 'ブッパ') npcFig('buppa_' + (NPCS['ブッパ'][sp[2] || 'normal'] || 'sleep')); else if (sp && NPCS[sp[1]] && ['ボルツ', 'アルス', '客', 'チッチ', '助手'].includes(sp[1])) npcFig(NPCS[sp[1]].id); }
  ({ home: homeMenu, weapon: shop, clinic: clinic, guild: guild, item: itemShop, bank: bank, inn: inn })[id](); hud();
}
const leave = { t: '外に出る', tail: true, f: () => townMap() };
// ---------- 親密度と会話 ----------
const WHO_NAME = { jenny: 'ジェニー', elly: 'エリー', ria: 'リア', fuuka: 'フウカ', jin: 'ジン' };
const perk = who => (G.aff[who] || 0) >= AFF_NEED;
const canTalk = who => G.talkRun[who] !== G.runs;
function talkBtn(who, back) { return { t: '話す', tail: true, s: canTalk(who) ? WHO_NAME[who] : 'また今度', off: !canTalk(who), f: () => talkTo(who, back) }; }
function talkTo(who, back) {
  const close = (G.seen || {})[who] && TALKS_CLOSE[who], key = close ? who + '_close' : who;
  const list = close || TALKS[who], i = (G.talkIdx[key] || 0) % list.length, T = list[i];
  log(T.q, true);
  buttons(T.a.map(([ans, pt, reply]) => ({ t: ans, f: () => {
    const before = G.aff[who] || 0; G.aff[who] = before + pt; G.talkIdx[key] = i + 1; G.talkRun[who] = G.runs; save();
    log(reply, true);
    const done = () => buttons([{ t: '戻る', hot: true, f: back }]);
    if (before < AFF_NEED && G.aff[who] >= AFF_NEED) { buttons([{ t: '……', hot: true, f: () => { affEvent(who); buttons([{ t: '……！', hot: true, f: () => { log(`親密度の特典: ${AFF_PERKS[who]}`, true); done(); } }]); } }]); return; }
    done();
  } })), 'three');
}
// 親密度が届いたとき: 向こうから好意を示してくる＋特典
function affEvent(who) {
  const L = {
    jenny: 'ジェニー[inlove]「……あんたのこと、ずっと前から見てたのよ。……気づきなさいよ、バカ」\n「……？ ああ、いつも店番ありがとうな」',
    elly:  'エリー[happy]「わたし、あなたが帰ってくるのが、一番うれしいんです。……それだけ、です」\n「そうか。俺も治療院があって助かってる」',
    ria:   'リア[happy]「あなたの記録を書くのが、わたしの一番の楽しみなんです。……仕事として、ですよ？」\n「そうか。いい仕事だな」',
    fuuka: 'フウカ[love]「……好き。……あ、ちがっ、その、刀が！ 刀が好きなの！」\n「そうか。今度、いい刀を打ってやる」',
    jin:   'ジン[laugh]「お主には、いずれ教えたいことがある。……その時が来たらな」',
  };
  if (who === 'jenny') npcFig('weapon_inlove');
  log(L[who] || `${TOWER_NPCS[who].name}[laugh]「あなたのこと、気に入ったわ。……また会いに来なさい」\n「ああ。また寄らせてもらう」`, true);
}
// 店の中の立ち絵を入れ替える（ギルドの加工職人など）
function npcFig(id) {
  const who = id.split('_')[0];
  showFig(`assets/npc/${id}.webp`, { who, mode: id === 'bar' ? 'wide' : id.startsWith('buppa') ? 'full' : undefined });
}

function homeMenu() {
  buttons([{ title: `工房の素材: ${matText(G.store)}` },
    { t: '鍛冶をする', s: '武具を打つ', hot: true, f: forge },
    { t: '休む', s: 'HP全回復', f: () => { if (G.hp >= G.mhp) { say('doubt', '「……まだ眠くないな」', true); return; } G.hp = G.mhp; save(); say('calm', `自分のベッドで眠った。炉の音が子守唄だ。\nHPが回復した。${G.injuries.length ? '\n……ケガは、寝ても治らない。治療院に行こう。' : ''}`, true); } },
    { t: 'ステータス', s: `Lv${G.lv} ${job()}`, f: () => statusMenu(homeMenu) },
    { t: '装備を変える', s: job(), f: () => equipMenu(homeMenu) },
    { t: 'ツール', s: toolName(), f: () => toolMenu(homeMenu) },
    { t: '技を選ぶ', s: `${Math.min(G.loadout.skills.length, SKILL_MAX)}/${SKILL_MAX}`, f: () => skillMenu(homeMenu) },
    { t: 'パッシブ', s: `${G.loadout.passives.length}/${PASSIVE_SLOTS}`, f: () => passiveMenu(homeMenu) },
    ...((G.visit && G.visit.run === G.runs ? G.visit.who : []).map(w => ({ t: `${VNAME[w]}と話す`, s: '遊びに来ている', f: () => { npcFig(VISIT_FIG[w]); talkTo(w, () => inside('home')); } }))),
    { t: G.als ? 'アルスと行く' : 'アルスを誘う', s: G.als ? '準備できてる' : '1〜10階', off: G.als, f: () => { G.als = true; save(); npcFig('als'); homeMenu(); log(pick(['アルス[laugh]「本当ですか！ 師匠と一緒に塔へ……！ すぐ準備します！」', 'アルス[smile]「はい！ 足手まといにはなりません。特訓の成果、見ててください！」']), true); } },
    leave]);
}
// 塔の入口: 塔の大きさを見せる。コマンドは 入る／準備する／戻る
function towerScreen(msg) {
  place = 'tower'; showTown(true, 941 / 1672);
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}tower.jpg" alt="塔の入口"><div class="name">塔</div>`;
  buttons([{ t: '入る', hot: true, stay: true, f: () => G.sentOff ? enterMenu() : sendOff() }, { t: '女神の像', s: G.warps.length ? `ワープ ${G.warps.length}か所` : 'まだ光っていない', f: warpMenu }, { t: '準備する', f: prepMenu }, { t: '戻る', f: townMap }]);
  if (msg) say('resolve', msg, true); else log(pick(PLACES.tower.hello), true);
  if (!msg && G.gold > 0) log(`手持ちの${G.gold}Gは、倒れるとなくなる。`);
  if (!msg && G.injuries.length) say('tired', `${G.injuries.map(k => INJURIES[k].name).join('・')}が痛む。\n「……まぁ〜、どうにかなるんじゃないか」`);
  hud();
}
// 広場の像: 300年前の剣士の像（実はジン。95階で知る）。ジンにたまに会える
function statueScreen(msg) {
  place = 'statue'; showTown(true, 0);
  const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}statue.jpg" alt="剣士の像"><div class="name">剣士の像</div>`;
  if (statueScreen.run !== G.runs) { statueScreen.run = G.runs; statueScreen.jin = R() < .4; }
  const L = [{ t: '碑文を読む', f: () => log('「三百年前、この塔に挑みし名もなき剣士」\n……台座の文字は、少しすり減っている。', true) }];
  if (statueScreen.jin) { npcFig('jin'); L.push(talkBtn('jin', () => statueScreen(byeLine('jin')))); }
  L.push({ t: '戻る', f: townMap });
  buttons(L); hud();
  if (msg) { log(msg, true); return; }
  if (statueScreen.jin) log(pick(['ジン「ほっほっほ。また会ったのう、鍛冶屋の」', 'ジン[smile]「この像の前は、なぜか落ち着くのじゃ」', 'ジン「塔の上は、まだ遠いかの」']), true);
  else say('lookup', pick(PLACES.statue.hello) + '\n「三百年前か……。どんな剣を持ってたんだろうな」', true);
}
// ---------- お城（50階に着いて生きて戻ると行ける） ----------
function castleScreen() {
  place = 'castle'; showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}castle_out.jpg" alt="お城"><div class="name">お城</div>`;
  buttons([{ t: '入る', hot: true, f: () => castleHall() }, { t: '戻る', f: townMap }]);
  log('門番「鍛冶屋殿ですね。王がお待ちです」', true); hud();
}
const CASTLE_TALK = {
  king: [[50, ['王様[laugh]「おお、来たか鍛冶屋！ 50階だと？ わっはっは、たいしたもんだ！」', '王様「わしの若い頃より強いんじゃないか？ ……いや、わしは登ったことないがな！」']],
         [70, ['王様[laugh]「70階か！ 国じゅうがお前の話をしておる。期待しとるぞ！」']],
         [86, ['王様「ギャバンの記録に並んだか……。いや、越えてくれ。この国の夢だ」']]],
  minister: [[50, ['大臣「よくぞご無事で。何か困ったことがあれば、何でも言ってください」', '大臣[smile]「陛下はああ見えて、毎晩あなたの記録を読んでおられます」']],
             [70, ['大臣「塔の情報で必要なものがあれば、王宮の書庫を開けましょう」']]],
  gaban: [[50, ['ギャバン[laugh]「鍛冶屋殿！ お会いしたかった！ その剣、自分で打ったのですか！？」', 'ギャバン「自分は2年前、86階で引き返しました。……敵が強すぎたのです」']],
          [70, ['ギャバン「70階……！ 自分は、あなたなら越えられると信じています！」']],
          [86, ['ギャバン[laugh]「86階……自分の記録です。ここから先は、あなたの道です！」']]],
};
const castleLine = who => { let L = CASTLE_TALK[who][0][1]; for (const [n, l] of CASTLE_TALK[who]) if (G.maxFloor >= n) L = l; return pick(L); };
function castleHall(msg) {
  place = 'castle'; showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  t.innerHTML = `<img src="${TOWN_IMG}castle_in.jpg" alt="謁見の間"><div class="name">謁見の間</div>`;
  npcFig('king');
  const talk = who => () => { npcFig(who); log(castleLine(who), true); };
  buttons([{ t: '王様と話す', hot: true, f: talk('king') }, { t: '大臣と話す', f: talk('minister') }, { t: 'ギャバンと話す', f: talk('gaban') },
    { t: '贈り物', s: '今後', off: true, f: () => {} }, { t: '戻る', f: castleScreen }]);
  log(msg || castleLine('king'), true); hud();
}
// 女神の像: 触ると、女神に会ったエリアの最初の階へワープできる
function warpMenu() {
  // 4人の女神の像を並べて出す。加護を受けた像だけが光る
  showTown(true, 4 / 3); const t = $('town'); t.className = 'box town';
  const lit = id => G.warps.some(n => GOD_OF_AREA[n] === id);
  t.innerHTML = `<div class="statues">${['forest', 'desert', 'mountain', 'ice'].map(id => `<img class="${lit(id) ? 'lit' : ''}" src="${TOWN_IMG}gstatue_${id}.png" alt="${TOWER_NPCS[id].name}の像">`).join('')}</div><div class="name">女神の像</div>`;
  if (!G.warps.length) { buttons([{ t: '戻る', f: () => towerScreen() }]); log('塔の入口に、4人の女神の像が並んでいる。\nまだどれも光っていない。……塔の中で、女神に会えたら。', true); return; }
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
function newGear(r) { const x = { uid: G.uidNext++, id: r.id, name: r.name, type: r.type, atk: r.atk || 0, def: r.def || 0 }; if (r.type === 'tool') { x.tool = r.tool; x.dur = x.maxDur = r.dur; } return x; }
const gearKind = t => t === 'armor' ? '鎧' : t === 'tool' ? 'ツール' : WEAPON_TYPES[t].name;
// 工房の鍛冶: まず「武器・防具・ツール・手入れ」を選んで、その中の一覧へ。
// 一覧の各行に「必要な素材（今の数）」を出す。足りない物を押すと、何が足りないかを教える
const FORGE_CAT = { weapon: ['武器', r => !['armor', 'shield', 'tool'].includes(r.type)], armor: ['防具', r => r.type === 'armor' || r.type === 'shield'], tool: ['ツール', r => r.type === 'tool'] };
const canMake = r => Object.entries(r.cost).every(([k, n]) => (G.store[k] || 0) >= n);
const lackText = r => Object.entries(r.cost).filter(([k, n]) => (G.store[k] || 0) < n).map(([k, n]) => `${MATS[k]}あと${n - (G.store[k] || 0)}`).join('・');
const needText = r => Object.entries(r.cost).map(([k, n]) => `${MATS[k]}${n}(${G.store[k] || 0})`).join(' ');
function forge(msg, face) {
  const L = [{ title: `工房の素材: ${matText(G.store)}` }];
  for (const [k, [name, f]] of Object.entries(FORGE_CAT)) { const rs = RECIPES.filter(f), n = rs.filter(canMake).length;
    L.push({ t: name, s: n ? `作れる ${n}/${rs.length}` : `作れる物なし（${rs.length}種）`, hot: n > 0, f: () => forgeList(k) }); }
  const worn = G.gear.filter(x => x.type === 'tool' && x.dur < x.maxDur);
  L.push({ t: '手入れ', s: worn.length ? `ツール${worn.length}本（銅1）` : '直す物なし', off: !worn.length, f: forgeFix });
  L.push({ t: '戻る', f: homeMenu });
  buttons(L);
  if (face) say(face, msg, true); else say('serious', msg || (Object.keys(G.raw).some(k => G.raw[k]) ? '「戦利品は、まずギルドで加工してもらわないとな」' : '「何を打とうか」'), true);
}
function forgeList(cat, msg, face) {
  const [name, f] = FORGE_CAT[cat], rs = RECIPES.filter(f).sort((a, b) => canMake(b) - canMake(a));
  const L = [{ title: `${name}（素材: ${matText(G.store)}）` }];
  for (const r of rs) {
    const ok = canMake(r), stat = r.type === 'tool' ? `${TOOL_NAMES[r.tool]}・耐久${r.dur}` : `${gearKind(r.type)}${r.atk ? ' 攻' + r.atk : ''}${r.def ? ' 守' + r.def : ''}`;
    L.push({ t: r.name + (ok ? '' : '<i class="lack">素材不足</i>'), s: `${stat}<br>${needText(r)}`, cls: ok ? '' : 'dim', f: () => {
      if (!canMake(r)) { log(`${r.name}を打つには、${lackText(r)}が足りない。\n必要: ${matText(r.cost)}`, true); return; }
      for (const [k, n] of Object.entries(r.cost)) G.store[k] -= n;
      G.gear.push(newGear(r)); save();
      fadeGo(() => forgeList(cat, `「${r.name}、できた。悪くない」`, 'grin'), { text: `${r.name}\n制作中`, hold: 1500, sfx: [['hit1', 250], ['hit1', 700], ['hit1', 1150], ['heavy', 1600]] });
    } });
  }
  L.push({ t: '戻る', f: () => forge() });
  buttons(L, 'list');
  if (face) say(face, msg, true); else log(msg || '（ ）の数字は、工房にある素材の数。', true);
}
function forgeFix() {
  const L = [{ title: '手入れ（銅1で新品同様に）' }];
  for (const t of G.gear.filter(x => x.type === 'tool' && x.dur < x.maxDur)) {
    const ok = (G.store.copper || 0) >= 1;
    L.push({ t: `${t.name}を直す`, s: `耐久${t.dur}/${t.maxDur}／銅1(${G.store.copper || 0})`, off: !ok, f: () => { G.store.copper--; t.dur = t.maxDur; save(); fadeGo(() => forge(`${t.name}を研ぎ直した。新品同様だ。`, 'grin'), { text: `${t.name}\n手入れ中`, hold: 900, sfx: [['hit1', 250], ['hit1', 700]] }); } });
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
    L.push({ t: g.name + where, s: `${kind}${g.atk ? ' 攻' + g.atk : ''}${g.def ? ' 守' + g.def : ''}`, hot: !!where, f: () => { const before = JSON.stringify(G.equip); equipItem(g); if (JSON.stringify(G.equip) !== before) sfx('equip'); equipMenu(back); checkLearn(job()); save(); } });
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
  for (const u of TOPS) L.push({ t: '？？？', s: `最上級職・${WEAPON_TYPES[u.hold].name}`, f: () => log('塔のずっと上で、この姿になれるらしい。', true) });
  L.push({ t: '戻る', f: back });
  buttons(L, 'three small'); jobScene(cur); log('熟練度は、その武器を持って勝つと上がる。', true);
}
// 武具屋: まず「買う／売る／話す／外に出る」。押してから、それぞれの一覧を出す
function shop(msg) {
  buttons([{ t: '買う', s: '自分で打つより高い', hot: true, f: () => shopBuy() }, { t: '売る', s: G.gear.length ? `持ち物${G.gear.length}個` : '売る物がない', f: () => shopSell() },
    talkBtn('jenny', () => inside('weapon', byeLine('jenny'))), leave]);
  if (msg) log(msg, true);
}
function shopSell(msg) {
  const L = [{ title: `売る（手持ち ${G.gold}G）` }];
  if (!G.gear.length) L.push({ t: '売る物がない', off: true, f: () => {} });
  for (const g of G.gear) {
    const used = [G.equip.r, G.equip.l, G.equip.armor, G.equip.tool].includes(g.uid); const rec = RECIPES.find(r => r.id === g.id); const p = Math.floor((rec ? rec.price : 10) * (perk('jenny') ? 1.25 : 1));
    L.push({ t: `${g.name}`, s: used ? '装備中' : `${p}Gで売る`, off: used, f: () => { G.gold += p; G.gear = G.gear.filter(x => x !== g); save(); shopSell(`ジェニー「${g.name}、${p}Gね。……もっと高く売れるのに」`); } });
  }
  L.push({ t: '戻る', f: () => shop() });
  buttons(L); log(msg || 'ジェニー「何を売るの？ 自分で打ったのも買い取るわよ」', true);
}
function shopBuy(msg) {
  const L = [{ title: `買う（手持ち ${G.gold}G）` }];
  for (const id of SHOP) { const r = RECIPES.find(x => x.id === id), p = Math.floor(r.price * 1.8);
    L.push({ t: r.name, s: `${p}G`, off: G.gold < p, f: () => { G.gold -= p; G.gear.push(newGear(r)); save(); shopBuy(`${r.name}を買った。\nジェニー「毎度。……あんたが打った方が、いい物なんだけどね」`); } }); }
  L.push({ t: '戻る', f: () => shop() });
  buttons(L); log(msg || 'ジェニー「うちの品よ。自分で打つより高いけど、急ぎならね」', true);
}
function itemShop(msg) {
  const L = Object.entries(ITEMS).map(([k, it]) => ({ t: `${it.name}<small>${it.price}G・持${G.items[k] || 0}</small>`, s: it.short, off: G.gold < it.price, f: () => { G.gold -= it.price; G.items[k] = (G.items[k] || 0) + 1; save(); itemShop(`${it.name}を買った。${it.desc}。`); } }));
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
  const L = [{ t: '噂を聞く', s: '今日の塔', f: () => { if (!G.rumor) rollRumor(); npcFig('bar'); log('客「' + RUMORS[G.rumor].say + '」', true); } }];
  for (const [id, m] of Object.entries(MEALS)) {
    const ok = !G.meal && Object.entries(m.cost).every(([k, n]) => (G.store[k] || 0) >= n);
    L.push({ t: m.name, s: `${m.desc}／${matText(m.cost)}`, off: !ok, f: () => {
      for (const [k, n] of Object.entries(m.cost)) G.store[k] -= n;
      G.meal = id; if (id === 'stew') { G.mhp += 10; G.hp += 10; }
      save(); inn(`ガストン[laugh]「${m.name}、お待ち！」\n${m.say}（次に塔から戻るまで効く）`);
    } });
  }
  L.push(leave); buttons(L);
  log(msg || (G.meal ? `今は${MEALS[G.meal].name}を食べたところ。次に塔から戻るまで効く。` : 'ガストン「素材を持ってきな。うまく料理してやるよ」'), true);
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
    const t = G.treated, line = t >= 6 ? 'エリー[angry]「もう！ わたし、本気で怒ってるんですからね！」' : t >= 3 ? 'エリー[think]「……また、ですか。次は、もっと気をつけてください」' : 'エリー[smile]「はい、もう大丈夫です。無理はしないでくださいね」';
    clinic(`${line}${note}\n「助かったよ」`); } });
  L.push({ title: G.bless ? `祝福: ${BLESSINGS[G.bless].name}（次の挑戦で効く）` : '祝福（次の1回の挑戦だけ。どれか1つ）' });
  for (const [id, b] of Object.entries(BLESSINGS)) { const bp = Math.floor(b.price * half); L.push({ t: b.name, s: `${b.desc}／${bp}G`, off: !!G.bless || G.gold < bp, f: () => {
    G.gold -= bp; G.bless = id; save(); clinic(`エリー[smile]「神様、この人をお守りください。……はい、${b.name}です」`); } }); }
  L.push(talkBtn('elly', () => inside('clinic', byeLine('elly'))), leave); buttons(L);
  if (msg) log(msg, true);
}
// ギルドに戦利品を持ち込む → 鍛冶の素材に加工＋報酬。ここに来ないと鍛冶ができない
function turnIn() {
  const got = {}; let gold = 0, n = 0;
  for (const [k, c] of Object.entries(G.raw)) { if (!c || !RAW[k]) continue; n += c; gold += RAW[k].reward * c; for (const [m, v] of Object.entries(RAW[k].to)) add(got, m, v * c); }
  if (!n) return;
  // 持ち込みが多いと、ギルドからおまけの素材も出る
  const bonus = {}; for (let i = 0; i < Math.floor(n / 6); i++) add(bonus, pick(['copper', 'leather', 'bone', 'iron']), 1);
  for (const [m, v] of Object.entries(got)) add(G.store, m, v); for (const [m, v] of Object.entries(bonus)) add(G.store, m, v);
  if (perk('ria')) gold = Math.floor(gold * 1.15);
  G.gold += gold; G.raw = {}; save();
  setTimeout(() => bigFx(`<b class="gold">+${gold}G</b><em>ギルドの報酬</em><span>工房へ: ${matText(got)}</span>${Object.keys(bonus).length ? `<small>おまけ: ${matText(bonus)}</small>` : ''}`, 'register', 'reward'), 350);
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
    { t: '到達記録', s: `あなた ${G.maxFloor}階`, f: () => log(`最高到達: 近衛兵長ギャバン 86階／あなた ${G.maxFloor}階${G.bossDown ? '（10階の主を倒した）' : ''}`, true) },
    talkBtn('ria', () => inside('guild', byeLine('ria'))), leave]);
  if (msg) { if (face) say(face, msg, true); else log(msg, true); }
}
function guildSell(msg) {
  const L = [{ title: `素材を売る（工房の素材）` }];
  if (!Object.values(G.store).some(n => n > 0)) L.push({ t: '売る素材がない', off: true, f: () => {} });
  for (const [k, n] of Object.entries(G.store)) if (n > 0) L.push({ t: `${MATS[k]}を1つ売る`, s: `${MAT_PRICE[k]}G（${n}個）`, f: () => { G.store[k]--; G.gold += MAT_PRICE[k]; save(); guildSell(`${MATS[k]}を${MAT_PRICE[k]}Gで売った。`); } });
  L.push({ t: '戻る', f: () => guild() });
  buttons(L); log(msg || 'リア「工房の素材を買い取ります。1つずつどうぞ」', true);
}
function guildBuy(msg, face) {
  const L = [{ title: `素材を買う（手持ち ${G.gold}G）` }];
  for (const [k, p] of Object.entries(MAT_PRICE)) { const bp = p * 3; L.push({ t: `${MATS[k]}を1つ買う`, s: `${bp}G`, off: G.gold < bp, f: () => { G.gold -= bp; add(G.store, k, 1); save(); guildBuy(`${MATS[k]}を${bp}Gで買った。\n「……高い。だから自分で取りに行くんだ」`, 'angry'); } }); }
  L.push({ t: '戻る', f: () => guild() });
  buttons(L); if (msg) { if (face) say(face, msg, true); else log(msg, true); } else log('リア「塔の素材は値上がりしていて……。すみません」', true);
}
// タイトルの設定: 音とデータ消去（町の地図から移した）
function settings() {
  buttons([{ title: '設定' }, { t: SND.on ? '音: オン' : '音: オフ', s: '押して切り替え', f: () => { SND.toggle(); $('snd').classList.toggle('off', !SND.on); settings(); } },
    { t: 'データを消す', s: 'はじめからやり直す', off: !load(), f: resetGame }, { t: '戻る', f: titleScreen }]);
}
function resetGame() { buttons([{ title: '本当にデータを消して、はじめからにする？' }, { t: '消してはじめる', f: () => { G = NEW_GAME(); save(); intro(0); } }, { t: 'やめる', f: titleScreen }]); }

// ---------- 探索 ----------
// 塔にいる間は、一度行った階の様子（開けた扉・宝箱・地図）を覚えておく。町に戻るとリセット
let FLOORS = {};
function enterFloor(n, fromAbove) {
  showTown(false, 4 / 3);
  if (!G.rumor) rollRumor(); TODAY = RUMORS[G.rumor].mod;
  if (!Object.keys(FLOORS).length) startRun();
  // 魔除け・魔寄せは、使ってから3フロアで切れる（階が変わるたびに1減る）
  let encEnd = false; if (G.enc && n !== floorNo) { G.enc.floors--; if (G.enc.floors <= 0) { G.enc = null; encEnd = true; } }
  floorNo = n; F = FLOORS[n] || (FLOORS[n] = genFloor(n, n % 10 === 0 ? 0 : 1 + Math.floor(R() * 1e6))); mode = 'dungeon'; B = null;
  // 上の階から下りてきたときは上り階段の前、それ以外は下り階段の前から始める（どちらも部屋の方を向く）
  const [sx, sy] = fromAbove ? F.upFront : F.start, sd = fromAbove ? F.upDir : F.startDir;
  P = { x: sx + .5, y: sy + .5, a: 0 };
  dir = DIRS.findIndex(([a, b]) => a === sd[0] && b === sd[1]); if (dir < 0) dir = 0;
  P.a = dir * Math.PI / 2; T = { ...P }; steps = 0; reveal(F, sx, sy);
  G.maxFloor = Math.max(G.maxFloor, n); save();
  dungeonUI(); log(`${n}階。うしろに${fromAbove ? '上り' : '下り'}階段がある。`, true); hud();
  if (encEnd) log('焚いていた香の効き目が切れた。');
  if (G.als && n > 10) { G.als = false; save(); log('アルス「ここから先は、まだ僕には……。師匠、先に町へ戻ってます！ ご無事で！」', true); }
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
  const [fdx, fdy] = DIRS[dir], here = cellAt(Math.floor(T.x) + fdx, Math.floor(T.y) + fdy);
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
function act(a) {
  if (mode !== 'dungeon' || busy) return;
  const cx = Math.floor(T.x), cy = Math.floor(T.y);
  if (a === 'tl' || a === 'tr') { dir = (dir + (a === 'tl' ? 3 : 1)) % 4; T.a += (a === 'tl' ? -1 : 1) * Math.PI / 2; busy = true; setTimeout(() => { facingNote(); dungeonUI(); }, 180); return; }
  const o = { f: 0, b: 2, sl: 3, sr: 1 }[a], [ddx, ddy] = DIRS[(dir + o) % 4], c = cellAt(cx + ddx, cy + ddy);
  if (c === 4 || c === 5) { F.M[cy + ddy][cx + ddx] = 0; reveal(F, cx + ddx, cy + ddy); log(c === 5 ? '重い鉄の扉を押し開けた。' : '扉を開けた。'); dungeonUI(); return; }
  if (c === 2 || c === 3) { if (o === 0) stairs(); else log('階段は正面から使う。'); return; }
  if (c === 1) { fx.shake = 3; sfx('hit1', { vol: .35, max: .3 }); log('壁だ。'); return; }
  if (c === 6) { fx.shake = 2; const ch = F.chests.find(q => q.x === cx + ddx && q.y === cy + ddy); log(ch ? (ch.open ? '開けた宝箱だ。' : '宝箱がある。開けてみよう。') : propAt(cx + ddx, cy + ddy) ? 'じゃまな物がある。' : '木が立ちふさがっている。'); return; }
  T.x += ddx; T.y += ddy; busy = true; steps++; stepSfx(floorNo);
  reveal(F, cx + ddx, cy + ddy);
  setTimeout(afterStep, 200);
}
// 宝箱は通れない。正面にあるときに開けられる
function chestAhead(any) { if (!F) return null; const [fdx, fdy] = DIRS[dir], x = Math.floor(T.x) + fdx, y = Math.floor(T.y) + fdy; return F.chests.find(ch => (any || !ch.open) && ch.x === x && ch.y === y); }
const chestHere = () => chestAhead();
function facingNote() {
  const [fdx, fdy] = DIRS[dir], c = cellAt(Math.floor(T.x) + fdx, Math.floor(T.y) + fdy);
  if (c === 2) log(floorNo === 10 && !G.bossDown ? '上り階段。上から重い足音がする……。\n（▲で上る）' : '上り階段がある。（▲で上る）');
  else if (c === 3) log(floorNo === 1 ? '下り階段。町に戻れる。（▲で下りる）' : '下り階段がある。（▲で下りる）');
  else if (c === 1 && F.vein && F.vein[(Math.floor(T.x) + fdx) + ',' + (Math.floor(T.y) + fdy)]) log({ v_copper: '銅', v_iron: '鉄', v_stone: '魔石', v_gems: '宝石' }[F.vein[(Math.floor(T.x) + fdx) + ',' + (Math.floor(T.y) + fdy)]] + 'の鉱脈が見える。ツールで掘れそうだ。');
  else if (c === 6) { const ch = chestAhead(true), p = propAhead(); if (ch) log(ch.open ? '開けた宝箱がある。' : ch.gold ? '豪華な宝箱がある！' : '宝箱がある。'); else if (p && PROP_INFO[p.key]) log(`${PROP_INFO[p.key][0]}がある。${p.searched ? '（調べた）' : ''}`); }
}
function afterStep() {
  if (mode !== 'dungeon') return;
  if (steps > 4 && R() < (TODAY.enc || .075) * (G.bless === 'calm' ? .6 : 1) * (G.enc ? (G.enc.k === 'ward' ? .7 : 1.4) : 1)) { startBattle(); return; }
  else if (steps > 6 && !F.met && R() < .025) { const who = meetCandidates(); if (who.length) { F.met = true; meetNpc(pick(who)); return; } }
  facingNote(); dungeonUI();
}
// ---------- 塔でたまに会う人 ----------
function meetCandidates() {
  return Object.entries(TOWER_NPCS).filter(([id, n]) => {
    const inRange = n.ranges ? n.ranges.some(([a, b]) => floorNo >= a && floorNo <= b) : floorNo >= n.from && (floorNo <= n.to || (id === 'fuuka' && perk('fuuka')));
    if (id === 'dan' && G.danRun === G.runs) return false;  // ダンは1回の塔で一度だけ
    return inRange && !(n.battles && G.ally);
  }).map(([id]) => id);
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
    G.hp = G.mhp; G.items.herb_l++; save();
    log(pick(['ギャバン[laugh]「鍛冶屋殿！ こんな上で会えるとは！ さあ、近衛兵の秘薬です。遠慮なく！」', 'ギャバン「自分も、ここまでは来られたのです。……鍛冶屋殿なら、その先へ行けます！」']), true);
    log('HPが全回復した。大薬草をもらった。');
    buttons([{ t: '「ありがとう、ギャバン」', hot: true, f: () => { log('ギャバン[laugh]「はっ！ ご武運を！」', true); go(); } }]); return;
  }
  if (id === 'gurugamo') {
    G.ally = { id, left: TOWER_NPCS.gurugamo.battles }; save();
    log('グルガモ[laugh]「おう、鍛冶屋！ ちょうど暇してたんだ。ちょっと付き合うぜ」', true);
    log(`グルガモが一緒に戦ってくれる（${G.ally.left}回）。`);
    buttons([{ t: '「頼もしいな」', hot: true, f: go }]); return;
  }
  if (id === 'fuuka' && evReady('fuuka', .6)) { fuukaEvent(go); return; }
  if (id === 'fuuka') {
    talkTo('fuuka', () => {
      G.ally = { id, left: perk('fuuka') ? 20 : TOWER_NPCS.fuuka.battles }; save();
      log(`フウカ「……しばらく、一緒に行ってあげる」\nフウカが一緒に戦ってくれる（${G.ally.left}回）。`, true);
      buttons([{ t: '先へ進む', hot: true, f: go }]);
    });
  }
}
// 女神: 会話（親密度）→ 戦利品をもらう／回復してもらう（親密度が上がると選べる）
function meetGod(id, go0) {
  SND.goddess = true; const go = () => { SND.goddess = false; go0(); };
  const name = TOWER_NPCS[id].name, start = areaOf(floorNo)[0];
  if (start > 1 && !G.warps.includes(start)) { G.warps.push(start); G.warps.sort((a, b) => a - b); save(); setTimeout(() => log(`（${name}の加護を受けた。塔の入口の女神像から、${start}階へ来られるようになった）`), 0); }
  talkTo(id, () => {
    const aff = G.aff[id] || 0;
    log(`${name}[smile]「さあ、どうしてほしい？」`, true);
    buttons([
      { t: '戦利品をもらう', hot: true, f: () => {
        const pool = MONSTERS.filter(m => m.from <= Math.min(floorNo, 10)).flatMap(m => Object.keys(m.drop)), got = {};
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
// 一緒に戦ってくれる人の番（主人公のターンの後、敵の前）
function allyTurn() {
  const m = B.m; if (B.over) return false;
  if (G.als && floorNo <= 10 && R() < .5) { const d = dmgTo(m, atkPower() * .6); log(`アルスの斬撃！ ${d}のダメージ。`); if (m.hp <= 0) { win(); return true; } }
  const a = G.ally; if (!a) return false;
  if (a.id === 'fuuka') { playFx('thrust', { delay: 200 }); playFx('heal_leaf', { self: true, delay: 420, size: .8 }); const d = dmgTo(m, atkPower() * .7), h = Math.ceil(G.mhp * .15); healMe(h); log(`フウカの攻撃！ ${d}のダメージ。HPを${h}回復してくれた。`); }
  if (a.id === 'gurugamo') { playFx('impact_heavy', { delay: 200 }); const d = dmgTo(m, atkPower()); log(`グルガモの斧！ ${d}のダメージ。`); }
  if (m.hp <= 0) { win(); return true; }
  return false;
}
// 戦闘が1回終わるたびに、残りの回数を減らす
function allyTick() {
  const a = G.ally; if (!a) return; a.left--;
  if (a.left > 0) return;
  G.ally = null;
  log(a.id === 'gurugamo' ? 'グルガモ「おっと、そろそろ帰らねえと、かみさんに怒られる！ じゃあな！」' : 'フウカ[shy]「……もう行かなきゃ。……また、会えるよね？」');
}
// ---------- 調べる（床の小物） ----------
const propAt = (x, y) => (F.props || []).find(p => p.cx === x && p.cy === y);
function propAhead() { const [fdx, fdy] = DIRS[dir], x = Math.floor(T.x) + fdx, y = Math.floor(T.y) + fdy; return (F.props || []).find(p => p.cx === x && p.cy === y); }
function rollLoot(table) { const sum = table.reduce((s, r) => s + r[2], 0); let q = R() * sum; for (const r of table) if ((q -= r[2]) < 0) return r; return table[table.length - 1]; }
function giveLoot([kind, v]) {
  if (kind === 'raw') { add(G.carry, v, 1); return `${NAMES[v]}を見つけた。`; }
  if (kind === 'item') { G.items[v] = (G.items[v] || 0) + 1; return `${ITEMS[v].name}を見つけた。`; }
  if (kind === 'gold') { const n = Math.ceil(v * (.6 + R() * .8) * (1 + floorNo * .1)); G.gold += n; return `${n}Gを見つけた。`; }
  return '';
}
// 調べる: 正面の宝箱を開ける／床の物を調べる／階段なら行き方を教える
function inspect() {
  if (chestHere()) { openChest(); return; }
  const p = propAhead(); if (p && PROP_INFO[p.key]) { if (p.searched) log(`${PROP_INFO[p.key][0]}。もう調べた。`, true); else searchProp(); return; }
  const [fdx, fdy] = DIRS[dir], c = cellAt(Math.floor(T.x) + fdx, Math.floor(T.y) + fdy);
  if (c === 2) log(`上り階段だ。前に進むと${floorNo + 1}階へ上る。`, true);
  else if (c === 3) log(`下り階段だ。前に進むと${floorNo === 1 ? '町に戻る' : (floorNo - 1) + '階へ下りる'}。`, true);
  else log(pick(['特に何もない。', '……何もないようだ。', '足元を見回した。何もない。']), true);
}
function searchProp() {
  const p = propAhead(); if (!p || p.searched) return; p.searched = true;
  const [name, grp] = PROP_INFO[p.key]; let msg;
  if (grp === 'feather') { G.items.wing++; msg = `${name}を拾った。……帰還の羽だ！`; }
  else if (grp === 'mimic') {
    const d = Math.max(1, Math.ceil(G.mhp * .2)); G.hp = Math.max(1, G.hp - d); fx.flash = .8; fx.shake = 6;
    const gold = 30 + floorNo * 8, raw = pick(['ore_iron', 'raw_gem', 'dim_stone']); G.gold += gold; add(G.carry, raw, 1);
    p.key = p.key === 'f_mimic' ? 'chest_open' : 'chest_gold_open'; p.size = .42;
    msg = `ガブッ！ ${name}にかみつかれた！ ${d}のダメージ。\nミミックは中身を吐き出して逃げていった。${gold}Gと${NAMES[raw]}を手に入れた。`;
  }
  else if (grp === 'mushroom') {
    if (R() < .6) { G.items.herb++; msg = 'キノコの根元に、薬草が生えていた。'; }
    else { const d = Math.ceil(G.mhp * .08); G.hp = Math.max(1, G.hp - d); msg = `……かじってみたら、毒キノコだった。${d}のダメージ。`; }
  }
  else { const got = giveLoot(rollLoot(SEARCH_LOOT[grp])); msg = got ? `${name}を調べた。${got}` : `${name}を調べた。……何もない。`; }
  save(); log(msg, true); dungeonUI(); hud();
}
// ---------- 採掘（ツールで壁を掘る） ----------
const areaOf = n => { let a = AREAS[0]; for (const x of AREAS) if (n >= x[0]) a = x; return a; };
const MARK = { 3: '◎', 2: '◯', 1: '△' };
const VEIN_RAW = { v_copper: 'ore_copper', v_iron: 'ore_iron', v_stone: 'dim_stone', v_gems: 'raw_gem' };
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
  F.dmg[k] = (F.dmg[k] || 0) + 1; d.t.dur--; fx.shake = 3; sfx('hit');
  F.crack = F.crack || {}; F.crack[k] = Math.min(3, Math.ceil(F.dmg[k] / d.need * 3));
  if (F.dmg[k] < d.need) {
    log(`カン！ ${['ヒビが入った。', 'ヒビが広がった。', 'もう少しで崩れそうだ。'][Math.min(2, Math.floor(F.dmg[k] / d.need * 3))]}${d.t.dur <= 5 ? `（${d.t.name}の耐久 残り${d.t.dur}）` : ''}`, true);
  } else {
    F.M[d.y][d.x] = 0; delete F.dmg[k]; delete F.crack[k]; reveal(F, d.x, d.y);
    const vk = F.vein && F.vein[k]; if (vk) delete F.vein[k];
    const table = vk ? [[VEIN_RAW[vk], 1]] : DIG_YIELD[areaOf(floorNo)[1]] || DIG_YIELD.stone, sum = table.reduce((s, [, w]) => s + w, 0), got = {};
    const n = (d.eff === 3 ? 2 : 1) + (vk ? 1 : 0);
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
function openChest() {
  const ch = chestHere(); if (!ch) return; ch.open = true;
  const pool = MONSTERS.filter(m => m.from <= floorNo).flatMap(m => Object.keys(m.drop));
  const got = {}; const n = ch.gold ? 5 : 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) add(got, pool[Math.floor(R() * pool.length)], 1);
  if (ch.gold) add(got, R() < .5 ? 'ore_iron' : 'dim_stone', 2);
  const gold = Math.floor((ch.gold ? 40 : 8) * (1 + floorNo * .3) * (.7 + R() * .6));
  for (const [k, v] of Object.entries(got)) add(G.carry, k, v); G.gold += gold;
  log(`宝箱を開けた！ ${matText(got)}、${gold}G。`, true); dungeonUI(); hud();
}
function stairs() {
  sfx('stairs', { max: 1.6 });
  const [fdx, fdy] = DIRS[dir], c = cellAt(Math.floor(T.x) + fdx, Math.floor(T.y) + fdy);
  if (c === 3) { if (floorNo === 1) fadeGo(() => toTown('塔から出た。', true)); else goFloor(floorNo - 1, true); }
  else if (c === 2) {
    if (floorNo === 10 && !G.bossDown) { startBattle(BOSS10); return; }
    if (floorNo >= 10) { log('11階から上は、まだ作っていない。', true); return; }
    goFloor(floorNo + 1);
  }
}
// 道具を使う。戻り値: 使えたか
function useItem(k) {
  if (!G.items[k]) return false;
  if (k === 'herb' || k === 'herb_m' || k === 'herb_l') {
    if (G.hp >= G.mhp) return false;
    const base = k === 'herb' ? 25 + G.lv * 3 : k === 'herb_m' ? 60 + G.lv * 5 : G.mhp;
    G.items[k]--; const h = healMe(Math.round(base * (has('p_herb') && k !== 'herb_l' ? 1.5 : 1))); log(`${ITEMS[k].name}を使った。HPが${h}回復した。`); save(); return true;
  }
  if (k === 'bandage') {
    const x = G.injuries.find(i => !G.bandaged.includes(i)); if (!x) { log('包帯を巻くようなケガはない。'); return false; }
    G.items[k]--; G.bandaged.push(x); log(`包帯を巻いた。${INJURIES[x].name}が、ひとまず楽になった。\n（町に戻ったら治療院へ）`); save(); return true;
  }
  if (k === 'bird') {
    if (!Object.values(G.carry).some(n => n > 0)) { log('運んでもらう戦利品がない。'); return false; }
    G.items[k]--; const t = matText(G.carry);
    for (const [m, n] of Object.entries(G.carry)) add(RAW[m] ? G.raw : G.store, m, n); G.carry = {}; save();
    log(`鳥が戦利品を足につかんで、窓の外へ飛んでいった。\n工房へ: ${t}`, true); return true;
  }
  if (k === 'ward' || k === 'lure') { G.items[k]--; G.enc = { k, floors: 3 }; save(); log(k === 'ward' ? '魔除けを焚いた。魔物の気配が遠のく。（3フロア）' : '魔寄せを焚いた。魔物の気配が近づいてくる……。（3フロア）', true); return true; }
  if (k === 'wing') { G.items[k]--; flashIn(); toTown('帰還の羽が光った。', true); return true; }
  return false;
}
// 塔の中の道具メニュー
function itemMenu() {
  const L = Object.entries(ITEMS).filter(([k]) => G.items[k] > 0).map(([k, it]) => ({ t: it.name, s: `${G.items[k]}個・${it.short}`, f: () => { const ok = useItem(k); if (mode === 'dungeon' && k !== 'wing') { if (ok) dungeonUI(); } } }));
  if (!L.length) L.push({ title: '道具を持っていない' });
  L.push({ t: '戻る', hot: true, f: () => { facingNote(); dungeonUI(); } });
  buttons(L); log(G.enc ? `${ITEMS[G.enc.k].name}: あと${G.enc.floors}フロア` : 'どれを使う？', true);
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
function pickMonster() {
  const pool = MONSTERS.filter(m => m.from <= floorNo);
  if (TODAY.goblin && floorNo >= 3) pool.push(MONSTERS.find(m => m.id === 'goblin'), MONSTERS.find(m => m.id === 'goblin'));
  const base = pool[Math.floor(R() * pool.length)], k = 1 + (floorNo - base.from) * .15, dz = TODAY.danger ? 1.2 : 1, rw = TODAY.danger ? 1.4 : 1;
  return { ...base, hp: Math.round(base.hp * k * dz), atk: Math.round(base.atk * k * dz), def: Math.round(base.def * k), exp: Math.round(base.exp * k * rw), gold: Math.round(base.gold * k * rw) };
}
function apBase() { return 3 + (has('p_ap') ? 1 : 0) - (hurt('rib') ? 1 : 0); }
const hurt = k => G.injuries.includes(k) && !G.bandaged.includes(k);
// ケガをする（すでに全部のケガをしていたら何もしない）
function injure() { const k = Object.keys(INJURIES).filter(x => !hurt(x)); if (!k.length) return null; const x = pick(k); G.injuries.push(x); return x; }
function startBattle(boss) {
  const m = boss ? { ...boss } : pickMonster();
  m.mhp = m.hp;
  B = { m, ap: apBase() + (G.meal === 'spark' ? 1 : 0), cut: 1, counter: null, dodge: 0, boost: 1, stun: false, broken: 0, turn: 1, over: false };
  mode = 'battle'; encounterFx(m);
  setTimeout(() => { if (B && B.m) { if (B.m.boss) sfx('bossstep'); sfx(CRY_SFX[B.m.id] || 'swing', { delay: B.m.boss ? 500 : 0 }); } }, 150);
  checkLearn(job());
  log(`${m.name}が現れた！`, true);
  if (G.ally) log(`${TOWER_NPCS[G.ally.id].name}が一緒に戦ってくれる（あと${G.ally.left}回）。`);
  if (G.als && floorNo <= 10) log('アルスも剣を構えた。');
  // 70〜95階: ジンの影が現れて、一閃して去っていく
  if (!boss && floorNo >= 70 && floorNo <= 95 && R() < .04) { playFx('jin', { x: VW / 2, y: VH / 2 }); m.hp = 0; win(); log('……どこからか、杖をついた老人の影が現れた。\n一閃。魔物は倒れ、影はもういない。'); return; }
  if (has('p_first')) { const d = dmgTo(m, atkPower() * .8); log(`先制！ ${d}のダメージ。`); if (m.hp <= 0) { win(); return; } }
  battleUI(); hud();
}
// レベルアップ: 画面全体に大きく出す（押すか2.4秒で消える）
function levelUpFx(lv, up) {
  bigFx(`<b>LEVEL UP!</b><em>Lv ${lv}</em><span>最大HP +${up.hp}　攻 +${up.atk}　守 +${up.def}</span><small>${job()}の伸び方</small>`, 'levelup');
}
// 画面全体に大きく出す（レベルアップ・ギルドの報酬）。押すか2.4秒で消える
function bigFx(html, snd, cls) {
  let d = $('lvup'); if (!d) { d = document.createElement('div'); d.id = 'lvup'; document.body.appendChild(d); d.onclick = () => d.classList.remove('on'); }
  d.innerHTML = `<div>${html}</div>`; d.className = cls || '';
  void d.offsetWidth; d.classList.add('on'); if (snd) sfx(snd, { vol: 1 });
  clearTimeout(bigFx.t); bigFx.t = setTimeout(() => d.classList.remove('on'), 2600);
}
// 遭遇の演出: 画面全体が黄色く光る → 揺れる →「遭遇！」の帯と魔物の名前。少しの間ボタンは押せない
function encounterFx(m) {
  const fl = $('flash'); if (fl) { fl.className = ''; void fl.offsetWidth; fl.className = m.boss ? 'on boss' : 'on'; }
  const v = $('view'); v.classList.remove('quake'); void v.offsetWidth; v.classList.add('quake'); setTimeout(() => v.classList.remove('quake'), 500);
  const old = v.querySelector('.enc'); if (old) old.remove();
  const e = document.createElement('div'); e.className = 'enc' + (m.boss ? ' boss' : '');
  e.innerHTML = `<b>${m.boss ? '強敵' : '遭遇'}！</b><span>${m.name}</span>`; v.appendChild(e); setTimeout(() => e.remove(), 1500);
  sfx('shock1', { vol: .5, max: .5 });
  const c = $('ctl'); c.classList.add('wait'); setTimeout(() => c.classList.remove('wait'), 750);
}
// 戦闘: 技を押して「行動の予定」に並べる（APはその場で減る）→「行動」で順番に実行 → 敵の番
// 予定は押すと取り消せる。予定が空のまま押すと、そのままターン終了（APを持ち越す）
const FIXED_CMD = ['attack', 'guard', 'herb', 'flee'];
const battleSkills = () => [...new Set([...G.loadout.skills.filter(id => G.learned.includes(id) && SKILLS[id]).slice(0, SKILL_MAX), ...(hasShield() ? ['counter', 'wall'] : [])])].filter(id => !FIXED_CMD.includes(id));
const canPlan = id => !B.over && !B.running && B.ap >= apCost(id) && !(id === 'flee' && B.m.boss) && (id !== 'herb' || battleItemList().length > 0) && !B.plan.some(p => p.id === 'flee');
const whyNot = id => B.ap < apCost(id) ? 'APが足りない' : id === 'flee' && B.m.boss ? 'ボスからは逃げられない' : B.plan.some(p => p.id === 'flee') ? '逃げる予定' : '';
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
    if (i < list.length) setTimeout(step, 750); else setTimeout(() => { if (!B || B.over) return; B.running = false; endTurn(); }, 700);
  };
  setTimeout(step, 450);
}
function doItem(k) {
  if (useItem(k)) playFx(k === 'bandage' ? 'heal_leaf' : 'heal', { self: true, size: .9 });
  else log(`${ITEMS[k].name}は使わなかった。`);
  return 'ok';
}
// 重い武器（斧・刀・大剣）は、ふつうの攻撃にAPが2かかる。軽い武器ほど回避しやすい
const apCost = id => id === 'attack' && isHeavy() ? 2 : SKILLS[id].ap;
const evade = () => hurt('leg') ? 0 : (isHeavy() ? .03 : .10) + (mainWeapon() && mainWeapon().type === 'dagger' ? .05 : 0);
const carryMax = () => 1 + (has('p_carry') ? 1 : 0);
function dmgTo(m, power, pierce, critBonus) {
  let d = Math.max(1, Math.round((power - (pierce ? 0 : Math.max(0, m.def - B.broken))) * (.85 + R() * .3)));
  const crit = !hurt('head') && R() < .08 + (critBonus || 0) + (has('p_crit') ? .15 : 0);
  if (crit) { d = Math.round(d * 1.8); B.lastCrit = true; playFx('crit', { delay: 120, size: .7 }); } else B.lastCrit = false;
  m.hp -= d; fx.hit = .6; B.anim = { kind: 'hit', t0: performance.now() }; fx.shake = Math.min(8, 2 + d / 6); return d;
}
function healMe(n) { const h = Math.min(G.mhp - G.hp, n); G.hp += h; return h; }
function doSkill(id) {
  if (B.over) return 'end'; const s = SKILLS[id], m = B.m;
  skillFx(id);
  const power = atkPower() * (s.mult || 1) * B.boost * (B.turn === 1 && has('p_focus') ? 1.5 : 1) + (s.magic ? G.lv * 2 : 0);
  switch (s.kind) {
    case 'atk': {
      if (s.kill && !m.boss && R() < s.kill) { m.hp = 0; fx.hit = 1; B.anim = { kind: 'hit', t0: performance.now() }; log(`${s.name}！ 急所を貫いた。`); break; }
      const ds = []; let crit = false;
      for (let i = 0; i < (s.hits || 1); i++) { ds.push(dmgTo(m, power, s.pierce, s.crit)); crit = crit || B.lastCrit; if (m.hp <= 0) break; }
      let t = `${s.name}！ ${ds.join('と')}のダメージ。${crit ? '会心！' : ''}`;
      if (s.break) { B.broken += s.break; t += '守りが崩れた。'; }
      if (s.self) { const c = Math.ceil(G.mhp * s.self); G.hp = Math.max(1, G.hp - c); t += `HPを${c}削った。`; }
      if (s.heal) t += `HPが${healMe(s.heal + G.lv * 3)}回復。`;
      if (s.stun && m.hp > 0 && !m.boss && R() < s.stun) { B.stun = true; t += `${m.name}は動けない！`; }
      if (s.guardToo) B.cut = Math.min(B.cut, .5);
      if (s.stealToo && m.hp > 0 && R() < (has('p_steal') ? .7 : .4)) { const k = Object.keys(m.drop)[0]; add(G.carry, k, 1); t += `${NAMES[k]}を奪った！`; }
      log(t); break;
    }
    case 'heal': log(`${s.name}。HPが${healMe(s.heal + G.lv * 4)}回復。`); break;
    case 'guard': B.cut = Math.min(B.cut, s.cut * (has('p_guard') ? .7 : 1)); log(`${s.name}。守りを固めた。${s.heal ? `HPが${healMe(s.heal + G.lv * 3)}回復。` : ''}`); break;
    case 'counter': B.counter = { cut: s.cut, back: s.back }; log(`${s.name}。次の攻撃に備えた。`); break;
    case 'buff': B.boost = s.boost; log(`${s.name}。このターンの攻撃が強くなる。`); break;
    case 'dodge': B.dodge = s.dodge; log(`${s.name}！`); break;
    case 'steal': { const k = Object.keys(m.drop)[0]; if (R() < (has('p_steal') ? .8 : .5)) { add(G.carry, k, 1); log(`${NAMES[k]}を盗んだ！`); } else log('盗めなかった。'); break; }
    case 'flee': if (R() < (hurt('leg') ? .25 : .5)) { allyTick(); log('逃げ出した！', true); B = null; mode = 'dungeon'; dungeonUI(); hud(); return 'end'; } log('逃げられない！'); break;
  }
  if (m.hp <= 0) { win(); return 'end'; }
  return 'ok';
}
function endTurn() {
  if (!B || B.over) return; const m = B.m;
  if (allyTurn()) return;
  const carry = Math.min(carryMax(), B.ap);
  if (B.stun) { log(`${m.name}は動けない。`); B.stun = false; }
  else {
    // 敵の番（ボスは2回動くことがある）
    const times = m.boss && R() < .4 ? 2 : 1;
    for (let i = 0; i < times; i++) {
      B.anim = { kind: 'attack', t0: performance.now() };
      if ((B.dodge && R() < B.dodge) || R() < evade()) { playFx('afterimage', { self: true, size: .8 }); log(`${m.name}の攻撃。かわした！`); continue; }
      let d = Math.max(1, Math.round((m.atk - defPower()) * (.85 + R() * .3)));
      playFx(B.counter || B.cut < 1 ? 'spark' : (m.id === 'rat' || m.id === 'centipede' ? 'bite' : 'claw'), { y: VH * .6, size: 1.1 });
      if (B.counter) { d = Math.ceil(d * B.counter.cut); const c = dmgTo(m, atkPower() * B.counter.back); log(`受け止めて反撃！ ${c}のダメージ。`); B.counter = null; }
      else d = Math.ceil(d * B.cut);
      if (m.boss && G.bless === 'ward') d = Math.ceil(d * .7);
      G.hp -= d; fx.flash = .8; fx.shake = 6; log(`${m.name}の攻撃。${d}のダメージを受けた。`);
      // 大きな一撃（最大HPの35%以上）はケガが残ることがある
      if (G.hp > 0 && d >= G.mhp * .35 && R() < .25) { const x = injure(); if (x) log(`${INJURIES[x].name}をした！（${INJURIES[x].desc}）`); }
      if (m.hp <= 0) { win(); return; }
      if (G.hp <= 0 && G.bless === 'stand' && !B.stood) { G.hp = 1; B.stood = true; G.bless = null; playFx('blessing', { self: true, size: 1.2 }); say('resolve', '「……まだだ！」\nエリーの祈りで、踏みとどまった！'); continue; }
      if (G.hp <= 0) { lose(); return; }
    }
  }
  if (has('p_regen')) healMe(3);
  B.cut = 1; B.boost = 1; B.dodge = 0; B.turn++; B.ap = apBase() + carry; B.plan = []; B.running = false; battleUI(); hud();
  if (B.auto) setTimeout(autoTurn, 550);
}
function win() {
  sfx('win', { delay: 300, max: G.exp + B.m.exp >= expNeed() ? .9 : 0 });
  const m = B.m; B.over = true; B.dying = performance.now();
  G.exp += m.exp; G.gold += m.gold; allyTick();
  for (const [k, n] of Object.entries(m.drop)) if (m.boss || R() < Math.min(.98, (TODAY.drop || .8) + (has('p_loot') ? .12 : 0))) add(G.carry, k, n);
  if (G.meal === 'broth') { G.hp = Math.min(G.mhp, G.hp + 6); }
  let msg = `${m.name}を倒した！ 経験値${m.exp}、${m.gold}G。素材: ${matText(m.drop)}`;
  if (G.exp >= expNeed()) setTimeout(() => playFx('levelup', { self: true, size: 1.2 }), 500);
  { const up = { hp: 0, atk: 0, def: 0 }, lv0 = G.lv;
    while (G.exp >= expNeed()) { G.exp -= expNeed(); G.lv++; const g = (JOBS[job()] || JOBS['素手']).grow; G.mhp += g.hp; G.hp += g.hp; G.atk += g.atk; G.def += g.def; up.hp += g.hp; up.atk += g.atk; up.def += g.def; }
    if (G.lv > lv0) { msg += `\nレベル${G.lv}になった！`; setTimeout(() => levelUpFx(G.lv, up), 900); } }
  if (m.boss) { G.bossDown = true; msg += '\n10階の主を倒した。上への道が開いた。'; }
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
  buttons([{ t: '先へ進む', hot: true, f: () => { B = null; mode = 'dungeon'; dungeonUI(); hud(); } }]);
  hud();
}
function lose() {
  sfx('fall'); SND.lost = true;
  B.over = true; let kept = '';
  if (has('p_keep')) { const k = {}; for (const [m, n] of Object.entries(G.carry)) { const h = Math.floor(n / 2); if (h) { k[m] = h; add(RAW[m] ? G.raw : G.store, m, h); G.carry[m] -= h; } } kept = matText(k); }
  const lost = matText(G.carry), lostG = G.gold;
  const inj = injure(); G.runs++; G.ally = null; G.bandaged = []; G.enc = null; G.als = false;
  G.carry = {}; G.gold = 0; G.bless = null; endMeal(); endRun(); rollRumor(); G.hp = G.mhp; FLOORS = {}; save();
  say('sad', `倒れた……。素材（${lost}）と、手持ちの${lostG}Gはなくなった。${kept !== '' && kept !== 'なし' ? `\n持ち帰りのおかげで、${kept}は工房に残った。` : ''}`, true);
  buttons([{ t: '……', hot: true, f: () => { mode = 'town'; B = null; F = null; if (evReady('elly', .6)) { SND.lost = false; ellieEvent(inj); return; } inside('clinic'); say('wince', `気がつくと治療院の天井だった。${inj ? INJURIES[inj].name + 'が残っている。' : ''}\nエリー「もう、心配したんですから。レベルと装備は無事です」\n「……っ、またやられたか」`, true); hud(); } }]);
}

// ---------- 魔物の絵（待機・攻撃・攻撃を受けた の3枚＋コードの動き） ----------
const MON_IMG = {};
for (const [k, src] of Object.entries(ASSETS.mon || {})) { const i = new Image(); i.src = src; MON_IMG[k] = i; }
function drawMonster(m, t) {
  const idle = MON_IMG[m.id + '_idle'];
  if (idle && idle.complete) { drawMonsterImg(m, t); return; }
  drawMonsterShape(m, t);
}
// ---------- 戦闘エフェクト ----------
// 絵（fx.js）を1コマもらい、動きはコードでつける。絵と同じ色の光と粒を重ねて、切り口をなじませる
const FXI = {}; if (typeof FX_IMG !== 'undefined') for (const [k, s] of Object.entries(FX_IMG)) { const i = new Image(); i.src = s; FXI[k] = i; }
let fxList = [], fxParts = [];
// 動き方: slash=さっと広がって消える burst=はじける travel=下から飛んでいって当たる rise=足元から昇る screen=画面全体に
const FX_MOVE = {
  slash_h:'slash', slash_v:'slash', slash_x:'slash', iai:'slash', tsubame:'slash', flurry:'slash', claw:'slash', bite:'burst', dark_blade:'slash',
  impact:'burst', impact_heavy:'burst', crit:'burst', spark:'burst', thunder:'burst', thunder_ball:'burst', ice_burst:'burst', explosion:'burst', holy_cross:'burst', dark_mist:'burst', poison:'burst', rocks:'burst', fire_l:'burst', wind:'burst', magic_circle:'burst', smoke:'burst', sparkle:'burst', stun:'burst', paralyze:'burst', poison_bubble:'burst', sleep:'burst',
  thrust:'travel', arrow:'travel', magic_arrow:'travel', fire_s:'travel', ice_spear:'travel',
  heal:'rise', heal_leaf:'rise', holy_pillar:'rise', barrier:'rise', power:'rise', speed:'rise', pray:'rise', levelup:'rise', blessing:'rise', warp:'rise', bunshin:'rise', afterimage:'rise',
  jin:'screen',
};
const FX_DUR = { slash: 380, burst: 520, travel: 520, rise: 900, screen: 700 };
function playFx(name, opt = {}) {
  const img = FXI[name], meta = (typeof FX_META !== 'undefined' && FX_META[name]) || { c: '#ffffff', add: true };
  if (!img) return;
  if (FX_SFX[name]) sfx(FX_SFX[name], { delay: opt.delay || 0, max: 2.5 });
  const mv = FX_MOVE[name] || 'burst', self = opt.self || mv === 'rise';
  const x = opt.x !== undefined ? opt.x : VW / 2 + (self ? 0 : (R() - .5) * 20), y = opt.y !== undefined ? opt.y : self ? VH * .62 : VH * .52;
  fxList.push({ name, img, meta, mv, x, y, t0: performance.now() + (opt.delay || 0), dur: FX_DUR[mv] * (opt.slow || 1), size: opt.size || (mv === 'screen' ? 2.8 : self ? 1.05 : .95), rot: opt.rot !== undefined ? opt.rot : mv === 'slash' ? (R() - .5) * .5 : 0, flip: R() < .5 && mv === 'slash' });
  // 同じ色の粒
  const n = opt.parts !== undefined ? opt.parts : mv === 'rise' ? 18 : 14;
  for (let i = 0; i < n; i++) {
    const a = mv === 'rise' ? -Math.PI / 2 + (R() - .5) * 1.2 : R() * Math.PI * 2, sp = mv === 'rise' ? 20 + R() * 40 : 40 + R() * 110;
    fxParts.push({ x: x + (mv === 'rise' ? (R() - .5) * 70 : 0), y: y + (mv === 'rise' ? 30 : 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: meta.c, t0: performance.now() + (opt.delay || 0) + (mv === 'travel' ? 260 : 0), life: 380 + R() * 420, r: 1 + R() * 1.8, add: meta.add });
  }
}
function drawFx() {
  if (!fxList.length && !fxParts.length) return;
  const t = performance.now();  // playFx と同じ時計を使う
  ctx.save();
  fxList = fxList.filter(e => t - e.t0 < e.dur);
  for (const e of fxList) {
    const k = (t - e.t0) / e.dur; if (k < 0) continue;
    const base = VH * .55 * e.size, w = base * e.img.width / Math.max(e.img.width, e.img.height), h = base * e.img.height / Math.max(e.img.width, e.img.height);
    let s = 1, a = 1, x = e.x, y = e.y;
    if (e.mv === 'slash') { s = .75 + k * .45; a = k < .2 ? k / .2 : 1 - (k - .2) / .8; }
    if (e.mv === 'burst') { s = .5 + Math.pow(k, .5) * .8; a = k < .15 ? k / .15 : 1 - (k - .15) / .85; }
    if (e.mv === 'travel') { const q = Math.min(1, k / .5); x = VW / 2 + (e.x - VW / 2) * q; y = VH * 1.05 + (e.y - VH * 1.05) * q; s = .6 + q * .5; a = k < .5 ? 1 : 1 - (k - .5) / .5; }
    if (e.mv === 'rise') { s = .9 + k * .15; y = e.y - k * 18; a = k < .2 ? k / .2 : 1 - (k - .2) / .8; }
    if (e.mv === 'screen') { s = 1 + k * .2; a = k < .1 ? k / .1 : 1 - (k - .1) / .9; }
    // うしろの光（絵と同じ色）
    ctx.globalCompositeOperation = e.meta.add ? 'lighter' : 'source-over';
    const r = Math.max(w, h) * s * .55, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, e.meta.c + (e.meta.add ? '66' : '33')); gr.addColorStop(1, e.meta.c + '00');
    ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.translate(x, y); ctx.rotate(e.rot); if (e.flip) ctx.scale(-1, 1);
    ctx.drawImage(e.img, -w * s / 2, -h * s / 2, w * s, h * s);
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
  shieldbash:['impact'], fire:['fire_s','fire_l'], sagefire:['fire_l'], ice:['ice_spear','ice_burst'], bolt:['thunder'], holy:['holy_pillar'], magicblade:['slash_x','fire_s'], darkblade:['dark_blade','dark_mist'],
  arcanearrow:['magic_circle','magic_arrow'], bomb:['explosion'], heal:['heal'], guard:['barrier'], wall:['barrier'], holyguard:['barrier','pray'], counter:['barrier'], mikiri:['afterimage'],
  hone:['power'], bunshin:['bunshin'], steal:['sparkle'],
};
const WEAPON_FX = { sword:'slash_h', katana:'iai', axe:'impact_heavy', greatsword:'slash_v', hammer:'impact_heavy', dagger:'thrust', bow:'arrow', book:'magic_arrow', staff:'impact' };
function skillFx(id) {
  let list = SKILL_FX[id];
  if (id === 'attack') { const w = mainWeapon(); let n = w ? WEAPON_FX[w.type] : 'impact'; if (n === 'slash_h' && R() < .5) n = 'slash_v'; list = [n]; }
  if (!list) return;
  const self = ['heal', 'guard', 'wall', 'holyguard', 'counter', 'mikiri', 'hone', 'bunshin'].includes(id);
  list.forEach((n, i) => playFx(n, { delay: i * 160, self }));
}
function drawMonsterImg(m, t) {
  const A = B.anim || {}, dt = t - (A.t0 || -1e9);
  let pose = 'idle', sx = 1, sy = 1, ox = 0, oy = 0, white = 0, alpha = 1;
  // 待機: ゆっくり呼吸
  sy = 1 + Math.sin(t / 420) * .015; sx = 1 - Math.sin(t / 420) * .008;
  if (A.kind === 'attack' && dt < 480) { pose = 'attack'; const k = Math.sin(Math.min(1, dt / 480) * Math.PI); sx *= 1 + k * .14; sy *= 1 + k * .14; oy = k * 10; }
  if (A.kind === 'hit' && dt < 360) { pose = 'hit'; const k = 1 - dt / 360; ox = Math.sin(dt / 25) * 5 * k; oy = -4 * k; white = dt < 90 ? .75 : 0; }
  if (B.dying) { const d = Math.min(1, (t - B.dying) / 700); pose = 'hit'; alpha = 1 - d; oy = d * 18; sy *= 1 - d * .25; white = d < .2 ? .6 : 0; }
  const img = MON_IMG[m.id + '_' + pose] || MON_IMG[m.id + '_idle'];
  const H = VH * (m.size || .7), W = H * img.width / img.height, cx = VW / 2 + ox, by = VH * .93 + oy;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, by - 2, W * .38, 8, 0, 0, 7); ctx.fill();
  ctx.imageSmoothingEnabled = true; ctx.drawImage(img, cx - W * sx / 2, by - H * sy, W * sx, H * sy);
  if (white > 0) { // 当たった瞬間に白く光らせる
    if (!drawMonsterImg.c) drawMonsterImg.c = document.createElement('canvas');
    const o = drawMonsterImg.c; o.width = img.width; o.height = img.height; const g = o.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height);
    ctx.globalAlpha = white * alpha; ctx.drawImage(o, cx - W * sx / 2, by - H * sy, W * sx, H * sy);
  }
  ctx.restore();
  drawMonsterBar(m);
}
function drawMonsterBar(m) {
  const w = 120, x = VW / 2 - w / 2, y = 6;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 4, y - 2, w + 8, 24);
  ctx.fillStyle = '#efe3cc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.name, VW / 2, y + 10);
  ctx.fillStyle = '#3a1410'; ctx.fillRect(x, y + 14, w, 5); ctx.fillStyle = '#d9553f'; ctx.fillRect(x, y + 14, w * Math.max(0, m.hp) / m.mhp, 5);
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
  ctx.fillStyle = '#efe3cc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.name, cx, y + 20);
}

// ---------- 町の絵（仮） ----------
function drawTown(t) {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#2a3550'); g.addColorStop(.6, '#c98a5a'); g.addColorStop(1, '#3a2a20');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.moveTo(140, VH); ctx.lineTo(150, 10); ctx.lineTo(170, 10); ctx.lineTo(180, VH); ctx.fill();
  for (let i = 0; i < 9; i++) ctx.fillRect(130 + (i % 2) * 4, VH - 20 - i * 24, 60 - (i % 2) * 8, 3);
  ctx.fillStyle = '#120d0a'; for (let i = 0; i < 8; i++) { const x = i * 42 - 10, h = 40 + hash(i, 1, 3) * 40; ctx.fillRect(x, VH - h, 36, h); ctx.beginPath(); ctx.moveTo(x - 4, VH - h); ctx.lineTo(x + 18, VH - h - 18); ctx.lineTo(x + 40, VH - h); ctx.fill(); }
  ctx.fillStyle = '#ffb35a'; for (let i = 0; i < 8; i++) { if (hash(i, 2, 5) < .6) ctx.fillRect(i * 42 + 2, VH - 30, 6, 6 + Math.sin(t / 400 + i) * .5); }
  ctx.fillStyle = 'rgba(255,190,110,.85)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('塔の国　鍛冶屋の工房', 8, 18);
}

// ---------- ループ ----------
function loop(t) {
  if (mode === 'dungeon' || mode === 'battle') {
    const k = .2; P.x += (T.x - P.x) * k; P.y += (T.y - P.y) * k; P.a += (T.a - P.a) * k;
    if (busy && Math.abs(T.x - P.x) < .01 && Math.abs(T.y - P.y) < .01 && Math.abs(T.a - P.a) < .01) { P.x = T.x; P.y = T.y; P.a = T.a; busy = false; }
    if (TEX.ready && F) renderView(ctx, F, P, t, mode === 'battle' ? .5 : 1);
    if (mode === 'battle' && B && (B.m.hp > 0 || (B.dying && t - B.dying < 700))) drawMonster(B.m, t);
    if (mode === 'battle' || mode === 'dungeon') drawFx();
    if (F) { mapCv.style.display = mode === 'battle' ? 'none' : ''; renderMap(mapCtx, F, P); }
  } else { mapCv.style.display = 'none'; }
  if (fx.flash > .02) { ctx.fillStyle = `rgba(255,60,40,${fx.flash * .35})`; ctx.fillRect(0, 0, VW, VH); fx.flash *= .85; }
  if (fx.hit > .02) { ctx.fillStyle = `rgba(255,255,255,${fx.hit * .25})`; ctx.fillRect(0, 0, VW, VH); fx.hit *= .7; }
  if (fx.shake > .3) { cv.style.transform = `translateX(-50%) translate(${(R() - .5) * fx.shake}px,${(R() - .5) * fx.shake}px)`; fx.shake *= .8; } else cv.style.transform = '';
  requestAnimationFrame(loop);
}

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
{ const b = document.getElementById('snd'); if (b) { b.classList.toggle('off', !SND.on); b.addEventListener('click', e => { e.stopPropagation(); b.classList.toggle('off', !SND.toggle()); }); } }

// 塔の中: 地図を押すと大きくなる（もう一度押すか、画面を押すと戻る）
(() => {
  const mp = $('map');
  mp.addEventListener('click', e => { e.stopPropagation(); mp.classList.toggle('big'); });
})();
