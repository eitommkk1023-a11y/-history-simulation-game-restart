/** Two-link leg IK: half-cycle stance, half-cycle lifted swing. Angles in radians. */
export function legPose(phase,hipHeight,stride,liftHeight,groundDelta=0){
 const u=((phase%1)+1)%1,swing=u>=.5,t=(u-.5)*2;
 const z=swing?-stride+2*stride*t:stride*(1-4*u);
 const lift=swing?liftHeight*Math.sin(Math.PI*t):0;
 const down=hipHeight-.035-lift-groundDelta;
 const distance=Math.min(.7,Math.max(.001,Math.hypot(down,z)));
 const knee=2*Math.acos(distance/.7);
 return {hip:Math.atan2(-z,down)-knee/2,knee,z,lift};
}
