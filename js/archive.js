// ===== ギルドの資料庫（2026-11-27 Daichiさん） =====
// どの階で何がとれるかを、エリアごとに読める。冒険者たちの記録なので、前人未到の90階から上は「記録なし」
const ARC_TOP = 89;
function archiveWin(ai, sub) {
  sub = sub || 0;
  let w = $('arc'); if (w) w.remove();
  w = document.createElement('div'); w.id = 'arc';
  const areas = AREAS.filter(a => a[0] <= ARC_TOP);
  const cur = ai !== undefined ? ai : Math.max(0, areas.findIndex(a => G.maxFloor >= a[0] && G.maxFloor <= a[0] + 9));
  const [a0, key, aname] = areas[cur], a1 = Math.min(a0 + 9, ARC_TOP);
  const nm = k => NAMES[k] || k;
  const icon = k => { const s = typeof iconOf === 'function' ? iconOf(k) : null; return s ? `<img src="${s}" alt="">` : ''; };
  const rng = (f, t) => f === t ? `${f}階` : `${f}〜${t}階`;
  // 魔物（この範囲に出るもの）
  const mons = MONSTERS.filter(m => m.from <= a1 && (m.to || 999) >= a0).map(m => ({ m, f: Math.max(a0, m.from), t: Math.min(a1, m.to || 999) }));
  const monRows = mons.map(({ m, f, t }) => `<tr><th>${m.name}<small>${rng(f, t)}</small></th><td>${Object.keys(m.drop || {}).map(k => `<span>${icon(k)}${nm(k)}</span>`).join('') || '—'}</td></tr>`).join('');
  // 主・番人
  const boss = Object.keys(BOSSES).map(Number).filter(f => f >= a0 && f <= a1).sort((x, y) => x - y)
    .map(f => `<tr class="boss"><th>${BOSSES[f].name}<small>${f}階・${f % 10 === 0 ? '主' : '番人'}</small></th><td>${Object.keys(BOSSES[f].drop || {}).map(k => `<span>${icon(k)}${nm(k)}</span>`).join('')}</td></tr>`).join('');
  // 掘ると・鉱脈
  const dig = (DIG_YIELD[key] || DIG_YIELD.stone).map(([k]) => `<span>${icon(k)}${nm(k)}</span>`).join('');
  const va = typeof VEINS_AREA !== 'undefined' && VEINS_AREA[key] ? VEINS_AREA[key][1].map(([v]) => VEIN_RAW[v]).filter(Boolean) : [];
  const vein = [...new Set(va)].map(k => `<span>${icon(k)}${nm(k)}</span>`).join('');
  // 魔物がときどき持っている上の金属（win() と同じ決まり）
  const extra = [[21, 'ore_silver'], [41, 'ore_mithril'], [61, 'dark_steel'], [71, 'ore_orichalcum'], [85, 'dragon_bone']].filter(([f]) => f <= a1)
    .map(([f, k]) => `<span>${icon(k)}${nm(k)}<small>${f}階〜</small></span>`).join('');
  const god = Object.entries(TOWER_NPCS).find(([, n]) => n.god && (n.ranges || []).some(([x, y]) => a0 >= x && a0 <= y));
  w.innerHTML = `<div class="arw"><div class="arh"><b>ギルドの資料庫</b><button class="x">閉じる</button></div>
    <div class="art">${areas.map((a, i) => `<button data-i="${i}" class="${i === cur ? 'on' : ''}">${a[2]}<small>${rng(a[0], Math.min(a[0] + 9, ARC_TOP))}</small></button>`).join('')}</div>
    <div class="ars"><button data-s="0" class="${sub === 0 ? 'on' : ''}">魔物と素材</button><button data-s="1" class="${sub === 1 ? 'on' : ''}">主・番人と採取</button></div>
    <div class="arb"><h3>${aname}　${rng(a0, a1)}${god ? `<small>${god[1].name}の加護が効く</small>` : ''}</h3>
      ${sub === 0 ? `<table>${monRows}</table>` : `<table>${boss}</table>
      <dl>${dig ? `<dt>壁を掘ると</dt><dd>${dig}</dd>` : ''}${vein ? `<dt>鉱脈</dt><dd>${vein}</dd>` : ''}${extra ? `<dt>魔物が<br>ときどき<br>持っている</dt><dd>${extra}</dd>` : ''}</dl>`}
      ${a1 === ARC_TOP ? '<p class="note">90階から上の記録は、まだない。……誰も、そこまで行ったことがないのだ。</p>' : ''}</div></div>`;
  document.body.appendChild(w);
  const close = () => { sfx('select', { vol: .4 }); w.remove(); };
  w.onclick = e => { if (e.target === w || e.target.classList.contains('x')) close(); };
  w.querySelectorAll('.art button').forEach(b => b.onclick = e => { e.stopPropagation(); sfx('select', { vol: .4 }); archiveWin(+b.dataset.i, sub); });
  w.querySelectorAll('.ars button').forEach(b => b.onclick = e => { e.stopPropagation(); sfx('select', { vol: .4 }); archiveWin(cur, +b.dataset.s); });
  /* 1画面に収める: はみ出すときは、文字を1段ずつ小さくする */
  const body = w.querySelector('.arb'), fit = () => body.scrollHeight <= body.clientHeight + 1;
  for (const [fs, tight] of [[12, 0], [11, 0], [10, 0], [10, 1], [9, 1]]) { w.classList.toggle('tight', !!tight); body.style.fontSize = fs + 'px'; body.querySelectorAll('th').forEach(t => t.style.fontSize = fs + 'px'); if (fit()) break; }
}
