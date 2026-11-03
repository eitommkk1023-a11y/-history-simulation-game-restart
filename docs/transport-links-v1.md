# 交通施設の地形接続試作 v1（未統合）

対象: `feature/transport-links-v1` ブランチ。自然地理生成器のHTMLと既存の世界生成コードには変更を加えず、地形配列の上に道路・橋・浅瀬・渡し場の**交通ネットワーク情報**を重ねる。

## 追加・変更したファイル

- `src/transport/transport-network.mjs`: 道路（road）と横断施設（bridge, ford, ferry）の経路、利用モード、荷重条件、状態、保存・復元。
- `src/transport/geography-adapter.mjs`: 既存の地理配列を読む経路探索へ上記レイヤーをオプション接続。
- `tests/transport-network.test.mjs`: 新規18件。従来の11件と合わせ計29件のNodeテストをローカルで確認。

## 使用する地理情報

現行の自然地理生成器では `window.__geo.world` から `elev`（標高）、`type`（海陸）、`water`（0なし/1河川/2湖）、`biome`（土地特性）を取得できる。既存地理データを直接変更せず、**経路ごとの追加データ**として施設の状態を保存する。

## 使い方（例：合成された3×1の地形）

```js
import { createTransportNetwork } from './src/transport/transport-network.mjs';
import { createGeographyAdapter } from './src/transport/geography-adapter.mjs';
const world = {
  type: Uint8Array.of(1, 1, 1),
  water: Uint8Array.of(0, 1, 0), // 中央セルが川
  elev: new Float32Array(3),
  biome: new Uint8Array(3).fill(5),
};
const grid = { width: 3, height: 1, kmPerBlock: 1 };
const infrastructure = createTransportNetwork(world, grid);
const navigation = createGeographyAdapter(world, { ...grid, infrastructure });
const route = () => navigation.route({ x: 0, y: 0 }, { x: 2, y: 0 }, {
  knows: () => true,            // 本来は個人別の知識台帳から取得
  knowsFacility: () => true,    // 本来は施設の認知状況から取得
});
route().status; // 'unreachable'
infrastructure.add({
  id: 'bridge-1', kind: 'bridge',
  path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
  allowedModes: ['foot', 'cart'], maxLoadKg: 1000,
});
route().status; // 'ok'
infrastructure.update('bridge-1', { status: 'destroyed' });
route().status; // 'unreachable'
infrastructure.update('bridge-1', { status: 'open' });
route().status; // 'ok'
const save = infrastructure.snapshot();
const restored = createTransportNetwork(world, { ...grid, snapshot: save });
```

## 既存仕様との整合性

- 道路の4階層 `level: 1..4` は交通上の重要度。**重要度そのものは移動速度を変更しない。**
- 地形・道路状態からの移動速度は引き続き別計算。試験用 `speedFactor` だけを追加したが、この係数をゲームの確定仕様として扱わない。
- 河川横断は、現段階では川・湖を挟む陸上セル間の明示的なリンクで表現する。橋の破壊、渡し場の運休などは経路の再探索に反映される。
- 地理情報の制約（`knows`, `knowsFacility`）、権限・通行制限（`canUse`）、運搬方法・荷重（`mode`, `loadKg`）は呼出側から与える。
- 閉鎖道路も、法令で土地そのものが封鎖されない限り、周辺の自然地形を歩くことまでは機械的に禁止しない（この判定は別システム）。
- 通行施設の状態は元の地形データと別に保存。地形が変わって使用不能になった古い橋も、記録としては保存・復元できる。

## 現在の制限（重要）

1. **自然地理生成器の3D画面には未接続。** マップ上の視覚的な道路や橋の建設・破壊アニメーションは存在しない。
2. 現在の1セルは約3.33kmで、橋幅や地形勾配の細部を再現できない。**セル単位の橋・渡し場は広域ナビ用の抽象表現**であり、実物の橋の3D形状・当たり判定ではない。
3. 川底の水深・流速などから自然渡河を判定する処理、立体的な橋脚・道路・トンネル、施設の施工段階・費用・損傷度、道路自然形成の更新処理は未接続。
4. 渡し場には`operating`フラグと`travelHours`があるが、実際の船・船頭のIDや家計とは未接続。渋滞・定員待ちはユーザー方針に従い保留。
5. 世界全体の大規模経路探索、道路ネットワークの複数解像度・LOD、100万人規模の負荷、端末上の性能は未検証。インフラ接続時は、安全な最短経路を求めるため現在はDijkstraを用い、探索に上限を設けている。
6. セーブJSONは別モジュールとして保存・復元可能だが、既存のIndexedDB/エクスポート形式への追加はしていない。ロード時は同一世界（同一Seed、同一縮尺）の配列を呼出側で提供する必要がある。
7. 人口・経済・建築・軍事の本体実装との統合は未完了。施設使用権、渡航許可、金銭徴収等の判断は外部コールバックに任せている。

## 検証

```sh
node --test tests/geography-adapter.test.mjs tests/transport-network.test.mjs
```

**29/29成功（ローカル実行）。** GitHub ActionsなどのリモートCIは未実行。新しいゲーム仕様を確定する変更ではない。
