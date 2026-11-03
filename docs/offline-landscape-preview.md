# 単体HTMLと横画面対応

`World-of-History.html`はチャンク検証画面を1枚にまとめた配布用ファイル。
Three.js r128、地形モジュール、既存の地理・生態生成Workerを同梱し、起動・世界生成のどちらも外部通信なしで行う。
既存の自然地理生成器.htmlと配信中サイトは変更しない。歩行操作はまだ含まない。

## 再生成
既存と同じ https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js を取得したうえで、次を実行する。

```
node tools/build-terrain-preview.mjs /path/to/three.min.js
```

出力は`exports/World-of-History.html`。出力先を第2引数で指定できる。生成物はGit管理対象外。
ライブラリのSHA256を検査し、Three.jsのライセンス表示を含めて同梱する。
変更後はビルダーで再生成し、HTMLを渡し直す。元の世界生成器のアルゴリズムは変更しない。

## 横画面
iPhone相当の844×390では設定を初期状態で折り畳む。世界生成中は設定欄内で進捗を表示し、表示完了後に折り畳む。
iPad相当の1180×820では設定を表示。両方でボタン・入力を44px以上にし、セーフエリアを考慮する。
縦向きでも起動でき、横向きの案内を出す。OSの画面回転や表示機能を強制変更しない。
画面下の情報バーは廃止。標高・斜面・生成状況は上の設定欄内にまとめ、閉じたときは地形に重ねない。
ChatGPTの「フォローアップの変更を求める」など、親画面の入力バーはこのHTMLから制御しない。

## 検証と制限
`node tests/offline-landscape.browser.cjs`で、通信を遮断したChromiumの2画面サイズを確認する。
単体HTMLの読み込み以外のHTTP要求は0。iPhone相当のサイズでSeed 12345の既存世界生成も確認。
画面回転、横スクロールの有無、設定折り畳み、タップ領域、JavaScriptエラーを検証する。
これは実機Safariの検証ではない。ChatGPTのファイルプレビュー、iOSのファイル表示、学校の管理設定がJavaScriptやWebGLを許可するかは、このHTMLから変更できない。
HTMLを実行できるビューで開く必要がある。iframe内などWorkerが使えない環境では、固定テスト地形だけ表示できる場合がある。
