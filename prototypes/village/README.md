# 村の成長 — 農耕・牧畜の造形 / 村メニュー試作07

本編の人口・農耕・牧畜・建設・季節進行は変更しない。描画用モジュールと、ダミーデータで操作を確認する画面。`codex/prototype-village-v1` はmainの `7df2862213d1c60c92e59ddd23f87e2a65294ce0` から作成。mainへ書き込み・マージ・公開しない。

- 造形: `exports/World-of-History-village-prototype-v1.html`（畑、家畜、施設、村全体、最大数の各ボタン）。
- メニュー: `exports/World-of-History-menu-prototype-v7.html`（試作06から村タブを追加）。
- 素材/描画データ: `assets/village-source/village.render.json`。元の手続き型生成器はこのフォルダの各mjs。
- UIの基準: `codex/prototype-rpg-menu-v1` / commit `964124ba403f435ec873ea5df50510fc26e89be5` の試作06。新しいUIを本編へ直接適用していない。

## 再生成

```sh
node tools/build-village-prototype.mjs
node tools/build-village-menu-prototype.mjs
node --test --test-isolation=none tests/village.test.mjs tests/village-menu.test.mjs
node tests/village.browser.cjs
node tests/village-menu.browser.cjs
```

Node、Playwright、`/usr/bin/chromium` が必要。基準v31を `vendor/world-v31.html` に固定保存（SHA-256 `50a6f786eef5b641d0ec235f2111712d7acabd29e87542a75d802b2d993dd348`）。メニュービルダーはこのハッシュを検査、造形ビルダーは既存Three.js r128をハッシュ検査して抽出する。新しい外部モデル/外部テクスチャ/有料サービス/ライブラリは使っていない。既存Three.jsのライセンス表示は同梱スクリプト内に保持。

## 1. 畑・作物の渡し方

```js
import {createFields, plotWorldPoint} from './prototypes/village/fields.mjs';
const fields = createFields(THREE, scene, {capacity:200});
fields.setPlots([{x:0,y:1,z:0,yaw:0,hw:10,hd:12,kind:1,crop:0,tint:.4,
  stage:3,progress:.6,cropHeight:1.3,heights:[1,1.3,2,2.3]}]);
fields.update(camera);
```

`x,y,z`はメートル、`yaw`はラジアン、半幅/半奥行は5〜15m（辺長10〜30m）。`kind` 0畝の長方形/1棚田状/2丸い菜園、`crop` 0穀物/1根菜・豆/2低木の実り物。`tint`と`progress`は0〜1。`stage` 0耕土/1芽/2伸長/3実り/4刈り跡。

追加の`cropHeight`は成熟時の背丈（0.1〜3m）。省略時は作物ごとの標準値。色と背丈は独立に渡せる。プレビューの「色・背丈」スライダーだけは両者を一緒に変えて見本を示す。

`heights`は**世界座標の絶対Y**を4つ。順序は、区画の回転前の局所座標で `(-x,-z),(+x,-z),(-x,+z),(+x,+z)`。yawで回した4隅を本編側でサンプリングして渡す。省略すると4点とも`y`。描画時に`y`を二重加算しない。土と作物が共通の高さ式を使い、通常は双線形補間、棚田は奥行方向を4段の中心値へ揃える。土面は近16分割/遠4分割の三角形による近似なので、極端な非平面の4点では中間誤差が残る。崖を跨ぐ区画は本編側で分割/配置回避してほしい。棚田は地形を削らず、段差と土の縁を重ねて表現する。

`plotWorldPoint(plot,u,v)`のu/vは-1〜1、同じ規則で座標を得る。円形菜園の有効範囲は`u*u+v*v<=1`。

近景は穂の小群・葉・低木、遠景は群の数と面を減らす。畝/被覆の模様はシェーダーで生成し、画像テクスチャは0バイト。1本ごとのObject3Dや作物AIは作らない。9区画の画面は3形状×3作物の造形見本、村全体は20区画、最大数は200区画。

## 2. 家畜の渡し方

```js
import {createLivestock} from './prototypes/village/livestock.mjs';
const animals = createLivestock(THREE, scene, {capacity:500, renderer});
animals.setInstances([{x:0,y:0,z:0,yaw:0,scale:1,speed:1.1,phase:.2,
  state:2,stateT:0,coat:3,kind:0}], {time:gameSeconds});
animals.update(camera,gameSeconds);
```

`kind` 0大型牛系/1山羊羊系/2猪豚系/3鳥鶏系。名前や品種を固定しない。`coat`は0〜255の色の個体値、`scale`は0.1〜3。状態は0idle/1graze/2walk/3lie。牛・山羊系だけlieを持ち、他体型のlie入力はidleに置き換える。lieは`stateT`0〜0.8秒で寝そべる姿勢へ移行し、最後を保持する。その他はループ。

`phase`は0〜1の周期のずれ、`stateT`は状態に入ってからの秒、`speed`はm/s。`time`は秒で、setInstances時とupdate時で同じ時計を使う。描画側は位置/yawのシミュレーションを行わない。歩行移動は本編がx/zを更新する。見本アプリだけが歩行時に簡単な軌道を動かす。

馬と同じ骨格テクスチャ＋インスタンス方式を使用するが、骨格は各体型に合わせた7骨の簡略版。4体型×4状態×24サンプル、32×384 RGBA Float32 = **196,608バイト（192KiB）**。近景は2サンプル補間、遠景は1サンプルに省略。非選択の体型は頂点シェーダーで早期に除外し、不要な骨格テクスチャ読み取りを省く。

足と尾のモデル頂点から接地補正を焼き込む。平面上のCPUサンプルは検証済みだが、急斜面に合わせた足ごとのIKや家畜同士の衝突、AI、放牧・繁殖はない。頂点テクスチャ未対応では静止形状へ退避する。退避経路の実機確認は未実施。

## 3. 村の施設

```js
import {createFacilities} from './prototypes/village/facilities.mjs';
const facilities = createFacilities(THREE, scene, {capacity:128});
facilities.setInstances([{x:10,y:0,z:5,yaw:.3,w:4,d:5,h:3,
 role:'raised_storehouse',wall:0,roof:0,state:1}]);
facilities.update(camera);
```

| role | 見た目 |
|---|---|
| raised_storehouse | 高床倉庫、床下の柱、階段、鼠返し |
| storage_pit | 貯蔵穴の暗い開口・内壁と覆い屋根 |
| drying_rack | 干し棚、横木と吊り下げ物 |
| well | 穴のある井戸枠、柱・吊り綱・覆い |
| livestock_pen | 門を空けた柵と小屋 |
| communal_hearth | 石囲い、薪、炊事用の支柱 |
| watchtower | 高い床、手すり、梯子、屋根 |
| pottery_kiln | 土の窯体、焚き口、煙突、土器 |

日本語の上記名称、`storehouse/pit/rack/pen/hearth/tower/kiln`も別名として受け付ける。`w,d,h`は全体の幅/奥行/高さ、メートル。貯蔵穴の内壁はY=0より下にも伸びる。穴の暗い開口は描画するが、**地形メッシュのくり抜き・衝突の穴は作らない**。必要なら本編側で別途マスク/穴を接続する。

`wall`は既存`npc/arch-gen.js`の番号に合わせる: 0timber木/1stone石/2adobe日干しレンガ/3mud土/4turf芝土/5reed葦。`roof`は0thatch草/1shingle板/2turf芝/3mud土/4slab石板。同じMAT_COLOR値を使用し、単体テストで一致を確認。既存の共有形状と同様の箱・円柱・切妻・寄棟・円錐・平屋根から構成する。

追加の`roofKind`は0切妻/1寄棟/2円錐/3平屋根。省略時は土屋根だけ平、他は切妻。`state`は0新築（明るい）/1通常/2老朽（傾きと退色）/3廃屋（屋根と上部を省略）。破壊の物理計算はしない。柵と井戸など、屋根のない部分は屋根指定の影響を受けない。

## 4. メニュー「村」ページ

`village-data.mjs`がダミースナップショットの形、`village-menu.mjs`が表示と確認を担当する。

```js
import {createVillagePage} from './prototypes/village/village-menu.mjs';
const page=createVillagePage(container,{snapshot:{
 id:'settlement-12',name:'川辺の村',stage:2,population:84,households:19,
 food:{days:18.4,season:'春',income:{forage:42,farm:68,herd:24}},
 buildings:[2,1,3,1,1,1,1,2]
},onIntent(intent){ /* 本編側の検証・指示キューへ渡す。 */ }});
page.setSnapshot(updatedVillage);
```

stageは0野営地/1半定住/2村/3大きな村。buildingsの順は上の8施設のroleと同じ。food.incomeは食料/日。0収入のバーも扱う。

確認後の値: `{villageId,type:'ration',value:0..100}`、`{villageId,type:'build',value:'storehouse'|'well'|'livestock_shed'|'field_expansion'}`、`{villageId,type:'proposal',value:'expand_fields'|'increase_livestock'|'relocate'}`。確認前/取消ではonIntentを呼ばず、スナップショットを変更しない。別の村のデータに置き換えると未確認の操作を取り消す。本編は権限・材料・日数・実際の処理を改めて検証してほしい。

プレビューでは`window.__villageMenu`でsnapshot/intents/setSnapshotを確認できる。操作履歴は画面内メモリーだけ。分配・建設で本編の食料を消費したり、建物を生成したりしない。初期表示は村タブ、従来の所持品・地図・ミッションも切替可能。確認画面のEscは取消、通常のEscはメニューを閉じる。ワールドの保存先は従来試作同様に隔離する。

## 5. 更新頻度と描画方式

setPlots/setInstancesは入力を複製・検証し、上限超過や不正値で途中のデータを採用しない。区画と施設の配置は変更時のみ渡し、毎フレームupdate(camera)を呼ぶ。カメラの位置を約0.5m単位で検査し、同じ配置・同じLODならGPUバッファを再送しない。家畜はアニメーション時間だけ毎フレーム進み、位置を動かす時は本編からsetInstancesを更新する。

近/遠距離の基準は畑90m、家畜70m、施設120m（カメラの水平距離）。setForcedLOD(0|1|null)で検証できる。LOD間の形の変化はあり、ジオモーフは未実装。地理チャンクの管理・遠方の村シミュレーションには干渉しない。

畑は近/遠それぞれ土1＋作物1で最大4描画、家畜は近/遠で最大2、施設も最大2。異なる体型/役割/作物の候補形状を共通メッシュで持つため、描画命令は少なくなるが、非選択候補の頂点やメモリもゼロにはならない。

## 6. 性能・検証

三角形数、テクスチャ使用量、CPU更新/描画送信時間、実際のフレーム間隔、画像と検証件数は `validation/village/REPORT-ja.md` および `assets-browser.json` に記録。CPUの送信時間をGPU描画時間や1フレーム全体と取り違えないこと。計測はLinux Chromium/SwiftShaderで、iPhone/iPad Safari実機のFPS・熱・電池・長時間動作は未検証。

最大数のソフトウェア描画は重く、低い描画回数だけを根拠に実機で軽いとはしていない。実機評価後、必要なら可視範囲の絞り込みや体型ごとの小さなバッチへの分離を検討する。テクスチャ未対応の退避や極端な崖の畑は未検証。本編への接続・経済/家畜AI・建設や農業のゲームバランスは納品範囲外。

### 実測値（今回の環境）

## 三角形数

共有メッシュが全種類の候補を保持するため、表示しない候補の頂点も含めた送信数。

|対象|近景|遠景|
|---|---:|---:|
|畑の土（3形状込み）|710|170|
|作物（3系統の群れ込み）|1840|243|
|牛系の素材|346|130|
|山羊羊系の素材|346|130|
|猪豚系の素材|358|138|
|鳥鶏系の素材|306|126|
|4家畜込みの描画メッシュ|1356|524|
|8施設/屋根候補込み|2256|1366|

全て近/遠が混在しても、畑4＋家畜2＋施設2の最大8バッチ。計測した最大数シーンは全て遠LOD: 200区画・家畜500頭・施設80基で造形4バッチ、背景地面込み**5描画 / 455,032三角形**。種別/役割ごとに数百Object3Dを作る方式ではない。頂点処理の候補保持コストは残り、近景を全数に強制すると重くなる。

## テクスチャ・1フレームの時間

骨格DataTextureは32×384 RGBA Float32、196608バイト（192KiB）。畝・作物・材質は手続き型の形と色で、外部/画像テクスチャは0バイト。JSON内のbase64データは同じ骨格テクスチャであり、別のアニメーション画像ではない。

Linux Chromium/SwiftShader、874×380、最大数シーンで操作・撮影中の時間を除き60フレームを記録。

|指標|平均ms|p95 ms|
|---|---:|---:|
|CPU更新|0.077|0.200|
|CPU描画送信|0.847|0.700|
|実際のrAFフレーム間隔|394.413|766.600|

**最大数のソフトウェア描画は重い。** CPU更新/送信が短くても、GPU描画完了や1フレーム全体が短いことを意味しない。独立したGPUタイマーの値は未計測。iPhone/iPadの実機FPS・熱・長時間の安定性は未検証。少ない描画命令だけを根拠に「実機で軽い」とは報告しない。実機ではLOD距離・可視範囲・区画密度を調整する必要があるかもしれない。

