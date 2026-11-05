export const RPG_MENU_STORAGE='woh:prototype:rpg-menu:v1';
export const MENU_ITEMS=[
 {id:'knife',name:'青銅の短剣',category:'gear',kind:'武器',icon:'sword',weight:.8,count:1,slot:'weapon',quality:'標準',description:'旅人が護身に使う短い刃。扱いやすく、腰に下げて持ち運べる。',stat:'攻撃力 +8'},
 {id:'tunic',name:'麻の上衣',category:'gear',kind:'防具',icon:'shirt',weight:1.2,count:1,slot:'body',quality:'標準',description:'麻布で作られた軽い上衣。旅の道中でも動きを妨げにくい。',stat:'防御力 +3'},
 {id:'bread',name:'堅焼きパン',category:'food',kind:'食料',icon:'bread',weight:.3,count:5,consumable:true,quality:'保存食',description:'日持ちするよう固く焼いたパン。水に浸せば、少し食べやすくなる。',stat:'使用すると所持数が1減る'},
 {id:'water',name:'水袋',category:'food',kind:'飲料',icon:'bottle',weight:.7,count:2,consumable:true,quality:'飲み水',description:'旅のために汲んだ水。革の袋に入れて持ち歩く。',stat:'使用すると所持数が1減る'},
 {id:'bandage',name:'包帯',category:'tools',kind:'道具',icon:'bandage',weight:.1,count:3,consumable:true,quality:'手当用品',description:'傷の手当に使う清潔な布。畳んで荷物にしまってある。',stat:'使用すると所持数が1減る'},
 {id:'wood',name:'木材',category:'materials',kind:'素材',icon:'wood',weight:.5,count:6,quality:'加工用',description:'扱いやすい長さに切った木材。道具や建築の材料になる。',stat:'素材アイテム'},
 {id:'stone',name:'石材',category:'materials',kind:'素材',icon:'stone',weight:.7,count:4,quality:'加工用',description:'加工に向いた石のかけら。道具の補修や野営にも使える。',stat:'素材アイテム'},
 {id:'flint',name:'火打ち石',category:'tools',kind:'道具',icon:'spark',weight:.2,count:2,quality:'火起こし',description:'火花を飛ばして火を起こすための石。乾いた火口と組み合わせて使う。',stat:'道具アイテム'},
 {id:'rope',name:'縄',category:'tools',kind:'道具',icon:'rope',weight:.5,count:1,quality:'丈夫',description:'植物の繊維をより合わせた縄。荷物を結ぶなど、旅のさまざまな場面で役に立つ。',stat:'道具アイテム'},
 {id:'herb',name:'薬草',category:'food',kind:'食材',icon:'leaf',weight:.05,count:4,consumable:true,quality:'採れたて',description:'香りのある野草。よく乾燥させれば保存にも向く。',stat:'使用すると所持数が1減る'},
 {id:'ore',name:'銅鉱石',category:'materials',kind:'素材',icon:'ore',weight:.8,count:2,quality:'鉱石',description:'銅を含む鉱石。精錬すれば、金属の道具の原料になる。',stat:'素材アイテム'},
 {id:'leather',name:'なめし革',category:'materials',kind:'素材',icon:'leather',weight:.2,count:3,quality:'加工済み',description:'やわらかく加工した革。袋や衣服の補修に使える。',stat:'素材アイテム'},
];
export const MENU_MISSIONS=[
 {id:'camp',name:'野営の準備',type:'暮らし',status:'active',place:'旅の道中',description:'日が落ちる前に、野営に使う物資をそろえよう。まずは道具と材料を確認しておきたい。',objectives:[['木材を集める',6,8],['石材を集める',4,4]],reward:'銅貨 30枚'},
 {id:'river',name:'川沿いの道',type:'探索',status:'active',place:'川辺',description:'川の流れに沿って進めば、人が暮らす場所へたどり着くかもしれない。地図で周囲を確かめよう。',objectives:[['川辺の情報を集める',0,1],['安全な道を見つける',0,1]],reward:'探索の手がかり'},
 {id:'first',name:'旅のはじまり',type:'物語',status:'done',place:'出発地点',description:'身支度を整え、新しい土地へと歩き始めた。これから先の道は、自分で選んでいく。',objectives:[['旅の支度をする',1,1]],reward:'受取済み'},
];
export function freshMenuState(){return {version:1,counts:Object.fromEntries(MENU_ITEMS.map(i=>[i.id,i.count])),equipment:{weapon:null,body:'tunic'},tracked:'camp'};}
export function restoreMenuState(raw){const state=freshMenuState();if(!raw||raw.version!==1)return state;for(const item of MENU_ITEMS){const q=raw.counts?.[item.id];if(Number.isInteger(q)&&q>=0&&q<=999)state.counts[item.id]=q;}for(const slot of ['weapon','body']){const id=raw.equipment?.[slot];if(id===null||MENU_ITEMS.some(i=>i.id===id&&i.slot===slot&&state.counts[id]>0))state.equipment[slot]=id;}for(const slot of ['weapon','body'])if(state.equipment[slot]&&state.counts[state.equipment[slot]]<1)state.equipment[slot]=null;if(raw.tracked===null||MENU_MISSIONS.some(m=>m.id===raw.tracked&&m.status==='active'))state.tracked=raw.tracked;return state;}
export function menuWeight(state){return MENU_ITEMS.reduce((sum,i)=>sum+i.weight*state.counts[i.id],0);}
export function useMenuItem(state,id){const item=MENU_ITEMS.find(i=>i.id===id);if(!item?.consumable||state.counts[id]<1)return false;state.counts[id]--;return true;}
export function equipMenuItem(state,id){const item=MENU_ITEMS.find(i=>i.id===id);if(!item?.slot||state.counts[id]<1)return false;state.equipment[item.slot]=state.equipment[item.slot]===id?null:id;return true;}
