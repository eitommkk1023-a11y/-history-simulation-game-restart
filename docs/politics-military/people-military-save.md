# 人口・配属の保存接続 P0c

## 状態
任意利用の接続アダプター。実際の `npc/people-core.js` の `peopleSave/peopleLoad` と `Population` をテストに利用した。本編HTML・IndexedDB・時計・部隊正本へは未接続。P0の保存接続であり、自律政治・兵役・補給・戦争を実装したものではない。

## 呼出側の例
```js
import {createPeopleMilitarySession} from './src/politics-military/people-military-session.mjs';
const session = createPeopleMilitarySession({
  worldKey: canonicalWorldKey, // 世界正本の識別子。Seedだけで生成しない
  people,
  savePeople: WohPeople.peopleSave,
  loadPeople: WohPeople.peopleLoad,
  resolveUnit: (id, targetPeople) => canonicalUnitRegistry.get(id),
  authorize: (command, targetPeople) => checkCanonicalAuthority(command, targetPeople)
});
const snapshot = session.save();
// 型付き配列を保持するIndexedDB等で、この人口セクションを一度に保存。
// 全世界の保存は、呼出側が時計・部隊・経済・地理等と同じトランザクションに含める。
const restoredPeople = session.restore(snapshot);
// 成功した場合だけ、呼出側の正本参照もsession.peopleへ交換する。
```

sessionは世界ごとに1個。execute/assignments/pendingEvents/acknowledgeEvent/revisionは配属台帳を使う。部隊や権限を保存するものではなく、resolveUnit/authorizeは必ず渡されたtargetPeopleと同じ世界状態を参照する。旧peopleへのクロージャ参照を使わない。ポートは同期・読取専用。ロードは新しい独立したpeopleを返す。セッション再入による復元・書込は拒否する。

## 保存と復元
- envelope形式 `woh.people-military`, version1。worldKey、人口のn/day/seed/rng/checksum、既存peopleSaveの結果、軍事sidecarを含む。
- peopleSaveのmetaには人物統計や集落・民族への参照が残るためstructuredCloneで分離する。返した保存は以後の在庫・死亡・民族変更等で変化しない。
- peopleLoadは入力groupsを更新するため、入力を複製してから呼ぶ。候補人口を構築し、メタデータと軍事参照を検証し、成功時だけ人口と台帳を同時交換。失敗時はセッションの元の人口・台帳を保持する。
- n/day/seed/rng/checksumは読込不整合の検出用。改ざん認証・全データの暗号学的整合検証ではない。既存peopleLoadの保存スキーマ全項目検証を置き換えない。
- 人物0・死亡者のIDもそのまま保存。死亡は人口側の状態を読む。軍事側で死亡処理・新規人物生成・復活を行わない。死亡した配属者はalive:falseで返し、任務参加者に計上してはならない。
- 旧人口保存は `session.restoreLegacyPeople(legacyPeopleSnapshot)` で明示読込。世界IDが無いので、呼出側が対象世界を確認した場合だけ使う。軍事台帳は空で開始する。未知の新形式を旧形式へ自動変換しない。
- 単純なJSON.stringify/parseは型付き配列を失うため不可。既存のJSON用型付き配列エンコーダを使用するか、IndexedDB/structuredClone/v8等の保存方法を使う。本機能に新規JSONエンコーダは含まれない。

## 未接続と制限
全世界の原子的な復元、ストレージ書込、worldKeyの永続化、部隊正本と権限の復元、人口以外の会計/地理/歴史、思想通知は未接続。旧セーブ移行で別世界を自動判別しない。外部ポートが正本を書き換える副作用は契約違反であり、外部副作用までロールバックする機能ではない。

本編はapplyStateでnpc.dayをclock.dayへ後から代入する。正式統合ではその前に時計と人口・軍事の保存日を検証する必要がある。実位置・職業は配属によって変更しない。復元後はsession.peopleを正本として採用し、別途保持している旧世界参照を使い続けない。

## 検証
新規13件：実peopleSave/peopleLoad往復、人物0、死亡状態・死亡統計不変、在庫/民族/配列の保存分離、入力不変、破損sidecar・異世界・時計/人数/乱数不一致の全件拒否、outbox再送、復元後の対象peopleでの権限確認、旧人口保存、60日stepDayの決定性、再入・非同期ポート拒否。
60日の試験は人口の直接stepDayによる短期継続。peopleMonthlyや世界全体の60年/100年シミュレーション、人口減少原因の検証ではない。

既存回帰：tests配下全45件合格（交通11・人物参照6・配属15・本保存接続13）、npc/test-battle.js 35件合格、npc/test-durability.js全チェック合格。単一エージェントの自己レビューであり独立レビューは未実施。結果はpeople-military-save-validation.jsonへ保存。公開中のP0b試験画面は未変更。
