export const RIDING_MODES=Object.freeze(['idle','walk','trot','canter','gallop']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function freshRideControls(){return {gear:0,mode:'idle',steer:0,brake:0,pull:0,forwardHeld:false};}
export function stepRideControls(state,input={}){
 const x=clamp(input.x??0,-1,1),y=clamp(input.y??0,-1,1),back=Math.max(0,-y),forwardHeld=y>.18;
 let gear=state.gear;
 if(input.advance&&back<=.18&&!input.stop)gear=Math.min(4,gear+1);
 if(gear===0&&forwardHeld&&!state.forwardHeld)gear=1;
 if(back>.18)gear=Math.min(gear,back>=.75?0:back>=.45?1:2);
 if(input.stop)gear=0;
 return {gear,mode:RIDING_MODES[gear],steer:Math.abs(x)<.12?0:Math.sign(x)*(Math.abs(x)-.12)/.88,brake:back>.18?(back-.18)/.82:0,pull:back,forwardHeld};
}
