# 小範囲チャンク・接地面の検証（第2段階）

## 内容
- `src/geography/terrain-chunk.mjs`: 64m・32分割が初期値。局所座標の頂点・法線・三角形インデックスと`sampleGround(xM,yM)`を返す。
- `previews/terrain-chunks.html`: 固定テスト地形、または既存生成器の数値Seedから、乾いた地点に9チャンクを表示する。
- 人型は高さ1.7mの目印。地面タップで接地位置を変えられるが、歩行や体全体の衝突は未実装。
- 正本の生成器HTML、交通モジュール、Seed、保存形式、配信中サイトは変更しない。

## 座標と接地
表示用のThree.js BufferGeometryに渡すFloat32頂点を、接地計算もそのまま読む。
`sampleBase`の双線形補間を接地に使うと、非平面の区画で描画三角形から浮くため、`sampleGround`では実際の三角形の重心座標で補間する。
勾配は衝突面の法線から取得。表示用法線は共通の基礎地形から求め、境界の陰影をそろえる。
チャンク原点の標高を差し引いた局所Float32座標を使うため、隣接チャンクの共有辺には丸め誤差がありうる。受け入れ精度は1mm以内。
元地形の標高変更は、既存の描画・接地スナップショットを直接変えない。両方を更新するにはチャンクを再構築する。

## 手元で開く
リポジトリ直下をHTTPで配信し、`previews/terrain-chunks.html`を開く。
例: `python -m http.server 8000`（開発端末上）。このページには別途配信やGitHub Pagesの設定はない。
最初は軽い固定テスト地形。既存世界の生成ボタンは元の3000×3000生成器を実行し、その生成負荷・メモリ消費は残る。
数値Seedのみ受付。Three.js r128の読み込みに通信が必要。

## 検証
`node --test --test-isolation=none tests/*.test.mjs`: 35件成功（既存26件、新規9件）。
ブラウザ検証にはPlaywrightとChromiumが必要。`node tests/terrain-chunks.browser.cjs`で固定地形・既存世界・Raycaster比較・画面切替を確認する。
必要に応じて`CHROMIUM_PATH`でブラウザ、`THREE_R128_PATH`で保存済みr128ライブラリ、`WOH_SCREENSHOT_PATH`で画像出力先を指定できる。
ChromiumでSeed 12345を生成し、9チャンク・36地点の描画面と接地高さを比較。固定地形でも36地点を比較し、両方とも1mm以内。pageerrorは0件。
差分は単独レビュー。iPhone/iPad実機、歩行、カプセル衝突、カメラ衝突、LOD、先読み、噴火との自動連携は未検証・未実装。
