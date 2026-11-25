// 日本語の文字列を js/*.js から抜き出す。
// 出力: strings.json = [{k, kind, file, line, ctx}]
//  kind: lit（ふつうの文字列）/ pat（テンプレートや + でつないだもの。{0}{1} が差し込み）
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const JP = /[぀-ヿ㐀-鿿！-｠]/;
const dir = process.argv[2], files = process.argv.slice(3);
const out = new Map();
function add(k, kind, file, src, pos) {
  if (!JP.test(k)) return;
  if (out.has(k)) { out.get(k).n++; return; }
  const line = src.slice(0, pos).split('\n').length;
  const ls = src.lastIndexOf('\n', pos) + 1; let le = src.indexOf('\n', pos); if (le < 0) le = src.length;
  let ctx = src.slice(Math.max(ls, pos - 80), Math.min(le, pos + 120));
  out.set(k, { k, kind, file, line, n: 1, ctx });
}
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }); }
  catch (e) { console.error('parse fail', f, e.message); continue; }
  const inChain = new Set();
  // + の連なりを平らにする
  const flat = (n, acc) => {
    if (n.type === 'BinaryExpression' && n.operator === '+') { flat(n.left, acc); flat(n.right, acc); }
    else if (n.type === 'Literal' && typeof n.value === 'string') acc.push({ s: n.value, node: n });
    else if (n.type === 'TemplateLiteral') { n.quasis.forEach((q, i) => { acc.push({ s: q.value.cooked, node: n }); if (i < n.expressions.length) acc.push({ x: true }); }); }
    else acc.push({ x: true });
    return acc;
  };
  walk.fullAncestor(ast, (node, st, anc) => {
    const parent = anc[anc.length - 2];
    if (node.type === 'BinaryExpression' && node.operator === '+' && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')) {
      const parts = flat(node, []);
      if (parts.some(p => p.s !== undefined && JP.test(p.s))) {
        let i = 0, k = '';
        for (const p of parts) k += p.x ? '{' + (i++) + '}' : p.s;
        if (i > 0) add(k, 'pat', f, src, node.start);
        // 部品も単独で入れておく（ほかの所で組み合わされることがある）
        for (const p of parts) if (p.s && JP.test(p.s)) { add(p.s, 'lit', f, src, node.start); }
        walk.full(node, m => inChain.add(m));
      }
    }
  });
  walk.full(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') add(node.value, 'lit', f, src, node.start);
    else if (node.type === 'TemplateLiteral') {
      if (node.expressions.length === 0) add(node.quasis[0].value.cooked, 'lit', f, src, node.start);
      else {
        let k = ''; node.quasis.forEach((q, i) => { k += q.value.cooked; if (i < node.expressions.length) k += '{' + i + '}'; });
        add(k, 'pat', f, src, node.start);
        node.quasis.forEach(q => add(q.value.cooked, 'lit', f, src, node.start));
      }
    }
  });
}
const arr = [...out.values()];
fs.writeFileSync(process.argv[1].replace(/extract\.js$/, 'strings.json'), JSON.stringify(arr, null, 1));
const by = {}; for (const a of arr) by[a.file] = (by[a.file] || 0) + 1;
console.log(arr.length, by, 'pat', arr.filter(a => a.kind === 'pat').length);
