# Bellona (1760) モデル — Codex 製ビューアーから取り込んだ資産

取り込み元: Codex が作成した「World of History · Bellona 1760 study(船内試作05)」ビューアー(単体HTML、three.js r128)。
中身を取り出して、このフォルダに置いた(ビューアー本体は取り込んでいない)。操船・戦闘の機能は含まれていない(ビューアーの表記)。

| ファイル | 内容 |
|---|---|
| bellona-lod0-near.glb | 外観・近距離(約5.1万三角形、107メッシュ)。船体・甲板・砲門・帆装・帆・舵(`rudder_pivot`)・帆桁・舵輪(`wheel_pivot`)・衝突用の箱(`collision_proxies`) |
| bellona-lod1-mid.glb | 中距離(約2.8万三角形) |
| bellona-lod2-far.glb | 遠距離(約5.6千三角形) |
| bellona-interior.glb | 船内(約6.3万三角形、画像4枚付き、3.6MB) |
| bellona-layout.json | 船内の配置:8つの床(hold/orlop/lower/upper/quarter/fore/poop/head)、階段7、部屋26、障害物440、窓20、落下防止136、船体の水除外輪郭(`waterExclusion`) |
| ship-walk-reference.js | ビューアーの船内歩行(床の高さ・階段・障害物の衝突)のコード。参考用 |

座標: 単位メートル、X=右舷、Y=上、-Z=船首。砲列甲板の長さ 51.21 m(ビューアーの表記)。基準人型 1.7 m。
史料の位置づけ: レイアウトは `provisional fit-out informed by shared design and general 74-gun arrangements; exact compartment assignments unverified`(暫定。区画の割り当ては未検証)。
砲は見た目だけの仮の形(`caliber_note`: 年代の砲身寸法は未確認)。
