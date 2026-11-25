# 英語版の辞書（2026-11-25）

ゲームの中身は日本語のまま。画面に出るときに js/i18n.js が js/en.js の辞書で英語に置きかえる。

- tr/<ファイル>.keys.json … extract.js で js/*.js から抜き出した日本語の文（番号順）
- tr/<ファイル>.en*.txt … 「番号|英語」。{0}{1} は差しこみ、{name} は主人公の名前、{f}{b}{k} は階・主の階・倒した数
- tr/extra.txt … 「日本語|英語」を直接書く。新しく足したセリフはここに足すのがいちばん楽
- 作り直し: `python3 tools/i18n/build_en.py js/en.js`
- 抜けの確かめ: shot.js を index.html に差しこんでヘッドレスで開き、`I18N.miss`（訳せなかった文）を見る（pp.js）

注意: keys.json の番号は抜き出したときのもの。js を直したあとに extract.js をやり直すと番号がずれるので、
新しい文は extra.txt に足す。
