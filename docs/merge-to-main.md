# main への取り込みの手順（案。実行は監督の承認が要る）

現状：作業は専用ブランチ `claude/small-world-v1` で行い、main は変更していない。公開（push）・マージは、約束により監督の承認が要る。

## 取り込む前の確認
1. `node tests/run-all.js`（node・ブラウザ）が全て合格し、結果が `tests/last-run.json` に記録されている。
2. 実機の診断結果（`docs/device-diagnosis.md`）が取れている（少なくとも S1・S3）。
3. 通常のプレイ（`?autostart`）の確認テストが、現在のHTMLで合格している。
4. 旧い保存が読める（`tests-browser/suite/smallfull.js` と、旧版の保存の読み込みの確認）。

## 取り込みの方法（案）
- 差分の確認：`git log main..claude/small-world-v1` と `git diff --stat main...claude/small-world-v1`。
- 方式：squash でなく、小さなコミットの履歴を残す merge（履歴の追跡のため）。
- 公開中のArtifact（既存の公開版）は、取り込みとは別に、監督が更新を決める。
- 取り込み後：main で `node tests/run-all.js` を再実行。問題があれば、merge を revert する。

## 取り込む順番の候補（分けて取り込む場合）
1. 基盤：保存の圧縮、配置の高速化、世界生成の検証の土台（テストの一括実行）。
2. 見た目：川・湖・海・木・地形の多様さ。
3. 観察：神モード・小規模ワールド（開発者向け）。
4. 人口の層化（方針は未接続）。
