# 馬の試作08 — 停止旋回・走行中の転倒・落馬

試作07の歩法ボタン、駈歩27km/h・消費なし、馬車6.6／14km/hを保持し、停止中のその場旋回と、転倒・落馬を追加しました。新しい外部ライブラリ・モデル・画像は使っていません。正式ワールド、main、battle.js、旧HTML05〜07、モデル資産は変更していません。

## 操作

- 馬に乗って停止し、スティック左右：足踏みしながらその場旋回。スティックを離すと止まります。歩法は上がりません。
- 通常画面の上側に、後ろ脚立ち／転倒／倒れたまま／左90°／右90°／復帰の6ボタン。UI情報を隠しても残ります。
- 走行中に転倒：馬は勢いを残して減速しながら崩れ、倒れたまま止まります。騎手は鞍から進行方向へ投げ出されます。
- 騎手は着地後、短く倒れてから自動で起き上がり、徒歩へ戻ります。馬は「復帰」まで倒れたままです。再乗馬には徒歩で近づいてください。
- 飛行・起き上がり中は乗馬・歩行・加速を受け付けません。「復帰」を押しても飛行中の騎手が鞍へ瞬間移動することはありません。
- 位置リセットは落馬状態も解除します。馬車のもう1頭や乗客が残らないよう、描画インスタンスも整理します。

後ろ脚立ちと90°旋回は停止中だけ。緊急転倒は走行中でも選べます。馬車は、まず切り離して転倒を試してください。車体・2頭の連結を保ったままの事故や御者・乗客の落下は今回扱いません。馬車のその場旋回も行わず、前後に移動して旋回します。

## 実装と受け渡し

`prototypes/horse-extras/stunts.mjs` が状態更新を担当します。これまでの骨格テクスチャ、fall/dead/turn_l/turn_rクリップと馬・人型モデルを再利用し、新しい焼き込みデータは追加していません。

- `stepStationaryTurn(horse, steer, dt, {cart})`：位置を変えずヨーを更新し、turnClip/turnPhaseを返します。位相を回転角に結び、足踏みを既存のturn_l/rで描きます。
- `startHorseFall(horse)` / `stepHorseFall(state, dt, terrain)`：開始時の符号付き速度を保持。速度を指数減衰させ、1.5秒でdeadへ移行。小刻みな移動で地形・障害物を確認します。
- `launchRider({x,y,z,yaw,speed,scale})`：現在の鞍のワールド位置から、移動速度＋投げ出す初速・上向き速度を与えます。
- `stepRiderFlight(state, dt, terrain)`：重力9.81m/s²、着地、地上での減衰、0.75秒の倒れ姿勢と0.6秒の起き上がりを更新します。
- `poseThrownRider(THREE,rider,state,terrain,bounds)`：既存の円柱人型の手足・体の姿勢を適用。再利用するBox3で描画境界を確認し、地面との隙間を約2.5cmに保ちます。

terrainは既存と同じheight(x,z)とblocked(x,z,radius)。純粋な移動計算は最大1/120秒・横方向約12cm以下の刻みを使います。ホストの長い検証用update(dt)も分割し、通常の描画と同じ刻みで進めます。描画・物理を大きな1回の移動で飛ばす方法ではありません。

落馬は1人の試作プレイヤーに適用します。5000人の落馬処理を実装したものではありません。戦闘への統合側は、馬の転倒イベントで上記の関数を使い、見える騎手の数を管理する必要があります。既存のspeed/state/stateTの描画APIはそのままです。

これは簡易運動と手続き的なポーズです。関節ごとの物理ラグドール、落下ダメージ、馬車事故、全身の衝突形状、地面の傾斜に合わせた全関節の接地は対象外。障害物判定は既存フィールドのblockedに基づく保守的な判定です。

## 再生成・確認

```sh
node tools/build-horse-extras-prototype.mjs
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
node tests/horse-v8.browser.cjs
mkdir -p validation/horse-v8/regressions
HORSE_HTML=exports/World-of-History-horse-prototype-v8.html HORSE_REPORT_DIR=/validation/horse-v8/regressions node tests/horse-battle-extras.browser.cjs
```

出力は `exports/World-of-History-horse-prototype-v8.html`。実行時の外部通信は不要です。画像・検証値は `validation/horse-v8/`。新機能の確認と、旧GPU・資産回帰を別のJSONに保存します。

確認環境はChromium/SwiftShader。iPhone/iPadの実機速度は未測定です。資産の構造は [試作06](README.md)、歩法と速度の仕様は [試作07](README-v7.md) を参照してください。
