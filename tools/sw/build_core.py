# sw.js の CORE（最初に保存するファイルの一覧）に、ファイルごとの指紋（md5 の頭8文字）を付け直す。
# 版を上げたとき、指紋が変わったファイルだけを取り直す（全部を取り直すと GitHub Pages の回数制限にかかる）。
# 使い方: python3 tools/sw/build_core.py   （ファイルを足した・変えたあと、反映の前に毎回）
import re, json, hashlib, os, sys
p = 'sw.js'; s = open(p, encoding='utf-8').read()
m = re.search(r'const CORE = (\[.*?\]|\{.*?\});', s, re.S)
core = json.loads(m.group(1)); urls = list(core) if isinstance(core, dict) else core
out, miss = {}, []
for u in urls:
    f = 'index.html' if u == './' else u[2:] if u.startswith('./') else u
    if not os.path.exists(f): miss.append(u); continue
    out[u] = hashlib.md5(open(f, 'rb').read()).hexdigest()[:8]
s = s[:m.start(1)] + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + s[m.end(1):]
open(p, 'w', encoding='utf-8').write(s)
print(len(out), 'files', ('missing: ' + ', '.join(miss)) if miss else '')
