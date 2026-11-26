// ===== 見た目の皮（2026-11-24 試作）: ボタンのアイコン、名札、方角 =====
(() => {
  const IC = [[/^攻撃/, 'sword'], [/^守る/, 'shield'], [/^道具/, 'bag'], [/^逃げる/, 'boot'], [/^オート/, 'gear'], [/^ツール/, 'pick'], [/^調べる/, 'look'],
    [/^(ターン終了|行動)/, 'hourglass'], [/^取り消す/, 'cross'], [/^(入る|外に出る)/, 'door'], [/^(戻る|やめる)/, 'back'], [/^(鍛冶|作る|工房)/, 'hammer'],
    [/^(売る|買う)/, 'coin'], [/^話す/, 'talk'], [/^休む/, 'bed'], [/^薬草/, 'herb']];
  document.documentElement.style.setProperty('--coin', `url("${UI_ICON.coin}")`);
  document.documentElement.style.setProperty('--bag', `url("${UI_ICON.bag}")`);
  // 名前からアイテムの絵を探す（長い名前から順に。「中薬草」が「薬草」にならないように）
  let NAMEMAP = null;
  function itemIcon(t) {
    if (!NAMEMAP) {
      NAMEMAP = [];
      for (const [k, n] of Object.entries(NAMES)) NAMEMAP.push([n, k]);
      for (const [k, v] of Object.entries(ITEMS)) NAMEMAP.push([v.name, k]);
      for (const r of RECIPES) NAMEMAP.push([r.name, r.id]);
      NAMEMAP.sort((a, b) => b[0].length - a[0].length);
    }
    const s = t.replace(/^[「（\s]+/, '');
    for (const [n, k] of NAMEMAP) if (s.startsWith(n)) return iconOf(k);
    return '';
  }
  const label = b => { for (const n of b.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim(); return ''; };
  function icons() {
    for (const b of document.querySelectorAll('#ctl button:not([data-ic])')) {
      b.dataset.ic = 1; const t = label(b); let k = null;
      for (const [re, n] of IC) if (re.test(t)) { k = n; break; }
      if (!k && typeof mode !== 'undefined' && mode === 'battle' && /AP\d/.test(b.textContent)) k = 'star';
      let src = k ? UI_ICON[k] : itemIcon(t);
      if (!src) continue;
      const i = document.createElement('i'); i.className = 'ic' + (k ? '' : ' item'); i.style.backgroundImage = `url("${src}")`; b.insertBefore(i, b.firstChild);
    }
    /* 2026-11-26: 3列のボタンは、アイコンと名前を1行にまとめる。入らないとき（バードキャリーなど）は名前だけ少し詰める */
    for (const b of document.querySelectorAll('#ctl .btns.small button:not([data-fit])')) {
      b.dataset.fit = 1; const t = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue;
      const row = document.createElement('span'); row.className = 'nmrow'; const ic = b.querySelector(':scope > i.ic');
      t.replaceWith(row); if (ic) row.appendChild(ic); row.appendChild(t);
    }
    clearTimeout(icons.ft); icons.ft = setTimeout(fitNames, 30);  /* 英語に置きかわったあとで測る */
    const log = $('log'), n = document.querySelectorAll('#ctl button').length;
    log.classList.toggle('wait', n === 1 && !document.body.classList.contains('title'));
  }
  function fitNames() {
    for (const row of document.querySelectorAll('#ctl .btns.small .nmrow')) {
      const b = row.parentNode, room = () => b.clientWidth - 8; row.classList.remove('fit', 'fit2', 'fit3', 'wrap');
      for (const c of ['fit', 'fit2', 'fit3', 'wrap']) if (row.scrollWidth > room()) row.classList.add(c); else break;
    }
  }
  function who() {
    const w = $('who'), raw = w.textContent; if (w.dataset.raw === raw) return;
    const parts = raw.split(/\s+/).filter(Boolean);
    w.setAttribute('translate', 'no'); w.innerHTML = parts.map(s => `<i class="${/G$/.test(s) ? 'g' : /^ケガ/.test(s) ? 'hurt' : ''}">${tr(/G$/.test(s) ? s.slice(0, -1) : s)}</i>`).join('');
    w.dataset.raw = w.textContent;
  }
  new MutationObserver(icons).observe($('ctl'), { childList: true, subtree: true });
  new MutationObserver(who).observe($('who'), { childList: true, characterData: true, subtree: true });
  const st = $('stage'), hd = document.createElement('div'), cp = document.createElement('div'); hd.className = 'hud2'; cp.className = 'cmp'; st.appendChild(hd); st.appendChild(cp);
  const NAME = ['東', '南', '西', '北'];
  setInterval(() => {
    const on = typeof mode !== 'undefined' && mode === 'dungeon' && F;
    hd.style.display = cp.style.display = on ? '' : 'none'; if (!on) return;
    const a = areaOf(floorNo), n = Object.values(G.carry || {}).reduce((s, v) => s + v, 0);
    hd.setAttribute('translate', 'no'); cp.setAttribute('translate', 'no');
    const h = `<div class="fl"><small>${tr(a[2])}</small>${floorNo}F</div><div class="bag">${n}</div>`; if (hd.innerHTML !== h) hd.innerHTML = h;
    const NM = I18N.on ? ['E', 'S', 'W', 'N'] : NAME, c = `<span>${NM[(dir + 3) % 4]}</span><b>${NM[dir]}</b><span>${NM[(dir + 1) % 4]}</span>`; if (cp.innerHTML !== c) cp.innerHTML = c;
  }, 150);
  icons(); who();
})();
// セリフ欄を押すと、1文字ずつの表示を飛ばして全部出す
// 台詞の欄の大きさが変わったら、ページを分け直す
try { let lastH = 0; new ResizeObserver(() => { const h = $('log').clientHeight; if (Math.abs(h - lastH) > 4) { lastH = h; if (typeof refitLog === 'function') refitLog(); } }).observe($('log')); } catch (e) {}
// 続きのページがあるあいだに選択肢を押したら、選ばずに続きのページを出す（2026-11-26）
/* 2026-11-26: 続きがあるあいだは、画面のどこを押しても続きへ（ボタン・上の帯・移動のボタンも反応しない）。最後のページが出た直後の押しすぎも受け流す */
{
  const pgOn = () => { const c = $('ctl'); return c && c.classList.contains('pg'); };
  const guarded = () => Date.now() < (drawLog.guard || 0);
  const eat = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  for (const ev of ['pointerdown', 'pointerup']) document.addEventListener(ev, e => { if (pgOn() || guarded()) eat(e); }, true);
  document.addEventListener('click', e => {
    if (pgOn()) { eat(e); if (drawLog.tm && drawLog.skip) drawLog.skip(); else if (!nextLogPage()) { $('ctl').classList.remove('pg'); document.body.classList.remove('pgon'); } return; }
    if (guarded()) eat(e);
  }, true);
}
$('log').addEventListener('click', () => { if (drawLog.tm && drawLog.skip) drawLog.skip(); else if (typeof nextLogPage === 'function') nextLogPage(); });
