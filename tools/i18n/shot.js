// テスト用の場面（location.hash で選ぶ）
(function(){
  try { localStorage.setItem('tower_opts', JSON.stringify({lang: location.hash.includes('ja') ? 0 : 1, text: 3})); } catch(e){}
  window.addEventListener('load', () => setTimeout(run, 300));
  function run(){
    const h = location.hash.replace('#','').split('-')[0];
    try {
      if (h === 'title') { titleScreen(); }
      else if (h === 'intro') { G = NEW_GAME(); intro(0); setTimeout(()=>{ for(let i=0;i<6;i++){ const b=document.querySelector('#ctl button'); } },100); }
      else { G = NEW_GAME(); G.name='鍛冶屋'; G.maxFloor = 12; G.gold = 500;
        if (h === 'town') townMap();
        else if (h === 'opt') { townMap(); openMenu('opt'); }
        else if (h.startsWith('in_')) inside(h.slice(3));
        else if (h === 'floor') enterFloor(3);
        else if (h === 'battle6') { G.learned=['smash','hone','double','lunge','iai','mikiri']; G.loadout.skills=['smash','hone','double','lunge','iai','mikiri']; G.ap=3; enterFloor(3); setTimeout(()=>startBattle(), 200); }
        else if (h === 'forgew' || h === 'forgec' || h === 'forgea' || h === 'forges' || h === 'forgesa') { G.store = {copper:30,iron:30,bone:20,leather:30,stone:20,wood:20,silver:20}; G.forgeUp = {furnace:2, anvil:1}; const g = newGear(RECIPES.find(r=>r.id==='iron_sword')); G.gear.push(g); G.equip.r = g.uid; inside('home'); setTimeout(()=>{ if (h==='forgew') forgeList('weapon'); else if (h==='forges') { forgeList('weapon'); setTimeout(()=>{ const b=[...document.querySelectorAll('#ctl button')].find(b=>/^\s*(銀|Silver)\s*$/.test(b.textContent)); b&&b.click(); },200); } else if (h==='forgesa') { forgeList('armor'); setTimeout(()=>{ const b=[...document.querySelectorAll('#ctl button')].find(b=>/^\s*(銀|Silver)\s*$/.test(b.textContent)); b&&b.click(); },200); } else if (h==='forgea') forgeList('armor'); else forgeConfirm('weapon', RECIPES.find(r=>r.id==='silver_katana')); }, 300); }
        else if (h === 'sleep') { G.hp = 3; inside('home'); setTimeout(()=>{ const b=[...document.querySelectorAll('button')].find(b=>/休む|Rest/.test(b.textContent)); b&&b.click(); },300); }
        else if (h === 'visit') { G.aff = Object.assign(G.aff||{}, {jenny:5}); G.seen = {}; G.runs = 3; G.visit = {run: G.runs, who: ['jenny']}; inside('home'); }
        else if (h === 'fuuka') { enterFloor(6); setTimeout(()=>{ meetNpc('fuuka'); setTimeout(()=>{ for (let k=0;k<3;k++) { const b=document.querySelector('#ctl button'); b&&b.click(); } }, 300); }, 300); }
        else if (h === 'equip') { for (const id of ['iron_sword','iron_katana','iron_axe','bone_bow','iron_great','bone_staff']) G.gear.push(newGear(RECIPES.find(r=>r.id===id))); inside('home'); setTimeout(()=>{ equipMenu(); let n=0; const tk=()=>{ const bs=[...document.querySelectorAll('#ctl button')]; const b=bs[(n%5)+1]; b&&b.click(); n++; if(n<7) setTimeout(tk, 230); }; setTimeout(tk,300); }, 300); }
        else if (h === 'ending') { G.maxFloor=100; G.aff={jenny:9}; G.seen={jenny:true}; G.homeEv={jenny:true}; townMap(); setTimeout(()=>{ ending(); let n=0; const tk=()=>{ const b=document.querySelector('#ctl button.hot')||document.querySelector('#ctl button'); if(b) b.click(); else { const l=document.getElementById('log'); l&&l.click(); } if(++n<160) setTimeout(tk,120); }; setTimeout(tk,500); },300); }
        else if (h === 'battle') { enterFloor(3); setTimeout(()=>startBattle(), 200); }
        else if (h === 'boss') { enterFloor(10); setTimeout(()=>startBattle(true), 200); }
        else if (h === 'forge') { inside('home'); setTimeout(()=>{ const b=[...document.querySelectorAll('button')].find(b=>/Smithing|鍛冶をする/.test(b.textContent)); b&&b.click(); },300); }
        else if (h === 'skills') { inside('home'); setTimeout(()=>{ const b=[...document.querySelectorAll('button')].find(b=>/Choose Skills|技を選ぶ/.test(b.textContent)); b&&b.click(); },300); }
        else if (h === 'dex') { townMap(); openMenu('dex'); }
      }
    } catch(e) { document.title = 'ERR ' + e.message; console.error(e); }
    setTimeout(() => { window.__miss = [...I18N.miss]; const d=document.createElement('pre'); d.id='__miss'; d.style.display='none'; d.textContent=JSON.stringify(window.__miss); document.body.appendChild(d); }, 2500);
  }
})();
