# 世界正本への一括保存・復元接続（P3b）

## 状態と正本
監督の一括保存指示に基づく任意利用の接続。政治軍事の別世界を作らない。src/persistence/world-checkpoint.mjsは世界担当が所有する保存処理へ登録する検証ゲートで、世界セーブの最終スキーマを決定するものではない。世界本体の人口・集落・民族・建築・経済・位置・配送・取引結果はworld参加部品がまとめて持つ。military参加部品は既存人物/部隊のID参照・配属/命令履歴だけを追加する。

現行HTML・IndexedDB・公開ゲームには未接続。既存peopleSave/peopleLoadを実試験で使用し、本編ファイルを変更していない。旧セーブに新拡張を黙って混ぜたり、現行ゲームの正本を別形式へ置換したりしない。

## 世界担当の接続例
```js
const military = createMilitaryCheckpointParticipant({
  worldKey: canonicalWorldKey,
  resolveUnit: (id, candidateWorld) => candidateWorld.units.get(id),
  authorizeAssignment: (command, candidateWorld) => authority.check(command, candidateWorld),
  orderPorts: candidateWorld => bindCanonicalOrderPorts(candidateWorld)
});
const gate = createWorldCheckpoint({
  worldKey: canonicalWorldKey,
  world: {world: currentWorld, military: military.bind(currentWorld)},
  participants: [
    {
      id: 'world', version: WORLD_COMPONENT_VERSION, dependsOn: [],
      save: root => worldOwner.save(root.world),
      restore: snapshot => worldOwner.stage(snapshot)
    },
    military.participant
  ],
  getDay: root => root.world.clock.day,
  validate: root => worldOwner.validate(root.world) && military.validate(root)
});
const snapshot = gate.capture(canonicalCheckpointId);
// 世界のストレージ担当が、この全体を一つのIndexedDB取引等で書く。
gate.restore(snapshot);
// 成功した場合だけ、世界全体の正本参照をgate.currentへ採用する。
```

worldOwner.stageは新しい独立した候補を返す。既存のapplyStateは途中でグローバル時計・人口等を書き換えるため、候補の構築には呼ばない。型付き配列を維持するpeopleSave/peopleLoad等はそのまま利用できる。所有者のシリアライザーが既存拡張を保存し続けるため、政治側が知らない建築/民族/地理の項目を選別・再生成しない。初期状態もロード状態も世界所有者が検証する。シミュレーションは保存/ロードの同期区間に割り込ませない。

## 全件検証とコミット
- 依存関係順に参加部品を構築。欠落/未知部品、世界ID、部品バージョン、共通checkpointId/day、依存循環、非同期ポート、世界時計の不一致を拒否する。
- 全入力はstructuredCloneで分離。peopleLoadによる入力変更を元の保存へ波及させない。候補がactive正本と共有する可変オブジェクト/Map/ArrayBufferも拒否する。
- 世界全体の検証がtrueになるまでactive参照を替えない。失敗時には人口だけ/時計だけ/在庫だけの部分適用を行わない。通信やディスク書込をこの途中で起こさない。
- military.validateは配属が同じ候補peopleを参照すること、命令が参照する配送のworldKey/宛先/伝令ID/日時、および実行結果の識別子が一致することを検証する。世界担当はさらに人口・建築・在庫・交通の各正本を検証する。
- checkpointIdは世界担当の保存ID。住民や船のIDとして流用しない。同じゲートでの再利用を拒否する。最終的な保存バージョン/移行は世界担当が決める。未知の形式やP0c/P3a単独保存を自動的に完全セーブとみなさない。
- 同期のsave/stage/validateはactiveに副作用を起こさない契約。任意のコールバックが外部やactiveを書き換える悪意ある副作用まで自動ロールバックする仕組みではない。

## 伝令の実移動：世界交通の任意利用部品
src/transport/courier-state.mjsは実Populationの人物IDと世界交通の位置Mapを参照する。別の伝令住民を生成しない。位置の初期値は既存の物理位置を世界側から与え、集落中心を人物位置へ勝手に代用しない。試験では初期位置を明示した隔離世界を使う。本編の全NPCに物理位置が接続済みとは扱わない。

世界所有のstateはpositions/deliveries/cargo/movementReceiptsおよびtravelClockHoursを含む。既存geography.routeで既知の経路を求め、経路の区間と区間途中の経過時間で人物の実座標を進める。明示のprofile.baseKmH、knows/knowsTarget、authorizeが必要。同じ人物に複数の進行中任務を割り当てない。

travelClockHoursは世界スケジューラーが提供する累積移動時間。日から何時間へ変換するかを本モジュールで決めない。advanceは利用可能な時間だけを消費し、区間/位置/消費した時刻範囲とoperationIdを同時記録する。ロード後の再送も、IDを変えた同じ時間の再消費も防ぐ。保存時の区間進捗、座標、伝令本人、速度プロファイル、時間履歴を相互検証する。

到達は実際の座標一致で判定する。経路が遮断された、伝令が死亡した、受信者が移動した場合に予定時刻だけで到達させない。受信者移動時は経路終点でinterruptedとなり、readDeliveryは配送中として返す。自動追跡/再経路探索や命令の喪失・救出判断は未実装。新しい天候・疲労の計算式を追加せず、既存経路係数は実験値のまま扱う。

## 実食料移転：世界経済の任意利用部品
src/economy/food-transfer.mjsは既存people.groupsのg.food（総kg）/fresh/dried（内訳）を直接参照する。耐久食料はfood-fresh-driedの派生量として扱い、別の在庫を足さない。輸送中は集落から減り、同じ実人物IDの世界交通cargoへ移る。荷下ろし時はcargoから実在庫へ移る。個別ロットIDのある物資を代替IDで複製するものではない。

transfer({worldKey,operationId,actorId,from:{kind:'community'|'cargo',id},to,foodKind:'fresh'|'dried'|'durable',kg})。
- 行為者は生存する実人物。積み元・積み先・行為者が同じ実座標にいる必要があり、距離だけの自動配送をしない。
- authorizeは世界の権限を照会し、明示trueだけ許可。容量は世界側のcargo.capacityKgを参照し、勝手な軍用容量や無限資源を与えない。
- 在庫・内訳・容量・書込可能性を検証してから、両在庫と世界経済receiptsのoperationIdを同期反映する。失敗は再減算しない。同じID/同じ内容の再送は過去結果、別内容のID再利用は拒否。
- 同一cargoオブジェクトを異なる人物の在庫に二重登録した状態、未知人物、負在庫、総量と内訳の矛盾を拒否。死亡者の積荷は存在を保持し、所有者死亡だけで消さない。回収には別の生存行為者と権限が必要。
- 経済の生産・腐敗・消費・他物資や資金は作り直さない。現段階は食料の局地移転のみ。水/飼料/弾薬/一般資源の補給、軍隊全体の配給・徴発制度は未接続。

命令実行担当は、命令のexecutionKeyを対応する食料操作のoperationIdとして永続化できる。食料効果が先に完了し命令結果の受領前に中断しても、同じキーを再送して以前の実行日を返し、命令を完了できる。任意の複数ハンドラーを跨ぐ全世界の実行原子性は、世界の実行ディスパッチャーの責任として残る。

## 指示6項目の証拠
|監督の確認事項|今回の検証|
|---|---|
|人口・配属・命令・伝令・補給の整合|実peopleSave/Load、実配属/命令、世界交通/積荷/経済取引結果を同じゲートで保存・復元|
|二重実行しない|配属解除/積載/荷下ろし/移動の再送、効果コミット直後・命令結果受領前の復元|
|伝令途中から再開|端点間の小数座標・区間途中の時間を保持し、継続側とロード側の到達・在庫が一致|
|一部不正なら既存状態維持|不正進捗、別世界/別宛先、欠落部品、重複所有、負在庫、読込途中の例外、activeメモリ共有を拒否|
|人物・物資の重複計上なし|実人口6人のまま。食料は集落＋積荷の合計120kgを保持。人物の二重任務と積荷の二重所有を拒否|
|Claude側正本との整合|既存人口シリアライザーを利用。民族ID・建築ID・集落在庫と既存拡張を保持。正本4ファイルは未変更|

最初の保存ゲートは82件通過後に伝令/補給開発へ進んだ。最終結果はworld-checkpoint-validation.jsonに記録。60人口日だけの継続再現試験であり、60年/100年の全世界試験ではない。

## 未接続・残る境界
本編HTML/IndexedDB/全グローバル参照の原子的採用、正式worldKeyと旧セーブ移行、世界時計から移動時間への正式接続、人口の労働/軍務の配分、移動中の健康/食事/腐敗、伝令の3D表示、AIによる伝令人選・補給量の決定は未接続。試験用の権限true・既知地理true・速度1km/h・容量15kgはfixture値であり正式なゲーム仕様ではない。これらを本編へそのまま既定値として投入しない。
