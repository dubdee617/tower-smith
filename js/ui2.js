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
    const log = $('log'), n = document.querySelectorAll('#ctl button').length;
    log.classList.toggle('wait', n === 1 && !document.body.classList.contains('title'));
  }
  function who() {
    const w = $('who'), raw = w.textContent; if (w.dataset.raw === raw) return;
    const parts = raw.split(/\s+/).filter(Boolean);
    w.innerHTML = parts.map(s => `<i class="${/G$/.test(s) ? 'g' : /^ケガ/.test(s) ? 'hurt' : ''}">${/G$/.test(s) ? s.slice(0, -1) : s}</i>`).join('');
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
    const h = `<div class="fl"><small>${a[2]}</small>${floorNo}F</div><div class="bag">${n}</div>`; if (hd.innerHTML !== h) hd.innerHTML = h;
    const c = `<span>${NAME[(dir + 3) % 4]}</span><b>${NAME[dir]}</b><span>${NAME[(dir + 1) % 4]}</span>`; if (cp.innerHTML !== c) cp.innerHTML = c;
  }, 150);
  icons(); who();
})();
// セリフ欄を押すと、1文字ずつの表示を飛ばして全部出す
$('log').addEventListener('click', () => { if (drawLog.tm && drawLog.skip) drawLog.skip(); });
