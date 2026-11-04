from pathlib import Path
import json,html,base64,shutil,zipfile,hashlib
D=Path('validation/rocks'); L=Path('/workspace/library-files');L.mkdir(exist_ok=True)
rs=json.loads((D/'experiments.json').read_text());catalog=json.loads((D/'rock-catalog.json').read_text());worlds=[json.loads((D/f'world-{s}-new.json').read_text()) for s in [12345,67890,314159]];browser=json.loads((D/'browser.json').read_text());repro=json.loads((D/'reproducibility.json').read_text())
md=[];out=[]
def p(text):md.append(text+'\n');out.append('<p>'+html.escape(text)+'</p>')
def sec(n,title):md.append(f'## {n}. {title}\n');out.append(f'<h2>{n}. {html.escape(title)}</h2>')
def table(head,rows):
 md.append('| '+' | '.join(map(str,head))+' |\n| '+' | '.join(['---']*len(head))+' |\n'+'\n'.join('| '+' | '.join(str(v).replace('|','/') for v in row)+' |' for row in rows)+'\n');out.append('<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(str(x))+'</th>' for x in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>')
def pic(name,caption):
 f=D/'images'/name
 if not f.exists():return
 if name in ['height-comparison.png','height-difference-from-A.png','geology-comparison.png']:md.append(f'![{caption}](../validation/rocks/images/{name})\n')
 else:md.append(caption+'：配布した単一HTML報告書と検証ZIPに収録。\n')
 out.append('<figure><img src="data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode()+'"><figcaption>'+html.escape(caption)+'</figcaption></figure>')
def num(v):
 if isinstance(v,str):return v
 if abs(v)>=1e6 or (v!=0 and abs(v)<.001):return f'{v:.5g}'
 return f'{v:.5f}'.rstrip('0').rstrip('.')
def val(r,key):
 v=r['metrics'][key];d=r['deltaFromA'][key];return num(v)+' / Δ '+num(d['absolute'])+(' / '+f"{d['percent']:+.2f}%" if d['percent'] is not None else ' / 率なし')
def get(kind,name):return next(r for r in rs if r['kind']==kind and r['name']==name)
p('World of History v30 — 岩石・地層・山肌 統合実装報告（2026-11-04）')
p('単一エージェントで実装・検証。作業ブランチ codex/terrain-query-v1。mainへの変更・マージ・Web公開は行っていません。生成バージョン12 / rock-24-v1。実験の数値はソース世界のSI単位です。ゲーム画面の縮尺へ変換した値ではありません。')
sec(1,'実装した機能と変更ファイル')
p('24岩種の共通カタログ、形成条件に基づく地質区分、有限厚の地層、実効物性、地表流出・浸透・地下水、風化・侵食・溶解・固体土砂の運搬堆積、実標高の更新、露出層、岩肌模様、4種類の地質表示を世界生成へ接続しました。計算は生成時だけ実行します。既存の地殻変動→気候→河川・湖→資源などの処理は残しています。岩石による変形後には気候を再計算し、既存の河川・湖生成に新しい標高を渡します。')
table(['ファイル','役割'],[['src/rocks/catalog.mjs','24岩種・基本値・地域条件からの実効物性'],['src/rocks/layers.mjs','6層の岩柱・傾斜・褶曲・断層・露出更新'],['src/rocks/evolution.mjs','保存則を持つ2.5Dの地質年代計算と計測'],['src/rocks/world-rocks.mjs','既存地質/気候からの条件抽出・実標高反映・共通参照'],['src/rocks/rock-material.mjs','岩肌・鉱物/風化/湿潤/層理模様・診断表示'],['tools/integrate-rocks.mjs / build-integrated-world.mjs','Worker・保存世代・UI・単一HTMLの統合'],['src/integration/playable-scale.mjs / third-person.mjs','同じ標高/岩石を俯瞰と三人称から使用'],['src/vegetation/grass-placement.mjs','表土が薄い露岩への草の抑制'],['src/development/developer-tools.mjs','岩肌の確認地点・上から下への地層情報'],['tests/rocks*.mjs / *.cjs, tools/rock-*.mjs, rock-*.py','数値実験・互換性・GPU照合・再現可能な計測と報告']])
sec(2,'24岩種と物性の反映先')
p('密度・圧縮/引張強度・空隙率・基質透水性は幅を持つ代表値です。割れ目・風化・含水・温度・地層傾斜は地域側の別配列で保持します。強度低下、割れ目の三乗則による透水性増加、Darcy則に基づく透水係数、湿潤/凍結/熱拡散に依存する風化を計算します。侵食耐性は機械侵食率の分母へ、密度は土砂/岩盤の質量変換へ、溶解性と反応速度は溶解物の供給上限へ使います。層理と傾斜は侵食の方向依存性とMohr-Coulomb型の安全率に使います。硬度は記述用の参考物性として保持し、岩盤強度の代用にはしていません。鉱物組成は結晶粒の明暗・長石の色味・雲母/粘土の暗部・含鉄鉱物の風化色に反映します。')
p('下表は基本値。単位は密度kg/m³、強度MPa、空隙率は体積比、透水性κはm²、風化はm/年、溶解性はkg/m³です。侵食耐性・風化速度・反応速度・損傷低下係数はゲームモデルの未校正パラメータです。すべてを24岩種別の実測値と主張するものではありません。全項目は同梱 rock-catalog.json にあります。')
table(['ID/岩石','密度','Mohs','UCS','引張','空隙率','基質κ','耐性','風化速度','溶解性','形成条件'],[[str(r['id'])+' '+r['name'],str(r['densityKgM3']),str(r['hardnessMohs']),str(r['ucsMPa']),str(r['tensileMPa']),str(r['porosity']),str(r['matrixPermeabilityM2']),r['erosionResistance'],r['weatheringMPerYear'],r['solubilityKgM3'],r['formation']] for r in catalog])
p('文献の参照範囲：岩石試料のUCSの代表的な大小関係はRockmassの試験集計表と照合しました。USGSの空隙率・密度/熱物性の報告は条件依存性を考慮するための参考です。蒸発岩の溶解には水と流出経路が必要というUSGSの整理に合わせ、濡れたら無条件に消す方式は採用していません。今回はpH・CO₂・イオン活量まで解く反応輸送モデルではありません。')
refs=[('Rockmass: 試料の一軸圧縮強度の集計','https://rockmass.net/files/strength_and_deform_values%20.pdf'),('USGS Manger: Porosity and bulk density of sedimentary rocks','https://pubs.usgs.gov/publication/b1144E'),('USGS Robertson: Thermal properties of rocks','https://pubs.usgs.gov/publication/ofr88441'),('USGS Johnson: Evaporite dissolution','https://www.usgs.gov/publications/subsidence-hazards-due-evaporite-dissolution-united-states')]
for name,url in refs:md.append(f'- [{name}]({url})');out.append('<p><a href="'+url+'">'+html.escape(name)+'</a></p>')
sec(3,'A〜Dの比較実験')
p('4地形とも32×32、格子40m、Seed1729、1万年・64ステップ。実験ごとに初期入力のSHA-256を照合しています。入力標高・降水・気温・初期水分/地層・境界条件・計算法を固定し、流路・地下水・露出の変化は結果として許しています。周囲と海への境界は開放。地表の流路は窪地をpriority floodで排水可能にし、岩盤を上り坂へ削る計算は行いません。世界全体の20万年・32ステップとは格子規模が異なり、小さな地形には短い時間刻みを使っています。')
table(['実験','唯一の変更'],[['A','固有の全物性'],['B','岩石名/層位置を維持し、地形に働く基本物性を全岩種共通の中間値に統一'],['C1/C2','対象岩種の侵食耐性だけ1.5倍 / 1÷1.5倍'],['D1','実効透水性だけ全岩種2倍'],['D2','石灰岩ID12の溶解性だけ2倍（反応速度上限は固定）'],['D3','傾斜角25°・方向90°だけに変更。互層では初期地表IDが750/1024セル変化']])
table(['地形 / Cの対象','A 対象の機械侵食(Mkg)','C1','A比','C2','A比'],[[kind+' / '+catalog[t]['name'],num(get(kind,'A')['metrics']['mechanicalBedKgByRock'][t]/1e6),num(get(kind,'C1')['metrics']['mechanicalBedKgByRock'][t]/1e6),f"{(get(kind,'C1')['metrics']['mechanicalBedKgByRock'][t]/get(kind,'A')['metrics']['mechanicalBedKgByRock'][t]-1)*100:+.2f}%",num(get(kind,'C2')['metrics']['mechanicalBedKgByRock'][t]/1e6),f"{(get(kind,'C2')['metrics']['mechanicalBedKgByRock'][t]/get(kind,'A')['metrics']['mechanicalBedKgByRock'][t]-1)*100:+.2f}%"] for kind,t in [('contact',0),('alternating',9),('limestone',12),('fractures',0)]])
p('Cでは対象岩種の侵食の増減が4地形すべてで予想する向きになりました。ただし領域全体の標高差や総侵食量は、下位層の露出、表土の保護、流路・堆積の変化も含むため、対象岩種だけの値と比例しません。Bの均一化でも、必ず侵食が増えるという前提は置いていません。')
table(['地形','D1 浸透のA比','D1 表面流出のA比','D2 溶解のA比','D3 初期ID変更','D3 流路変更割合'],[[k,f"{get(k,'D1')['deltaFromA']['infiltrationM3']['percent']:+.2f}%",f"{get(k,'D1')['deltaFromA']['surfaceRunoffM3']['percent']:+.2f}%",f"{get(k,'D2')['deltaFromA']['dissolvedKg']['percent']:+.2f}%",str(get(k,'D3')['initialIdChanges'])+'/1024',f"{get(k,'D3')['flowReceiverChangedFraction']*100:.2f}%"] for k in ['contact','alternating','limestone','fractures']])
p('D1は浸透を増やし地表流出を減らします。地下へ入った水は保存量と基底流へ分け、消失させていません。D2では湿潤/乾燥石灰岩の溶解量がほぼ2倍になりました。他の3地形には対象の石灰岩がないため差は0で、差を演出する補正は入れていません。D3の互層では初期岩石分布も変わるので「同じ岩種で傾斜だけの力学効果」とは解釈できません。明示柱を持つ他の地形では初期IDは同じで、方向依存性の影響を比較できます。')
sec(4,'標高・斜面・谷・水・土砂の数値比較')
p('各セルは「値 / Aとの差 / A比」。Aが0のとき率は出しません。谷は集水セル数8以上の流路に対し左右4セルの断面を取り、岸の平均標高からの深さと半深度の幅を求めた格子上の代理指標です。実地の谷幅の測定やカルスト洞窟の解析ではありません。流路密度は流路セル数×格子間隔/陸面積です。')
keys=[('bedrockRemovedKg','総岩盤除去kg'),('meanElevationChangeM','平均Δ標高m'),('maxAbsElevationChangeM','最大|Δ標高|m'),('meanSlopeDegrees','平均傾斜°'),('p90SlopeDegrees','p90傾斜°'),('steepAreaFraction','35°以上割合'),('valleyMeanDepthM','谷深m'),('valleyMeanWidthM','谷幅m'),('channelDensityPerM','流路密度1/m'),('infiltrationM3','浸透m³'),('surfaceRunoffM3','地表流出m³'),('dissolvedKg','溶解kg'),('sedimentDepositedKg','累積再堆積kg'),('solidExportedKg','固体域外流出kg')]
for kind in ['contact','alternating','limestone','fractures']:
 out.append('<details><summary>'+kind+' — 全数値比較</summary>');md.append('### '+kind)
 table(['指標']+['A','B','C1','C2','D1','D2','D3'],[[label]+[val(get(kind,n),key) for n in ['A','B','C1','C2','D1','D2','D3']] for key,label in keys]);out.append('</details>')
p('質量収支は「初期表土＋岩盤から除去した質量＝最終表土＋固体域外流出＋溶解域外流出」。風化で岩盤を土へ変えた質量を二重に流出へ加えません。累積運搬/再堆積は同じ粒子の再移動を含み、正味の物質増加ではありません。溶解物は固体土砂と別に移送・域外排出します。')
p('28実験の最大相対収支誤差：物質 '+num(max(abs(r['metrics']['massRelativeError']) for r in rs))+'、水 '+num(max(abs(r['metrics']['waterRelativeError']) for r in rs))+'。NaN/無限大/負の残存層厚は数値テストで検出対象にしています。風化の表土遮蔽は局所解析式で積分し、均一な平面の1ステップ対64ステップで風化質量の一致も検証しました。')
sec(5,'岩石別侵食・露出の変化')
p('by-rock.csv に28実験×24岩種の除去質量、除去体積、平均侵食深、露出面積、そのAとの差を保存しています。平均侵食深は「その岩種が除去計算の対象になったセル（削れなかったセルも含む）」での平均で、初期の全面積で割った値ではありません。32区間の対数深度ヒストグラムは侵食イベントの分布で、地形全体の最終高度分布とは別です。experiments.json に全ビンと岩種別の機械侵食/風化/溶解を格納しています。')
for kind in ['contact','alternating','limestone','fractures']:
 a=get(kind,'A')['metrics'];rows=[]
 for r in catalog:
  i=r['id'];kg=sum(a[k][i] for k in ['mechanicalBedKgByRock','weatheredKgByRock','dissolvedKgByRock']);area=a['exposedRockAreaM2'][i]
  if kg or area:rows.append([r['name'],num(kg),num(a['removedDepthByRock'][i]*1600),num(a['rockMeanErosionDepthM'][i]),num(area),num(a['bedrockAreaM2'][i])])
 table([kind+' A 岩石','除去kg','除去m³','平均深m','露岩面積m²','表土下含む分布m²'],rows)
p('岩柱の上位層が空になると次の層へ移ります。薄い上層を除去して下の砂岩が露出するテストを通過しました。表土の下の最上位岩種も診断表示では色分けし、自然表示では表土厚と斜面に応じて岩の見える割合を変えます。')
sec(6,'比較画像と描画整合性')
for f,c in [('height-comparison.png','4地形×7実験：初期標高からの変化（ソースm）'),('height-difference-from-A.png','Aを基準とした標高差：各行で共通カラースケール。差の増幅なし'),('geology-comparison.png','実際の露出層ID。ゲーム診断表示と同じ24色'),('three-seeds.png','通常世界3Seed：岩石計算後の標高・標高変化・露出ID')]:pic(f,c)
p('GPUの1×1オフスクリーン描画を読み取り、CPUの共通岩柱参照と照合：'+str(browser['gpuIdMatches'])+'/'+str(browser['gpuIdSamples'])+'一致、全24岩種を含みます。これはサンプリングした露出ID照合であり、全画素を検査したという意味ではありません。自然色の各鉱物の見え方を科学的に同定したテストでもありません。通常材質は独立したWebGL1のテストでも、既存用4サンプラーを残した状態でコンパイルし、24IDの一致を確認しました。')
for f,c in [('rock-natural-844.png','Chromium 844×390：三人称の自然表示'),('rock-id-844.png','同じ世界の岩石診断表示'),('rock-overview-1180.png','Chromium 1180×820：既存の俯瞰表示')]:pic(f,c)
sec(7,'異なるSeedと再現性')
table(['Seed','全体秒','岩石計算秒','ピークRSS MiB','岩種数','平均/最大|Δ標高|m','質量相対誤差'],[[r['seed'],num(r['elapsedMs']/1000),num(r['rockMetrics']['elapsedMs']/1000),num(r['maxRssKiB']/1024),len(r['exposedIds']),num(r['rockMetrics']['meanElevationChangeM'])+' / '+num(r['rockMetrics']['maxAbsElevationChangeM']),num(r['rockMetrics']['massRelativeError'])] for r in worlds])
p('いずれも通常の3000×3000世界生成全体を実行しました。岩石専用のダミー地形で通常世界を代替していません。12345を同じバージョンで再生成し、標高・陸海種別・植生・水域・湖ID/水位・河川点・地域/山脈IDのハッシュ、および地層を含む全岩石TypedArrayのハッシュが一致しました。岩石配列SHA-256: '+repro['rockHash'])
sec(8,'性能・メモリ・スマホへの含意')
p('計測環境はLinuxのNode24とChromium/ソフトウェアWebGLです。秒数は計測中の環境負荷を含む観測値で、iPhone/iPadの速度やFPSの保証ではありません。ピークRSSはSeedごとの別Nodeプロセスで取得し、通常世界と検証用入力の保持を含みます。実機Safariは未検証です。')
p('岩石の常駐TypedArrayは '+num(worlds[0]['rockTypedBytes']/1048576)+' MiB、世界のTypedArray全体は約 '+num(worlds[0]['worldTypedBytes']/1048576)+' MiB。共有GPU地質アトラスは '+str(browser['atlasBytes'])+' bytes（約1.07 MiB）と288 bytesの共通パレットで、チャンクごとにコピーしません。密な全世界3Dボクセルは作っていません。既存の大きな標高/気候/水系配列が引き続きメモリの主な負担です。')
drawing=browser.get('drawing')
if drawing:
 table(['描画試験','結果'],[['条件',drawing['test']],['材質計算無効 中央値ms',num(drawing['disabledMedianMs'])],['材質計算有効 中央値ms',num(drawing['enabledMedianMs'])],['draw calls 無効/有効',str(drawing['disabledDrawCalls'])+' / '+str(drawing['enabledDrawCalls'])],['WebGLテクスチャユニット',drawing['maxTextureUnits']]])
 p('この比較は新しい共通シェーダ内の岩肌計算オン/オフで、旧ゲーム全体との厳密なA/B性能比較ではありません。小さい320×180の描画先とGPU完了待ちで測っています。実画面のゲームFPSとは分けて扱ってください。0.1ms程度の差の逆転は計測の揺らぎで、性能改善の根拠にはしません。岩石用パレット・識別色・鉱物情報を1枚へまとめ、既存の火山/気象用テクスチャと合わせたサンプラー数を抑えました。')
p('単体テスト94件成功。ブラウザの統合テストでは、元のUI・同一世界の切り替え・移動スティック・三人称接地・新セーブ再生成と座標復元を確認しました。岩石テストでは4診断モード、844×390 / 1180×820、旧保存世代の読み込みと位置復元を確認しました。ブラウザの例外/シェーダエラーは最終テストで0でした。')
sec(9,'既存機能・保存互換性と合理的な修正')
p('既存世代11は岩石計算を挿入せず再生成し、新規世界だけ世代12へ分離しました。旧保存の形式1と既存の差分適用処理を維持しています。12345の旧方式で前述9配列のSHA-256を変更前HTMLと比較し、全一致。「前の世界」に戻る履歴にも生成方式を保持します。新保存にはrockGenerationVersionを記録し、未対応の岩石世代は読み込みを止めます。')
p('元の地殻変動・河川/湖・火山・資源・シミュレーション・保存コードを削除していません。既存の火山/気象シェーダをチェーン接続し、上書きで失わないようにしました。ただし火山・資源・気候・月次シミュレーションの全操作を端末上で網羅したとは主張しません。基準HTMLのSHA-256は3fda25e31e14e0d6689f388efd3a9b0500a84a66bf397f55037a01298024d62fのままです。')
p('修正の理由：(1) ボクセルではなく粗い2.5D柱にし、世界全体を計算可能なメモリ量に抑えました。(2) 地質年代内の水は年平均の流入/流出と地下水の解析積分で扱い、数千年分を1回の水滴更新で代替しません。(3) 風化で増えた表土の遮蔽も局所解析積分にして時間刻み依存を減らしました。(4) 岩盤の侵食量は現在層の在庫・下流との高低差・運搬可能な質量で制限しました。差を大きくする補正はありません。(5) 自然材質は既存の軽量Lambert照明と手続き模様を維持し、外部PBR素材や新しい大規模描画ライブラリは導入していません。')
p('重要な収支の範囲：保存則が成立するのは粗い侵食計算格子です。その後の高解像度標高への双線形補間、海岸の陸海判定を守る標高下限、既存の河川/湖/ランドマークによる追加掘削は別段階として計測しています。この後処理を含む世界全体について「完全に物質保存」とは主張していません。resampling と nativePostprocess の値を各SeedのJSONへ残しました。')
table(['Seed','補間要求体積m³','実適用体積m³','下限保護セル数','既存後処理の岩盤除去kg'],[[r['seed'],num(r['rockMetrics']['resampling']['requestedVolumeM3']),num(r['rockMetrics']['resampling']['appliedVolumeM3']),r['rockMetrics']['resampling']['clampedCells'],num(r['rockMetrics']['nativePostprocess']['bedrockRemovedKg'])] for r in worlds])
sec(10,'未実装・未検証・制約と確認してほしいこと')
p('実装は地域規模の地質をゲームへ接続する初期モデルです。高精度な地質予測器ではありません。全3D応力、マグマの冷却PDE、化学平衡/飽和度の反応輸送、地下の洞窟・空洞崩落、風化巨岩の独立3Dモデル、継続的な地質年代侵食は対象に含めていません。')
p('岩石IDは375×375の地域格子です。ゲーム上では約266m/地質セルであり、微小な崖や河岸の各点の地層までは解像しません。地域格子の岩種境界が診断表示で四角く見える場合があります。地形の変位自体は双線形補間し、チャンクごとに別の標高を作りません。既存のLOD境界テストは成功していますが、全Seed・全境界を実機で踏査したわけではありません。')
p('既存のプレイ用縮尺（横0.01、標高1000×tanh(source/3000)）を維持しました。地質計算は元の地理の物理単位で行い、人間サイズへの既存変換を後から適用します。画面上の勾配や安全率と、ソース地質の安全率は同じ量ではありません。診断安全率は最後の地質侵食ステップの地域値で、プレイヤーの移動可能性を表す値ではありません。')
p('ゲーム開始後に既存の火山機能などで作られた新しい溶岩層を、この新しい地質年代の岩柱へ追記する処理は未実装です。既存の溶岩表示/保存経路は維持していますが、岩石診断は生成時の地域地質として扱ってください。')
p('スマホの実機のメモリ上限とFPSは未検証です。約500MiBの生成プロセスRSSが観測されるため、iOSでの安定動作を保証できません。今回、単純に世界の配列サイズを縮小する変更は加えていません。物性と侵食速度も、実世界の地形データに対する校正は未実施です。')
p('確認してほしいこと：新しい世界を生成し、開発者→岩肌・地層を確認で移動する。表示→岩石24種/侵食耐性/透水性/斜面安定性を選ぶ。同じ場所を俯瞰と三人称で見比べる。草・ダッシュ・ジャンプ・しゃがみが使え、新規保存と以前の保存を読み込めるか確認する。端末名、Seed、画面の状態が分かると不具合を絞れます。')
p('再実行：node --test --test-isolation=none tests/*.test.mjs / node tools/rock-experiments.mjs / node tools/rock-extra-metrics.mjs / node tools/rock-world-check.mjs <seed> new / node tests/rocks-material.browser.cjs / node tests/rocks.browser.cjs。HTMLビルドには検証済みThree.js r128をtools/build-integrated-world.mjsへ渡します。')
Path('docs/rock-system-report.md').write_text('\n\n'.join(md),encoding='utf8')
style='body{margin:0 auto;max-width:1100px;padding:24px;font:16px/1.75 system-ui;background:#101e2b;color:#e6eef6}h2{margin-top:45px;color:#b9deff}.scroll{overflow:auto}table{border-collapse:collapse;font-size:13px;white-space:nowrap;width:100%}th,td{border:1px solid #496174;padding:7px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#263d50}img{width:100%;height:auto;background:white}figure{margin:24px 0}figcaption{color:#b9cfe0}a{color:#9dd1ff}details{margin:20px 0}summary{cursor:pointer;background:#29495e;padding:10px}'
report='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World of History v30 岩石システム検証報告</title><style>'+style+'</style><body>'+''.join(out)+'</body></html>'
(L/'World-of-History-v30-rock-report.html').write_text(report,encoding='utf8');shutil.copyfile('exports/World-of-History-development.html',L/'World-of-History-v30-development.html')
with zipfile.ZipFile(L/'World-of-History-v30-validation.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in D.rglob('*'):
  if f.is_file() and f.suffix in ['.json','.csv','.png','.txt']:z.write(f,str(f))
 z.write('docs/rock-system-report.md','docs/rock-system-report.md')
 z.write(L/'World-of-History-v30-rock-report.html','World-of-History-v30-rock-report.html')
print('Report, standalone game and raw validation ZIP written.')
