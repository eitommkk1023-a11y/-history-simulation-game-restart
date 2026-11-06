# 試作11 — 脚の太さの比較版

ユーザー承認済みの比較試作です。前脚の付け根を約18％、後ろ脚の太ももを約20％太くし、膝・飛節の接続部に少しふくらみを付けました。膝下の中ほど、足首、蹄は細さを残しています。

画面上部の「脚：厚め」を押すと「脚：元の形」へ戻せます。再度押すと厚め。個体・毛色・能力・カメラ・歩法・再生位相をリセットしないため、そのまま比べられます。起動時は厚めです。切替状態は今回保存しません。

## モデル

`leg-proportions.mjs` が既存メッシュを複製し、骨の中心軸から外側への距離を調整します。肩〜前腕、後脚の太ももへ厚みを足し、関節から膝下へ細くつながる形にしています。

- 元のモデル／horse.render.json／GLBを変更しません。正式採用前の比較です。
- 身体・頭・蹄・馬具・骨の位置・スキニング・インデックスは保持。
- 近2132／中1064／遠174三角形のまま。頂点追加・新しいモデル／テクスチャ／ライブラリはありません。
- 太さに合わせ法線を再計算。3つのLODにも同じ方針を適用。
- 膝・飛節の接続幅は、おおむね約10cmから約12cmへ調整。膝下の中間部分はほぼ据え置きです。

rendererの `setHorseLods(lods)` で主役と集団の位置・法線バッファの中身を差し替えます。切り替えのたびにメッシュを作り直す方法ではありません。同じトポロジーと骨の割当であることを検査します。

太くなった関節が転倒中に埋まらないよう、主役はモーションの補間後に候補メッシュの変形境界を確認し、必要な高さだけ接地補正します。`createBattleHorseRenderer` の第7引数のposeAdjusterで実行します。元の形を選択中は補正を使いません。大量描画の全個体をCPUで検査する機能ではありません。

## 動作確認

単体151件、比較版のブラウザ12項目、共有回帰25項目が通過。

同じ姿勢で実画像の2053画素が変わり、太さの変更がGPUへ反映されることを確認しました。通常5歩法・後退、後ろ脚立ち・左右旋回・走行転倒・復帰で、主役の厚い関節が地面に埋まらないことを確認しています。横画面667×375、844×390、1180×820で切替ボタンを含む操作領域の重なりを確認しました。

厚め5000頭と馬具1667頭を実際に送信し、全頭遠LODで馬関連2バッチ・890004三角形。切替100回で既存の位置・法線配列とジオメトリ数が増えないことも確認しました。これはiPhone/iPad実機のFPS測定ではありません。

## 再生成

```sh
node tools/build-horse-extras-prototype.mjs
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
node tests/horse-v11.browser.cjs
mkdir -p validation/horse-v11/regressions
HORSE_HTML=exports/World-of-History-horse-prototype-v11.html HORSE_REPORT_DIR=/validation/horse-v11/regressions node tests/horse-battle-extras.browser.cjs
```

出力は `exports/World-of-History-horse-prototype-v11.html`。比較画像は `validation/horse-v11/leg-comparison.png`。既存の歩法・走行転倒・控えめな落馬・馬車を継続しています。main、battle.js、正式ワールド、旧HTMLは変更していません。

今回は太さの見た目を比較する段階で、正式モデルの採用判断はまだです。起き上がり等の既存の簡易表現はそのまま。検証環境はChromium/SwiftShaderで、実機は未検証です。
