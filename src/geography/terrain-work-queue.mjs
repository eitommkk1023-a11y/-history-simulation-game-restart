/** Stages a complete replacement while keeping active terrain visible. */
export function createTerrainWorkQueue({build,release,commit,now=()=>performance.now()}){
 let active=new Map(),staged=new Map(),wanted=[],jobs=[],dirty=false;
 function request(plan){
  const keys=new Set(plan.map(p=>p.key));for(const [key,e]of staged)if(!keys.has(key)){release(e);staged.delete(key);}
  dirty=true;wanted=plan;jobs=plan.filter(p=>!active.has(p.key)&&!staged.has(p.key));
 }
 function tick(budgetMs=3,maxJobs=2){
  const start=now();let count=0;
  while(jobs.length&&count<maxJobs&&(count===0||now()-start<budgetMs)){const p=jobs.shift();staged.set(p.key,build(p));count++;}
  if(!jobs.length&&dirty){
   const next=new Map(wanted.map(p=>[p.key,active.get(p.key)||staged.get(p.key)])),old=active;
   active=next;staged=new Map();wanted=[];dirty=false;commit(next,old);
   for(const [key,e]of old)if(!next.has(key))release(e);
  }
  return count;
 }
 return {request,tick,get active(){return active;},get pending(){return jobs.length;},clear(){for(const e of active.values())release(e);for(const e of staged.values())release(e);active=new Map();staged=new Map();wanted=[];jobs=[];dirty=false;}};
}
