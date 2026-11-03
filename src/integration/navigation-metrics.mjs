/** Coordinates: +X east, +Y south. Compass degrees: north=0, east=90. */
export function compassDegrees(dx,dy){return (Math.atan2(dx,-dy)*180/Math.PI+360)%360;}
export function mapPoint(xM,yM,widthM,heightM){return {x:Math.max(0,Math.min(1,xM/widthM)),y:Math.max(0,Math.min(1,yM/heightM))};}
export function measuredSpeed(previous,current,elapsedMs,maxSpeed){
 if(!previous||!current||elapsedMs<=0||elapsedMs>1000)return 0;
 const distance=Math.hypot(current.xM-previous.xM,current.yM-previous.yM),seconds=elapsedMs/1000;
 // Reject loading/teleport jumps instead of reporting them as movement.
 return distance>maxSpeed*seconds*1.5+1?0:distance/seconds*3.6;
}
