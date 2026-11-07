# 命令伝達接続 P3a Implementation Plan

**Goal:** 実在人物への命令を発信・配送・到達・理解・実行依頼・結果に分離し、再送と保存で二重効果を起こさない接続を作る。
**Architecture:** 副作用のない同期ポートで世界の事実・判断を読む独立台帳。実際の配送/実行は各正本へ依頼し、結果の記録を待つ。交通アダプターは経路試算だけを再利用する。
**Spec:** 監督提示の統合引継ぎ3/5.2/6.2/10/11/13章、直前の命令接続計画への了承。
**Execution:** 単一エージェント、既存codex/politics-military-p0。制度・速度・服従率・時間換算を新規確定しない。

## 調査結果と選択
既存battle.issueは独立nextIdと秒時計の試作。人物正本や世界時計にそのまま接続しない。geography.routeはhoursを返す実験的な経路試算で、実際の伝令到達記録ではない。ゆえに配送所要時間だけで到達させるタイマー方式は採用しない。位置が不明なら経路試算不能。世界共通日時は既存npc.day、実時間への換算を置かない。

## Task 1: 人物命令台帳
- Create src/politics-military/order-ledger.mjs, tests/politics-military/order-ledger.test.mjs。
- createOrderLedger({worldKey,people,assignments,resolveUnit,authorize,readDelivery,interpret,assessExecution,readExecution},snapshot?)。
- issue({orderId,issuerId,recipientId,unitId,instruction})。instructionは空でない文字列の伝達内容（戦術名やバフではない）。発信権限・人物の存在/生存・配属を検証し、同一ID再送は不変、別内容は拒否。
- step(orderId)で1段階ずつ進む。issued→dispatched→received→understood→execution-requested→completed。配送喪失、誤解、拒否、実行不能は別の終端。未接続ポート・未知情報・未到達・例外は進行させない。
- readDeliveryはworldKey/orderId/recipientId/deliveryId/dispatchedDay/receivedDayを持つ配送事実。到達予定時刻は根拠にしない。readExecutionはexecutionKey/recipientId/unitId/completedDayを持つ正本の実行結果。
- 配送/実行依頼はdetachedなoutbox。世界側は依頼キーを永続的に重複排除し、実移動・消費は世界正本で行う。台帳は位置/職業/人口/在庫を変更しない。
- 保存には状態遷移の事実journalを含め、再生時に現在の権限やAIを再実行しない。異世界/壊れた遷移/未来日/不明参照を拒否。人口差替え・時計逆行・再入を拒否。
- RED: 未実装APIの失敗を確認。GREEN: ID0、遅延、予定時刻のみの到達拒否、未知位置、死者、配属解除、失権、誤解、拒否、能力不足、配送喪失、再送、保存、結果キー検証、無副作用を実Populationで確認。

## Task 2: 交通試算と統合試験
- Create src/politics-military/order-route.mjs, tests/politics-military/order-route.test.mjs。
- estimateOrderRoute({geography,locate,knows,profile},order)。locateは人物IDの実位置、knowsは伝達者の既知地理。移住先や集落中心で代用しない。profile.baseKmHは呼出側が明示。経路を得ても到達を進めない。
- 既存createGeographyAdapterを使用する試験。未知地理・河川遮断を保存。世界APIと同じ名前だけの代替ルート実装は作らない。
- NPC担当者をfixtureとして設定し、プレイヤー入力なしで発信→遅延→到達→理解→実行依頼→正本結果を試験。fixtureの配送・実行判断を本編AI完成と扱わない。

## Task 3: 検証・契約・コミット
- 全testsのNode検証、git diff --check、自己レビュー。人口/本編HTMLを変更しない。
- docs/politics-military/order-contract.mdに接続API・保存例・外部の重複排除責任・未接続を明示。
- 小単位コミット。新規コードの公開は今回はローカル成果として報告（直前の公開承認はP0cの2コミットに限定）。

## Review Focus
- 発信者死亡と命令の履歴を混同しない。現在の実行権限は実行直前に別照会。
- 完全な到達証拠なしで既知の敵・相手に情報を渡さない。
- 正本の結果確認前にcompletedとしない。依頼の再送で人口/在庫を変えない。
- 旧命令の保存を読み込んでも実行依頼の識別子を変えない。
- 本編保存への原子的な接続・実伝令・実移動は未実装として残す。

## 実行記録
- Task 1 complete: 初回15件が未実装APIによりRED、実装後GREEN。追加の境界検査を含め命令22件。
- Task 2 complete: 交通5件が未実装APIによりRED→GREEN。実配属解除APIで、効果コミット直後/命令受領前の中断と再送を検証。
- Task 3 complete: 全Node72件合格。正本の人口/people-core/battle/本編HTML4ファイルは基点から変更なし。
- 自己レビュー修正: 拒否の復元遷移が広すぎるため実行依頼後のrefusedを拒否（回帰RED→GREEN）。異世界/別peopleの配属台帳も受け付けていたためisBoundToを追加（RED→GREEN）。P0cセッションへ同じ読取APIを公開し、ロード後の古い命令アダプターを拒否（RED→GREEN）。
- レビューは単一エージェントによる著者自己レビュー。外部ポートの純粋性、実効果側の永続重複排除、全世界の原子的保存は接続契約として残す。正式な数式/制度の新規決定はない。
