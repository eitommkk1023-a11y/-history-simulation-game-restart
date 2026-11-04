/** Representative fresh-rock ranges, NOT universal constants or a site-calibrated model.
 * SI except MPa/Mohs/degrees. Matrix permeability excludes the regional fracture network.
 * Sources and empirical-parameter boundaries: docs/reports/rock-model-method.md.
 */
export const ROCK_PROFILE='rock-24-v1';
const rockRows=[
 ['granite','花崗岩','igneous',[2600,2750],[6,7],[100,250],[7,20],[.001,.03],[1e-21,1e-17],2.2,.00008,.001,.000002,3.1,790,8e-6,38,[177,171,163],0,{quartz:.3,feldspar:.6,mica:.1},'大陸地殻深部の珪長質マグマの緩慢冷却','block'],
 ['diorite','閃緑岩','igneous',[2700,2950],[6,7],[100,250],[8,22],[.002,.04],[1e-21,1e-17],2.3,.00009,.001,.000002,2.5,800,8e-6,37,[125,132,127],0,{plagioclase:.6,amphibole:.3,biotite:.1},'中間質マグマの深成貫入','block'],
 ['gabbro','斑れい岩','igneous',[2900,3300],[6,7],[100,300],[10,25],[.001,.025],[1e-22,1e-18],2.5,.00008,.001,.000002,2.3,850,7e-6,39,[78,88,83],0,{plagioclase:.5,pyroxene:.4,olivine:.1},'苦鉄質マグマの深部結晶化','block'],
 ['basalt','玄武岩','igneous',[2700,3100],[5.5,6.5],[80,300],[8,25],[.005,.12],[1e-20,1e-15],2.4,.00010,.002,.000003,1.8,840,8e-6,37,[61,66,67],1,{plagioclase:.5,pyroxene:.4,olivine:.1},'海洋地殻・リフト・盾状火山の苦鉄質溶岩','columnar'],
 ['andesite','安山岩','igneous',[2500,2850],[5.5,6.5],[80,220],[6,20],[.01,.15],[1e-20,1e-15],1.8,.00014,.002,.000003,2.0,820,8e-6,36,[118,115,109],1,{plagioclase:.6,amphibole:.2,pyroxene:.2},'沈み込み帯の中間質火山活動','block'],
 ['rhyolite','流紋岩','igneous',[2300,2700],[6,7],[50,200],[4,16],[.01,.18],[1e-20,1e-15],1.6,.00015,.001,.000002,2.4,800,9e-6,35,[187,155,145],2,{quartz:.3,feldspar:.6,glass:.1},'大陸火山の珪長質噴出','flow'],
 ['tuff','凝灰岩','igneous',[1500,2400],[3,6],[5,80],[.5,8],[.1,.45],[1e-17,1e-12],.6,.00040,.003,.000006,1.1,900,8e-6,30,[178,166,133],2,{glass:.6,feldspar:.25,lithic:.15},'爆発的噴火による火山灰の堆積と固結','bedded'],
 ['obsidian','黒曜岩','igneous',[2200,2600],[5,5.5],[40,150],[1,10],[.001,.03],[1e-22,1e-18],1.3,.00012,.001,.000002,1.5,800,6e-6,32,[34,32,40],3,{glass:.95,feldspar:.05},'珪長質溶岩の急冷した流紋岩溶岩縁','conchoidal'],
 ['conglomerate','礫岩','sedimentary',[2000,2700],[4,7],[20,150],[2,12],[.01,.25],[1e-17,1e-12],1.2,.00020,.002,.000003,2.1,850,8e-6,35,[151,139,117],4,{quartz:.5,lithic:.35,calcite:.15},'造山帯前縁の扇状地・河道の礫質堆積','bedded'],
 ['sandstone','砂岩','sedimentary',[1900,2650],[4,7],[20,170],[1,15],[.05,.30],[1e-17,1e-12],1.2,.00018,.003,.000004,3.0,850,10e-6,34,[183,146,98],4,{quartz:.75,feldspar:.15,calcite:.1},'陸棚・海浜・河川・砂漠の砂質堆積','bedded'],
 ['mudstone','泥岩','sedimentary',[2000,2600],[2,4],[5,60],[.3,5],[.05,.25],[1e-22,1e-18],.45,.00045,.003,.000005,1.5,900,10e-6,25,[120,112,97],5,{clay:.65,quartz:.25,calcite:.1},'静穏な湖盆・氾濫原・海盆の泥質堆積','massive'],
 ['shale','頁岩','sedimentary',[2000,2700],[2,4],[5,100],[.3,7],[.03,.20],[1e-22,1e-18],.5,.00040,.003,.000005,1.7,900,12e-6,24,[86,89,87],5,{clay:.6,quartz:.3,organic:.1},'圧密した海盆泥の薄層と剥離性','fissile'],
 ['limestone','石灰岩','sedimentary',[2200,2800],[3,4],[30,180],[2,15],[.005,.25],[1e-21,1e-15],1.4,.00010,.12,.00008,2.5,850,8e-6,35,[192,190,176],6,{calcite:.95,clay:.05},'暖かい浅海の炭酸塩堆積','bedded'],
 ['dolostone','ドロマイト岩','sedimentary',[2500,2900],[3.5,4.5],[50,220],[3,18],[.005,.20],[1e-21,1e-15],1.7,.00008,.05,.00003,4.0,870,9e-6,36,[172,168,148],6,{dolomite:.95,calcite:.05},'炭酸塩堆積物の苦灰石化','bedded'],
 ['chert','チャート','sedimentary',[2400,2700],[6.5,7],[100,300],[8,25],[.001,.08],[1e-23,1e-19],3.0,.00003,.0001,.000001,4.5,750,7e-6,39,[116,109,103],7,{quartz:.97,ironOxide:.03},'遠洋の珪質生物堆積と続成作用','bedded'],
 ['gypsum','石膏岩','sedimentary',[1800,2400],[1.5,2.5],[5,40],[.3,4],[.01,.3],[1e-22,1e-16],.25,.00035,2.4,.002,1.3,1090,20e-6,25,[215,205,188],8,{gypsum:1},'閉鎖性乾燥盆地の蒸発濃縮','bedded'],
 ['halite','岩塩','sedimentary',[2000,2200],[2,2.5],[10,50],[.3,3],[.001,.05],[1e-24,1e-20],.2,.00020,360,.01,5.5,860,40e-6,25,[214,202,199],8,{halite:1},'蒸発岩盆地の強い蒸発・塩水濃縮','cubic'],
 ['gneiss','片麻岩','metamorphic',[2600,2900],[5.5,7],[80,250],[4,18],[.001,.04],[1e-22,1e-18],2.0,.00008,.001,.000002,3.0,800,9e-6,34,[154,151,144],9,{quartz:.3,feldspar:.5,mica:.2},'大陸地殻の高温・高変成度','foliated'],
 ['schist','結晶片岩','metamorphic',[2500,2900],[3.5,6],[20,120],[1,8],[.005,.08],[1e-22,1e-17],1.0,.00025,.002,.000003,2.6,850,11e-6,25,[132,141,133],9,{mica:.5,quartz:.35,feldspar:.15},'泥質原岩の中変成度・片理形成','foliated'],
 ['slate','粘板岩','metamorphic',[2600,2900],[3,5],[40,160],[2,12],[.002,.06],[1e-23,1e-18],1.4,.00016,.002,.000003,2.2,850,10e-6,29,[82,91,99],5,{mica:.4,clay:.3,quartz:.3},'泥岩・頁岩の低度変成','cleavage'],
 ['phyllite','千枚岩','metamorphic',[2500,2850],[3,5],[20,100],[1,8],[.005,.08],[1e-22,1e-17],.9,.00024,.002,.000003,2.3,850,11e-6,25,[121,130,124],9,{mica:.5,quartz:.4,chlorite:.1},'粘板岩と結晶片岩の中間の変成度','foliated'],
 ['marble','大理石','metamorphic',[2500,2850],[3,4],[50,150],[3,12],[.001,.05],[1e-22,1e-17],1.3,.00009,.12,.00008,2.7,850,7e-6,34,[211,207,196],6,{calcite:.95,mica:.05},'炭酸塩岩の接触・広域変成','crystalline'],
 ['quartzite','珪岩','metamorphic',[2600,2800],[6.5,7],[100,300],[8,25],[.001,.03],[1e-23,1e-19],3.0,.00003,.0001,.000001,5.5,750,8e-6,40,[192,183,163],0,{quartz:.97,mica:.03},'石英質砂岩の再結晶','massive'],
 ['serpentinite','蛇紋岩','metamorphic',[2400,2800],[3,5.5],[20,150],[1,10],[.005,.12],[1e-22,1e-17],.9,.00021,.02,.00002,2.2,950,12e-6,22,[81,109,83],9,{serpentine:.85,magnetite:.1,talc:.05},'苦鉄質・超苦鉄質岩への熱水付加・蛇紋岩化','sheared'],
];
export const ROCKS=Object.freeze(rockRows.map((r,id)=>Object.freeze({id,key:r[0],name:r[1],family:r[2],densityKgM3:Object.freeze(r[3]),hardnessMohs:Object.freeze(r[4]),ucsMPa:Object.freeze(r[5]),tensileMPa:Object.freeze(r[6]),porosity:Object.freeze(r[7]),matrixPermeabilityM2:Object.freeze(r[8]),erosionResistance:r[9],weatheringMPerYear:r[10],solubilityKgM3:r[11],dissolutionKineticMPerYear:r[12],thermal:Object.freeze({conductivityWmK:r[13],heatCapacityJkgK:r[14],expansionPerK:r[15]}),joints:Object.freeze({frictionDegrees:r[16],style:r[21],referenceApertureM:15e-6}),color:Object.freeze(r[17]),pattern:r[18],minerals:Object.freeze(r[19]),formation:r[20]})));
export const ROCK_REFERENCE=Object.freeze({densityKgM3:[2400,2700],hardnessMohs:[4,6],ucsMPa:[40,120],tensileMPa:[3,12],porosity:[.02,.12],matrixPermeabilityM2:[1e-21,1e-15],erosionResistance:1.3,weatheringMPerYear:.00015,solubilityKgM3:.01,dissolutionKineticMPerYear:.00001,thermal:{conductivityWmK:2.5,heatCapacityJkgK:850,expansionPerK:9e-6},joints:{frictionDegrees:33}});
export const rockClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function effectiveRockProperties(id,conditions={},intervention={}){
 const r=intervention.uniform?ROCK_REFERENCE:ROCKS[id];if(!r)throw new RangeError('Unknown rock ID');
 const fracture=rockClamp(conditions.fracture??.3,0,1),weather=rockClamp(conditions.weathering??.2,0,1),moisture=rockClamp(conditions.moisture??.3,0,1),temperature=conditions.temperatureC??15;
 const mean=p=>(p[0]+p[1])/2,range=conditions.sample??.5,pick=p=>p[0]+(p[1]-p[0])*rockClamp(range,0,1);
 const damage=(1-.65*fracture)*(1-.7*weather)*(1-.2*moisture),porosity=rockClamp(mean(r.porosity)+.03*fracture+.03*weather,.001,.55);
 const matrix=Math.exp(Math.log(r.matrixPermeabilityM2[0])*(1-range)+Math.log(r.matrixPermeabilityM2[1])*range);
 const aperture=(2+18*fracture+8*weather)*1e-6,spacing=1/(.05+.8*fracture),fractureK=aperture**3/(12*spacing)*fracture;
 const thermalDiffusivity=r.thermal.conductivityWmK/(mean(r.densityKgM3)*r.thermal.heatCapacityJkgK),thermalStress=r.thermal.expansionPerK*20/Math.max(1e-4,Math.sqrt(thermalDiffusivity*86400));
 const freeze=temperature>-12&&temperature<5?1+moisture*.8:1;
 const targeted=intervention.targetRockId==null||intervention.targetRockId===id;
 const permeabilityM2=(matrix*(1+3*weather)+fractureK)*(targeted?(intervention.permeabilityMultiplier??1):1);
 return {densityKgM3:pick(r.densityKgM3),hardnessMohs:pick(r.hardnessMohs),ucsMPa:pick(r.ucsMPa)*damage,tensileMPa:pick(r.tensileMPa)*damage,erosionResistance:r.erosionResistance*(targeted?(intervention.resistanceMultiplier??1):1),porosity,permeabilityM2,hydraulicConductivityMPerYear:permeabilityM2*1000*9.81/.001*31557600,solubilityKgM3:r.solubilityKgM3*(targeted?(intervention.solubilityMultiplier??1):1),dissolutionKineticMPerYear:r.dissolutionKineticMPerYear*Math.exp(.025*(temperature-15)),weatheringMPerYear:r.weatheringMPerYear*(1+2*fracture+2*weather)*(.2+.8*moisture)*freeze*(1+thermalStress),frictionDegrees:r.joints.frictionDegrees*(1-.25*fracture-.2*weather),cohesionPa:pick(r.tensileMPa)*1e6*damage*.01};
}
