// ---------- 女神の物語と試練（2026-11-25） ----------
// 1周目（11〜50階）: 初めて会ったとき、女神が塔の秘密を少しずつ話す
// 2周目（51〜90階）: 話の続き＋「試練」（守護の魔物と戦う）。勝つと女神の名品の設計図をくれる
// 花の女神は51〜60階だけ。森の女神は仲良くなる（親密度が最大）と設計図をくれる
// 話の順番（Daichiさんの設定「塔の誕生と真実の鏡」に合わせる）: 貧しかった国 → 塔の誕生 → 女神像 → 塔に登る人々 → 塔の息づかい（塔の意志の気配） → 頂のこと → 最上階の鏡 → 人間とは → （99階の最後の女神 → 100階の鏡）
// 未確定のこと（鏡が何を知りたいのか、勝ったあと何が起こるのか、女神は塔の意志を知っているのか、願いは叶うのか、塔の未来）は、ここでは決めない
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
  druid2: { title: '塔の息づかい', L: [
    '花の女神「……あら。人の子。……ずいぶん、遠くから来たのね」',
    '花の女神「わたしは花の女神。塔の中の草木を、芽吹かせているの」',
    '花の女神「……最近ね、少し不思議なの。\n花を咲かせようとすると、わたしが力を注ぐより先に、花が開くことがあって」',
    ['doubt', '「……塔が、自分で咲かせてるのか？」'],
    '花の女神「わからない。……でも、まるで塔が、誰かに見せたくて咲かせているみたい」',
    '花の女神[laugh]「……変な話をしたわね。忘れて。……ううん、やっぱり、覚えていて」',
  ] },
  desert2: { title: '頂のこと', L: [
    '砂の女神「また会ったね。……ここまで来た人の子は、そう多くない」',
    '砂の女神「人々は、塔の頂がどこにあるのか知らない。\nいちばん上まで行ったのは、近衛兵長ギャバンの86階……ってことになってる」',
    ['serious', '「……その先は」'],
    '砂の女神「わたしたちの力は、塔の上のほうまでは届きにくいんだ。\n……てっぺんのことは、わたしにも、はっきりとはわからない」',
    '砂の女神[laugh]「だから、お前が見てきておくれ。……帰って、話してくれればいい」',
  ] },
  mountain2: { title: '最上階の鏡', L: [
    '山の女神「……七十階を越えたか。てっぺんのことを、少し話しておこう」',
    '山の女神「塔の最上階には、大きな鏡があるらしい。\n……だが、わたしたちが作ったものではない」',
    ['shock', '「女神が作ったんじゃない……？ じゃあ、誰が」'],
    '山の女神「わからない。いつからあるのかも。\n……ただ、あの鏡は、立った者の姿だけでなく、心まで写すと聞く」',
    '山の女神「恐れるな。……あれが何であれ、お前を憎んでいるわけではない。そんな気がするのだ」',
  ] },
  ice2: { title: '人間とは', L: [
    '氷の女神「八十階……。ここまで来ると、町の灯りも見えないでしょう」',
    '氷の女神「ねえ、鍛冶屋。人は、豊かさを求めながら、それを誰かに譲る。\n強さを求めながら、弱い人を守ろうとする。失敗を恐れながら、それでも挑む」',
    '氷の女神「長い間見てきたけれど……わたしにも、まだよくわからない。あなたは、わかる？」',
    ['laugh', '「……さあな。鉄と同じだ。打ってみないとわからん」'],
    '氷の女神[smile]「ふふ。……その答え、てっぺんの鏡にも聞かせてあげて」',
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
