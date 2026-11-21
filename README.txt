塔の鍛冶屋 たたき台（iPhoneオフライン版）

■ 入っているもの
index.html            ゲーム本体（フォント埋め込み済み）
manifest.webmanifest  ホーム画面アプリの設定
sw.js                 オフラインで動かすための仕組み
icon-180/192/512.png  アイコン

■ iPhoneで遊ぶまでの手順（GitHub Pagesを使う場合）
1. github.com で無料アカウントを作る
2. 右上の「+」→「New repository」。名前は tower-smith など。Public を選んで作成
3. 「uploading an existing file」から、このフォルダの6つのファイルを全部アップロードして「Commit changes」
4. リポジトリの「Settings」→「Pages」→ Branch を「main」「/(root)」にして「Save」
5. 1〜2分待つと、https://（ユーザー名）.github.io/tower-smith/ で開けるようになる
6. iPhoneのSafariでそのURLを開く → 共有ボタン →「ホーム画面に追加」
7. ホーム画面のアイコンから一度起動する（この時だけネットが必要）
8. 以後は機内モードでも遊べる

■ 注意
- 無料のGitHub Pagesは公開サイトになります（URLを知っている人は開けます）
- セーブはiPhoneの中に保存されます。ホーム画面アプリを削除すると消えます
- ゲームを更新したときは、sw.js の CACHE の名前（v1→v2）も変えると、iPhone側に新しい版が届きます
