# Single HTML landscape preview

> Execute inline, single agent. No hosting deployment or main merge.

**Goal:** チャンク検証画面を、通信なしで起動できる1枚のHTMLとして渡す。
**Architecture:** 既存の生成器・Three.js r128・地形モジュール・検証UIを同梱するビルダーを追加。通常の開発用ページも維持する。
**Constraints:** 既存の自然地理生成器.html、Seed、保存、main、配信中サイトを変更しない。
**UI:** iPhone横画面は設定を折り畳み、iPad横画面は設定を表示。タップ領域は44px以上、セーフエリアを確保。端末の向きを強制せず、縦向きでは横向きを案内する。
**Limit:** OSや学校の端末管理、ChatGPTのHTMLプレビュー機能を変更するものではない。歩行操作は今回追加しない。

- [x] 通信を遮断したブラウザで、単体HTMLの起動・世界生成・横画面の表示を確認する検証を先に用意。
- [x] 埋め込み生成器の読み込みと横画面レイアウトを追加。
- [x] ライブラリのハッシュを確認して単体HTMLを作るビルダーを追加。
- [x] Node全テスト、オフラインブラウザ検証、既存HTML不変を確認。
- [x] 作業ブランチへコミットし、ダウンロード用HTMLを渡す。公開しない。
