#!/usr/bin/env python3
# tr/<file>.keys.json と tr/<file>.en.txt（番号|英語）を合わせて js/en.js を作る
# tr/extra.txt は「日本語|英語」を直接書く（実行時にしか出ない文など）
import json, re, os, sys, glob
here = os.path.dirname(os.path.abspath(__file__))
out = {}
TAG = re.compile(r'^([^\[「\n]+)\[\w+\]「')
def put(k, v):
    if v is None: return
    v = v.replace('\\n', '\n')
    k2 = k.replace('{name}', '{9}'); v2 = v.replace('{name}', '{9}')
    out[k2] = v2
    # 表情タグ（ジェニー[laugh]「…」）は、画面に出るときは消えている
    if TAG.search(k2):
        out[TAG.sub(r'\1「', k2)] = TAG.sub(r'\1「', v2)
    # HTML の文は、タグで分けて、文字の部分ごとにも引けるように
    if '<' in k2 and '<' in v2:
        a = [x.strip() for x in re.split(r'<[^>]*>', k2)]; b = [x.strip() for x in re.split(r'<[^>]*>', v2)]
        if len(a) == len(b):
            for x, y in zip(a, b):
                if x and x != y and x not in out: put(x, y)
    # 複数行の文は、1行ずつでも引けるように
    if '\n' in k2 and k2.count('\n') == v2.count('\n'):
        for a, b in zip(k2.split('\n'), v2.split('\n')):
            if a.strip() and a not in out: put(a, b)
missing = []
for kf in sorted(glob.glob(os.path.join(here, 'tr', '*.keys.json'))):
    base = kf[:-len('.keys.json')]
    keys = json.load(open(kf, encoding='utf8'))
    for ef in sorted(glob.glob(base + '.en*.txt')):
        for line in open(ef, encoding='utf8'):
            line = line.rstrip('\n')
            if not line or line.startswith('#'): continue
            i, _, v = line.partition('|')
            try: i = int(i)
            except: continue
            if i >= len(keys): print('bad index', ef, i); continue
            put(keys[i], v)
ex = os.path.join(here, 'tr', 'extra.txt')
if os.path.exists(ex):
    for line in open(ex, encoding='utf8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#') or '|' not in line: continue
        k, _, v = line.partition('|'); put(k.replace('\\n', '\n'), v)
dst = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/tower-smith/js/en.js'
with open(dst, 'w', encoding='utf8') as f:
    f.write('/* 英語版の辞書（tools/build_en.py で作る。手で直さない） */\n')
    f.write('const EN_DICT = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'entries')
