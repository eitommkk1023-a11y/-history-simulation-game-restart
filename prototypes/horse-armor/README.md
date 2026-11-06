# 馬の防具・比較試作01

馬試作11を変更せず、独立した着せ替え試作を追加。頭・首・胴に「なし・布・小札・金属板」を指定できる。各部位を混ぜられ、一式ボタンで素早く比較できる。文化名・時代・国への割り当て、防御力・重量・価格は未接続。今回は見た目を比較する段階。

## 操作

上部「防具」で設定を開き、部位を選ぶ。「閉じる」で馬全体を見る。既存の乗降・歩法・旋回・転倒・復帰・馬車は継続。試験設定から5000頭の描画も試せる。防具設定自体は保存しない。

## 構成

- model.mjs: メートル単位の自作曲面。目・耳・鼻先・鞍・脚をできるだけ露出し、頭2番/首0〜1番/胴0番の既存骨に追従。小札は小さな独立板、金属板は大きな分割板、布は連続面。小札・金属板に浅い縁を設ける。
- renderer.mjs: 馬試作11の描画処理のコピーを拡張。元ファイルは変更しない。選択は追加のinstance属性 armorKit (head,neck,body)、各値0〜3。setArmorKit([3,2,1]) が標準設定、setInstances の各行に armor:[3,2,1] を渡すと個体指定。配列は検証して複製する。
- skinのregion 20〜28が部位×系統。共有メッシュへ全候補を入れ、非選択部品をGPUのfragment shaderで破棄する。描画命令は増えず、切替時にモデルも作り直さない。ただし隠した候補も頂点処理は行うため、無料の処理ではない。
- 全候補込みの近/中/遠LODを用意。遠方では小札一枚ずつの形を省き、被覆形状と色を残す。板の細部・穴・縁の造形はまだ簡略化。
- 布は骨格追従の表現で、布シミュレーションではない。動作中に全方向で一切接触しない保証はない。大量描画は兵士AI/衝突/戦闘計算を含まない。

新規ライブラリ、外部モデル、外部テクスチャ、有料生成は使用していない。専用game-dev CLIが未導入のため、既存のJS生成器を使用。成果物は部品JSONと再生成ソース、単一HTML。GLBの正規化・canonical package化・正式版への導入は未実施。

## 再生成と検証

```sh
node tools/build-horse-armor-prototype.mjs
node --test --test-isolation=none tests/horse-armor.test.mjs tests/horse-leg-proportions.test.mjs tests/horse-running-collapse.test.mjs tests/horse-button-controls.test.mjs
node tests/horse-armor.browser.cjs
```

基準v31のexports/World-of-History-development.htmlから既存Three.js r128をハッシュ検証して抽出。既存 assets/horse-source/horse.render.json と assets/cart-source/wagon.render.json が必要。出力は exports/World-of-History-horse-armor-01.html と assets/horse-armor-source/armor.render.json。原本は上書きしない。

単体18件・ブラウザ11項目成功。比較用の色は構造を見分けるための固定色で、実在文化の代表色という意味ではない。検証の詳細はvalidation/horse-armor/REPORT-ja.md。iPhone/iPad Safari実機の動作・FPSは未確認。
