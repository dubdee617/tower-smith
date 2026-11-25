/* 英語版（2026-11-25）
   しくみ: ゲームの中身（データ・セーブ）は日本語のまま。画面に出る瞬間に、日本語の文を英語に置きかえる。
   - EN_DICT（js/en.js）: 日本語の文 → 英語。{0}{1} は差しこみ（数字や名前）
   - 画面の文字は MutationObserver で見張って置きかえる。台詞の欄（drawLog）とキャンバスの文字は tr() を直接呼ぶ
   - 言語は設定の OPTS.lang（0=日本語 1=English）。はじめは端末の言語で決める */
const I18N = (() => {
  const JP = /[぀-ヿ㐀-鿿！-｠　-〿]/;
  let on = false;
  try { const o = JSON.parse(localStorage.getItem('tower_opts') || '{}'); on = o.lang !== undefined ? o.lang === 1 : !/^ja/i.test(navigator.language || 'ja'); } catch (e) {}
  const cache = new Map(), miss = new Set();
  let D = null, PATS = null, FRAG = null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function build() {
    D = (typeof EN_DICT !== 'undefined') ? EN_DICT : {};
    PATS = [];
    const frags = [];
    for (const k in D) {
      if (/\{\d\}/.test(k)) {
        const stat = k.replace(/\{\d\}/g, '');
        if (!JP.test(stat) || /[<>]/.test(k) || (k.match(/\{\d\}/g) || []).length > 5) continue;
        const parts = k.split(/\{\d\}/).filter(Boolean);
        const order = []; const src = '^' + k.split(/(\{\d\})/).map(p => { const m = /^\{(\d)\}$/.exec(p); if (m) { order.push(+m[1]); return '([\\s\\S]*?)'; } return esc(p); }).join('') + '$';
        PATS.push({ re: new RegExp(src), order, en: D[k], w: stat.length, strict: stat.length <= 2, parts });
      } else if (JP.test(k) && !(/^[\u3040-\u309f\u3000-\u303f]+$/.test(k) && k.length <= 2) && D[k] !== k) frags.push(k);
    }
    PATS.sort((a, b) => b.w - a.w);
    frags.sort((a, b) => b.length - a.length);
    FRAG = frags.length ? new RegExp(frags.map(esc).join('|'), 'g') : null;
  }
  // 「」はそのまま残す（台詞の欄が名札を見つけるのに使う）。最後に quote() で "" にする
  function tr0(s) {
    if (Object.prototype.hasOwnProperty.call(D, s)) return D[s];
    const ws = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    if ((ws[1] || ws[3]) && ws[2]) return ws[1] + tr(ws[2], 1) + ws[3];
    if (s.includes('\n')) return s.split('\n').map(x => tr(x, 1)).join('\n');
    let q = /^([^「」\n]{1,16}?)(\[\w+\])?「([\s\S]*)」([^「」]*)$/.exec(s);
    if (q && !JP.test(q[4] || '')) return tr(q[1], 1) + (q[2] || '') + '「' + tr(q[3], 1) + '」' + (q[4] || '');
    q = /^「([\s\S]*)」$/.exec(s); if (q) return '「' + tr(q[1], 1) + '」';
    q = /^（([\s\S]*)）$/.exec(s); if (q) return '(' + tr(q[1], 1) + ')';
    for (const p of PATS) {
      if (!p.parts.every(x => s.includes(x))) continue;
      const m = p.re.exec(s);
      if (m && p.strict && m.slice(1).some(x => JP.test(x) && !Object.prototype.hasOwnProperty.call(D, x))) continue;
      if (m) return p.en.replace(/\{(\d)\}/g, (_, i) => { const j = p.order.indexOf(+i); return j < 0 ? '' : tr(m[j + 1], 1); });
    }
    // 文に分けて、ひとつずつ
    const sent = s.match(/[^。！？!?]+[。！？!?」]*|[。！？!?」]+/g);
    if (sent && sent.length > 1) return sent.map(x => tr(x, 1)).join(' ').replace(/\s+([,.!?])/g, '$1');
    // 最後の手: 知っている言葉を長い順に置きかえる
    if (FRAG) return s.replace(FRAG, x => { const e = D[x]; return e; });
    return s;
  }
  const quote = s => s.replace(/([^\s\n(「『"'])「/g, '$1: 「').replace(/「/g, '"').replace(/」/g, '"').replace(/『/g, '\'').replace(/』/g, '\'')
    .replace(/、/g, ', ').replace(/。/g, '. ').replace(/！/g, '!').replace(/？/g, '?').replace(/…/g, '...').replace(/　/g, ' ')
    .replace(/（/g, '(').replace(/）/g, ')').replace(/：/g, ': ').replace(/／/g, '/').replace(/〜/g, '-').replace(/ +\n/g, '\n').replace(/  +/g, ' ');
  function tr(s, keepQ) {
    if (!on || typeof s !== 'string' || !JP.test(s)) return s;
    if (!D) build();
    const key = keepQ ? '\u0001' + s : s;
    let r = cache.get(key); if (r !== undefined) return r;
    r = tr0(s);
    if (typeof r !== 'string') r = s;
    if (!keepQ) r = quote(r);
    if (JP.test(r.replace(/[「」『』、。！？…　（）：／〜]/g, ''))) miss.add(s);
    cache.set(key, r); return r;
  }
  // 画面の文字の見張り
  const ORIG = new WeakMap();
  function doText(n) {
    const v = n.data; if (!JP.test(v)) return;
    const p = n.parentNode; if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || (p.closest && p.closest('[translate="no"]')))) return;
    ORIG.set(n, v); const e = tr(v); if (e !== v) n.data = e;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function doEl(el) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && JP.test(v)) { const e = tr(v); if (e === v) continue; if (!el.__ja) el.__ja = {}; el.__ja[a] = v; el.setAttribute(a, e); } }
  }
  function walkAll(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  let obs = null;
  function watch() {
    if (obs || !document.body) return;
    obs = new MutationObserver(list => {
      if (!on) return;
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(walkAll);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function restore(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) {
      if (n.nodeType === 3) { const o = ORIG.get(n); if (o !== undefined) n.data = o; }
      else if (n.__ja) { for (const a in n.__ja) n.setAttribute(a, n.__ja[a]); n.__ja = null; }
    }
  }
  function setLang(en) {
    on = !!en; document.documentElement.lang = on ? 'en' : 'ja';
    document.documentElement.classList.toggle('en', on);
    if (on) walkAll(document.body); else restore(document.body);
  }
  function start() { document.documentElement.lang = on ? 'en' : 'ja'; document.documentElement.classList.toggle('en', on); watch(); if (on) walkAll(document.body); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { tr, quote, setLang, get on() { return on; }, miss, cache, rebuild: () => { D = null; cache.clear(); miss.clear(); } };
})();
const tr = I18N.tr;
