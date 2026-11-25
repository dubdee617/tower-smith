// ---------- 女神の物語と試練（2026-11-25） ----------
// 1周目（11〜50階）: 初めて会ったとき、女神が塔の秘密を少しずつ話す
// 2周目（51〜90階）: 話の続き＋「試練」（守護の魔物と戦う）。勝つと女神の名品の設計図をくれる
// 花の女神は51〜60階だけ。森の女神は仲良くなる（親密度が最大）と設計図をくれる
// 話の順番: 願いの塔 → 三百年前の剣士 → 女神はもと人の子 → 名もなき鍛冶屋 → 花の女神と剣士 → 迷い → 鏡と選択 → 帰りなさい → （99階の最後の女神 → 100階の鏡）
const GOD_LORE = {
  forest1: { title: '願いの塔', L: [
    '森の女神[smile]「よく来たね、鍛冶屋。……この塔が何でできているか、知っている？」',
    '森の女神「石でも、木でもない。人の『願い』だよ。\n登りたい、見たい、帰りたい。……そういう願いが積み重なって、塔は伸びてきた」',
    ['doubt', '「願いで、塔が……」'],
    '森の女神「だから階ごとに景色が違うの。森を願った誰か、砂漠を願った誰か……。\nわたしも、昔はその一人だった」',
    '森の女神[laugh]「……今日はここまで。また上で会いましょう」',
  ] },
  desert1: { title: '三百年前の剣士', L: [
    '砂の女神「三百年前、ひとりの剣士がこの塔を登りきった。\n町の広場に、像があるだろう？」',
    '砂の女神「あの男は、誰かを助けるために登った。自分のためじゃない。\n……だから、てっぺんまで行けた」',
    ['lookup', '「あの像の剣士が……」'],
    '砂の女神「お前は、何のために登る？\n……答えなくていい。てっぺんで、嫌でも聞かれるからね」',
  ] },
  mountain1: { title: '女神はもと人の子', L: [
    '山の女神「……話しておこう。わたしたち女神は、生まれつきの神ではない」',
    '山の女神「昔、この塔を登った人の子だ。\nてっぺんの手前で、帰ることをやめた者たち」',
    ['shock', '「帰ることを、やめた……？」'],
    '山の女神「帰る場所を失った者、帰りたくなかった者。\n……塔は、そういう者を女神にして、ここに留める」',
    '山の女神「お前には、帰る場所があるだろう？ ……それを、忘れるな」',
  ] },
  ice1: { title: '名もなき鍛冶屋', L: [
    '氷の女神「三百年前の剣士の剣を打ったのも、町の鍛冶屋だったそうよ」',
    '氷の女神「でも、誰もその鍛冶屋の名前を覚えていない。像になったのは、剣士だけ」',
    ['calm', '「……鍛冶屋は、そういうものだ」'],
    '氷の女神[smile]「そう言うと思った。……でもね、あの剣士は、てっぺんで最後に鍛冶屋の名前を呼んだの。\nわたしは、それを聞いていた」',
    '氷の女神「打つ人と、振るう人。……あなたは、その両方になろうとしている。\nだから、塔はあなたを見ているのよ」',
  ] },
  druid2: { title: '花の女神と剣士', L: [
    '花の女神「……あら。人の子。……ずいぶん、遠くから来たのね」',
    '花の女神「わたしは花の女神。女神の中で、いちばん新しいの。\n……三百年前に、ここに残った」',
    ['doubt', '「三百年前……。像の剣士と、同じ頃か」'],
    '花の女神「……あの人と、一緒に登ったの。わたしは、あの人の仲間だった」',
    '花の女神「てっぺんの手前で、わたしは怖くなって……帰らないことを選んだ。\nあの人は、ひとりで鏡の前に立って、そして町へ帰っていった」',
    '花の女神「ねえ、鍛冶屋さん。……あの人は、帰って、幸せだった？」',
    ['calm', '「……広場の像は、いつも塔を見上げてる。\n誰かを待ってるみたいに」'],
    '花の女神[laugh]「……そう。……そう、なのね」',
  ] },
  desert2: { title: '迷いながら', L: [
    '砂の女神「また会ったね。……前に聞いたこと、覚えてる？ 何のために登るのか」',
    ['doubt', '「……まだ、うまく言えない」'],
    '砂の女神[laugh]「それでいい。剣士もそうだった。\n……塔はね、迷いのない者より、迷いながら登る者を好むんだ」',
    '砂の女神「迷いながらでも、足を止めない。……それが、願いの正体だよ」',
  ] },
  mountain2: { title: '鏡と選択', L: [
    '山の女神「……七十階を越えたか。そろそろ、鏡のことを話さねばならない」',
    '山の女神「てっぺんの鏡は、登ってきた者を写す。\n打った武器も、選んだ技も、……迷いも」',
    '山の女神「鏡に勝った者は、選べる。\n女神として塔に残るか、人の子として帰るか」',
    ['serious', '「……剣士は、帰ったんだな」'],
    '山の女神「ああ。……わたしは、残った。\nだから、お前がどちらを選ぶのか、見てみたい」',
  ] },
  ice2: { title: '帰りなさい', L: [
    '氷の女神「八十階……。ここまで来ると、町の灯りも見えないでしょう」',
    '氷の女神「わたしは、帰る場所がなかった。だから残った。……後悔は、していないけれど」',
    '氷の女神[smile]「あなたには、待っている人がたくさんいる。\n武具屋の子、治療院の子、ギルドの子。……弟子も、居候も」',
    ['laugh', '「……よく知ってるな」'],
    '氷の女神「女神は、見守るのが仕事だもの。\n……あなたは、帰りなさい。わたしたちの分まで」',
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
