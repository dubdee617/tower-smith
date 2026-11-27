// ===== 上のステータス（2026-11-26） =====
// 上の帯のボタンから、いつでも今の強さ・装備・技・持ち物を見られる窓。下のボタンや絵は動かさない
function statPanel() {
  let w = $('stp'); if (w) { w.remove(); return; }
  if (mode === 'battle' || typeof G === 'undefined' || !G.name) return;  // 戦闘中は開かない
  w = document.createElement('div'); w.id = 'stp';
  const now = statNow(), j = job(), src = jobImg(j);
  const r = gearBy(G.equip.r), l = gearBy(G.equip.l), a = gearBy(G.equip.armor), t = gearBy(G.equip.tool);
  const row = ([k, name, mx, c]) => `<div class="srow"><div class="sl"><span>${name}</span><b>${k === 'eva' || k === 'crit' ? now[k] + '%' : now[k]}</b></div><div class="sbar"><i style="background:${c};width:${Math.min(100, 100 * now[k] / mx(G.lv))}%"></i></div></div>`;
  const nm = (id, T) => T[id] ? T[id].name : '';
  const sk = G.loadout.skills.map(id => nm(id, SKILLS)).filter(Boolean), ps = G.loadout.passives.map(id => nm(id, PASSIVES)).filter(Boolean);
  const items = Object.entries(ITEMS).filter(([k]) => G.items[k] > 0).map(([k, it]) => `${it.name}×${G.items[k]}`);
  const inTower = mode !== 'town';
  const line = (h, v) => v ? `<tr><th>${h}</th><td>${v}</td></tr>` : '';
  w.innerHTML = `<div class="stw"><div class="sth"><b>ステータス</b><button class="x">閉じる</button></div>
    <div class="stt">${src ? `<img src="${src}" alt="">` : ''}<div class="stn"><b>${G.name}</b><span>Lv${G.lv}　${j}</span>
      <span>HP ${G.hp}/${G.mhp}</span><span>経験値 ${G.exp}/${expNeed()}</span></div></div>
    <div class="sts">${STAT_DEF.map(row).join('')}</div>
    <table>${line('右手', r ? r.name : 'なし')}${line('左手', l ? l.name : 'なし')}${line('鎧', a ? a.name : 'なし')}${line('ツール', t ? `${t.name}（耐久${t.dur}/${t.maxDur}）` : 'なし')}
      ${line('技', sk.join('・') || 'なし')}${line('パッシブ', ps.join('・') || 'なし')}${line('道具', items.join('・') || 'なし')}
      ${G.injuries.length ? `<tr class="inj"><th>ケガ</th><td>${G.injuries.map(k => `<div><b>${INJURIES[k].name}</b>${G.bandaged.includes(k) ? '（包帯でしのいでいる）' : ''}<small>${INJURIES[k].desc}</small></div>`).join('')}<small class="how">寝ても治らない。治療院で治す（包帯は塔の中だけ）</small></td></tr>` : ''}${line('料理', G.meal && MEALS[G.meal] ? MEALS[G.meal].name : '')}
      ${line('手持ち', `${G.gold}G${inTower ? '（倒れるとなくなる）' : ''}`)}${inTower ? line('戦利品', `${matText(G.carry) || 'なし'}（倒れるとなくなる）`) : ''}</table></div>`;
  document.body.appendChild(w);
  const close = () => { sfx('select', { vol: .4 }); w.remove(); };
  w.onclick = e => { if (e.target === w || e.target.classList.contains('x')) close(); };
}
{ const b = document.getElementById('stb'); if (b) { if (typeof UI_ICON !== 'undefined' && UI_ICON.shield) b.innerHTML = `<img src="${UI_ICON.shield}" alt="">`; b.addEventListener('click', e => { e.stopPropagation(); sfx('select', { vol: .5 }); statPanel(); }); } }
