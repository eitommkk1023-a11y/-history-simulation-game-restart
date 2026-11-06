export const RIDING_MODES=Object.freeze(['idle','walk','trot','canter','gallop']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function freshRideControls(){return {gear:0,mode:'idle',steer:0,brake:0,pull:0,forwardHeld:false,backHeld:false,brakeStage:0};}
export function stepRideControls(state,input={}){
 const x=clamp(input.x??0,-1,1),y=clamp(input.y??0,-1,1),back=Math.max(0,-y),speed=input.speed??0;
 const forwardHeld=y>.18||(state.forwardHeld&&y>.12),backHeld=back>.18||(state.backHeld&&back>.12),forwardEdge=forwardHeld&&!state.forwardHeld,backEdge=backHeld&&!state.backHeld;
 let gear=state.gear,brakeStage=state.brakeStage??0;
 if(gear<0){if(!backHeld||forwardEdge)gear=0;}
 else if(forwardEdge){gear=speed<-.04?0:Math.min(4,gear+1);brakeStage=0;}
 if(backEdge&&state.gear>=0){
  if(state.gear===0&&Math.abs(speed)<.04&&!input.stop){gear=-1;brakeStage=0;}
  else{brakeStage=Math.min(3,brakeStage+1);gear=brakeStage===3?0:Math.max(0,gear-1);if(gear===0)brakeStage=3;}
 }
 if(input.stop){gear=0;brakeStage=3;}
 const brake=gear<0?0:brakeStage===3&&gear===0?1:backHeld&&brakeStage>0?brakeStage/3:0;
 return {gear,mode:gear<0?'reverse':RIDING_MODES[gear],steer:Math.abs(x)<.12?0:Math.sign(x)*(Math.abs(x)-.12)/.88,brake,pull:back,forwardHeld,backHeld,brakeStage};
}
