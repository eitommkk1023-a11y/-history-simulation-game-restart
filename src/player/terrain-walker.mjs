/** Ground-only walking, using the rendered terrain snapshot. Distances are meters. */
export function stepTerrainWalker(position,input,dt,groundAt){
  let result={...position,blocked:false};
  if(!Number.isFinite(dt)||dt<=0)return result;
  const ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0;
  const yaw=Number.isFinite(input.yaw)?input.yaw:0;
  const length=Math.max(1,Math.hypot(ix,iy)),speed=input.crouch?.65:input.sprint?4:1.5;
  const dx=(ix*Math.cos(yaw)+iy*Math.sin(yaw))/length*speed*Math.min(dt,.05);
  const dy=(-ix*Math.sin(yaw)+iy*Math.cos(yaw))/length*speed*Math.min(dt,.05);
  const distance=Math.hypot(dx,dy);if(!distance)return result;
  const steps=Math.ceil(distance/.1),sx=dx/steps,sy=dy/steps;
  for(let i=0;i<steps;i++){
    const xM=result.xM+sx,yM=result.yM+sy,p=groundAt(xM,yM);
    const support=[[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25]].map(([x,y])=>groundAt(xM+x,yM+y));
    if(!p||support.some(q=>!q||!Number.isFinite(q.elevationM)||q.slopeDegrees>45||Math.abs(q.elevationM-p.elevationM)>.3)||
      Math.abs(p.elevationM-result.elevationM)>Math.hypot(sx,sy)+.05){result.blocked=true;break;}
    result={xM,yM,elevationM:p.elevationM,blocked:false};
  }
  return result;
}
