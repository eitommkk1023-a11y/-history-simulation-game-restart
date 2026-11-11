# 人物命令の伝達・実行接続 P3a

## 現在動く範囲
実在人物ID・常設配属・部隊正本への参照を使う任意利用の命令台帳。発信、配送中、到達、理解、実行依頼、完了を分ける。紛失、誤解、拒否、実行不能を別に記録する。部隊・伝令・人物・資源を生成しない。固定の軍階級、服従率、伝令速度、時間換算を追加しない。

本編の政治AI・NPC伝令・個人の移動/労働・戦争・思想・歴史・IndexedDBへの接続は未実施。P0cの人口/配属保存に命令を自動追加したわけではない。ブラウザの既存P0b試験画面は今回変更しない。

## 接続
```js
const orders = createOrderLedger({
  worldKey,
  people,                  // Population正本を保持する既存people
  assignments: session,    // P0cセッション、または既存配属台帳
  resolveUnit,
  authorize: request => checkAuthority(request),
  readDelivery: request => transport.readReceipt(request),
  interpret: request => receiver.interpretDeliveredOrder(request),
  assessExecution: request => receiver.assess(request),
  readExecution: request => worldActions.readReceipt(request)
});
orders.issue({orderId,issuerId,recipientId,unitId,instruction});
orders.step(orderId);       // 世界の論理更新から呼ぶ。描画/プレイヤー入力に依存させない
```

すべてのポートは同期・読取専用。実行中のコールバックから再入書込を拒否する。instructionは非空文字列の伝達内容であり、任意のコードを評価しない。本段階で自然言語の自動解釈器はない。各正本はworldKeyと対象人物/部隊を検証して応答する。

配属元はisBoundTo(worldKey,people)で世界ID・peopleオブジェクト・Population正本が同一である必要がある。人口やセッションがロードで差し替わったら古い命令アダプターは使用せず、同じ保存単位から作り直す。

## 状態とポート契約
1. `issue` は発信者/受信者の実在・生存、受信者の配属、部隊、`authorize({...,phase:'issue'}) === true` を検証する。成功したorderIdは同じ内容なら再送扱い、別内容なら拒否。発信時点で相手に情報が届いたとは扱わない。
2. `deliveryRequests()` は未到達命令の依頼。transportはdeliveryKeyを重複排除して既存の伝達手段へ割り当てる。依頼を読むだけでは伝令を作らず、人物を移動しない。
3. `readDelivery` は `{status:'in-transit'|'arrived'|'lost',worldKey,orderId,recipientId,deliveryId,dispatchedDay,receivedDay?,lostDay?}` の正本事実を返す。台帳はissued→dispatched→received/lostの順を検証する。予定日・経路の試算だけでは到達にならない。失われた記録や未接続はnull/`{status:'pending'}`として待機。異世界・別宛先・別伝令・未来の到達事実を拒否する。
4. `interpret` は到達後のみ呼ぶ。`{status:'understood'|'misunderstood',instruction}` またはpending。原文は保持し、受信者の解釈を別のunderstoodInstructionに記録する。誤解は本段階の終端として記録し、勝手に原文へ補正したり実行したりしない。誤解した内容での実際の行動・訂正交渉は後続の接続課題。
5. `authorize({...,phase:'execute'})` と `assessExecution` を別照会。後者は `{status:'ready'|'refused'|'blocked'|'pending',reason?}`。拒否/実行不能には理由が必要。権限があっても実行依頼は自動成立しない。受信者の死亡・配属解除・部隊無効を実行依頼前に再検証する。発信者の後日の死亡だけでは過去の命令を消さず、継続する権限は正本の権限ポートで判断する。
6. `executionRequests()` は理解・採択後の実行依頼。instructionには受信者の解釈を返す。executionKeyは `[worldKey,orderId,'execute']` をJSON文字列化した技術的な依頼ID。新しい人物IDではない。
7. 実行担当の正本は**現在の権限/配属/位置/健康/在庫を原子的に再検証**し、executionKeyの重複排除と実効果を同じ取引で永続化する。依頼生成から消費までに状態が変わり得る。台帳側だけで世界全体のexactly-onceを保証しない。
8. `readExecution` の `{status:'completed',worldKey,orderId,executionKey,recipientId,unitId,completedDay}` だけで完了する。正しい識別子を持つ `{status:'blocked',...,reason}` なら実行不能を記録。外部結果がない限りcompletedにしない。外部で既に実行された後の死亡・配属解除でも、完了の事実は消さず受領する。

一回のstepで状態は一段階まで進む。これは実装上の観測単位であり、各段階に一律一日の待ち時間を課す仕様ではない。世界の日時にはnpc.dayを使う。独自の秒時計や1年のプレイ時間を決めない。

## 交通の再利用
`estimateOrderRoute({geography,locate,knows,profile},order)` は既存createGeographyAdapterのrouteを呼ぶ。locate(personId,observerId)は発信者が把握している人物の位置を返し、不明ならnull。集落の中心や移住先を実位置として代入しない。knows(observerId,x,y)とprofile.baseKmHは呼出側が明示する。未知地理や河川遮断、探索打切りは既存交通APIの結果を保持する。

結果のstatus:'estimated'とhours/pathは試算。交通側の実験的な速度係数を正式仕様へ昇格させない。時間が過ぎたという理由だけで到達へ変換してはいけない。動く受信者への追跡や実伝令の位置・生存・伝達失敗は交通/人物側の接続が必要。

## 保存
形式woh.military.orders、version1。worldKey・最後の観測日・状態遷移journal。復元時は全記録を検証し、未来・二重発信・不可能な遷移・不明人物/部隊を拒否する。現在の権限/AIを実行して過去を再判断しない。get/events/依頼/saveは切り離された値を返す。

命令だけを別時点へ戻してはならない。正式統合では人口・配属・部隊・実行正本の重複排除台帳・配送記録と同じ保存単位でロードする。P0cセッションへの原子的な組込は今回の範囲外。ロード後は全候補の検証成功時だけアクティブ参照へ交換する。journalは長期履歴の正本へ未配信で、圧縮・容量上限もP7で要検討。

## 検証と証拠の限界
実Population・実配属台帳を使用。NPC役のfixtureが発信→配送記録→理解→判断→実配属解除APIへ依頼→結果確認を進める。プレイヤー入力はないが、配送・判断は試験用の明示データであり、本編NPCの自律意思決定/実歩行を実装した証拠ではない。

配属解除を実行直後、命令台帳の結果受領前に中断する試験では、両台帳を保存・復元後に同一executionKeyを再送し、解除を二重適用せず正本の結果から命令を完了できる。人口・職業・RNG・死亡統計は不変。全世界の60年/100年・実機・遠近切替・本編UIは未試験。
