export const HORSE_COATS=Object.freeze([
 {name:'鹿毛',body:[.36,.19,.10],dark:[.075,.054,.040]},
 {name:'栗毛',body:[.53,.25,.11],dark:[.24,.10,.035]},
 {name:'青毛',body:[.075,.080,.085],dark:[.022,.026,.029]},
 {name:'芦毛',body:[.66,.67,.65],dark:[.23,.25,.25]},
 {name:'黒鹿毛',body:[.19,.13,.10],dark:[.045,.040,.036]},
 {name:'月毛',body:[.69,.53,.29],dark:[.74,.69,.53]},
 {name:'河原毛',body:[.59,.48,.29],dark:[.09,.075,.055]},
 {name:'濃い栗毛',body:[.34,.13,.075],dark:[.20,.073,.032]},
]);
export function horseRandom(id,seed,channel){let h=(seed>>>0)^Math.imul(channel,1597334677);for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function horseIdentity(id,seed=71031){const r=c=>horseRandom(id,seed,c),coatIndex=Math.floor(r(1)*HORSE_COATS.length),athletic=r(20),endurance=r(21);return {id:String(id),seed,coatIndex,coat:HORSE_COATS[coatIndex],blaze:r(2)>.57,socks:Math.floor(r(3)*16),scale:.96+r(4)*.08,stats:{speed:6.8+athletic*3.4,acceleration:1.25+r(22)*1.25,endurance:80+endurance*60,agility:.8+r(23)*.55},appearance:coatIndex+(r(2)>.57?8:0)+Math.floor(r(3)*16)*16};}
