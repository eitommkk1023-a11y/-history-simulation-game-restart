# 本体統合版 v17

作業ブランチの自然地理生成器.htmlを本体統合版へ変更する。mainの元ファイルは変更せず、変更前の同一blobをbaseline/自然地理生成器.htmlにも保存する。

元HTMLの生成器・保存/ロード・時間・地質/火山操作・各表示モードを残したまま、共有するWebGLRendererへ三人称の描画を接続。俯瞰は元のscene/cameraと元の入力処理を実際に使用し、v16のコピーした広域描画は統合版では使わない。
三人称と本体のworldは同じ参照。初期画面はテスト地形ではなく本体の通常起動（既存オートセーブ確認または世界生成）。単一canvas。

通常はUIを隠し、スティック・ダッシュ・ジャンプ・しゃがみ・UI再表示のみ表示。UIを表示すると元のtoolbar等を利用できる。元の「表示：植生」等の表示切替は維持し、その隣に「世界を俯瞰／三人称に戻る」を追加。俯瞰中は人物を止め、アクションを隠す。
保存にはオプションのplayerフィールド（世界座標・カメラyaw）を追加。元のformat/genVersionは変更せず、既存セーブもplayerなしでロード可能。元の保存コードのほかの項目は維持。ユーザーの端末にある別オリジンのIndexedDBをこの環境から移動したり検証したりすることはできない。書き出しJSONは元のメニューから読み込む。
元の地形更新通知を受け、変更が落ち着いてから三人称チャンクを再構築する。実験操作は俯瞰へ切替えて行うのが見やすい。

## ビルド
node tools/build-integrated-world.mjs /tmp/geo-three-r128.min.js
baselineから本体ソースHTML（モジュール参照）とexports/World-of-History-integrated.html（Three.jsと三人称を内蔵する単一HTML）を生成する。
src/integration/third-person.mjsが統合用三人称の本体。previews/terrain-chunks.*は過去の検証用であり統合版の入口ではない。

## 検証
Node54件。integrated-world.browser.cjsで、本体からの実世界生成、1canvas、同一world、通常UI非表示、元のUI表示、俯瞰中の人物停止、三人称復帰、元のsaveTo/serializeState/loadState、人物位置の復元を確認。三人称と元の広域画面を目視確認。
ブラウザはChromium横844×390。Safari実機・ユーザーの既存保存データそのもの・全火山イベントの長期動作は未確認。
