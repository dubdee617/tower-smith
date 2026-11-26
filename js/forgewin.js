// ===== 工房の鍛冶を、画面全体の窓で（2026-11-25） =====
// 上: 種類（武器・防具・ツール・名品）／素材／棚（素材の段階）
// 中: 一覧（窓の高さに合わせて1ページの数を決める）
// 下: 選んだ物のくわしい情報（今の装備との比較・必要な素材）と「打つ」ボタン
// 窓の大きさは決まっているので、選んでもボタンの位置は動かない
const FW = { cat: 'weapon', shelf: {}, page: 0, sel: null, per: 8, msg: '' };
const FW_CATS = ['weapon', 'armor', 'tool', 'meika'];

function fwRecipes(cat) {
  const f = FORGE_CAT[cat][1];
  return RECIPES.filter(r => f(r) && (cat === 'meika' || needFurnace(r) <= upLv('furnace') + 1))
    .sort((a, b) => canMake(b) - canMake(a) || needFurnace(b) - needFurnace(a));
}
function fwShelves(cat) {
  const rs = fwRecipes(cat), name = FORGE_CAT[cat][0];
  return (SHELF[cat] || [[name, () => true]]).map(([n, g]) => [n, rs.filter(g)]).filter(x => x[1].length);
}
// 呼び出し口（前の forgeList・forgeConfirm の代わり）
function forgeList(cat, msg) {
  if (cat !== FW.cat || !$('fw')) {
    FW.cat = cat; FW.page = 0; FW.sel = null;
    const sh = fwShelves(cat);
    if (FW.shelf[cat] === undefined || FW.shelf[cat] >= sh.length) {
      /* はじめに開く棚: 打てる物がある、いちばん新しい棚。なければ炉が足りている、いちばん新しい棚 */
      let i = -1; for (let j = sh.length - 1; j >= 0 && i < 0; j--) if (sh[j][1].some(canMake)) i = j;
      for (let j = sh.length - 1; j >= 0 && i < 0; j--) if (sh[j][1].some(r => upLv('furnace') >= needFurnace(r))) i = j;
      FW.shelf[cat] = cat === 'meika' ? 0 : Math.max(0, i);
    }
  }
  FW.msg = msg || ''; fwDraw();
}
function forgeConfirm(cat, r) { FW.cat = cat; FW.sel = r.id; const sh = fwShelves(cat), i = sh.findIndex(x => x[1].includes(r)); if (i >= 0) FW.shelf[cat] = i; fwDraw(); }
function fwClose() { const w = $('fw'); if (w) w.remove(); forge(); }

function fwDraw() {
  let w = $('fw');
  if (!w) { w = document.createElement('div'); w.id = 'fw'; document.body.appendChild(w); }
  const cat = FW.cat, shelves = fwShelves(cat), si = Math.min(FW.shelf[cat] || 0, Math.max(0, shelves.length - 1)), list = shelves[si] ? shelves[si][1] : [];
  const pages = Math.max(1, Math.ceil(list.length / FW.per)); FW.page = Math.min(FW.page, pages - 1);
  const items = list.slice(FW.page * FW.per, FW.page * FW.per + FW.per);
  let sel = FW.sel ? RECIPES.find(r => r.id === FW.sel) : null;
  if (sel && !list.includes(sel)) { FW.sel = null; sel = null; }
  const have = Object.keys(MATS).filter(k => G.store[k] || ['copper', 'iron', 'bone', 'leather', 'stone', 'wood'].includes(k)).map(k => `<span>${icoImg(k)}${G.store[k] || 0}</span>`).join('');
  const catBtn = k => { const n = fwRecipes(k).filter(canMake).length; return `<button data-cat="${k}" class="${k === cat ? 'on' : ''}">${FORGE_CAT[k][0]}${n ? `<i>${n}</i>` : ''}</button>`; };
  const card = r => {
    const ok = canMake(r), lock = upLv('furnace') < needFurnace(r), c = cmpNow(r), src = iconOfType(r);
    const stat = r.type === 'tool' ? `${TOOL_NAMES[r.tool]}・耐久${r.dur}` : `${gearKind(r.type)}${r.atk ? ' 攻' + (r.atk + upLv('anvil')) : ''}${r.def ? ' 守' + (r.def + upLv('anvil')) : ''}`;
    const d = c ? `${dTag(c.da, '攻')}${dTag(c.dd, '守')}` : '';
    return `<button class="fwi${r.type === 'tool' ? ' tl' : ''}${ok ? '' : ' dim'}${sel === r ? ' sel' : ''}" data-id="${r.id}">${src ? `<img src="${src}" alt="">` : ''}<span class="nm">${r.name}</span><span class="sp">売${sellPrice(r)}G</span><small>${stat}</small><span class="dl">${lock ? `<em class="lk">炉Lv${needFurnace(r)}</em>` : d}</span></button>`;
  };
  // 下のくわしい情報
  let det = '', acts = '';
  if (!list.length) det = `<p class="fwnone">${cat === 'meika' ? '設計図がまだない。宝箱・主・ミミックから、まれに見つかる。' : '打てる物がない。'}</p>`;
  else if (!sel) det = `<p class="fwnone">${FW.msg ? FW.msg.replace(/\n/g, '<br>') : '打ちたい物を選ぶ。足りない素材は赤く出る。'}</p>`;
  else {
    const c = cmpNow(sel), lock = upLv('furnace') < needFurnace(sel), cost = costOf(sel);
    const max = lock ? 0 : Math.min(10, ...Object.entries(cost).map(([k, n]) => Math.floor((G.store[k] || 0) / n)));
    const row = (l, a, b, dd) => `<tr><th>${l}</th><td>${a}</td><td class="ar">→</td><td><b>${b}</b></td><td class="${dd > 0 ? 'up' : dd < 0 ? 'dn' : ''}">${dd > 0 ? '▲' + dd : dd < 0 ? '▼' + (-dd) : '±0'}</td></tr>`;
    let tbl = '';
    if (c) { const ca = c.cur ? c.cur.atk || 0 : 0, cd = c.cur ? c.cur.def || 0 : 0;
      tbl = `<div class="fwcur">今の装備: ${c.cur ? c.cur.name : 'なし'}</div><table>${c.atk || ca ? row('攻撃', ca, c.atk, c.da) : ''}${c.def || cd ? row('守り', cd, c.def, c.dd) : ''}</table>`;
      if (!['armor', 'shield'].includes(sel.type) && WEAPON_TYPES[sel.type]) { const mw = mainWeapon(); if (!mw || mw.type !== sel.type) tbl += `<div class="fwjob">持つと、ジョブは「${WEAPON_TYPES[sel.type].job}」の系統になる</div>`; } }
    else { const tt = sel.tt || 0, hits = tt >= 3 ? 'どこでも1回' : tt === 2 ? '◎1回 ◯2回 △4回' : '◎2回 ◯3回 △5回';
      tbl = `<div class="fwcur">${TOOL_NAMES[sel.tool] || ''}・耐久${sel.dur || ''}</div><div class="fwjob">壁を崩す回数: ${hits}</div>`; }
    det = `<div class="fwdh"><b>${sel.name}${upLv('anvil') && sel.type !== 'tool' ? '+' + upLv('anvil') : ''}</b><span class="sellp">売値${sellPrice(sel)}G</span></div>${tbl}${sel.desc ? `<div class="fwds">${sel.desc}</div>` : ''}<div class="fwneed">1本に: ${needHtml(sel)}</div>`;
    if (lock) acts = `<div class="fwwhy">${['', '鉄', '銀', 'ミスリル', 'オリハルコン'][needFurnace(sel)]}を打つには、炉をLv${needFurnace(sel)}に（工房の強化）</div>`;
    else if (!max) acts = `<div class="fwwhy">足りない: ${lackText(sel)}</div>`;
    else { const qs = [...new Set([1, 2, 3, 5, max].filter(q => q >= 1 && q <= max))].slice(-4); if (!qs.includes(1)) qs.unshift(1);
      acts = qs.slice(0, 4).map((q, i) => `<button data-make="${q}" class="${i === 0 ? 'hot' : ''}">${q === max && q > 1 && ![1, 2, 3, 5].includes(q) ? `作れるだけ（${q}本）` : `${q}本打つ`}</button>`).join(''); }
  }
  w.innerHTML = `<div class="fwp">
    <div class="fwh"><b>鍛冶</b><small>炉Lv${upLv('furnace')} 金床Lv${upLv('anvil')} 作業台Lv${upLv('bench')}</small><button class="x" data-act="back">戻る</button></div>
    <div class="fwc">${FW_CATS.map(catBtn).join('')}</div>
    <div class="fwm have">${have}</div>
    ${shelves.length > 1 ? `<div class="fws">${shelves.map(([n], i) => `<button data-sh="${i}" class="${i === si ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}
    <div class="fwg">${items.map(card).join('')}</div>
    <div class="fwpg">${pages > 1 ? `<button data-pg="-1" ${FW.page ? '' : 'disabled'}>◀</button><span>${FW.page + 1}/${pages}</span><button data-pg="1" ${FW.page < pages - 1 ? '' : 'disabled'}>▶</button>` : ''}</div>
    <div class="fwd">${det}</div>
    <div class="fwa">${acts}</div></div>`;
  // 押したとき
  w.querySelector('[data-act="back"]').onclick = () => { sfx('select', { vol: .5 }); fwClose(); };
  w.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { sfx('page', { vol: .5 }); forgeList(b.dataset.cat); });
  w.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { sfx('page', { vol: .5 }); FW.shelf[cat] = +b.dataset.sh; FW.page = 0; FW.sel = null; FW.msg = ''; fwDraw(); });
  w.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { sfx('page', { vol: .5 }); FW.page += +b.dataset.pg; fwDraw(); });
  w.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { sfx('select', { vol: .45 }); FW.sel = b.dataset.id; FW.msg = ''; fwDraw(); });
  w.querySelectorAll('[data-make]').forEach(b => b.onclick = () => { if (sel) forgeMake(cat, sel, +b.dataset.make); });
  // 一覧の場所に何個入るかを測る（2列。カードの高さは決まっている）。変わったら描き直す
  const g = w.querySelector('.fwg'), ch = 62, per = Math.max(2, Math.floor((g.clientHeight + 6) / (ch + 6)) * 2);
  if (per !== FW.per && g.clientHeight > 0) { FW.per = per; fwDraw(); }
}
// 打ったあとは、窓を開いたまま「制作中」→ できた物を見せる
function forgeMake(cat, r, q) {
  for (let i = 0; i < q; i++) { if (!canMake(r)) { q = i; break; } for (const [k, n] of Object.entries(costOf(r))) G.store[k] -= n; G.gear.push(newGear(r, true)); }
  G.forged = (G.forged || 0) + q; save();
  const hits = [['forge1', 250], ['forge1', 700], ['forge1', 1150]]; if (q > 1) hits.push(['forge1', 1600], ['forge1', 2050]); hits.push(['forge2', q > 1 ? 2500 : 1600]);
  fadeGo(() => {
    FW.cat = cat; FW.msg = q > 1 ? `「${r.name}を${q}本。……腕が鳴ったな」` : `「${r.name}、できた。悪くない」`; if (!canMake(r)) FW.sel = null; fwDraw();
    const src = iconOfType(r); if (src) bigFx(`<img class="gearimg" src="${src}" alt=""><b>${r.name}${q > 1 ? ` ×${q}` : ''}</b><small>${gearKind(r.type)}${r.atk ? ' 攻' + r.atk : ''}${r.def ? ' 守' + r.def : ''}</small>`, 'equip', 'reward', 2400);
  }, { text: `${r.name}${q > 1 ? ` ×${q}` : ''}\n制作中`, hold: q > 1 ? 2400 : 1500, sfx: hits });
}
