# 人口・配属の保存接続 P0c

監督の統合引継ぎ3/10/12/13章と「続けて」に基づく小単位。単一エージェント、codex/politics-military-p0で実施。制度・数式の変更なし。

## 選択と境界
既存HTMLのapplyState/collectStateを直接変更する案は、時計・地理・他担当の保存と同時変更になるため今回は採用しない。人口/軍事を別々に復元する案は部分適用を招く。既存peopleSave/peopleLoadを同期ポートとして呼ぶ任意利用のセッションアダプターを追加する。

既存peopleSaveは型付き配列を返し、ネストしたmetaに正本への参照を含む。peopleLoadは入力のgroupsを変更する。structuredCloneで保存直後およびロード前に切り離す。JSONへの単純変換は禁止。IndexedDBと同じstructured clone形式を扱う。全世界のセーブやディスクへの原子書込を実装したとは扱わない。

## 変更ファイルと手順
1. tests/politics-military/people-military-session.test.mjs：実Populationと実peopleSave/peopleLoadを利用。保存の不変性、人物0・死亡者保持、outbox/再送、同一世界確認、壊れた入力の全件拒否、復元後の新規操作、乱数継続、旧人口保存の明示読込を先に記述して失敗確認。
2. src/politics-military/people-military-session.mjs：世界ごとに一つの台帳を所有するセッション。人口と台帳を一つのenvelopeに保存。候補人口を別構築→参照検証→両方成功時のみセッション参照を交換。外部の部隊/権限ポートには対象peopleを渡す。再入処理は拒否。
3. docs/politics-military/people-military-save.md：呼出例、型付き配列、旧形式、外部部隊の復元責任、未接続を明示。
4. node --test（既存Nodeテスト全件）と影響する既存人口・建築・野戦の自立実行テスト。generator/world.binが必要な長期人口試験は未実施と明記。小単位コミット。

## 完了条件
保存後の世界更新で過去の保存が変わらず、復元入力も変更しない。死亡した兵員を復活・複製させない。不正な軍事sidecarで既存人口が巻き戻らない。保存をまたいだ再送で追加の人口/配属/イベントが増えない。同一入力による人口の短期継続が一致する。

## 残る依存
本編の永続worldKey、部隊正本の保存、地理・在庫・経済・歴史・思想のトランザクション、全世界時計同期は未接続。現行HTMLはロード後にnpc.dayをclock.dayへ代入するため、本統合時にはその処理より前に時計整合を検証する必要がある。旧保存にworldKeyが無いので、旧形式読込は呼出側が対象世界を確認した明示APIのみとする。
