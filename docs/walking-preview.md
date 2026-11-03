# 歩行プレビュー v3

Safariで単体HTMLを開いて利用する。左スティックで移動、右側をドラッグして見回す。ダッシュは押している間有効。
PCではWASD/矢印、Shift、画面ドラッグ。設定内の「周辺を俯瞰」で同じ地形を見下ろせる。
設定は見出しをタップして折りたたむ。ChatGPT側の入力バーはこのHTMLから消せない。

現在の対象は9チャンクの地形上の歩行。端・急斜面・崖で停止する。全世界ストリーミング、LOD、ジャンプ、建物の衝突、歩行アニメーションは未実装。
半径0.25mの周辺点で足元を検査する簡易接地方式で、完全な人体カプセル衝突ではない。カメラは地形への線分交差で短縮し終点の高さを補正する。狭い隙間に対する球体スイープは後段。

既存世界生成を選ぶと元の3000×3000世界を生成するため、そのメモリ負荷は従来通り。初期表示は軽い固定地形。

## 検証
- Node: 歩行の速度、対角線、ダッシュ、斜面の接地、崖と範囲端、長時間フレームを検証。
- Chromium: 844×390 / 1180×820、WASD、同時タッチ、指離し、blur、視点切替、オフライン起動を確認。
- Safari実機のv3操作感は未確認。ユーザー側ではv2をSafariで開けることが確認済み。

ビルド: `node tools/build-terrain-preview.mjs /tmp/geo-three-r128.min.js`
テスト: `node --test --test-isolation=none tests/*.test.mjs` / `node tests/walking.browser.cjs`
既存回帰: `THREE_R128_PATH=/tmp/geo-three-r128.min.js node tests/terrain-chunks.browser.cjs` / `node tests/offline-landscape.browser.cjs`
