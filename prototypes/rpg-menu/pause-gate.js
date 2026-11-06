// Prototype-only gate, installed before the copied game schedules its animation loops.
(()=>{const raf=window.requestAnimationFrame.bind(window),caf=window.cancelAnimationFrame.bind(window),pending=new Map();let paused=true,next=0;
 function schedule(record){record.native=raf(time=>{record.native=null;if(paused)return;pending.delete(record.id);record.callback(time);});}
 const frame=callback=>{const record={id:++next,callback,native:null};pending.set(record.id,record);if(!paused)schedule(record);return record.id;};
 const cancel=id=>{const record=pending.get(id);if(record?.native!=null)caf(record.native);pending.delete(id);};
 window.__rpgMenuGate={frame,cancel,get paused(){return paused;},setPaused(value){paused=!!value;if(!paused)for(const record of pending.values())if(record.native==null)schedule(record);}};
})();
