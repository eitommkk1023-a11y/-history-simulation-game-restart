# 試作07：復帰修正・ボタン歩法・速度別の旋回

追加のモデルやライブラリは使用せず、試作06の馬・荷馬車・幌・乗客を継続使用しています。正式ワールド、main、battle.js、既存05/06のHTMLには変更していません。

## 操作

- スティック左右：進行方向の操舵。前後の入力は歩法・減速に使いません。
- 加速：停止→常歩→速歩→駈歩→襲歩、押すたび1段階。
- 減速：1段階下げます。停止ボタンは、現在の速度から制動して止めます。
- 後退：停止中に選択、もう一度押すと停止。スティックを離しても選択した歩法・後退を維持します。
- 馬車：常歩6.6km/hと速歩14km/hの2段階。騎乗と御者席で同じボタンを使います。
- 駈歩：27km/h。常歩・速歩・駈歩ではスタミナを消費せず回復します。襲歩は従来の個体別最高速と消費を維持し、疲労時に駈歩へ下がります。
- PC：R加速、F減速、Space停止、B後退、A/D操舵。徒歩はWASD、E乗降、V視点。

歩法ボタンはpointerdownで処理し、スティック保持中の2本目の指でも反応します。通常のclickとの二重加速を防ぎ、キーボードの自動連打でも段階が上がり続けないようにしています。

## 復帰の不具合

倒れた姿勢では、騎手の腰を鞍の変形位置へ動かしていました。通常の騎乗処理は腰のYだけを更新しており、X/Zが残っていました。旧06のブラウザ再現では約0.94mの横ずれが、復帰・再乗馬後も残ります。

毎フレーム、通常の騎手更新より先に腰のローカル位置と回転を初期化し、そのフレームの必要な姿勢を適用するよう修正しました。復帰・下馬・再乗馬、dead/fall/rearの反復後にX/Z=0になることを確認しています。起き上がりアニメーションの追加ではありません。

## 移動処理の受け渡し

`locomotion.mjs` は今回の操作・速度を担当します。既存 `prototypes/horse/controller.mjs` と `riding-controls.mjs` は試作05の仕様のまま保存し、変更していません。新しいホストは次の関数を使います。

```js
import {freshButtonRide,stepButtonRide,stepHorse07} from './locomotion.mjs';
let input = freshButtonRide();
// commandは実際に押したときだけ指定。毎描画フレーム送る値ではありません。
input = stepButtonRide(input, {
  command:'up', x:stickX, speed:horse.speed, maxGear:towing?2:4
});
horse = stepHorse07(horse, {
  forward:input.gear!==0?1:0, mode:input.mode,
  steer:input.steer, brake:input.brake, cart:towing
}, dt, terrain);
```

入力がないフレームもstepButtonRideへxを渡し、操舵値を更新します。commandはup/down/stop/reverse。yは速度選択に使いません。horseの初期状態・terrainインターフェースは従来と同じです。

旋回半径は、馬が `1.8 / agility + speed² / 3.0`、牽引中が `5.5 / agility + speed² / 1.6`（単位m）。ヨー速度を `abs(speed) / radius` で制限し、高速ほど大回りになります。個体のagilityを残しています。逆走中の操舵は進行方向に応じて反転します。車輪・くびき・乗客の追従処理は継続使用しています。

これは制限付きの運動モデルです。実測馬の完全再現や、馬車の横転・懸架・全輪の厳密接地を実装したものではありません。

## ビルドと検証

今回モデル資産を変更していないため、HTMLのビルドで確認できます。

```sh
node tools/build-horse-extras-prototype.mjs
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
node tests/horse-v7.browser.cjs
mkdir -p validation/horse-v7/regressions
HORSE_HTML=exports/World-of-History-horse-prototype-v7.html HORSE_REPORT_DIR=/validation/horse-v7/regressions node tests/horse-battle-extras.browser.cjs
```

出力は `exports/World-of-History-horse-prototype-v7.html`。実行時は外部通信不要。旧05/06のHTMLを上書きしません。モデルそのものの再生成・公開値は [試作06のREADME](README.md) にあります。

単体135件、新操作ブラウザ16項目と既存機能の回帰25項目が通過。固定比較で旧5歩法のRGBA差分0、追加5動作のGPU/CPUシルエット差分0。5000頭＋馬具1667頭は遠LODで馬関連2バッチでした。667×375、844×390、1180×820でボタンが重ならず、44px以上の操作領域が画面内に収まることを確認しています。

検証環境はChromium/SwiftShader。iPhone/iPad実機の操作感・性能は未測定です。
