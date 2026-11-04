/** 地質の成り立ちから、各区画の地層の柱（有限の厚さの地層＋基盤）を作る。
 *  - 基盤岩の地域（安定地塊・造山帯・リフト・火山帯）と、その上の堆積岩の被覆を分けて決める
 *  - 被覆の厚さは、数百kmの大きさで変わる盆地とアーチ（なめらかな場）から決める。薄い所は基盤が露出する
 *  - 地表に出る岩石は、積み重なった地層の合計と、基盤の深さ・起伏との位置関係で決まる（標高を周期的に繰り返さない）
 *  - 生成は整数ハッシュと補間だけ（三角関数・指数関数なし）。同じ Seed なら同じ結果
 *  数値は［仮］：地質学的な目安で、特定の岩石の割合に合わせるための値ではない
 */
const ROCK_STACK_SED = 2800;          // 堆積岩の地層の合計の厚さ（m）［仮］
const ROCK_STACK_CRYST = 8000;        // 結晶質（火成岩・変成岩）の地層の合計の厚さ（m）［仮］
const ROCK_UNIT_WEIGHT = [1, .55, 1.4, .7, 1.1];   // 5つの地層の厚さの比（従来と同じ）
// 薄層・レンズ状に産する岩石は、同じ組み合わせの中でも厚さを小さくする（地表の面積が過大にならないように）
const ROCK_THIN = {7: .3, 14: .3, 15: .5, 16: .4, 23: .6};   // 黒曜岩・チャート・石膏岩・岩塩・蛇紋岩
const ROCK_SHIELD_T = .40;            // 被覆の場がこれ未満の所は基盤が露出する（盾状地）［仮］
const ROCK_COVER_MAX = 3400;          // 被覆の場が最大の所の堆積岩の厚さ（m）［仮］
const ROCK_SMOOTH_R = 5;              // 起伏の基準にする地表の平均の範囲（区画数）［仮］
const ROCK_OROGEN_NEAR = 8;           // 造山帯からこの区画数以内は、粗い砕屑物が多い（前縁盆地）［仮］
const ROCK_VOLC_T = 120;              // 火成活動の履歴がこれ以上の地域は火山・火成岩の地域［仮］

// なめらかな値ノイズ（0〜1）。period は格子点の間隔（区画数）
function rockSmoothNoise(seed,channel,x,y,period){
 const fx=x/period,fy=y/period,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
 const a=rockHash(seed,ix,iy,channel),b=rockHash(seed,ix+1,iy,channel),c=rockHash(seed,ix,iy+1,channel),d=rockHash(seed,ix+1,iy+1,channel);
 return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
}
// 大きな波長と小さな波長を混ぜ、中央を強調して 0〜1 に広げる
function rockProvinceField(seed,channel,x,y,period){
 const v=rockSmoothNoise(seed,channel,x,y,period)*.65+rockSmoothNoise(seed,channel+50,x,y,period*.5)*.35;
 return rockClamp((v-.5)*1.7+.5,0,1);
}
function rockLandMean(z,land,w,h,r){   // 陸の区画だけの平均（積分画像）
 const S=new Float64Array((w+1)*(h+1)),C=new Int32Array((w+1)*(h+1)),out=new Float32Array(w*h);
 for(let y=0;y<h;y++){let rs=0,rc=0;for(let x=0;x<w;x++){const i=y*w+x;if(land[i]){rs+=z[i];rc++;}S[(y+1)*(w+1)+x+1]=S[y*(w+1)+x+1]+rs;C[(y+1)*(w+1)+x+1]=C[y*(w+1)+x+1]+rc;}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
  const n=C[y1*(w+1)+x1]-C[y0*(w+1)+x1]-C[y1*(w+1)+x0]+C[y0*(w+1)+x0],s=S[y1*(w+1)+x1]-S[y0*(w+1)+x1]-S[y1*(w+1)+x0]+S[y0*(w+1)+x0];out[y*w+x]=n?s/n:z[y*w+x];}
 return out;
}
function rockDistanceTo(mask,w,h){   // マスクまでの距離（区画数、斜めは1.41）
 const d=new Float32Array(w*h),INF=1e9;for(let i=0;i<w*h;i++)d[i]=mask[i]?0:INF;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let v=d[i];
  if(x>0&&d[i-1]+1<v)v=d[i-1]+1;if(y>0){if(d[i-w]+1<v)v=d[i-w]+1;if(x>0&&d[i-w-1]+1.414<v)v=d[i-w-1]+1.414;if(x<w-1&&d[i-w+1]+1.414<v)v=d[i-w+1]+1.414;}d[i]=v;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let v=d[i];
  if(x<w-1&&d[i+1]+1<v)v=d[i+1]+1;if(y<h-1){if(d[i+w]+1<v)v=d[i+w]+1;if(x<w-1&&d[i+w+1]+1.414<v)v=d[i+w+1]+1.414;if(x>0&&d[i+w-1]+1.414<v)v=d[i+w-1]+1.414;}d[i]=v;}
 return d;
}
const ROCK_SEDIMENTARY_FORMATIONS=new Set([4,5,6,7,13]);
/** formation（0〜13：ROCK_ASSEMBLAGES の番号）と、地層の柱（layerRockIds・layerThicknessM）を input に書き込む */
function assignRockColumns(seed,input,tec,step){
 const w=input.width,h=input.height,n=w*h,L=ROCK_LAYER_COUNT,get=(arr,i,fallback=0)=>arr?.[i]??fallback;
 const land=input.land,z=input.elevation,smoothZ=rockLandMean(z,land,w,h,ROCK_SMOOTH_R);
 const crustA=tec.crust,causeA=tec.cause,oroA=tec.oro??tec.orogeny,oroAgeA=tec.oroAge??tec.orogenyAge,volcA=tec.volcHist??tec.volcanism,thickA=tec.thick??tec.thickness,rhoA=tec.density,basinA=tec.basin,faultA=tec.fault;
 // 造山帯（現在も山をつくる所・古い造山帯の芯）からの距離：砕屑物の供給源
 const mountain=new Uint8Array(n);for(let i=0;i<n;i++){const cr=get(crustA,i),c=get(causeA,i);if((cr===2&&get(oroA,i)>300)||c===4||c===5)mountain[i]=1;}
 const dMountain=rockDistanceTo(mountain,w,h);
 const ids=new Uint8Array(n*L),thick=new Float32Array(n*L);input.layerRockIds=ids;input.layerThicknessM=thick;
 for(let i=0;i<n;i++){
  const x=i%w,y=(i-x)/w,cr=get(crustA,i),cause=get(causeA,i),oro=get(oroA,i),oroAge=get(oroAgeA,i,10),volc=get(volcA,i),th=get(thickA,i,35),rho=get(rhoA,i,2.7),fault=get(faultA,i),basin=get(basinA,i);
  // なめらかな地質区の場（盆地とアーチ、堆積相、火成・変成の区）
  const cover=rockProvinceField(seed,201,x,y,22),facies=rockProvinceField(seed,202,x,y,13),province=rockProvinceField(seed,203,x,y,8);
  let family,coverM=0,grade=0;
  if(!cr){family=land[i]?(volc>5?3:1):(get(tec.age,i,20)>80?13:1);}   // 海洋地殻：島は玄武岩、海は海洋地殻と深海堆積物
  else if(cr===3||cause===7){family=volc>5||province>.5?3:4;}                           // リフト：溶岩・玄武岩、または堆積盆
  else if(cause===9){family=3;}                                                           // ホットスポット
  else if(cause===3||volc>ROCK_VOLC_T){family=th>40&&rho<2.8?12:2;}                      // 火山弧・活発な火成活動
  else if((fault>3||cause===8)&&rho>2.82){family=11;}                                    // 断層帯の蛇紋岩・オフィオライト
  else if(cause===4||cause===5){family=province>.35?9:8;grade=province;}                 // 現在の衝突帯・沈み込み山脈：高度変成帯
  else if(cr===2||cause===11){
   // 古い造山帯：造山の強さが残る芯は変成岩と花崗岩。周辺で、被覆が厚い所は堆積岩が覆う
   if(cover>.62&&oro<520){coverM=(cover-ROCK_SHIELD_T)/(1-ROCK_SHIELD_T)*ROCK_COVER_MAX;}
   if(coverM>0){family=dMountain[i]<ROCK_OROGEN_NEAR?(facies<.5?4:5):(facies<.55?6:4);}
   else if(province>.72){family=0;}                                                        // 深成岩体（花崗岩・閃緑岩）
   else{family=oroAge>700&&province>.3?9:8;grade=rockClamp((oro-250)/450+(province-.5)*.8,0,1);}   // 古い造山帯の変成岩（造山の年代が古いほど高度変成）
  }
  else if(cause===13){coverM=ROCK_COVER_MAX*.6;family=dMountain[i]<ROCK_OROGEN_NEAR&&facies<.5?4:6;}   // 陸棚：炭酸塩台地
  else if(cause===12){coverM=ROCK_COVER_MAX*.7;family=4;}                                // 前縁盆地：砕屑岩
  else{
   // 安定地塊：被覆の場が低い所は基盤（花崗岩・片麻岩）が露出し、高い所は堆積岩が覆う
   if(cover<ROCK_SHIELD_T){family=province>.72?9:0;}
   else{
    coverM=(cover-ROCK_SHIELD_T)/(1-ROCK_SHIELD_T)*ROCK_COVER_MAX;
    if(dMountain[i]<ROCK_OROGEN_NEAR)family=facies<.5?4:5;                                // 山地に近い：砕屑岩
    else if(coverM>2200&&facies>.88)family=7;                                             // 深い内陸盆地の一部：蒸発岩
    else family=facies<.28?5:facies<.62?6:4;                                              // 泥質・炭酸塩・砂質の堆積相
   }
  }
  input.formation[i]=family;
  const seq=ROCK_ASSEMBLAGES[family],sed=ROCK_SEDIMENTARY_FORMATIONS.has(family),stack=sed?ROCK_STACK_SED:ROCK_STACK_CRYST;
  // 5つの地層の順序（結晶質の区は、地域ごとに最上位の地層をずらして花崗岩・片麻岩などの地域差をつくる）
  const order=[0,1,2,3,4];
  if(!sed){let r=0;if(family===8)r=Math.min(3,Math.floor(grade*4));else if(family===9)r=Math.floor(province*5)%5;else if(family===0)r=Math.floor(province*5)%5;if(r)for(let k=0;k<5;k++)order[k]=(k+r)%5;}
  const w5=order.map(k=>ROCK_UNIT_WEIGHT[k]*(ROCK_THIN[seq[k]]??1)),wsum=w5.reduce((a,b)=>a+b,0),t=w5.map(v=>v/wsum*stack);
  // 地表が積み重なった地層のどの深さにあるか（0 が最上部）。堆積岩は被覆の厚さから、結晶質は広域の地表との差から
  const relief=rockClamp(smoothZ[i]-z[i],-600,600);
  let d=sed?stack-Math.min(coverM,stack)+relief*.5:Math.max(-100,relief*.5);
  // 柱を作る：露出する層（残りの厚さ）、その下の層、最下部は基盤
  const base=seq[5],o=i*L;let j=0,lower=0;
  if(d<0){ids[o]=seq[order[0]];thick[o]=t[0]-d;j=0;}
  else if(d>=stack){ids[o]=base;thick[o]=5000;j=5;}
  else{while(j<4&&d>=lower+t[j])lower+=t[j++];ids[o]=seq[order[j]];thick[o]=Math.max(.001,lower+t[j]-d);}
  let k=1;for(let u=j+1;u<5&&k<L-1;u++,k++){ids[o+k]=seq[order[u]];thick[o+k]=t[u];}
  for(;k<L;k++){ids[o+k]=base;thick[o+k]=5000;}
 }
}
