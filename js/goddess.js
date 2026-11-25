// ---------- 女神の物語と試練（2026-11-25） ----------
// 1周目（11〜50階）: 初めて会ったとき、女神が塔の秘密を少しずつ話す
// 2周目（51〜90階）: 話の続き＋「試練」（守護の魔物と戦う）。勝つと女神の名品の設計図をくれる
// 花の女神は51〜60階だけ。森の女神は仲良くなる（親密度が最大）と設計図をくれる
// 話の順番（Daichiさんの設定「塔の誕生と真実の鏡」に合わせる）: 貧しかった国 → 塔の誕生 → 女神像 → 塔に登る人々 → 塔の心 → 頂のこと → 最上階の鏡 → 人間とは → （99階の最後の女神 → 100階の鏡）
// 2026-11-25 決定: 塔は人間そのものを理解したくて鏡を生んだ。女神たちはそれを知っていて、邪魔をせず見守っている
const GOD_LORE = {
  forest1: { title: '貧しかった国', L: [
    '森の女神[smile]「よく来たね、鍛冶屋。……この森、きれいでしょう？」',
    '森の女神「でも、遥か昔のエルディアは、貧しい国だった。\n山からは鉱石が消え、大地は痩せて、わたしの森の恵みも乏しくなっていた」',
    '森の女神「人々は、わずかな物を分け合いながら、苦しい暮らしを続けていたの」',
    ['doubt', '「……今の町からは、想像もつかないな」'],
    '森の女神[laugh]「そうでしょう。……続きは、また上で話してあげる」',
  ] },
  desert1: { title: '塔の誕生', L: [
    '砂の女神「人々の暮らしを見かねて、山の女神が、わたしたちに助けを求めた」',
    '砂の女神「みんなで話し合って決めたのさ。\n人がいつまでも豊かに暮らせるよう、恵みを生み続ける塔を建てようって」',
    '砂の女神「でも、ただの建物じゃ、いつか尽きてしまう。\n……だから塔には、命が要った。自分で育ち、恵みを生み続ける命が」',
    ['lookup', '「この塔は……生きてるのか」'],
    '砂の女神[laugh]「足もとの砂だって、息をしているよ。……よく耳をすましてごらん」',
  ] },
  mountain1: { title: '女神像', L: [
    '山の女神「……塔を作ろうと言い出したのは、わたしだ」',
    '山の女神「わたしたちは、それぞれの力を宿した女神像を、塔のあちこちに置いた。\n像から注ぐ力で、塔は命をつなぎ、鉱脈を育て、草木を芽吹かせ、魔物を生む」',
    ['shock', '「じゃあ、俺が掘ってる鉱石も……」'],
    '山の女神「ああ。わたしたちの力と、塔の命が育てたものだ。\n……大事に使え。良い物を打て」',
  ] },
  ice1: { title: '塔に登る人々', L: [
    '氷の女神「塔ができてから、たくさんの人を見てきたわ。\n富を求める人、強さを求める人、家族のために働く人、まだ見ぬ世界に憧れる人」',
    '氷の女神「あなたは？ どうして登るの？」',
    ['calm', '「……材料が高いからだ」'],
    '氷の女神[smile]「ふふ。……今まで聞いた中で、いちばん正直な理由ね」',
    '氷の女神「でも、人はみんな最初はそう。登っているうちに、理由が増えていくのよ」',
  ] },
  druid2: { title: '塔の心', L: [
    '花の女神「……あら。人の子。……ずいぶん、遠くから来たのね」',
    '花の女神「わたしは花の女神。塔の中の草木を、芽吹かせているの」',
    '花の女神「……最近はね、わたしが力を注ぐより先に、花が開くことがあるの。\n塔が、自分で咲かせているのよ」',
    ['doubt', '「塔が、自分で……？」'],
    '花の女神「ええ。長い年月、人を見つめるうちに、塔は心を持った。\n……わたしたちも、知っているわ」',
    '花の女神[laugh]「わたしたちが作った塔から、自然に生まれた心だもの。\n邪魔をしないように、そっと見守っているの」',
  ] },
  desert2: { title: '頂のこと', L: [
    '砂の女神「また会ったね。……ここまで来た人の子は、そう多くない」',
    '砂の女神「人々は、塔の頂がどこにあるのか知らない。\nいちばん上まで行ったのは、近衛兵長ギャバンの86階……ってことになってる」',
    ['serious', '「……その先は」'],
    '砂の女神「てっぺんは、塔の心が住むところさ。\nわたしたち女神は、あそこには手を出さないと決めている」',
    '砂の女神[laugh]「だから、お前が自分の足で行っておいで。……塔も、きっと待ってる」',
  ] },
  mountain2: { title: '最上階の鏡', L: [
    '山の女神「……七十階を越えたか。てっぺんのことを、話しておこう」',
    '山の女神「塔の最上階には、大きな鏡がある。\nわたしたちが作ったものではない。……塔が、自ら生み出したものだ」',
    ['shock', '「塔が、鏡を……？ 何のために」'],
    '山の女神「人間を知るためだ。\n塔は、人間というものを、心の底から理解したがっている」',
    '山の女神「だから鏡になった。人が、自分の姿と心を写せるように。\n……鏡の前に立てば、お前はもう一人のお前と向き合うことになる」',
    '山の女神「恐れるな。あれは罰ではない。……塔が人を知るための、窓なのだ」',
  ] },
  ice2: { title: '人間とは', L: [
    '氷の女神「八十階……。ここまで来ると、町の灯りも見えないでしょう」',
    '氷の女神「ねえ、鍛冶屋。人は、豊かさを求めながら、それを誰かに譲る。\n強さを求めながら、弱い人を守ろうとする。失敗を恐れながら、それでも挑む」',
    '氷の女神「塔はずっと、それが不思議でならないの。\n『人間とは、いったい何なのだろう』って」',
    ['laugh', '「……さあな。鉄と同じだ。打ってみないとわからん」'],
    '氷の女神[smile]「ふふ。……その答え、てっぺんの鏡に見せてあげて」',
  ] },
};
const GOD_LORE_ORDER = ['forest1', 'desert1', 'mountain1', 'ice1', 'druid2', 'desert2', 'mountain2', 'ice2'];
const godLap = () => floorNo > 50 ? 2 : 1;
// 物語（まだ聞いていない章）→ 試練（2周目でまだなら）→ いつもの会話。何もなければ false
function godStory(id, then, leave) {
  G.godLore = G.godLore || []; G.godTrial = G.godTrial || {};
  const key = id + godLap(), lore = GOD_LORE[key];
  const trial = () => {
    if (godLap() === 2 && GOD_MK[id] && !G.godTrial[id]) { godTrialOffer(id, then, leave); return true; }
    return false;
  };
  if (lore && !G.godLore.includes(key)) {
    G.godLore.push(key); save();
    const seq = lore.L.map(x => Array.isArray(x) ? { hero: x[0], t: x[1] } : { t: x });
    runSeq(seq, 0, () => { log(`（女神の話「${lore.title}」を聞いた。工房の書棚の図鑑で読み返せる）`, true); buttons([{ t: '次へ', hot: true, f: () => { if (!trial()) then(); } }]); });
    return true;
  }
  return trial();
}
function godTrialOffer(id, then, leave) {
  const name = TOWER_NPCS[id].name;
  log(`${name}「……でも、ただで加護を強くするわけにはいかない。\nわたしの守護の魔物と戦ってごらん。勝てたら、わたしの名品の設計図をあげる」`, true);
  buttons([
    { t: '試練を受ける', hot: true, f: () => {
      const pool = monPool(floorNo).filter(m => !m.boss), base = pool.reduce((a, b) => (b.hp > a.hp ? b : a), pool[0]), M = midPow(floorNo), k = 1 + (floorNo - base.from) * .15;
      const g = { ...base, name: `${name}の守護者・${base.name}`, hp: Math.round(base.hp * k * M.hp * 2.6), atk: Math.round(base.atk * k * M.atk * 1.3), def: Math.round(base.def * k * M.def * 1.2), exp: Math.round(base.exp * k * 4), gold: Math.round(base.gold * k * 3), boss: true, trial: id };
      log(`${name}「……行くよ」`, true);
      setTimeout(() => { SND.goddess = false; $('meet').style.display = 'none'; clearFig(); dungeonUI(); startBattle(g); }, 700);
    } },
    { t: '今はやめておく', s: '次に会ったときに受けられる', f: then },
  ]);
}
// 試練に勝った
function trialWon(id) {
  G.godTrial = G.godTrial || {}; G.godTrial[id] = true; save();
  setTimeout(() => godBp(id), 1500);
  return `${TOWER_NPCS[id].name}の声が聞こえる。「……見事。あなたなら、きっと帰れる」`;
}
// 女神の名品の設計図を渡す
function godBp(id) {
  const k = GOD_MK[id]; if (!k) return; G.bp = G.bp || []; if (G.bp.includes(k)) return;
  G.bp.push(k); save(); const r = RECIPES.find(x => x.id === k);
  sfx('holy', { vol: .7 }); bigFx(`<img class="gearimg" src="${iconOfType(r)}" alt=""><b>女神の名品の設計図</b><em>${r.name}</em><small>${r.desc}（工房の「名品」で打てる）</small>`, 'levelup', 'reward', 3600);
}
// 図鑑の「女神の話」の章
function dexGodLore() {
  const got = G.godLore || [], sel = DEX.lore === undefined ? got.length - 1 : DEX.lore;
  return `<div class="dexw one">${GOD_LORE_ORDER.map((k, i) => { const x = GOD_LORE[k], ok = got.includes(k), who = TOWER_NPCS[k.slice(0, -1)].name, lap = k.endsWith('1') ? '1周目' : '2周目';
    if (!ok) return `<div><b>${i + 1}. ？？？<em>${who}・${lap}</em></b></div>`;
    const open = got[sel] === k;
    return `<div data-lore="${got.indexOf(k)}" style="cursor:pointer"><b>${i + 1}. ${x.title}<em>${who}・${lap}${open ? '' : '　▼'}</em></b>${open ? `<small>${x.L.map(y => (Array.isArray(y) ? y[1] : y).replace(/^[^「]*「/, '「')).join('<br>')}</small>` : ''}</div>`; }).join('')}</div>`;
}
