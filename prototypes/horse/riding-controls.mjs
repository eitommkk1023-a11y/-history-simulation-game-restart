export const RIDING_MODES=Object.freeze(['idle','walk','trot','canter','gallop']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function freshRideControls(){return {gear:0,mode:'idle',steer:0,brake:0,pull:0,forwardHeld:false,brakeStage:0,brakeBase:null};}
export function stepRideControls(state,input={}){
 const x=clamp(input.x??0,-1,1),y=clamp(input.y??0,-1,1),back=Math.max(0,-y),forwardHeld=y>.18,previousStage=state.brakeStage??0;
 let brakeStage=back>.18?(back>=.75?3:back>=.45?2:1):0;
 // A small margin prevents thumb jitter from repeatedly changing the selected tier.
 if(previousStage===3&&back>=.715)brakeStage=3;
 else if(previousStage===2&&back>=.415&&brakeStage<2)brakeStage=2;
 else if(previousStage>0&&back>.12&&brakeStage===0)brakeStage=1;
 const brakeBase=brakeStage===0?null:previousStage===0?state.gear:(state.brakeBase??state.gear);
 let gear=state.gear;
 if(input.advance&&brakeStage===0&&!input.stop)gear=Math.min(4,gear+1);
 if(gear===0&&forwardHeld&&!state.forwardHeld)gear=1;
 if(brakeStage>0)gear=Math.min(gear,brakeStage===3||brakeBase===0?0:Math.max(1,brakeBase-brakeStage));
 if(input.stop)gear=0;
 return {gear,mode:RIDING_MODES[gear],steer:Math.abs(x)<.12?0:Math.sign(x)*(Math.abs(x)-.12)/.88,brake:brakeStage>0?Math.max(.04,(back-.18)/.82):0,pull:back,forwardHeld,brakeStage,brakeBase};
}
