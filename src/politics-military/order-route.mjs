/** Estimate only: canonical geography's hours/path never establish actual dispatch or receipt.
 * locate(personId, observerId) must return a position known to the observer, not a home location.
 * knows(observerId,x,y) and profile.baseKmH are explicitly supplied world facts/test settings.
 */
export function estimateOrderRoute({geography,locate,knows,profile}={},order){
 if(typeof knows!=='function')return {status:'knowledge-unavailable'};
 if(!Number.isFinite(profile?.baseKmH)||profile.baseKmH<=0)return {status:'profile-unavailable'};
 if(typeof locate!=='function'||typeof geography?.route!=='function')return {status:'route-unavailable'};
 try{
  if(!Number.isSafeInteger(order?.issuerId)||order.issuerId<0||!Number.isSafeInteger(order.recipientId)||order.recipientId<0)return {status:'position-unknown'};
  const from=locate(order.issuerId,order.issuerId),to=locate(order.recipientId,order.issuerId);
  if(!from||!to)return {status:'position-unknown'};
  const result=geography.route(from,to,{...profile,knows:(x,y)=>knows(order.issuerId,x,y)===true});
  if(result.status!=='ok')return result;
  return {...result,status:'estimated'};
 }catch{return {status:'route-unavailable'};}
}
