# 試作10 — 勢いのある走行転倒と動作点検

## 変更

走行中の馬自身が、前脚の支えを失って崩れ落ちる動きへ変更しました。転倒直前の脚の姿勢を引き継ぎ、前脚が折れる→胸が前へ沈む→後脚と胴体が落ちる→地面を滑って横倒しで止まる、の順で進みます。高速ほど沈み込みが大きくなります。

2.5m/s以上の走行転倒で新しい姿勢を使います。停止・低速の転倒、通常の5歩法、後退、後ろ脚立ち、旋回、ボタン・スティック操作、馬車と騎手の控えめな落馬を維持しています。

前半は勢いを残し、胸の接地後に強く減速します。18m/sの試験例では0.12秒で約16m/s、0.28秒で約13m/s、その後に地面の抵抗で減速し、1.5秒で停止します。単に馬を横へ回すだけの転倒ではありません。

## 実装

新規ライブラリや外部モデルは使用していません。`running-fall.mjs` の手続き的な姿勢を、操作する主役の既存ライブ骨格へ適用します。

- 開始姿勢は転倒直前の240要素の骨格行列から取得。歩法・位相・速度も記録します。
- 0〜0.28秒：前脚の折れと胸の前傾・沈み込み。
- 0.28〜0.6秒：後脚が折れ、腹と胴体が低くなる。
- 0.6〜1.5秒：倒れる側へ体重が移り、既存dead姿勢へ滑らかに接続。
- 脚は既存20骨の長さを使う二節IK、回転は正規化クォータニオンの補間。モデル全頂点の変形境界で接地補正します。
- 最後の既存deadへの接続は、既存ポーズとの骨配置の差を補間し、終了フレームの飛びを抑えています。
- 移動は従来の小刻みな障害物判定を継続し、初期・支持喪失中・接地後で抵抗を変えます。

`sampleRunningFallPose(elapsed,{speed,mode,phase,sourceMatrices},ground)` が新しい姿勢を返します。`sampleStuntHorsePose(state,ground)` を `createBattleHorseRenderer` の第6引数のposeSamplerへ渡します。

主役の `action.clip='running_fall'` にelapsed、sourceSpeed、sourceMode、sourcePhase、sourceMatricesを渡す経路です。大量描画用のstate/stateTを新しい値へ拡張したものではありません。5000頭は既存の焼き込みクリップを継続利用します。戦場への統合時に新しい走行転倒を多数へ適用する場合は、近距離個体の処理数と骨格配信を別途設計する必要があります。

GLB・horse.render.json・骨格テクスチャは変更していません。新しい走行転倒は速度・直前姿勢に依存するため、今回は固定GLBクリップへ追加せず、主役の実行時の姿勢として実装しました。正式ワールド、main、battle.js、旧HTML05〜09も変更していません。

## 他の動作の調査

| 対象 | 確認したこと | 結果 |
|---|---|---|
| 停止・常歩・速歩・駈歩・襲歩・後退 | 各4位相の実描画、脚の変化、有限な行列、騎手の位置 | 脚の動きと騎手の中央位置を確認 |
| 後ろ脚立ち | 上がる途中・頂点・戻る途中・終了 | 鞍への追従とidleへの復帰を確認 |
| 左右旋回 | その場旋回と左右90°の終了 | 回転完了、通常操作への復帰を確認 |
| 騎手の落下・復帰 | 同じ側への落下、接地、再乗馬 | 操作不能や残る横ずれは再現せず |
| 馬車 | 1頭／2頭、14km/h、御者・乗客、幌・荷物・車輪 | 既存動作の回帰確認が通過 |
| 騎手の起き上がり | 地面との境界と徒歩への接続 | 接続を確認。全身の簡易姿勢補間を継続 |

通常歩法の造形・アニメーションは既存のものです。今回の点検は全関節の現実的な動きを保証するものではありません。起き上がりの自然さは、さらに詰められる箇所として残っています。

画像一覧：`validation/horse-v10/collapse-review.png`、`gaits-review.png`、`rear-review.png`。変形の途中も確認できるよう撮影しています。

## 再生成と検証

```sh
node tools/build-horse-extras-prototype.mjs
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
node tests/horse-v10.browser.cjs
mkdir -p validation/horse-v10/input-regressions validation/horse-v10/regressions
HORSE_HTML=exports/World-of-History-horse-prototype-v10.html HORSE_REPORT_DIR=/validation/horse-v10/input-regressions node tests/horse-v9.browser.cjs
HORSE_HTML=exports/World-of-History-horse-prototype-v10.html HORSE_REPORT_DIR=/validation/horse-v10/regressions node tests/horse-battle-extras.browser.cjs
```

出力は `exports/World-of-History-horse-prototype-v10.html`。単体148件、新しい転倒と動作点検11項目、09操作14項目、共有回帰25項目を使用します。単に画面の1枚を見て完了とせず、途中姿勢・終了姿勢・操作復帰を確認します。

検証環境はChromium/SwiftShader。iPhone/iPad実機の速度は未測定です。馬車事故・全身ラグドールは対象外です。
