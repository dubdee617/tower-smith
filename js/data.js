// ゲームのデータ（数値はすべて仮。あとで調整する）

// 素材（17種のうち、1〜10階で出るもの）
const MATS = { copper:'銅', iron:'鉄', bone:'骨', leather:'革', stone:'魔石', wood:'木' };
// 塔で手に入るのは「使える前の状態」の戦利品（2026-11-23 決定）
// ギルドに持ち込むと、鍛冶に使える素材に加工してもらえて、さらに報酬（お金）がもらえる
// to: 加工するとなる素材。reward: 1個あたりのギルドの報酬
const RAW = {
  rat_hide:    { name:'大ネズミの毛皮',   to:{leather:1}, reward:3 },
  cursed_bone: { name:'呪われた骨',       to:{bone:1},    reward:2 },
  ore_copper:  { name:'銅の鉱石',         to:{copper:1},  reward:4 },
  ore_iron:    { name:'鉄の鉱石',         to:{iron:1},    reward:8 },
  dim_stone:   { name:'くすんだ魔石',     to:{stone:1},   reward:8 },
  iron_shell:  { name:'鉄喰いの甲殻',     to:{iron:1, leather:1}, reward:12 },
  golem_core:  { name:'ゴーレムの核',     to:{stone:3, iron:2},   reward:60 },
  rubble:      { name:'鉱石まじりの岩',   to:{copper:1},  reward:2 },
  log:         { name:'塔の丸太',         to:{wood:2},    reward:3 },
  sand_find:   { name:'砂の中の掘り出し物', to:{bone:1, copper:1}, reward:5 },
  raw_gem:     { name:'宝石の原石',       to:{stone:2},   reward:25 },
};
// 11階より上の魔物の戦利品（2026-11-24）
Object.assign(RAW, {
  beast_pelt:  { name:'獣の毛皮',       to:{leather:2},          reward:10 },
  beast_fang:  { name:'獣の牙',         to:{bone:2},             reward:9 },
  spider_silk: { name:'大蜘蛛の糸',     to:{leather:1, stone:1}, reward:14 },
  hard_shell:  { name:'硬い甲殻',       to:{iron:1, leather:1},  reward:16 },
  old_wood:    { name:'古木の枝',       to:{wood:3},             reward:9 },
  spore:       { name:'魔力を帯びた胞子', to:{stone:1},           reward:12 },
  scale:       { name:'うろこ',         to:{leather:2, bone:1},  reward:14 },
  old_cloth:   { name:'古い布切れ',     to:{leather:1},          reward:6 },
  cursed_gold: { name:'呪われた金細工', to:{stone:2, copper:2},  reward:30 },
  rock_core:   { name:'岩の核',         to:{stone:2, iron:1},    reward:24 },
  feather:     { name:'大きな羽根',     to:{leather:1, wood:1},  reward:12 },
  ice_shard:   { name:'溶けない氷',     to:{stone:2},            reward:26 },
  ember_stone: { name:'燃える石',       to:{stone:2, iron:1},    reward:30 },
  star_dust:   { name:'星のかけら',     to:{stone:3},            reward:40 },
  dark_steel:  { name:'黒い鋼の欠片',   to:{iron:3},             reward:45 },
  worm_gem:    { name:'大砂蟲の宝石',   to:{stone:4, iron:2},    reward:150 },
});
const NAMES = Object.assign({}, MATS, Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.name])));

// 武器の種類 → 基本職（2026-11-22 の新方針）
// 片手武器は盾を一緒に持てる。両手武器は強いが盾を持てない（熟練を積むと片手で持てる）
// heavy: 重い武器。攻撃にAPが2かかり、回避しにくい
const WEAPON_TYPES = {
  hammer:     { name:'槌',     job:'鍛冶屋' },
  sword:      { name:'剣',     job:'剣士' },
  book:       { name:'魔導書', job:'魔導士' },
  staff:      { name:'杖',     job:'僧侶' },
  dagger:     { name:'ダガー', job:'盗賊' },
  axe:        { name:'斧',     job:'山賊',       twoHand:true, heavy:true },
  katana:     { name:'刀',     job:'侍',         twoHand:true, heavy:true },
  greatsword: { name:'大剣',   job:'騎士',       twoHand:true, heavy:true },
  bow:        { name:'弓矢',   job:'アーチャー', twoHand:true },
  shield:     { name:'盾',     job:null },
};
const ONE_HAND_NEED = 15; // 両手武器をこの熟練度まで使い込むと、片手で持てる（盾や二刀流ができる）

// ---------- ジョブ ----------
// 基本職: 持っている武器（右手）で決まる
// 上級職: 「持っている武器」＋「過去に使い込んだ別の武器の熟練度」で進化する（順番で別のジョブになる）
// 熟練度: その武器を持って戦闘に勝つと1上がる
const UPPER_NEED = { hold: 10, exp: 10 }; // 上級職の条件（仮）: 持つ武器の熟練10、経験する武器の熟練10
const UPPERS = [
  { job:'魔法剣士', hold:'sword',      exp:'book'   },
  { job:'賢者',     hold:'book',       exp:'staff'  },
  { job:'僧兵',     hold:'staff',      exp:'axe'    },
  { job:'狩人',     hold:'bow',        exp:'dagger' },
  { job:'魔弓士',   hold:'bow',        exp:'book'   },
  { job:'略奪者',   hold:'axe',        exp:'dagger' },
  { job:'狂戦士',   hold:'axe',        exp:'greatsword' },
  { job:'聖騎士',   hold:'greatsword', exp:'staff'  },
  { job:'黒騎士',   hold:'greatsword', exp:'book'   },
  { job:'剣豪',     hold:'katana',     exp:'sword'  },
  { job:'忍者',     hold:'katana',     exp:'dagger' },
  { job:'アサシン', hold:'dagger',     exp:'katana' },
];
// 最上級職: 70階より上が目安。条件はまだ決めていない（一覧には？？？で出る）
const TOPS = [
  { job:'剣聖',     hold:'sword' },
  { job:'大魔導',   hold:'book' },
  { job:'鍛冶師範', hold:'hammer' },  // 鍛冶屋を極めた先。ほかのジョブの経験も必要
];
// grow: レベルアップ時の伸び方。learn: そのジョブで勝った回数で覚える技（[回数, 技]）。覚えた技はずっと使える
// img: 立ち絵（assets/jobs/job_○○.webp）
const JOBS = {
  '鍛冶屋':     { img:'smith',     grow:{hp:6, atk:1, def:2}, learn:[[0,'smash'],[3,'hone'],[6,'p_keep'],[10,'p_loot']] },
  '剣士':       { img:'swordsman', grow:{hp:7, atk:2, def:1}, learn:[[0,'double'],[3,'lunge'],[7,'p_atk']] },
  '魔導士':     { img:'wizard',    grow:{hp:4, atk:1, def:0}, learn:[[0,'fire'],[3,'ice'],[6,'bolt'],[8,'dark1'],[10,'p_ap']] },
  '僧侶':       { img:'cleric',    grow:{hp:6, atk:1, def:1}, learn:[[0,'heal'],[3,'holy'],[6,'p_regen'],[9,'p_herb']] },
  '盗賊':       { img:'thief',     grow:{hp:5, atk:1, def:1}, learn:[[0,'steal'],[3,'stab'],[6,'p_steal'],[9,'p_loot']] },
  '山賊':       { img:'bandit',    grow:{hp:9, atk:3, def:0}, learn:[[0,'rage'],[3,'cleave'],[7,'p_hp']] },
  '侍':         { img:'samurai',   grow:{hp:6, atk:3, def:0}, learn:[[0,'iai'],[3,'mikiri'],[7,'p_crit']] },
  '騎士':       { img:'knight',    grow:{hp:8, atk:2, def:2}, learn:[[0,'heavyslash'],[3,'wall'],[7,'p_def']] },
  'アーチャー': { img:'archer',    grow:{hp:5, atk:2, def:1}, learn:[[0,'aim'],[3,'volley'],[7,'p_first']] },
  '魔法剣士':   { img:'spellsword', grow:{hp:6, atk:2, def:1}, learn:[[0,'magicblade'],[3,'bolt2'],[5,'p_ap'],[15,'bolt3']] },
  '賢者':       { img:'sage', grow:{hp:5, atk:2, def:1}, learn:[[0,'sagefire'],[2,'fire2'],[4,'ice2'],[5,'p_regen'],[6,'holy2'],[15,'fire3'],[18,'holy3']] },
  '僧兵':       { img:'monk', grow:{hp:8, atk:2, def:2}, learn:[[0,'monkstrike'],[5,'p_def']] },
  '狩人':       { img:'hunter', grow:{hp:6, atk:2, def:1}, learn:[[0,'snipe'],[5,'p_loot']] },
  '魔弓士':     { img:'magearcher', grow:{hp:5, atk:3, def:0}, learn:[[0,'arcanearrow'],[3,'ice2'],[5,'p_focus'],[15,'ice3']] },
  '略奪者':     { img:'marauder', grow:{hp:9, atk:3, def:0}, learn:[[0,'plunder'],[5,'p_steal']] },
  '狂戦士':     { img:'berserker', grow:{hp:10,atk:4, def:0}, learn:[[0,'frenzy'],[5,'p_carry']] },
  '聖騎士':     { img:'paladin', grow:{hp:9, atk:2, def:3}, learn:[[0,'holyguard'],[3,'holy2'],[5,'p_guard'],[16,'holy3']] },
  '黒騎士':     { img:'blackknight', grow:{hp:8, atk:4, def:1}, learn:[[0,'darkblade'],[3,'dark2'],[5,'p_atk'],[15,'dark3']] },
  '剣豪':       { img:'kengo', grow:{hp:7, atk:4, def:0}, learn:[[0,'tsubame'],[5,'p_focus']] },
  '忍者':       { img:'ninja',     grow:{hp:6, atk:2, def:1}, learn:[[0,'bunshin'],[3,'kagenui'],[6,'p_first']] },
  'アサシン':   { img:'assassin', grow:{hp:5, atk:3, def:0}, learn:[[0,'assassin'],[5,'p_crit']] },
  '剣聖':       { img:'kensei',      grow:{hp:9, atk:5, def:2}, learn:[] },
  '大魔導':     { img:'archmage',    grow:{hp:7, atk:5, def:1}, learn:[[0,'fire3'],[0,'ice3'],[0,'bolt3'],[0,'dark3']] },
  '鍛冶師範':   { img:'mastersmith', grow:{hp:10,atk:5, def:3}, learn:[] },
  '素手':       { grow:{hp:6, atk:1, def:1}, learn:[] },
};

// ---------- 技 ----------
// 基本の4つ（攻撃・守る・薬草・逃げる）はいつでも使える。それ以外は覚えた中から10個を選んで持ち込む
// kind: atk=攻撃 heal=回復 guard=守り counter=反撃 buff=強化 steal=盗む
// mult=攻撃力の倍率 hits=回数 pierce=守りを無視 crit=会心しやすさ break=敵の守りを下げる self=自分のHPを削る
const SKILLS = {
  attack:   { name:'攻撃',     ap:1, kind:'atk', mult:1,   desc:'武器で殴る', base:true },
  guard:    { name:'守る',     ap:1, kind:'guard', cut:.5, desc:'このターンの被ダメージ半分', base:true },
  herb:     { name:'道具',     ap:1, kind:'herb', desc:'薬草・包帯を使う', base:true },
  flee:     { name:'逃げる',   ap:2, kind:'flee', desc:'5割で逃げる', base:true },
  smash:    { name:'叩き割り', ap:2, kind:'atk', mult:1.6, break:2, desc:'強い一撃＋守りを崩す' },
  hone:     { name:'研ぎ直し', ap:1, kind:'buff', boost:1.3, desc:'このターンの攻撃1.3倍' },
  double:   { name:'二段斬り', ap:2, kind:'atk', mult:.8, hits:2, desc:'2回攻撃' },
  lunge:    { name:'踏み込み', ap:1, kind:'atk', mult:1.25, desc:'少し強い一撃' },
  iai:      { name:'居合',     ap:3, kind:'atk', mult:2.6, desc:'とても重い一撃' },
  mikiri:   { name:'見切り',   ap:1, kind:'counter', cut:.2, back:1.4, desc:'受け流して強く反撃' },
  rage:     { name:'捨て身',   ap:2, kind:'atk', mult:2.2, self:.1, desc:'HPを削って大ダメージ' },
  cleave:   { name:'大振り',   ap:3, kind:'atk', mult:1.9, break:1, desc:'重い一撃＋守りを崩す' },
  steal:    { name:'盗む',     ap:1, kind:'steal', desc:'素材を盗む' },
  stab:     { name:'急所突き', ap:2, kind:'atk', mult:1.3, crit:.5, desc:'会心が出やすい' },
  aim:      { name:'狙い撃ち', ap:2, kind:'atk', mult:1.5, crit:.35, desc:'急所に入りやすい' },
  volley:   { name:'速射',     ap:2, kind:'atk', mult:.6, hits:3, desc:'3回攻撃' },
  heal:     { name:'祈り',     ap:2, kind:'heal', heal:18, desc:'HPを大きく回復' },
  holy:     { name:'聖光',     ap:2, kind:'atk', mult:1.3, pierce:true, magic:true, heal:4, desc:'聖の魔法（小）。少し回復' },
  fire:     { name:'炎',       ap:2, kind:'atk', mult:1.4, pierce:true, magic:true, desc:'炎の魔法（小）。守りを無視' },
  ice:      { name:'氷',       ap:2, kind:'atk', mult:1.1, pierce:true, magic:true, stun:.35, desc:'氷の魔法（小）。たまに敵が凍る' },
  bolt:     { name:'雷',       ap:2, kind:'atk', mult:1.25, pierce:true, magic:true, twice:.3, desc:'雷の魔法（小）。たまに2回当たる' },
  // 5属性×小・中・大（2026-11-24）。中はAP3、大はAP4（APを持ち越さないと撃てない）
  fire2:    { name:'火炎',     ap:3, kind:'atk', mult:2.2, pierce:true, magic:true, desc:'炎の魔法（中）' },
  fire3:    { name:'業火',     ap:4, kind:'atk', mult:3.4, pierce:true, magic:true, desc:'炎の魔法（大）。APを溜めて撃つ' },
  ice2:     { name:'氷槍',     ap:3, kind:'atk', mult:1.8, pierce:true, magic:true, stun:.5, desc:'氷の魔法（中）。よく凍らせる' },
  ice3:     { name:'吹雪',     ap:4, kind:'atk', mult:2.9, pierce:true, magic:true, stun:.7, desc:'氷の魔法（大）。ほぼ凍らせる' },
  bolt2:    { name:'落雷',     ap:3, kind:'atk', mult:2.0, pierce:true, magic:true, twice:.4, desc:'雷の魔法（中）。2回当たることも' },
  bolt3:    { name:'天雷',     ap:4, kind:'atk', mult:3.0, pierce:true, magic:true, twice:.5, desc:'雷の魔法（大）。半分の確率で2回' },
  holy2:    { name:'聖十字',   ap:3, kind:'atk', mult:2.0, pierce:true, magic:true, heal:8, desc:'聖の魔法（中）。回復つき' },
  holy3:    { name:'裁きの光', ap:4, kind:'atk', mult:3.1, pierce:true, magic:true, heal:14, desc:'聖の魔法（大）。大きく回復' },
  dark1:    { name:'闇',       ap:2, kind:'atk', mult:1.7, pierce:true, magic:true, self:.04, desc:'闇の魔法（小）。HPを少し削って強く撃つ' },
  dark2:    { name:'暗黒',     ap:3, kind:'atk', mult:2.6, pierce:true, magic:true, self:.07, desc:'闇の魔法（中）。HPを削る' },
  dark3:    { name:'深淵',     ap:4, kind:'atk', mult:3.9, pierce:true, magic:true, self:.12, desc:'闇の魔法（大）。HPを大きく削る、いちばん強い魔法' },
  // 盾の技: 盾を持っていると、持ち込む10個とは別にいつでも使える
  counter:  { name:'構え',     ap:1, kind:'counter', cut:.3, back:1.2, desc:'次の攻撃を受け止めて反撃' },
  wall:     { name:'鉄壁',     ap:1, kind:'guard', cut:.25, desc:'このターンの被ダメージを大きく減らす' },
  shieldbash:{ name:'盾打ち',  ap:2, kind:'atk', mult:1.2, guardToo:true, desc:'殴って、そのまま守る' },
  frenzy:   { name:'乱れ斬り', ap:3, kind:'atk', mult:.7, hits:4, desc:'4回攻撃' },
  tsubame:  { name:'燕返し',   ap:3, kind:'atk', mult:1.6, hits:2, desc:'重い2回攻撃' },
  bunshin:  { name:'分身',     ap:1, kind:'dodge', dodge:.5, desc:'このターン、5割で攻撃をかわす' },
  kagenui:  { name:'影縫い',   ap:2, kind:'atk', mult:1, stun:.5, desc:'たまに敵の動きを止める' },
  assassin: { name:'暗殺',     ap:3, kind:'atk', mult:1.2, kill:.25, desc:'たまに一撃で仕留める（ボスには効かない）' },
  magicblade:{ name:'魔法剣',  ap:2, kind:'atk', mult:1.6, pierce:true, desc:'守りを無視する斬撃' },
  sagefire: { name:'癒しの炎', ap:3, kind:'atk', mult:1.3, pierce:true, magic:true, heal:12, desc:'攻撃しながら回復' },
  heavyslash:{ name:'重斬り',  ap:3, kind:'atk', mult:2.0, break:1, desc:'大剣の重い一撃＋守りを崩す' },
  monkstrike:{ name:'破邪の杖', ap:2, kind:'atk', mult:1.3, heal:8, desc:'殴りながら回復' },
  snipe:    { name:'急所射ち', ap:2, kind:'atk', mult:1.7, crit:.4, desc:'急所を射抜く' },
  arcanearrow:{ name:'魔矢',   ap:3, kind:'atk', mult:1.0, hits:2, pierce:true, magic:true, desc:'魔法の矢を2本' },
  plunder:  { name:'略奪',     ap:2, kind:'atk', mult:1.6, stealToo:true, desc:'殴って素材を奪う' },
  darkblade:{ name:'暗黒剣',   ap:3, kind:'atk', mult:2.4, pierce:true, self:.12, desc:'HPを代償に守りを無視する大技' },
  holyguard:{ name:'聖なる守り', ap:2, kind:'guard', cut:.4, heal:12, desc:'回復して守る' },
  bomb:     { name:'爆薬',     ap:2, kind:'atk', mult:1.8, pierce:true, desc:'守りを無視する爆発' },
  punch:    { name:'正拳突き', ap:1, kind:'atk', mult:1.4, desc:'素手の一撃' },
  flurry:   { name:'連打',     ap:2, kind:'atk', mult:.6, hits:4, desc:'4回攻撃' },
};

// ---------- パッシブ ----------
// 覚えたジョブ以外でも付けられる。付けられる数は PASSIVE_SLOTS まで
const PASSIVE_SLOTS = 3;
const PASSIVES = {
  p_keep:  { name:'持ち帰り',   desc:'倒れても素材を半分持ち帰る' },
  p_loot:  { name:'目利き',     desc:'魔物が素材を落としやすい' },
  p_atk:   { name:'力持ち',     desc:'攻撃+3' },
  p_crit:  { name:'会心',       desc:'会心が出やすい' },
  p_hp:    { name:'頑丈',       desc:'最大HP+20（塔の中だけ）' },
  p_steal: { name:'盗み上手',   desc:'盗むが成功しやすい' },
  p_first: { name:'先制',       desc:'戦闘の最初に先に一撃入れる' },
  p_regen: { name:'自然回復',   desc:'毎ターンHP+3' },
  p_herb:  { name:'薬草上手',   desc:'薬草の回復1.5倍' },
  p_ap:    { name:'集中',       desc:'毎ターンのAP+1' },
  p_def:   { name:'鉄の皮膚',   desc:'守り+3' },
  p_guard: { name:'盾の心得',   desc:'守る・鉄壁の効果アップ' },
  p_carry: { name:'溜め',       desc:'持ち越せるAP+1' },
  p_focus: { name:'気合',       desc:'最初のターンの攻撃1.5倍' },
};

// 鍛冶のレシピ（主素材＋基本素材。上位ほど基本素材も多く要る）
const RECIPES = [
  { id:'copper_hammer', name:'銅の槌',       type:'hammer',     atk:6,  cost:{copper:3},                    price:40 },
  { id:'copper_sword',  name:'銅の剣',       type:'sword',      atk:7,  cost:{copper:2, leather:1},         price:50 },
  { id:'bone_dagger',   name:'骨のダガー',   type:'dagger',     atk:5,  cost:{bone:2, leather:1},           price:35 },
  { id:'bone_staff',    name:'骨の杖',       type:'staff',      atk:3,  cost:{bone:2, stone:1},             price:45 },
  { id:'stone_book',    name:'魔石の魔導書', type:'book',       atk:3,  cost:{stone:2, leather:1},          price:55 },
  { id:'bone_bow',      name:'骨の弓',       type:'bow',        atk:8,  cost:{bone:3, leather:1},           price:45 },
  { id:'copper_axe',    name:'銅の斧',       type:'axe',        atk:11, cost:{copper:4, bone:1},            price:60 },
  { id:'copper_shield', name:'銅の盾',       type:'shield',     atk:0, def:3, cost:{copper:2, leather:2},   price:45 },
  { id:'iron_sword',    name:'鉄の剣',       type:'sword',      atk:11, cost:{iron:2, copper:1, leather:1}, price:110 },
  { id:'iron_katana',   name:'鉄の刀',       type:'katana',     atk:17, cost:{iron:3, leather:1, bone:1},   price:150 },
  { id:'iron_great',    name:'鉄の大剣',     type:'greatsword', atk:19, cost:{iron:4, leather:1},           price:170 },
  { id:'iron_axe',      name:'鉄の斧',       type:'axe',        atk:18, cost:{iron:3, copper:2, bone:1},    price:150 },
  { id:'iron_hammer',   name:'鉄の槌',       type:'hammer',     atk:10, cost:{iron:3, bone:1},              price:100 },
  { id:'iron_shield',   name:'鉄の盾',       type:'shield',     atk:0, def:6, cost:{iron:2, leather:2},     price:100 },
  { id:'copper_pick',   name:'銅のツルハシ',   type:'tool', tool:'pick',   dur:40, cost:{copper:3, leather:1}, price:40 },
  { id:'lumber_axe',    name:'木こりの斧',     type:'tool', tool:'axe',    dur:40, cost:{copper:2, bone:1, leather:1}, price:40 },
  { id:'shovel',        name:'シャベル',       type:'tool', tool:'shovel', dur:40, cost:{copper:2, bone:2}, price:35 },
  { id:'leather_armor', name:'革の鎧',       type:'armor',      def:2,  cost:{leather:3},                   price:40 },
  { id:'iron_armor',    name:'鉄の鎧',       type:'armor',      def:5,  cost:{iron:3, leather:2},           price:120 },
];

// 武具屋で買える物（買うと高い。自分で打つ方が得）
const SHOP = ['copper_sword','bone_dagger','bone_staff','copper_shield','leather_armor'];

// 魔物（1〜10階・ダンジョン）。数値は仮
// 2026-11-24 強くした（最初の値からHP約3倍、攻撃約1.8倍）。最初は歯ごたえがあるように
const MONSTERS = [
  { id:'rat',      name:'大ネズミ',     hp:42, atk:9,  def:1, exp:6,  gold:3,  drop:{rat_hide:1},           from:1, color:'#8a6a52', size:.55 },
  { id:'skeleton', name:'スケルトン',   hp:60, atk:12, def:4, exp:11,  gold:5,  drop:{cursed_bone:2},        from:2, color:'#d8d0bc', size:.78 },
  { id:'goblin',   name:'ゴブリン',     hp:76, atk:14, def:4, exp:15, gold:9,  drop:{ore_copper:2, dim_stone:1}, from:3, color:'#6f9a48', size:.68 },
  { id:'centipede',name:'鉄喰いムカデ', hp:98, atk:18, def:7, exp:21, gold:8,  drop:{iron_shell:1, ore_copper:1}, from:5, color:'#7a3f2a', size:.66 },
];
const BOSS10 = { id:'golem', name:'鉱山ゴーレム', hp:520, atk:27, def:12, exp:220, gold:180, drop:{ore_copper:8, ore_iron:6, golem_core:1}, boss:true, color:'#7b746a', size:.86 };
// 11階より上の魔物（2026-11-24。絵: assets/monsters/<id>_idle|attack|hit.webp）
// [id, 名前, 出る最初の階, 強さの倍率, 戦利品, 大きさ]。強さはエリア（10階ごと）が上がるほど大きくなる
const MON_UP = [
  ['wolf','森狼',11,1.0,{beast_pelt:1,beast_fang:1},.66], ['spider','大蜘蛛',11,.9,{spider_silk:1},.66], ['treant','トレント',13,1.2,{old_wood:2},.85], ['mushroom','キノコ人',11,.8,{spore:1},.6],
  ['moth','毒蛾',14,.85,{spore:1},.66], ['boar','角イノシシ',15,1.1,{beast_pelt:1,beast_fang:1},.66], ['pixie','いたずら妖精',16,.75,{spore:1},.55], ['vine','つる草の魔物',17,1.05,{old_wood:1,spore:1},.8],
  ['scorpion','大サソリ',21,1.0,{hard_shell:1},.66], ['sandlizard','サンドリザード',21,.95,{scale:1},.66], ['mummy','ミイラ',23,1.05,{old_cloth:2,cursed_bone:1},.8], ['sandworm','砂ミミズ',25,1.2,{cursed_bone:2},.75],
  ['rockgolem','岩ゴーレム',31,1.25,{rock_core:1,ore_iron:1},.85], ['goatman','山羊の魔人',31,1.05,{beast_pelt:1,beast_fang:1},.8], ['wyvern','ワイバーン',34,1.15,{scale:2},.8], ['yeti','雪男',33,1.1,{beast_pelt:2},.82],
  ['rocklizard','岩トカゲ',32,1.0,{scale:1,rubble:1},.7], ['orc','オーク',32,1.05,{ore_iron:1,beast_fang:1},.8], ['harpy','ハーピー',35,.9,{feather:2},.72], ['ghostminer','幽霊坑夫',36,.95,{ore_iron:2},.78],
  ['python','大蛇',51,1.1,{scale:2},.7], ['maneater','人食い花',51,1.0,{old_wood:1,spore:2},.75], ['junglecat','森虎',53,1.1,{beast_pelt:2,beast_fang:1},.72], ['poisonfrog','毒蛙',52,.9,{spore:2},.6],
  ['ape','大猿',54,1.15,{beast_pelt:2},.8], ['swarm','羽虫の群れ',55,.85,{hard_shell:1},.75], ['shaman','ジャングルの呪術師',56,.95,{cursed_bone:2,spore:1},.75], ['beetle','巨大カブトムシ',57,1.2,{hard_shell:2},.7],
  ['statue','石像の番人',61,1.2,{rock_core:1},.85], ['cursedpot','呪いの壺',61,.9,{cursed_gold:1},.62], ['sphinx','スフィンクス',63,1.2,{cursed_gold:1,beast_pelt:1},.8], ['tombguard','遺跡の兵',62,1.05,{old_cloth:1,cursed_gold:1},.8],
  ['scarab','スカラベ',62,.95,{hard_shell:1,raw_gem:1},.62], ['sandserpent','砂の大蛇',64,1.1,{scale:2},.75], ['goldarmor','黄金の鎧',66,1.25,{cursed_gold:2},.82], ['jackal','墓守の犬',65,1.05,{cursed_gold:1,old_cloth:1},.8],
  ['griffin','グリフォン',71,1.15,{feather:2,beast_fang:1},.82], ['rockcrab','岩ガニ',71,1.1,{hard_shell:2},.66], ['ogre','オーガ',73,1.25,{beast_fang:2,ore_iron:1},.86], ['magmaslime','マグマスライム',72,.95,{ember_stone:1},.62],
  ['thunderbird','雷鳥',74,1.0,{feather:2},.75], ['rockgiant','岩の巨人の子',75,1.2,{rock_core:2},.8], ['canyonharpy','峡谷のハーピー',76,.95,{feather:2},.72], ['lavalizard','溶岩トカゲ',77,1.1,{ember_stone:1,scale:1},.7],
  ['pegasus','天馬',81,1.1,{feather:3},.82], ['cloudragon','雲竜',82,1.25,{scale:2,star_dust:1},.85], ['windspirit','風の精霊',81,.95,{star_dust:1},.78], ['stormbird','雷の鳥',83,1.05,{feather:2,ice_shard:1},.8],
  ['iceangel','氷の天使',84,1.1,{ice_shard:2},.82], ['cloudwhale','雲くじら',85,1.3,{star_dust:2},.8], ['frostknight','霜の騎士',86,1.2,{ice_shard:1,dark_steel:1},.82], ['starjelly','星のくらげ',87,.95,{star_dust:2},.75],
  ['phantomknight','亡霊騎士',91,1.2,{dark_steel:2},.85], ['gargoyle','ガーゴイル',91,1.1,{rock_core:2},.8], ['golemdoll','魔導人形',92,1.05,{dark_steel:1,star_dust:1},.8], ['dragoon','竜騎兵',93,1.25,{dark_steel:1,scale:2},.85],
  ['shadow','影の暗殺者',94,1.0,{dark_steel:1},.78], ['armor','動く甲冑',95,1.3,{dark_steel:3},.86], ['grimoire','呪いの書',96,.95,{star_dust:2},.65], ['mirrorshard','鏡の欠片',97,1.15,{star_dust:2,raw_gem:1},.82],
  ['icewolf','氷狼',41,1.0,{beast_pelt:1,ice_shard:1},.66], ['snowman','雪だるまの魔物',41,.95,{ice_shard:1},.72], ['icegolem','アイスゴーレム',43,1.25,{ice_shard:2},.85], ['snowsprite','雪の精',42,.85,{ice_shard:1,spore:1},.7],
  ['polarbear','白熊',44,1.2,{beast_pelt:2,beast_fang:1},.8], ['icebird','氷の鳥',45,1.0,{feather:2,ice_shard:1},.78], ['frozenknight','凍った騎士',46,1.15,{ice_shard:1,ore_iron:2},.82], ['blizzardghost','吹雪の亡霊',47,1.0,{ice_shard:2},.8],
  ['vulture','砂漠ハゲワシ',22,.95,{feather:1,cursed_bone:1},.76], ['cactus','サボテンの魔物',24,1.05,{old_wood:1,spore:1},.72], ['sandspirit','砂の精霊',26,1.05,{raw_gem:1},.78], ['graverobber','盗掘者の亡霊',27,1.0,{cursed_gold:1},.78],
  // 2026-11-24 追加（1エリア16体に）
  ['forestthief','森の盗賊ゴブリン',12,.9,{beast_pelt:1,ore_copper:1},.66], ['slug','巨大ナメクジ',13,.95,{spore:1},.64], ['owl','梟の魔物',14,.95,{feather:2},.72], ['stump','切り株の魔物',12,1.05,{old_wood:2},.66],
  ['mosstortoise','苔むした亀',16,1.2,{hard_shell:1,old_wood:1},.72], ['queenbee','蜂の女王',18,1.1,{hard_shell:1,spore:1},.74], ['kodama','木霊',15,.75,{spore:1},.55], ['scarecrow','枯れ枝の案山子',17,1.0,{old_wood:1,old_cloth:1},.78],
  ['bandit','砂漠の盗賊',21,.95,{old_cloth:1,ore_copper:2},.78], ['camel','ラクダの魔物',23,1.1,{beast_pelt:2},.78], ['antlion','蟻地獄',24,1.1,{hard_shell:2},.66], ['sandeye','砂嵐の目玉',26,1.0,{raw_gem:1},.72],
  ['snakeknot','毒蛇の束',25,1.05,{scale:2},.7], ['mirage','蜃気楼の踊り子',27,.95,{cursed_gold:1},.8], ['bonelizard','骨のトカゲ',22,1.0,{cursed_bone:2},.68], ['chesthermit','宝箱ガニ',28,1.15,{hard_shell:1,cursed_gold:1},.7],
  ['banditchief','山賊の頭',33,1.15,{beast_pelt:1,ore_iron:2},.82], ['lynx','山猫',31,.95,{beast_pelt:1,beast_fang:1},.68], ['boulder','落石の魔物',32,1.1,{rock_core:1,rubble:1},.66], ['eagle','大鷲',34,1.0,{feather:2},.78],
  ['dwarfghost','ドワーフの亡霊',36,1.0,{ore_iron:2},.76], ['orecentipede','鉱石ムカデ',35,1.1,{ore_iron:1,hard_shell:1},.66], ['thundergoat','雷の山羊',37,1.05,{beast_pelt:1,rock_core:1},.78], ['troll','トロル',38,1.25,{beast_fang:2,rock_core:1},.86],
  ['snowleopard','雪豹',41,1.0,{beast_pelt:2},.7], ['penguin','ペンギンの戦士',42,.95,{feather:1,ice_shard:1},.74], ['iceslime','氷のスライム',41,.9,{ice_shard:1},.6], ['mammoth','マンモス',45,1.25,{beast_pelt:2,beast_fang:2},.82],
  ['yukionna','雪女',47,1.05,{ice_shard:2},.8], ['frozentree','凍った大樹',44,1.15,{old_wood:2,ice_shard:1},.85], ['frostfox','霜の狐',43,.95,{beast_pelt:1,ice_shard:1},.7], ['iciclebeast','氷柱の魔物',46,1.1,{ice_shard:2},.82],
  ['chameleon','カメレオンの魔物',52,1.0,{scale:2},.7], ['parrot','大オウム',51,.9,{feather:3},.76], ['pitcherplants','食虫植物の群れ',53,1.05,{spore:2,old_wood:1},.72], ['crocwarrior','ワニの戦士',55,1.2,{scale:2,beast_fang:1},.82],
  ['mushsprite','毒キノコの森の精',54,.9,{spore:2},.68], ['leech','巨大ヒル',56,1.0,{scale:1,spore:1},.7], ['jaguarwarrior','ジャガーの戦士',57,1.15,{beast_pelt:2,raw_gem:1},.82], ['woodmask','木の仮面の精霊',58,1.05,{old_wood:2,star_dust:1},.8],
  ['hawkpriest','鷹の頭の神官',63,1.05,{cursed_gold:1,feather:1},.82], ['tablet','呪いの石板',62,1.1,{rock_core:1,cursed_gold:1},.76], ['chariot','砂の戦車兵',65,1.2,{cursed_bone:2,cursed_gold:1},.82], ['medusa','蛇の髪の女',66,1.1,{scale:2,raw_gem:1},.8],
  ['goldswarm','金の甲虫の群れ',64,1.0,{cursed_gold:2},.8], ['royalcat','王の猫',61,.95,{cursed_gold:1},.72], ['colossushand','崩れた巨像の手',67,1.25,{rock_core:2},.78], ['sealedbox','封印の箱',68,1.15,{cursed_gold:2,raw_gem:1},.72],
  ['rockrhino','岩のサイ',73,1.25,{rock_core:2},.8], ['frilllizard','火吹きトカゲ',71,1.0,{scale:1,ember_stone:1},.72], ['canyonbat','峡谷の大コウモリ',72,.95,{feather:1,beast_fang:1},.76], ['stoneeye','石化の目玉',74,1.0,{rock_core:1,raw_gem:1},.68],
  ['firesprite','炎の精',75,.95,{ember_stone:1},.7], ['obsidian','黒曜石のゴーレム',77,1.3,{rock_core:2,ember_stone:1},.86], ['scorpionking','巨大サソリの王',76,1.2,{hard_shell:3},.74], ['lavasnake','溶岩の蛇',78,1.1,{ember_stone:1,scale:1},.74],
  ['cloudsheep','雲の羊',81,.95,{feather:1,star_dust:1},.72], ['lightningsprite','稲妻の精',83,1.0,{star_dust:1,ice_shard:1},.78], ['jellyking','空の海月の王',86,1.15,{star_dust:2},.8], ['skyrider','天空の騎兵',85,1.2,{feather:2,dark_steel:1},.84],
  ['moonrabbit','月の兎',82,.9,{beast_pelt:1,star_dust:1},.66], ['glacierserpent','氷河の大蛇',84,1.15,{ice_shard:2,scale:1},.76], ['rainbowbird','虹の鳥',87,1.05,{feather:3},.8], ['cloudhand','雲の巨人の手',88,1.25,{star_dust:2,rock_core:1},.8],
  ['courtmage','宮廷魔術師の亡霊',92,1.05,{star_dust:2},.8], ['rose','血の色の薔薇',91,1.0,{old_wood:2,spore:2},.74], ['portrait','肖像画の魔物',93,1.0,{cursed_gold:2},.78], ['candleknight','燭台の騎士',94,1.15,{dark_steel:1,ember_stone:1},.82],
  ['wolfking','黒い狼の王',95,1.25,{beast_pelt:3,dark_steel:1},.82], ['hangingarmor','吊るし鎧',96,1.15,{dark_steel:2},.85], ['jester','道化の人形',97,1.0,{old_cloth:2,star_dust:1},.78], ['shadowhand','影の王の手',98,1.2,{dark_steel:1,star_dust:2},.8],
];
// エリアごとの強さの土台（10階ごと）。11〜20階が1
const AREA_POW = n => Math.pow(1.42, Math.floor((n - 1) / 10));
for (const [id, name, from, mul, drop, size] of MON_UP) {
  const p = AREA_POW(from) * mul, end = Math.floor((from - 1) / 10) * 10 + 10;
  MONSTERS.push({ id, name, hp: Math.round(120 * p), atk: Math.round(22 * p), def: Math.round(9 * p), exp: Math.round(30 * p), gold: Math.round(16 * p), drop, from, to: end, size, color: '#776655', file: true });
}
// 1〜10階に足した魔物
MONSTERS.push(
  { id:'bat',         name:'大コウモリ',   hp:34, atk:9,  def:1, exp:6,  gold:3, drop:{rat_hide:1},              from:2, to:10, size:.6,  file:true },
  { id:'slime',       name:'洞窟スライム', hp:48, atk:8,  def:5, exp:9,  gold:4, drop:{dim_stone:1},             from:3, to:10, size:.58, file:true },
  { id:'wanderarmor', name:'さまよう鎧',   hp:80, atk:15, def:9, exp:20, gold:12, drop:{ore_iron:1, ore_copper:1}, from:6, to:10, size:.8,  file:true },
  { id:'orelizard',   name:'鉱石トカゲ',   hp:64, atk:12, def:6, exp:15, gold:7, drop:{ore_copper:2},            from:4, to:10, size:.66, file:true },
  { id:'gobarcher',  name:'ゴブリンの弓兵', hp:46, atk:12, def:3, exp:11, gold:8, drop:{ore_copper:1, rat_hide:1}, from:3, to:10, size:.66, file:true },
  { id:'bonedog',    name:'骨の犬',     hp:40, atk:11, def:2, exp:9,  gold:4, drop:{cursed_bone:2},          from:2, to:10, size:.62, file:true },
  { id:'larva',      name:'大ムカデの幼虫', hp:56, atk:8, def:5, exp:9, gold:4, drop:{iron_shell:1},          from:4, to:10, size:.58, file:true },
  { id:'gearbeast',  name:'錆びた歯車の魔物', hp:70, atk:13, def:9, exp:16, gold:10, drop:{ore_iron:1, ore_copper:1}, from:7, to:10, size:.66, file:true },
  { id:'ratking',    name:'地下ネズミの王', hp:90, atk:14, def:5, exp:22, gold:20, drop:{rat_hide:3},            from:8, to:10, size:.72, file:true },
  { id:'chainghost', name:'鎖の亡霊',   hp:62, atk:14, def:4, exp:16, gold:9, drop:{cursed_bone:1, dim_stone:1}, from:6, to:10, size:.76, file:true },
  { id:'pebbleimp',  name:'石つぶて小鬼', hp:44, atk:11, def:4, exp:10, gold:6, drop:{rubble:2},              from:2, to:10, size:.62, file:true },
  { id:'candle',     name:'ろうそくの魔物', hp:52, atk:13, def:2, exp:12, gold:7, drop:{dim_stone:1},          from:5, to:10, size:.66, file:true },
);
for (const m of MONSTERS) if (!m.to) m.to = 10;  // 1〜10階の魔物は10階まで
// 10階ごとの主
const BOSS30 = { id:'sandwormking', name:'大砂蟲', hp:2600, atk:68, def:30, exp:1200, gold:900, drop:{worm_gem:1, raw_gem:3, hard_shell:3}, boss:true, color:'#a07a40', size:.95, file:true };
const mkBoss = (id, name, floor, mul, drop, size) => { const p = AREA_POW(floor) * mul; return { id, name, hp: Math.round(950 * p), atk: Math.round(36 * p), def: Math.round(15 * p), exp: Math.round(500 * p), gold: Math.round(320 * p), drop, boss: true, size, file: true }; };
const BOSSES = { 10: BOSS10, 30: BOSS30,
  20: mkBoss('forestbear', '森の主の大熊', 20, 1, { beast_pelt: 4, beast_fang: 3, old_wood: 3 }, .92),
  40: mkBoss('youngdragon', '若い竜', 40, 1, { scale: 5, rock_core: 2, raw_gem: 2 }, .95),
  50: mkBoss('icegiant', '氷の巨人', 50, 1, { ice_shard: 5, dark_steel: 1 }, .95),
  60: mkBoss('apeking', '密林の大猿王', 60, 1, { beast_pelt: 6, hard_shell: 3, raw_gem: 2 }, .95),
  70: mkBoss('ruinking', '遺跡の王', 70, 1, { cursed_gold: 6, raw_gem: 3 }, .95),
  80: mkBoss('firedragon', '古い火竜', 80, 1, { ember_stone: 5, scale: 5 }, .97),
  90: mkBoss('elderdragon', '古竜', 90, 1, { star_dust: 6, scale: 6, dark_steel: 2 }, .97),
};
// 中ボス（5階ごと。2026-11-24）。階段の前で待っている。主より弱い
Object.assign(BOSSES, {
  5:  { id:'goblinboss', name:'ゴブリンの親分', hp:220, atk:17, def:5, exp:70, gold:80, drop:{ore_copper:4, rat_hide:2, dim_stone:1}, boss:true, size:.86, file:true },
  15: mkBoss('mossserpent', '苔の大蛇', 15, .55, { scale: 3, spore: 2 }, .9),
  25: mkBoss('scorpionqueen', 'サソリの女王', 25, .55, { hard_shell: 3, raw_gem: 1 }, .9),
  35: mkBoss('ogrechief', 'オーガの戦士長', 35, .55, { beast_fang: 3, ore_iron: 3 }, .92),
  45: mkBoss('icewolfking', '氷の狼の王', 45, .55, { beast_pelt: 3, ice_shard: 3 }, .9),
  55: mkBoss('frogking', '巨大なカエルの王', 55, .55, { spore: 4, raw_gem: 1 }, .9),
  65: mkBoss('anubis', 'アヌビスの番人', 65, .55, { cursed_gold: 4 }, .92),
  75: mkBoss('chimera', 'キマイラ', 75, .55, { beast_pelt: 3, ember_stone: 2 }, .92),
  85: mkBoss('stormroc', '嵐の巨鳥', 85, .55, { feather: 5, star_dust: 2 }, .92),
  95: mkBoss('blackknightlord', '黒騎士団長', 95, .55, { dark_steel: 4 }, .92),
});
const TOP_FLOOR = 90;  // いま登れるいちばん上の階（91〜100階の城は、最後の「鏡」と一緒に作る）

// 道具屋
// 道具屋で買える物（2026-11-23）。battle: 戦闘中にも使える
const ITEMS = {
  herb:    { name:'薬草',           price:8,  short:'HP小回復', desc:'HPを少し回復',                 battle:true },
  herb_m:  { name:'中薬草',         price:25, short:'HP中回復', desc:'HPをそこそこ回復',             battle:true },
  herb_l:  { name:'大薬草',         price:60, short:'HP全回復', desc:'HPを全回復',                   battle:true },
  wing:    { name:'帰還の羽',       price:30, short:'町へ帰る', desc:'町へ帰れる' },
  bandage: { name:'包帯',           price:20, short:'ケガを一時的に治す', desc:'ケガを1つ一時的に治す（町に戻ったら治療が必要）', battle:true },
  bird:    { name:'バードキャリー', price:40, short:'戦利品を工房へ', desc:'鳥が今の戦利品を全部工房に運んでくれる（戦利品だけ）' },
  ward:    { name:'魔除け',         price:25, short:'出会う率−30%・3階', desc:'魔物に出会う率−30%（使ってから3フロア）' },
  lure:    { name:'魔寄せ',         price:20, short:'出会う率+40%・3階', desc:'魔物に出会う率+40%（使ってから3フロア）' },
};

// 宿屋の料理（塔の素材で作る。次の1回の挑戦だけ効く）
const MEALS = {
  stew:  { name:'革の煮込み',   cost:{leather:2}, desc:'最大HP+10',             say:'固い。でも、腹の底から力が湧いてくる。' },
  broth: { name:'骨のスープ',   cost:{bone:2},    desc:'戦闘に勝つたびHP+6',     say:'じんわり温まる。骨の髄まで。' },
  spark: { name:'魔石のスープ', cost:{stone:1},   desc:'戦闘の最初のターンAP+1', say:'舌がピリピリする。体が軽い。' },
};
// 今日の塔の噂（町に戻るたびに変わる。噂は本当に塔に反映される）
const RUMORS = {
  normal: { say:'今日の塔は、いつも通りらしいよ。', mod:{} },
  chest:  { say:'今日は塔の中に宝箱がやけに多いって噂だ。', mod:{chest:.65} },
  goblin: { say:'ゴブリンどもが騒がしいらしい。銅がよく取れるかもな。', mod:{goblin:true} },
  calm:   { say:'今日の塔は静かだって。魔物が少ないらしい。', mod:{enc:.04} },
  rich:   { say:'魔物がよく素材を落とすって話だよ。', mod:{drop:.97} },
  danger: { say:'今日は魔物が荒れてる。そのぶん、倒せば得るものも多いってさ。', mod:{danger:true} },
};

// ---------- 治療院（2026-11-23 決定） ----------
// ケガ: 倒れたときや、大きな一撃を受けたときに残る。工房のベッドでは治らず、治療院でしか治せない
const INJURIES = {
  arm:  { name:'腕の骨折',     desc:'攻撃−20%' },
  leg:  { name:'足のねんざ',   desc:'攻撃をかわせない・逃げにくい' },
  rib:  { name:'あばらのヒビ', desc:'毎ターンのAP−1' },
  head: { name:'頭の打撲',     desc:'会心が出ない' },
};
const INJURY_PRICE = 30;
// 祝福: エリーに祈ってもらう。次の1回の挑戦だけ効く守り（料理は攻め、祝福は守り）。一度に1つ
const BLESSINGS = {
  stand: { name:'踏みとどまる祈り', price:40, desc:'一度だけ、倒れてもHP1で踏みとどまる' },
  ward:  { name:'守りの祈り',       price:30, desc:'ボス戦で受けるダメージ−30%' },
  calm:  { name:'静けさの祈り',     price:20, desc:'魔物に出会いにくくなる' },
};

// ---------- 親密度と会話（2026-11-23 決定） ----------
// 好印象な返事をするとポイントが増える。AFF_NEED に届くと特典。町では1人につき、塔から戻るたびに1回話せる
// a: [返事, ポイント, 相手の反応]
const AFF_NEED = 10;
const TALKS = {
  jenny: [
    { q:'ジェニー「……ねえ、その手。また火傷してるじゃない」', a:[['「職人の勲章だ」',1,'ジェニー[laugh]「なにそれ。……ま、かっこいいけど」'],['「ありがとう。気をつけるよ」',2,'ジェニー[shy]「べ、別に心配なんかしてないから」'],['「お前の手も荒れてるな」',0,'ジェニー[angry]「うるさいわね！ 槌を振ってるのよ、あたしも」']] },
    { q:'ジェニー「あんたの打った剣、今日も売れたわよ。……あたしが一番いい棚に置いてるからね」', a:[['「助かる。お前の店だから売れるんだ」',2,'ジェニー[happy]「……そ、そうでしょ！ わかってるじゃない」'],['「剣がいいからだろ」',0,'ジェニー[angry]「はあ？ 置き方も大事なの！」'],['「一番いい棚って、どれだ？」',1,'ジェニー[laugh]「入口の正面よ。毎朝、磨いてるんだから」']] },
    { q:'ジェニー「塔の上って、景色いいの？ ……いつか、見てみたいな」', a:[['「いつか連れていくよ」',2,'ジェニー[inlove]「……ほんとに？ 約束だからね」'],['「危ないからやめとけ」',1,'ジェニー[worried]「わかってるわよ。……あんたもね」'],['「石の壁しかないぞ」',0,'ジェニー[laugh]「夢がないわねぇ」']] },
    { q:'ジェニー「今日はお客が少なくて暇なの。……ちょっとくらい、いてもいいわよ」', a:[['「じゃあ、少しだけ」',2,'ジェニー[shy]「……ふーん。座れば？」'],['「工房に戻らないと」',0,'ジェニー「……あっそ。行ってらっしゃい」'],['「店番、手伝おうか」',1,'ジェニー[laugh]「あんたが立ってたら、お客が逃げるわよ」']] },
  ],
  elly: [
    { q:'エリー「ちゃんと、ご飯食べてますか？ 塔の中で何を食べてるのか心配で……」', a:[['「宿屋で食べてから行ってる」',1,'エリー[smile]「よかった。ガストンさんのご飯なら安心です」'],['「心配してくれて、ありがとう」',2,'エリー[happy]「……い、いえ！ 治療院の者として当然です！」'],['「魔物の肉だな」',0,'エリー[shock]「えっ……。お、お腹壊しますよ！？」']] },
    { q:'エリー「お祈りの言葉、新しいのを考えたんです。聞いてくれますか？」', a:[['「ぜひ聞かせてくれ」',2,'エリー[shy]「……あなたが、無事に帰ってきますように。……以上です」'],['「神様に聞かせてやれ」',0,'エリー「……そ、そうですよね」'],['「短めで頼む」',1,'エリー[laugh]「ふふ、じゃあ一言だけ。『おかえりなさい』」']] },
    { q:'エリー「この花、治療院の裏で咲いたんです。……持っていきますか？」', a:[['「工房に飾るよ」',2,'エリー[happy]「はい！ 枯らしたら怒りますからね」'],['「塔に持っていっても、潰れるな」',1,'エリー[smile]「じゃあ、工房に置いておいてくださいね」'],['「食べられるのか？」',0,'エリー[shock]「食べちゃだめです！」']] },
  ],
  ria: [
    { q:'リア「到達記録の書類、清書しておきました。……字、きれいでしょう？」', a:[['「ああ、見やすいな」',1,'リア[smile]「ありがとうございます。仕事ですから」'],['「リアの字は、きれいだ」',2,'リア[shy]「……っ。……その一文、記録しておきます」'],['「数字が合ってればいい」',0,'リア「……そうですね」']] },
    { q:'リア「次はどこまで行くんですか？ 予定を聞いておかないと、心配……いえ、書類が」', a:[['「無理しない所までだ」',2,'リア[happy]「……はい。それが一番です」'],['「行けるところまで」',1,'リア[worried]「……帰ってくるところまで、にしてください」'],['「書類のためか」',0,'リア「……ええ。書類のためです」']] },
    { q:'リア「ボルツさんが、あなたの戦利品は丁寧だって褒めてましたよ」', a:[['「ボルツの腕がいいんだ」',1,'リア[smile]「ふふ、伝えておきます」'],['「リアが受け取ってくれるからな」',2,'リア[shy]「……わ、わたしは、受付なので」'],['「褒められても値段は変わらん」',0,'リア[laugh]「それはそうですね」']] },
  ],
  fuuka: [
    { q:'フウカ「あ、鍛冶屋さん。……また会えたね」', a:[['「元気そうだな」',1,'フウカ[smile]「うん。あなたも」'],['「待ってたのか？」',2,'フウカ[shy]「……ち、違うし。たまたま、だし」'],['「仕事中だ」',0,'フウカ[pout]「……知ってる」']] },
    { q:'フウカ「その刀……ううん、なんでもない。あなたが打ったの？」', a:[['「ああ。持ってみるか」',2,'フウカ[love]「……いいの？ ……あったかい」'],['「売り物じゃないぞ」',0,'フウカ[pout]「欲しいなんて言ってないもん」'],['「次はお前のも打とうか」',2,'フウカ[laugh]「ほんと！？ 約束だよ！」']] },
    { q:'フウカ「くノ一ってね、人を好きになっちゃいけないんだって」', a:[['「そうなのか。大変だな」',1,'フウカ[pout]「……ほんと、鈍いんだから」'],['「好きにすればいい」',2,'フウカ[love]「……うん。好きにする」'],['「腹が減ったな」',0,'フウカ[laugh]「あはは！ もう、なにそれ」']] },
  ],
  jin: [
    { q:'ジン「ほう、塔に登る鍛冶屋とは。……その手、いい手じゃ」', a:[['「まだまだです」',2,'ジン[laugh]「その答えがいい。ほっほっほ」'],['「どうも」',1,'ジン「うむ」'],['「じいさんも登るのか？」',0,'ジン[smile]「昔の話じゃよ」']] },
    { q:'ジン「塔は、何のためにあると思う？」', a:[['「素材を取るため……ですかね」',1,'ジン[smile]「それも答えのひとつじゃ」'],['「わからない。登ればわかる気がする」',2,'ジン[laugh]「よい。わからんと言える者は強い」'],['「考えたこともない」',0,'ジン「……そうか。いずれ、考える時が来る」']] },
    { q:'ジン「この像の男はな、塔のてっぺんの手前で、引き返したそうじゃ」', a:[['「なぜですか？」',2,'ジン[think]「……さてな。登りきるより、大事なものに気づいたのかもしれん」'],['「もったいない」',0,'ジン[laugh]「若いのう」'],['「怖くなったのかも」',1,'ジン「怖さを知るのも、強さのうちじゃ」']] },
  ],
};
// 親密度の特典
TALKS.desert = [
  { q:'砂の女神「あら、人の子。こんな砂の中まで、何をしに来たの？」', a:[['「素材を探しに」',1,'砂の女神[smile]「正直ね。好きよ、そういうの」'],['「あなたに会いに」',2,'砂の女神[laugh]「ふふっ、口が上手いのね」'],['「迷った」',0,'砂の女神「……出口は、あっちよ」']] },
  { q:'砂の女神「砂はね、全部むかしは岩だったの。あなたの剣も、いつか砂になるわ」', a:[['「それまで使ってもらえたら本望だ」',2,'砂の女神[smile]「……いい職人ね」'],['「ならないように打つ」',1,'砂の女神[laugh]「頑固ね」'],['「難しい話はわからん」',0,'砂の女神「……そう」']] },
];
TALKS.forest = [
  { q:'森の女神「森の木を、むやみに切ってはいないでしょうね？」', a:[['「必要な分だけだ」',2,'森の女神[smile]「ええ。それでいいの」'],['「木より鉄を使う」',1,'森の女神「……ならいいわ」'],['「薪はよく使う」',0,'森の女神[angry]「…………」']] },
  { q:'森の女神「あなたの炉の火、ここまで匂ってくる気がするわ」', a:[['「いい匂いだろう」',1,'森の女神[laugh]「ええ、嫌いじゃない」'],['「森を焼いたりはしない」',2,'森の女神[smile]「わかっているわ。あなたは」'],['「鼻がいいな」',0,'森の女神「女神ですもの」']] },
];
TALKS.druid = [
  { q:'花の女神「お花、好き？」', a:[['「工房に一輪あると落ち着く」',2,'花の女神[laugh]「ふふ、じゃあ、これをあげる」'],['「食べられるなら」',0,'花の女神「……食べないで」'],['「見る分には」',1,'花の女神[smile]「それで十分よ」']] },
  { q:'花の女神「ここまで登ってきたのね。……疲れてない？」', a:[['「少しな。でも楽しい」',2,'花の女神[smile]「楽しいなら、きっと大丈夫」'],['「全然」',1,'花の女神「無理はだめよ」'],['「腹が減った」',0,'花の女神[laugh]「あはは」']] },
];
TALKS.ice = [
  { q:'氷の女神「……寒くはないの？」', a:[['「炉の前より、ずっと涼しい」',2,'氷の女神[smile]「……変な人」'],['「寒い」',1,'氷の女神「……そう。少しだけ、和らげてあげる」'],['「別に」',0,'氷の女神「…………」']] },
  { q:'氷の女神「氷は溶ける。でも、また凍る。……人の心も、同じかしら」', a:[['「打ち直せば、刃もまた鋭くなる」',2,'氷の女神[laugh]「……ふふ。鍛冶屋らしい答え」'],['「難しいな」',1,'氷の女神「……ええ」'],['「溶けたら水だ」',0,'氷の女神「…………そうね」']] },
];
TALKS.mountain = [
  { q:'山の女神「よく登ってきたな、人の子。息は切れていないか？」', a:[['「まだまだ」',1,'山の女神[laugh]「ふふ、頼もしい」'],['「少し休ませてくれ」',2,'山の女神[smile]「正直でよろしい。山では見栄は命取りだ」'],['「余計なお世話だ」',0,'山の女神「……そうか」']] },
  { q:'山の女神「この杖の結晶は、山の奥で百年かけて育ったものだ」', a:[['「百年か……いい仕事だ」',2,'山の女神[laugh]「職人らしい褒め方だな」'],['「売ったら高そうだ」',0,'山の女神[angry]「…………」'],['「重くないのか」',1,'山の女神[smile]「慣れればな」']] },
];
const GOD_HEAL_NEED = 4;   // この親密度から、女神に回復してもらう選択肢が出る
const GOD_RARE_NEED = 6;   // この親密度から、レアな素材をくれる
const RARE_RAW = ['ore_iron', 'iron_shell', 'golem_core'];
const AFF_PERKS = {
  jenny: 'ジェニーに売る武器・防具の値段が+25%',
  elly:  '治療費と祈りが半額',
  ria:   '戦利品の持ち込みの報酬が+15%',
  fuuka: 'フウカが一緒に戦う回数が20回になり、40階より上にも現れる',
  jin:   'ジンが技を教えてくれる（技は今後）',
  desert: '砂の女神がめずらしい素材をくれて、回復もしてくれる', forest: '森の女神がめずらしい素材をくれて、回復もしてくれる',
  druid: '花の女神がめずらしい素材をくれて、回復もしてくれる', mountain: '山の女神がめずらしい素材をくれて、回復もしてくれる', ice: '氷の女神がめずらしい素材をくれて、回復もしてくれる',
};
// 塔でたまに会う人（階の範囲）
const TOWER_NPCS = {
  dan:      { name:'ダン',     from:1,  to:45 },
  fuuka:    { name:'フウカ',   from:5,  to:40, battles:15 },
  gurugamo: { name:'グルガモ', from:30, to:70, battles:10 },
  gaban:    { name:'ギャバン', from:60, to:80 },
  // 属性の階にランダムに現れる女神たち（戦利品をくれる。親密度が上がるとレアな素材、回復も選べる）
  // 2026-11-23: エリアを並べ直して、女神4人が塔を2周するように（森→砂→花→氷 を2回）
  forest:   { name:'森の女神', ranges:[[11,20],[51,60]], god:true },
  desert:   { name:'砂の女神', ranges:[[21,30],[61,70]], god:true },
  mountain: { name:'山の女神', ranges:[[31,40],[71,80]], god:true },
  // 花の女神（druid）は今は出番なし。画像と会話は残してある
  ice:      { name:'氷の女神', ranges:[[41,50],[81,90]], god:true },
};

// ---------- ツール（2026-11-23 決定） ----------
// 武器・防具とは別に、地形を変えるツールを1つ付けられる。使うたびに耐久が減る（工房で直す）
// どのツールでもどの壁も掘れるが、エリア（属性）との相性で掘る回数ととれる量が変わる
// 相性: 3=◎（2回で掘れて多めにとれる） 2=◯（3回） 1=△（5回で少なめ）
const TOOL_NAMES = { pick:'ツルハシ', axe:'木こりの斧', shovel:'シャベル' };
const AREAS = [ // 階 → エリア（2026-11-23 並べ直し。女神が10階ごとに順番に出る）
  [1,'stone','石のダンジョン'], [11,'forest','森'], [21,'desert','砂漠'], [31,'mountain','山'], [41,'snow','雪原'],
  [51,'jungle','ジャングル'], [61,'ruins','砂の遺跡'], [71,'canyon','岩山・峡谷'], [81,'glacier','氷河・雲の上'], [91,'castle','城'],
];
const TOOL_EFF = {
  pick:   { stone:3, forest:2, desert:1, mountain:3, snow:3, jungle:2, ruins:2, canyon:3, glacier:3, castle:2 },
  axe:    { stone:1, forest:3, desert:1, mountain:2, snow:1, jungle:3, ruins:1, canyon:1, glacier:1, castle:1 },
  shovel: { stone:1, forest:2, desert:3, mountain:1, snow:2, jungle:1, ruins:3, canyon:2, glacier:2, castle:1 },
};
// 女神の像（塔の入口）: 女神に会ったエリアの最初の階へワープできる
const GOD_OF_AREA = { 11:'forest', 21:'desert', 31:'mountain', 41:'ice', 51:'forest', 61:'desert', 71:'mountain', 81:'ice' };
const DIG_HITS = { 3:2, 2:3, 1:5 };
// 掘るととれる物（エリアごと。[戦利品, 重み]）。鉱脈の絵が入ったら、鉱脈の壁は多めに出す
const DIG_YIELD = {
  stone:  [['rubble',45], ['ore_copper',30], ['ore_iron',12], ['dim_stone',8], ['cursed_bone',5]],
  desert: [['sand_find',50], ['cursed_bone',25], ['ore_copper',25]],
  forest: [['log',60], ['old_wood',20], ['spore',10], ['ore_copper',10]],
  // 2026-11-24: エリアごとに、そのエリアらしい物が出る
  mountain:[['rubble',30], ['ore_copper',30], ['ore_iron',25], ['rock_core',10], ['dim_stone',5]],
  snow:    [['ice_shard',35], ['rubble',35], ['ore_iron',15], ['dim_stone',15]],
  jungle:  [['log',50], ['old_wood',30], ['spore',10], ['ore_copper',10]],
  ruins:   [['sand_find',40], ['cursed_bone',25], ['cursed_gold',15], ['raw_gem',10], ['ore_copper',10]],
  canyon:  [['rubble',30], ['ore_iron',30], ['ember_stone',15], ['rock_core',15], ['dim_stone',10]],
  glacier: [['ice_shard',45], ['dim_stone',25], ['rubble',15], ['star_dust',15]],
  castle:  [['rubble',50], ['ore_iron',25], ['dark_steel',15], ['cursed_gold',10]],
};
const NO_DIG_FLOORS = [10, 86, 100];  // 節目の階の壁は「塔の骨」で掘れない

// ---------- 調べる（塔の装飾）（2026-11-23） ----------
// 床の小物の名前と、調べたときに出る物のグループ
const PROP_INFO = {
  f_barrels:['古い樽','box'], f_crates:['木箱','box'], f_sacks:['麻袋','box'], f_pots:['壺','box'], f_scatter:['散らばった荷物','box'],
  f_rubble:['がれき','rock'], t_rock1:['岩','rock'], t_minecart:['トロッコ','rock'], t_pick_rock:['ツルハシの刺さった岩','rock'], t_crystal:['結晶','crystal'], u_cairn:['積み石','rock'], u_stalag:['石筍','rock'],
  f_skel_sit:['白骨化した戦士','bone'], f_skel_prone:['倒れた戦士の骨','bone'], f_skel_shield:['盾を抱えた骨','bone'], t_bones:['大きな骨','bone'], t_bullskull:['獣の頭骨','bone'],
  f_skulls:['頭骨の山','bone'], f_ribcage:['あばら骨','bone'], f_sword_grave:['剣の墓','bone'],
  f_feather:['飾りのついた羽根','feather'], f_mimic:['ミミック','mimic'], f_mimic_gold:['豪華なミミック','mimic'],
  t_planks:['壊れた板','wood'], t_wagon:['壊れた荷車','wood'], u_mushroom:['キノコ','mushroom'],
  f_altar:['祭壇','altar'], f_brazier_skull:['頭骨の台','altar'], f_rune_stone:['紋様の石','altar'],
  // ほかのエリアの小物（2026-11-24）。view は見るだけ（何も取れない）
  u_boulder:['大きな岩','rock'], t_rock2:['岩','rock'], t_rock3:['苔むした岩','rock'], u_mossrock:['苔むした岩','rock'], t_slab:['割れた岩','rock'], t_ore_rock:['鉱石まじりの岩','rock'],
  t_spire1:['尖った岩','view'], t_spire2:['そびえる岩','view'], u_spires:['岩の柱','view'],
  u_grass:['草むら','view'], u_flowers:['白い花','view'], t_bush:['茂み','view'], t_lavender:['紫の花','view'], t_bramble:['いばら','view'], t_wheat:['枯れ草','view'], u_berries:['木の実の茂み','berry'],
  u_mossarch:['苔むした岩のアーチ','view'], t_arch:['岩のアーチ','view'], t_ruinarch:['柱のアーチ','view'], t_colonnade:['並んだ柱','view'], t_ruinwall:['崩れた壁','view'], t_ruinwindow:['窓の残った壁','view'], u_wall:['崩れた壁','rock'],
  t_pillars:['折れた柱','rock'], u_pillar:['倒れた柱','rock'], t_rune1:['渦巻きの石','altar'], t_rune2:['渦巻きの石柱','altar'], t_head:['石像の頭','altar'],
  t_deadtree:['枯れ木','wood'], t_deadroots:['枯れた根','wood'], t_log:['苔むした丸太','wood'],
  u_crystal:['氷の結晶','crystal'],
};
// 見るだけの小物の、ひとこと
const PROP_LOOK = {
  t_spire1:'鋭くとがった岩が空を向いている。', t_spire2:'見上げるほどの岩だ。登れそうにはない。', u_spires:'風に削られた岩の柱が並んでいる。',
  u_grass:'背の高い草が揺れている。', u_flowers:'小さな白い花が咲いている。こんな所にも。', t_bush:'葉の茂った低い木だ。', t_lavender:'紫の花から、いい香りがする。',
  t_bramble:'とげだらけのいばらだ。手を出すのはやめておこう。', t_wheat:'乾いた草が、かさかさと鳴った。',
  u_mossarch:'苔に覆われた岩のアーチ。昔からここにあるようだ。', t_arch:'岩が自然にアーチを作っている。', t_ruinarch:'柱だけが残った門だ。',
  t_colonnade:'柱が並んでいる。昔はここに建物があったのだろう。', t_ruinwall:'崩れかけた石壁だ。', t_ruinwindow:'窓の形だけが残った壁だ。向こうには何もない。',
};
// グループごとの出る物: [種類, 中身, 重み]。種類 raw=戦利品 item=道具 gold=お金 none=何もない
const SEARCH_LOOT = {
  box:     [['item','herb',25], ['gold',12,25], ['raw','rat_hide',15], ['raw','rubble',10], ['item','bandage',6], ['item','wing',4], ['none',0,25]],
  rock:    [['raw','rubble',40], ['raw','ore_copper',25], ['raw','ore_iron',10], ['raw','dim_stone',8], ['none',0,25]],
  crystal: [['raw','dim_stone',60], ['raw','raw_gem',15], ['none',0,25]],
  bone:    [['raw','cursed_bone',45], ['gold',15,15], ['item','herb',10], ['raw','ore_iron',5], ['none',0,25]],
  wood:    [['raw','log',55], ['raw','ore_copper',10], ['none',0,35]],
  altar:   [['raw','dim_stone',35], ['gold',30,20], ['raw','raw_gem',10], ['none',0,35]],
};
