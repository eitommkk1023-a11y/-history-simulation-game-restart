# 設定値（F1）：`npc/game-config.js`

世界の段階・人口・層の方針・目標の規模・外との交易の量を、1か所（`CONFIG`）に集めた。値を変えるだけで、人口・段階が変わる。同じ設定・同じSeedなら同じ結果（`npc/test-config.js` で確認）。

| 区分 | 項目 | 既定 | 意味 |
|---|---|---|---|
| world | cells・widthM・landKm2 | 3000・99,866.7・4,400 | 世界の格子と広さ（**情報**。変えても生成は変わらない。スマホ前提で今のまま） |
| stages.1〜3 | sizeM・villages・popMin/popMax・minDm/maxDm・minLand | S1 20km・4村 …／S3 80km・24村 | 小規模ワールドの窓の広さ・初期の村の数・村の人数の範囲（100〜500）・村どうしの距離 |
| stages.4 | whole | true | S4＝世界全体（窓なし。通常の世界） |
| population | initSiteMin・initSiteSlope | 0.45・0.85 | 初期人口を、立地の良さの順位 q で min(1, min＋slope×q) 倍にする |
| population | splitPop・splitPopSettled・splitFedMin | 220・800・0.85 | 集団が分かれる人口。定住した村で食料が足りている（充足≥0.85）ときは800人まで |
| layers | cap・nearCap・demoteRate・promotePerMonth・nearDist | 300・2000・0.25・40・40 | 層の方針（遠い集団の個人の上限／近い集団の個人の上限／1か月に降格する割合／昇格する人数／近いとみなす距離） |
| targets | worldPopulation・cityPopulation | 10〜30万・3〜10万 | 規模の目標（目安。上限ではない） |
| trade | externalFoodPerMonth | 0 | 外から入る食料（M2で使う。今は未使用） |

## 使い方
- 検証・開発での上書き：node は `WOH_CONFIG='{"stages":{"1":{"popMax":300}}}' node …`、ブラウザは、読み込み前に `globalThis.__wohConfigPatch = {...}`。一部だけ書けばよい（残りは既定）。
- 不正な値（範囲外など）は、エラーを表示して、既定の設定を使う（`validate`）。
- 参照する所：`small-world.js`（段階）、`people-core.js`（`PE` の人口・層の値）。HTML には `<script id="game-config">` として、他より先に埋め込む。

## まだ設定に出していないもの（今後）
食料・輸送・衛生・統治などの値（M1以降の機能で、そのつど追加）。生成器の値（世界の広さ・地形・気候）は、世界が変わるため、対象外。
