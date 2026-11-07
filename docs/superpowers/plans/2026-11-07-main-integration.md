# 本編の時計・人口・労働・保存への接続

基点origin/main=16796365d5021f3a23f3f535b522b726db261127。P3b=40ebc26を保持し、別worktree/branch codex/politics-main-integrationへ無競合で取り込み。P3a/P3bの7コミットはローカルbundle検証済み。remote既存ブランチはf3d1ee6、公開pushの明示承認を非同期確認中。

## 発見と方針
本編peopleCtx.day=clock.dayでpeopleMonthlyを呼び、その内部で30日進めるため人口時計が先行する。peopleMonthlyは既定の30日処理を保ち、本編用populationAdvancedオプション時のみ省く。peopleDailyを追加し、本編の全day/skip/month/year/god-batch経路が通るdailyTickから呼ぶ。

## 小単位の実装
1. Population/people-coreに任意の生活労働可用性・食料分担の読取ポート、日次更新/既存年齢別日量のAPIを追加。未指定時は既存動作。外出者も同じ人物IDのまま。人口日付とclock.dayの一致、日次+月次での二重進行なしをテスト先行で確認。
2. src/integration/main-military.mjs：世界時計に接続する任意利用controller。既存命令/伝令/食料部品を利用。期間中の不在日数を月次生活労働/食料に反映。外出中の食事は実積荷から既存年齢別日量を消費し不足を記録、既存の飢餓係数を利用する読取ポートへ通知。未実装の制度・速度/勤務時間を正式値にしない。移動profile/travelHoursPerDay/capacityは明示指定のみ。
3. 本編は既存SAVE_FORMATを維持しmilitary拡張を追加。世界IDを新規世界ごとに保存。旧セーブの拡張欠落は空状態へ移行。人口/拡張/既知の保存配列をロード前に候補検証し、不正ならgenerate/applyState開始前に拒否。地形再生成後の追加検証もグローバル交換前に行う。clock acc/pending/playingも保存する。
4. 本編HTMLの埋込npc/peopleだけを同期し、依存を含むcontrollerを専用scriptへまとめる。Claudeの最新generator/fauna/神モード変更は保持する。位置は既知の実座標だけを登録。日常の描画位置を勝手に全人物の地理情報として採用しない。権限ポート未接続の本番操作は拒否。開発者専用の接続試験操作は区別し、資源/人物を増やさない。
5. 全Nodeテスト・実際の本編HTMLのブラウザ試験（共通時計、標準/加速、IndexedDB/JSON、命令到達/実行、中断復元）を分けて記録。人口増加は試験fixtureで実施し、既存peopleMonthlyの労働/食料接続と負荷を測る。本編の人口増加処理を試験のために変更しない。

## 未実装を隠さない
自律的な制度形成/軍制/伝令人選、実位置の全世界統合、全物資、全世界の長期歴史試験は今回の完了基準ではない。権限・速度・容量の試験入力は正式政策にしない。既存世界全体の完全なスキーマ検証を新規軍事拡張だけで代替したと報告しない。
