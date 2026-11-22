# 予算と自動検査（F8）

数字は `tests/budgets.json`。変えるときは、理由をここに書く。実機の記録は `device-measurements.md`・`device-diagnosis.md`。

| 予算 | 値 | 確認するテスト | 根拠 |
|---|---|---|---|
| 三角形（建物5,000棟を引いて描く） | 80万以下 | `browser stress` | 実機 iPhone 17 で、61万（S1）〜75万（S4）まで約50〜60FPS |
| 描画の呼び出し | 200以下 | `browser stress` | 実機の最大は 114 |
| 月の処理の1段階（1コマの計算） | 16ms 未満 | `browser monthslice`（ソフト描画の参考値）、実機の性能診断 | 60FPS の持ち時間 16.7ms。実機の記録は 5.0ms（2026-11-18） |
| S3（80km・24村）100年の人口 | 開始の 1.8〜6倍 | `node test-budget` | 案B（余剰）と衛生（M3）の結果：約4.5倍 |
| S3 100年の飢えの死者 | 最終人口の 5% 以内 | `node test-budget` | 現在 0.2% |
| S4（世界全体）100年の人口 | 1.2万〜6万 | `node test-budget` | 現在 3.1万 |
| S4 100年の集団の数 | 400以下 | `node test-budget` | 現在 129 |
| S4 100年の飢える集団（充足0.5未満） | 5以下 | `node test-budget` | 現在 0 |
| 台帳の収支の恒等式 | 全集団でちょうど0 | `node test-budget`、`test-ledger`、`test-aid`、`test-sanitation` | 設計 |
| 同じ Seed で同じ結果 | 一致 | `node test-budget`、`test-careers` | 設計 |
| 1か月の計算（node、S4）の平均 | 120ms 以下 | `node test-budget` | 現在 約34ms |

## 使い方
- `node tests/run-all.js` ですべて（約50分）。予算だけなら `node tests/run-all.js --only test-budget`（約5分）。
- 予算を超えたら、まず原因を調べる。意図した変更なら、数字を変え、この表の根拠も更新する。
