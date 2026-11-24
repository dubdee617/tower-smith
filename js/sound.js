// BGMと効果音（2026-11-23）
// BGM: 今いる場所・階・戦闘から自動で選ぶ。効果音: エフェクトや出来事に合わせて鳴らす
// iPhoneは最初に画面に触るまで音を出せないので、最初のタッチで音をまとめて「起こす」
const SND = (() => {
  // iPhone対策（2026-11-23）:
  //  ・BGMは <audio> 1本で流す（マナーモードでも鳴る。iPhoneは音量を変えられないので、そのままの音量）
  //  ・効果音と環境音は WebAudio で鳴らす（https で開いたとき）。マナーモードで消えないよう audioSession を playback にする
  //  ・最初のタッチの中で音を「起こす」
  const BGM_DIR = 'assets/bgm/', SFX_DIR = 'assets/sfx/';
  const VOL = { bgm: .55, amb: .25, sfx: .85 };
  let on = true; try { on = localStorage.getItem('tower_sound') !== 'off'; } catch (e) {}
  let unlocked = false, ac = null, master = null;
  const web = /^https?:/.test(location.protocol) && (window.AudioContext || window.webkitAudioContext);
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  // BGM
  const music = new Audio(); music.loop = true; music.preload = 'auto'; music.playsInline = true; music.setAttribute('playsinline', '');
  let cur = '', fade = 0;
  const mvol = v => { try { music.volume = Math.max(0, Math.min(1, v)); } catch (e) {} };
  function startMusic() { if (!on || !unlocked || !cur) return; const p = music.play(); if (p && p.catch) p.catch(() => {}); }
  function bgm(key) {
    if (!key || cur === key) return;
    cur = key; clearInterval(fade);
    const go = () => { music.src = BGM_DIR + key + '.mp3'; music.currentTime = 0; mvol(on ? VOL.bgm : 0); startMusic(); };
    if (!music.src || music.paused) { go(); return; }
    let v = music.volume; fade = setInterval(() => { v -= .08; if (v <= .02) { clearInterval(fade); go(); } else mvol(v); }, 40);
  }

  // 効果音・環境音（WebAudio。読めなければ <audio> で代わりに鳴らす）
  const bufs = {}, loading = {};
  function load(key) {
    if (bufs[key] || loading[key]) return loading[key];
    loading[key] = fetch(SFX_DIR + key + '.mp3').then(r => r.arrayBuffer()).then(b => new Promise((ok, ng) => ac.decodeAudioData(b, ok, ng))).then(d => (bufs[key] = d)).catch(() => null);
    return loading[key];
  }
  const pool = Array.from({ length: 6 }, () => { const a = new Audio(); a.playsInline = true; return a; }); let pi = 0;
  function sfx(key, opt = {}) {
    if (!on || !unlocked || !key) return;
    const fire = () => {
      if (ac && master) {
        const run = b => { if (!b) return; const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = VOL.sfx * (opt.vol || 1); s.connect(g).connect(master); s.start(); if (opt.max) s.stop(ac.currentTime + opt.max); };
        if (bufs[key]) run(bufs[key]); else load(key).then(run);
        return;
      }
      const a = pool[pi++ % pool.length]; a.src = SFX_DIR + key + '.mp3'; a.volume = Math.min(1, VOL.sfx * (opt.vol || 1)); const p = a.play(); if (p && p.catch) p.catch(() => {}); if (opt.max) setTimeout(() => a.pause(), opt.max * 1000);
    };
    if (opt.delay) setTimeout(fire, opt.delay); else fire();
  }
  let ambKey = '', ambSrc = null, ambEl = null;
  function ambience(key) {
    key = key || ''; if (key === ambKey) return; ambKey = key;
    if (ambSrc) { try { ambSrc.stop(); } catch (e) {} ambSrc = null; }
    if (ambEl) { ambEl.pause(); }
    if (!key || !on || !unlocked) return;
    if (ac && master) { load(key).then(b => { if (!b || ambKey !== key) return; const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; s.loop = true; g.gain.value = VOL.amb; s.connect(g).connect(master); s.start(); ambSrc = s; }); return; }
    ambEl = ambEl || new Audio(); ambEl.loop = true; ambEl.src = SFX_DIR + key + '.mp3'; ambEl.volume = VOL.amb; const p = ambEl.play(); if (p && p.catch) p.catch(() => {});
  }

  function unlock() {
    if (unlocked) { if (ac && ac.state !== 'running') ac.resume(); if (on && cur && music.paused) startMusic(); return; }
    unlocked = true;
    if (web) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = on ? 1 : 0; master.connect(ac.destination); ac.resume(); const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (e) { ac = null; } }
    // <audio> をタッチの中で一度鳴らしておく（これで後から曲を替えても鳴る）
    if (!music.src) music.src = SILENT; { const p = music.play(); if (p && p.catch) p.catch(() => {}); }
    for (const a of pool) { a.src = SILENT; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
    cur = ''; tick(true);
    // よく使う効果音を先に読んでおく
    if (ac) ['select', 'slash', 'hit', 'swing', 'door', 'win', 'heal1', 'step_stone_1', 'step_stone_2', 'step_stone_3', 'walk_town', 'item'].forEach(load);
  }
  // iPhoneは touchend / click の中でないと音を起こせない（touchstart や pointerdown ではだめ）
  ['touchend', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  // アプリに戻ってきたとき、止まった音を戻す
  document.addEventListener('visibilitychange', () => { if (document.hidden) { music.pause(); if (ac) ac.suspend(); } else if (unlocked) { if (ac) ac.resume(); startMusic(); } });

  // ?debug をつけて開くと、音の状態を画面の下に出す
  if (/debug/.test(location.search)) setInterval(() => {
    let d = document.getElementById('snddbg'); if (!d) { d = document.createElement('div'); d.id = 'snddbg'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999;font:11px monospace;background:#000c;color:#0f0;padding:4px;white-space:pre-wrap'; document.body.appendChild(d); }
    d.textContent = `unlocked=${unlocked} on=${on} ac=${ac ? ac.state : 'none'} web=${!!web}\nbgm=${cur} paused=${music.paused} ready=${music.readyState} err=${music.error ? music.error.code : '-'} t=${music.currentTime.toFixed(1)}\nsfx読込=${Object.keys(bufs).length}`;
  }, 500);
  function toggle() {
    on = !on; try { localStorage.setItem('tower_sound', on ? 'on' : 'off'); } catch (e) {}
    if (master) master.gain.value = on ? 1 : 0;
    if (on) { mvol(VOL.bgm); startMusic(); const k = ambKey; ambKey = ''; ambience(k); } else { music.pause(); const k = ambKey; ambience(''); ambKey = k; }
    return on;
  }
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
    else if (body.contains('title') || body.contains('story')) k = 'title';  // タイトルと、はじめの説明
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
  return { sfx, bgm, toggle, tick, get unlocked() { return unlocked; }, get on() { return on; }, get now() { return cur + '|' + ambKey; }, set lost(v) { lost = v; }, set goddess(v) { goddess = v; }, set scene(v) { scene = v || ''; tick(true); } };
})();
const sfx = (k, o) => SND.sfx(k, o);
let SND_INDOOR = false;
// エフェクト → 効果音
const FX_SFX = {
  slash_h: 'slash', slash_v: 'slash', slash_x: 'slash', flurry: 'slash', iai: 'katana', tsubame: 'katana', jin: 'katana',
  impact: 'hit1', impact_heavy: 'heavy', thrust: 'swing', arrow: 'arrow', magic_arrow: 'magic',
  fire_s: 'fire1', fire_l: 'fire3', explosion: 'explosion', wind: 'firewind', ice_spear: 'ice2', ice_burst: 'icefreeze', thunder: 'thunder3', thunder_ball: 'shock1', paralyze: 'shock2',
  holy_pillar: 'holy', holy_cross: 'holy', dark_mist: 'dark', dark_blade: 'dark', magic_circle: 'magic', blessing: 'holy', pray: 'magic', warp: 'magic',
  heal: 'heal1', heal_leaf: 'heal3', barrier: 'buff', power: 'buff', bunshin: 'dash', afterimage: 'miss',
  poison: 'poison1', poison_bubble: 'poison2', spark: 'hit', claw: 'punch', bite: 'bite', rocks: 'rockbreak',
};
// 足音（エリアごと）
const STEP_SFX = { stone: 'step_stone', forest: 'step_grass', jungle: 'step_grass', desert: 'step_sand', ruins: 'step_sand', mountain: 'step_dirt', canyon: 'step_dirt', snow: 'step_snow', glacier: 'step_snow', castle: 'step_stone' };
// 1歩ぶんに切った短い足音（3種類）をランダムに。長い元の音は最初が小さく、聞こえにくかった
const stepSfx = n => sfx((n >= 6 && n <= 9 ? 'step_wet' : STEP_SFX[areaOf(n)[1]] || 'step_stone') + '_' + (1 + Math.floor(Math.random() * 3)), { vol: .75 });
// 魔物の鳴き声（戦闘の始まり）
const CRY_SFX = { rat: 'cry_beast', centipede: 'cry_beast', skeleton: 'cry_skeleton', goblin: 'goblin', golem: 'cry_golem' };
// 文の中身で鳴らす効果音（店・宿・ギルドなど）
const LOG_SFX = [[/を(買|売)った|Gで買った/, 'register'], [/お待ち！/, 'cooking', 3], [/最高到達/, 'page', 1.2], [/扉を開けた|扉を押し開けた/, 'door'], [/宝箱を開けた|宝箱を開け/, 'chest'], [/を見つけた|を手に入れた|をもらった|を拾った/, 'item'], [/カン、カン、カン/, 'hit'], [/祈りでHP|もう大丈夫/, 'heal'], [/壁が崩れた/, 'rockbreak', 2]];
