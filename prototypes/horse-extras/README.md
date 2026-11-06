# 馬・荷馬車の戦場用追加分 — 試作06

最新は [試作09：静かな側方落馬・スティック発進](README-v9.md)。操作・速度は [試作07](README-v7.md)。以下は試作06の資産・APIの記録です。共通ビルダーの現在の出力は09です。

依頼元：[docs/codex-horse-request-v2.md](https://github.com/eitommkk1023-a11y/-history-simulation-game-restart/blob/44ce6fca88b98834e9eb1d2ebf5881e10d389d5e/docs/codex-horse-request-v2.md)。保存先は `codex/prototype-horse-v1`。main、battle.js、本作のワールド・セーブには変更していません。

## 保持したもの

試作05の造形、3つのLOD（2132／1064／174三角形）、操作コード、5クリップの生成式は変更していません。既存240行の骨格データとLOD配列を照合し、固定ポーズのGPU描画も旧rendererと比較してRGBA差分0でした。これは固定比較点での結果であり、すべての機種・フレームの画素一致を保証するものではありません。

`exports/World-of-History-horse-prototype-v5.html` はそのまま残しています。追加確認用は `exports/World-of-History-horse-prototype-v6.html`。既存05を上書き生成せず、下記の追加用ビルドを使用してください。

## 追加クリップ

| 名前 | 行オフセット | フレーム数 | 長さ | 再生 |
|---|---:|---:|---:|---|
| idle / walk / trot / canter / gallop | 0 / 48 / 96 / 144 / 192 | 各48 | 既存どおり | ループ |
| rear | 240 | 24 | 2秒 | 1回、終了後idle |
| fall | 264 | 24 | 1.5秒 | 1回、終了後dead |
| dead | 288 | 1 | 静止 | 変化しない |
| turn_l | 289 | 24 | 1.6秒 | ループ |
| turn_r | 313 | 24 | 1.6秒 | ループ |

rear/fallの24フレームは終点を含みます。ループクリップの24/48フレームは終点を重複せず、GLB出力時は先頭を末尾に加えて閉じます。GLBのdeadは1キーのみです。

turnは足踏みをするインプレースの動きです。モデル内に累積ヨーを焼き込まず、呼出側の行列を1周期あたり左右約90度回します。試作の左右ボタンでは実際に90度回転します。行列を更新しなければ足踏みだけになります。

騎手は鞍点に追従させています。rearでは上体を起こす補正も行います。転倒時も振り落とさず、落馬は戦闘側の担当です。deadは移動入力で解除せず、確認画面の「復帰」で明示的に戻します。起き上がりモーションやラグドールは追加していません。

## 骨格テクスチャと描画

64×256 RGBAFloat（262,144B）から64×512（524,288B）へ拡張。増加は262,144B＝256KiBです。使用337行・未使用175行。1フレームを64テクセル1行に格納し、20骨×3テクセル＝60テクセル、残り4テクセルは余白です。拡張後も元の240行は同じバイトです。

Three r128のInstancedMesh＋共通骨格テクスチャを読む頂点シェーダーを継続します。GLBのSkinnedMeshをそのまま大量複製する方式ではありません。GLBは交換・確認用で、戦場の大量描画には `horse.render.json` とrendererを使います。

馬本体は1頭1インスタンス、最大3LODバッチ。馬具は元のLODを変えないよう別のインスタンス描画です。馬具は近184／中120／遠12三角形。rider=0では馬側の鞍・鐙等を非表示にし、harness=1で首輪・引き綱を表示します。riderは5000人の人型を自動生成する指定ではなく、人型モデルは鞍点に別途取り付けます。

馬と荷馬車の頂点属性は各8スロット以内。未使用UV枠が残る問題を避け、実際のUV用途がない `uv` 属性へ内部情報を格納します。馬では `uv.x=bone0*32+bone1`、`uv.y=region+weight*0.999`、荷馬車ではpartと色領域です。これは画像用のUVではありません。追加の画像テクスチャは使用しません。

## 1頭ごとの値を渡す

```js
import {createBattleHorseRenderer} from './prototypes/horse-extras/renderer.mjs';

const view = createBattleHorseRenderer(THREE, scene, renderer, horseAsset, 5000);

// スナップショットを更新した時点の、描画用の共通時計（秒）を渡す。
view.setInstances([
  {x:0, y:0, z:0, yaw:0, scale:1,
   speed:4, phase:0.25, state:0, stateT:0, coat:0, rider:1, harness:0},
  {x:3, y:0, z:0, yaw:0, scale:1,
   speed:0, phase:0.7, state:2, stateT:0.4, coat:3, rider:0, harness:1}
], {time:renderSeconds});

// 毎描画フレーム。スナップショット後の時間もシェーダーで加算する。
view.updateCrowd(camera, renderSeconds, false, 'idle');
```

- `x,y,z,yaw,scale` からインスタンス行列を構成します。yは地面の標高。rendererは接地用に+0.012mします。
- speedはm/s。通常時は速さから歩法を決定し、境界付近ではシェーダーで隣接歩法をブレンドします。負値は常歩の逆方向再生に対応します。
- phaseは**スナップショット時点の再生位相**。個体差だけの定数を毎回送り直すと位相が戻るので、移動距離／歩幅等で進めた位相を渡します。更新間はrendererが進めます。
- stateは0=通常、1=rear、2=fall、3=dead。stateTはその状態に入ってからの秒数。rearは2秒以降idle、fallは1.5秒以降dead、deadは時間やphaseでループしません。
- coatは0〜7。追加でblaze（真偽）、socks（0〜15）、scaleを渡せます。未指定ならrider=1、harness=0。
- turnは任意：-1=turn_l、+1=turn_r、0=通常。ヨーの補間・90度回転は呼出側で行います。
- state/stateT/rider/harness/turnは内部で1つのfloatへパックします。呼出側でパックする必要はありません。公開の属性名で渡してください。
- 行列の位置・向きは渡した値を使います。battle側が0.5秒ごとに更新する位置の補間、個体ID管理、移動・戦闘判定は呼出側の担当です。ここで自律移動AIは追加していません。
- setInstancesは渡された全頭を管理し、カメラ外除外・LOD振分けを行います。metrics.placedとsubmittedを分けています。試作専用の主役を併用する場合だけ `{includePrimary:true}` を使います。

## 鞍・騎手

`sampleBakedHorsePose(horseAsset, row, elapsedSeconds)` で描画と同じ焼き込み行を補間できます。`horseSaddleMatrix(pose)` は馬ローカルの鞍位置・向き（行優先3×4）です。元の点は `[0,1.67,0]`。これを馬のインスタンス行列（接地オフセット+0.012mを含む）と掛け、騎手を配置します。通常歩法のブレンド、rear、fall、dead、turnを同じ計算から取得できます。

近距離の騎手をCPUで置くための補助関数です。5000人の騎手の描画負荷や、全員分をCPUで計算する性能は検証していません。

## 荷馬車

`assets/cart-source/` の `woh-wagon.glb`、`wagon.render.json`、`manifest.json`。長さ3.84m、幅1.8m、幌込み高さ約2.71m。幌・座席込み近736／中312／遠66三角形。幌なしの基礎部分は624／300／58、幌は112／12／8三角形。近・中モデルには木箱／俵両方の形状を含み、インスタンス属性で片方を選択します。遠景は簡略化した同一形状を色で切り替えます。

車輪4つ、車体は別モデル・骨なし。車輪は進んだ符号付き距離／半径0.48mでX回転し、前輪に簡易操舵を加えます。停止では回転せず、後退では逆に回ります。

```js
import {createCartRenderer} from './prototypes/horse-extras/cart-renderer.mjs';
const carts = createCartRenderer(THREE, scene, wagonAsset, 1000);
carts.update([{x:0,y:0,z:-3.65,yaw:0,
  distance:traveledMeters, frontSteer:0, cargo:0,canopy:true}], camera);
// cargo: 0=木箱、1=俵、2=乗客用（荷物を非表示）。canopyで幌を切替。
// distanceは車体の累積移動距離。
```

1車体1インスタンス、最大3LODバッチ。capacityは引数で変更可能です。車体の可視候補は呼出側で渡してください（このrendererは距離LODを行い、車体の画面外除外は別途必要です）。

基準点はメートル、+Y上、+Z前。

- 馬側の共通連結点：`[0,0.94,-1.25]`
- 車体側のくびき中心：`[0,0.94,2.4]`
- 2頭立てはチーム中心からX±0.6、1頭立てはX=0。
- 駆動するチーム中心から馬側の連結点を求め、車体の連結点と一致させます。
- `freshCart / stepCart / localToWorld` は試作用の簡易牽引補助です。

試作では2頭立てが標準。1頭・2頭と荷物を変更でき、牽引中は常歩を上限にしています。後退は低速で可能ですが、完全な牽引車両物理ではありません。平地の連結一致を検証済み。悪路でのサスペンション、全輪の厳密接地、横転・馬車の衝突・複雑な後退は未実装／未検証です。馬車接続中のrear/fall等の確認は、いったん切り離してください。

## 幌と乗客（作業中の追加依頼）

参考画像に合わせた生成メッシュの幌を追加。前後の開口を残し、透明描画を使わず、不透明・両面描画にしています。per-instanceのcanopyで切替可能です。描画は車体と同じバッチで、三角形の計数は非表示部も含む送信数です。

御者席1人、荷台の座席2人。全員1.7m相当の体の比率を保った簡略円柱モデルで、足を曲げて座ります。`assets/cart-source/wagon.render.json` の `anchors.seats` に位置・向きを含めています。座席の骨格は不要で、車体の位置とヨーに追従します。乗客モデルは1人312／200／24三角形、同じLODの全員を1バッチで描画します。大量乗客の実機性能は未測定です。

```js
import {createCartPassengers} from './prototypes/horse-extras/cart-passengers.mjs';
const occupants = createCartPassengers(THREE, scene, wagonAsset, 3000);
occupants.update([{x:0,y:0,z:-3.65,yaw:0,driver:true,passengers:2}], camera);
```

車体の描画にはcargo=2を渡して荷物を消し、人の領域を確保してください。driverは御者の表示、passengersは0〜2。呼出側の可視車体リストと同じ座標を渡します。現状の乗客APIは等身大の車体が前提で、車体の拡大縮小には連動しません。御者・乗客の独立アニメーション、乗降アニメーション、手綱IKは対象外です。

確認画面では、荷馬車を出し「馬車に乗る」を押すとプレイヤーが御者席へ移動し、従来のスティック操作で常歩・操舵・減速・停止・後退ができます。荷物は自動で乗客用へ切り替わります。停止して右下の「下車」で降ります。走行中の即時下車を禁止し、安全な左右の地面を確認します。試作の乗降は即時で、経路探索や乗車のアニメーションはありません。

GLBには3LOD×木箱／俵／乗客×幌あり／なし＝18シーンを収録。人は別メッシュとして座席の位置に配置しています。最初の予算600／300／60は幌・人を含まない目安だったため、追加依頼に合わせて上記の送信数へ改定しました。馬のLODやテクスチャの費用は変わりません。

## 再生成

Node24、ブラウザ検証にはPlaywrightと `/usr/bin/chromium`。新しい外部モデル・画像・課金サービスは使いません。以下をリポジトリルートで実行します。

```sh
node tools/build-horse-extras-assets.mjs
node tools/export-horse-extras-glb.mjs
node tools/export-cart-glb.mjs
node tools/build-horse-extras-manifests.mjs
node tools/build-horse-extras-prototype.mjs
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
node tests/horse-battle-extras.browser.cjs
```

馬のベースを新規生成する場合に限り、最初に `tools/build-horse-assets.mjs` を実行してから上記の追加用手順へ進みます。試作05のHTMLを生成する旧 `build-horse-prototype.mjs` と混同しないでください。

出力は `exports/World-of-History-horse-prototype-v6.html`。Three r128を既存の固定HTMLから抽出し、モデル・スクリプトを全内包します。実行時のCDN通信は不要です。確認ボタンは「試験設定」にあります。押すとパネルを閉じ、動作が見えるようにします。

## 検証と限界

129件の単体テスト、25項目のブラウザ確認が通過。旧5クリップの固定描画は192×192でRGBA差分0。追加5クリップの固定GPU／CPU比較は256×256シルエット差分0。GLBの10クリップを一般のクォータニオン計算で読み戻し、骨格の位置・向きを確認しました。外部glTF Validatorやgame-dev CLIによる認証ではありません。

5000頭の混在状態と馬具1667頭を実際に描画し、馬本体＋馬具が2バッチ、890004三角形、全シーン11描画命令でした。この固定広域カメラでは全頭が遠LODです。近距離に5000頭が集中した場合の性能、5000人の騎手、大量の馬車、戦闘AI込みの負荷は未検証です。

rearの終了後idle、fallの終了後deadを実際のシェーダー描画で確認し、数秒後もループしないことを比較しました。車輪の回転でも実画像の変化を確認しています。騎手の鞍点追従、1頭／2頭、木箱／俵、幌切替、御者席の乗降と操作、3人の追従、横画面667×375・844×390・1180×820を確認しました。

確認環境はChromium／SwiftShaderで、iPhone・iPad実機の速度は測っていません。旧試作のiPadが軽快とのユーザー報告を、追加分の実機測定に置き換えてはいません。既存のBlender評価が不安定だったため、今回もオリジナルJSから直接GLBを出力しています。providerやCLIの検証済みパッケージとの主張はしません。
