// BGMと効果音（2026-11-23）
// BGM: 今いる場所・階・戦闘から自動で選ぶ。効果音: エフェクトや出来事に合わせて鳴らす
// iPhoneは最初に画面に触るまで音を出せないので、最初のタッチで音をまとめて「起こす」
const SND = (() => {
  const BGM_DIR = 'assets/bgm/', SFX_DIR = 'assets/sfx/';
  const VOL = { bgm: .55, amb: .22, sfx: .8 };
  let on = true; try { on = localStorage.getItem('tower_sound') !== 'off'; } catch (e) {}
  let unlocked = false, ac = null;
  const useWA = /^https?:/.test(location.protocol) && (window.AudioContext || window.webkitAudioContext);
  // 音量: iPhoneでは audio.volume が効かないので、http で開いているときは WebAudio の音量つまみを使う
  function chan(vol) {
    const a = new Audio(); a.preload = 'auto'; a.playsInline = true; let g = null;
    const o = { a, cur: '', target: 0, level: 0,
      setLevel(v) { o.level = v; const x = on ? v * vol : 0; if (g) g.gain.value = x; else a.volume = Math.max(0, Math.min(1, x)); } };
    o.hook = () => { if (useWA && ac && !g) { try { const s = ac.createMediaElementSource(a); g = ac.createGain(); s.connect(g).connect(ac.destination); } catch (e) { g = null; } } };
    return o;
  }
  const bgmA = chan(VOL.bgm), bgmB = chan(VOL.bgm), amb = chan(VOL.amb);
  let front = bgmA, back = bgmB;
  const pool = Array.from({ length: 6 }, () => chan(VOL.sfx)); let pi = 0;

  function unlock() {
    if (unlocked) return; unlocked = true;
    if (useWA) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    for (const c of [bgmA, bgmB, amb, ...pool]) { c.hook(); c.setLevel(0); const p = c.a.play(); if (p && p.catch) p.catch(() => {}); c.a.pause(); }
    tick(true);
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { capture: true }));

  // BGM をゆっくり入れ替える（0.6秒）
  function bgm(key) {
    if (!key || front.cur === key) return;
    [front, back] = [back, front];
    front.cur = key; front.a.src = BGM_DIR + key + '.mp3'; front.a.loop = true; front.a.currentTime = 0;
    if (unlocked) { const p = front.a.play(); if (p && p.catch) p.catch(() => {}); }
    front.target = 1; back.target = 0;
  }
  function ambience(key) {
    if ((key || '') === amb.cur) return;
    amb.cur = key || ''; if (!key) { amb.a.pause(); return; }
    amb.a.src = SFX_DIR + key + '.mp3'; amb.a.loop = true; amb.setLevel(1);
    if (unlocked) { const p = amb.a.play(); if (p && p.catch) p.catch(() => {}); }
  }
  setInterval(() => { for (const c of [front, back]) { const d = c.target - c.level; if (Math.abs(d) > .01) c.setLevel(c.level + Math.sign(d) * Math.min(Math.abs(d), .08)); else if (c.target === 0 && c.level > 0) { c.setLevel(0); c.a.pause(); } } }, 50);

  // 効果音。max: 長い音を途中で止める秒数
  function sfx(key, opt = {}) {
    if (!on || !unlocked || !key) return;
    const play = () => { const c = pool[pi++ % pool.length]; c.a.src = SFX_DIR + key + '.mp3'; c.a.loop = false; c.setLevel(opt.vol || 1); const p = c.a.play(); if (p && p.catch) p.catch(() => {}); if (opt.max) setTimeout(() => { c.a.pause(); }, opt.max * 1000); };
    if (opt.delay) setTimeout(play, opt.delay); else play();
  }
  function toggle() { on = !on; try { localStorage.setItem('tower_sound', on ? 'on' : 'off'); } catch (e) {} for (const c of [front, back, amb, ...pool]) c.setLevel(c === back ? 0 : c.level || (c === front || c === amb ? 1 : 0)); if (!on) { amb.a.pause(); } else { amb.cur = ''; tick(true); } return on; }

  // 今の状況から、流すBGMと環境音を決める
  // ending: エンディング用（場面ができたら SND.bgm('ending') で流す）
  let lost = false, goddess = false, scene = '';  // scene: イベント中の特別な音（'rain' など）
  function stageKey(n) {
    if (n % 10 === 0) return 'bossfloor';
    if (n <= 5) return 'stage_dungeon';
    if (n <= 10) return 'stage_creepy';
    const a = areaOf(n)[1];
    return { forest: 'stage_forest', jungle: 'stage_plain', desert: 'stage_sand', ruins: 'stage_sand', mountain: 'stage_mountain', canyon: 'stage_mountain', snow: 'stage_snow', glacier: 'stage_cloud', castle: 'stage_castle' }[a] || 'stage_dungeon';
  }
  function tick(force) {
    if (!unlocked && !force) return;
    const body = document.body.classList;
    let k = 'town', am = '';
    if (scene) k = scene;
    else if (lost) k = 'lost';
    else if (body.contains('title')) k = 'title';
    else if (typeof mode !== 'undefined' && mode === 'battle' && typeof B !== 'undefined' && B) k = B.m && B.m.boss ? 'boss_battle' : 'battle';
    else if (typeof mode !== 'undefined' && mode === 'dungeon' && typeof floorNo !== 'undefined') {
      k = goddess ? 'goddess' : stageKey(floorNo);
      if (!goddess && floorNo >= 6 && floorNo <= 9) am = 'amb_sewer';
      if (!goddess && typeof areaOf === 'function' && areaOf(floorNo)[1] === 'snow') am = 'amb_blizzard';
    } else if (typeof place !== 'undefined') {
      const indoor = typeof SND_INDOOR !== 'undefined' && SND_INDOOR;
      if (place === 'castle') k = 'castle';
      else if (place === 'tower') k = 'gettingready';
      else if (indoor && place === 'home') { k = 'home'; am = 'amb_birds'; }
      else if (indoor && place === 'inn') { k = 'inn'; am = 'dishes'; }
      else if (indoor && place === 'clinic') k = 'clinic';
      else if (indoor && ['weapon', 'item', 'bank', 'guild'].includes(place)) k = 'shops';
      else { k = 'town'; am = 'amb_town'; }
    }
    bgm(k); ambience(am);
  }
  setInterval(tick, 300);
  return { sfx, bgm, toggle, tick, get on() { return on; }, get now() { return front.cur + '|' + amb.cur; }, set lost(v) { lost = v; }, set goddess(v) { goddess = v; }, set scene(v) { scene = v || ''; tick(true); } };
})();
const sfx = (k, o) => SND.sfx(k, o);
let SND_INDOOR = false;
// エフェクト → 効果音
const FX_SFX = {
  slash_h: 'slash', slash_v: 'slash', slash_x: 'slash', flurry: 'slash', iai: 'katana', tsubame: 'katana', jin: 'katana',
  impact: 'hit1', impact_heavy: 'heavy', thrust: 'swing', arrow: 'arrow', magic_arrow: 'magic',
  fire_s: 'fire1', fire_l: 'fire3', explosion: 'explosion', wind: 'firewind', ice_spear: 'ice2', ice_burst: 'icefreeze', thunder: 'thunder3', thunder_ball: 'shock1', paralyze: 'shock2',
  holy_pillar: 'holy', holy_cross: 'holy', dark_mist: 'dark', dark_blade: 'dark', magic_circle: 'magic', blessing: 'holy', pray: 'magic', warp: 'magic',
  heal: 'heal1', heal_leaf: 'heal3', barrier: 'buff', power: 'buff', levelup: 'levelup', bunshin: 'dash', afterimage: 'miss',
  poison: 'poison1', poison_bubble: 'poison2', spark: 'hit', claw: 'punch', bite: 'bite', rocks: 'rockbreak',
};
// 足音（エリアごと）
const STEP_SFX = { stone: 'step_stone', forest: 'step_grass', jungle: 'step_grass', desert: 'step_sand', ruins: 'step_sand', mountain: 'step_dirt', canyon: 'step_dirt', snow: 'step_snow', glacier: 'step_snow', castle: 'step_stone' };
const stepSfx = n => sfx(n >= 6 && n <= 9 ? 'step_wet' : STEP_SFX[areaOf(n)[1]] || 'step_stone', { max: .32, vol: .7 });
// 魔物の鳴き声（戦闘の始まり）
const CRY_SFX = { rat: 'cry_beast', centipede: 'cry_beast', skeleton: 'cry_skeleton', goblin: 'goblin', golem: 'cry_golem' };
// 文の中身で鳴らす効果音（店・宿・ギルドなど）
const LOG_SFX = [[/を(買|売)った|Gで買った/, 'register'], [/お待ち！/, 'cooking', 3], [/最高到達/, 'page', 1.2], [/扉を開けた|扉を押し開けた/, 'door'], [/宝箱を開けた|宝箱を開け/, 'chest'], [/を見つけた|を手に入れた|をもらった|を拾った/, 'item'], [/カン、カン、カン/, 'hit'], [/祈りでHP|もう大丈夫/, 'heal'], [/壁が崩れた/, 'rockbreak', 2]];
