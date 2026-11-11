(() => {
  const npc=new WohNpc.Population(321,2);
  for(let i=0;i<6;i++)npc.addFounder(1,25);
  const people={npc}, units=new Map([['a',{id:'a',commanderId:0}],['b',{id:'b',commanderId:1}]]);
  const ports={worldKey:'isolated-military-test-v1',people,resolveUnit:id=>units.get(id),authorize:c=>units.get(c.unitId)?.commanderId===c.actorId};
  let ledger=AssignmentAPI.createAssignmentLedger(ports),counter=0,last=null;
  const $=id=>document.getElementById(id);
  const text={
    'already-assigned':'すでに配属先があります。先に現在の配属を解除してください。',
    'not-assigned-to-unit':'選択した部隊への配属ではありません。',
    'not-authorized':'この人物には、選択した部隊の配属を変更する許可がありません。',
    'operation-id-conflict':'同じ操作IDを違う内容には使えません。',
    'stale-revision':'台帳が更新されています。現在の状態で操作し直してください。',
    'invalid-command':'対象の人物を1人以上選んでください。',
    'person-not-alive':'生存していない人物が含まれています。'
  };
  function message(body,ok=true){$('status').textContent=body;$('status').dataset.ok=String(ok);}
  function render(){
    $('populationCount').textContent=npc.livingCount();$('assignedCount').textContent=ledger.assignments().length;
    $('revision').textContent=ledger.revision;$('pendingCount').textContent=ledger.pendingEvents().length;
    const records=new Map(ledger.assignments().map(a=>[a.personId,a]));
    const selected=new Set([...document.querySelectorAll('[data-person]:checked')].map(x=>Number(x.dataset.person)));
    $('peopleRows').replaceChildren();
    for(let id=0;id<npc.n;id++){
      const row=document.createElement('tr'),choice=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.dataset.person=id;check.setAttribute('aria-label',`人物${id}を選択`);check.checked=selected.has(id);choice.append(check);row.append(choice);
      for(const value of [String(id),String(npc.group[id]),records.has(id)?`部隊${records.get(id).unitId.toUpperCase()}`:'なし','未取得・移動未接続']){const td=document.createElement('td');td.textContent=value;row.append(td);}
      $('peopleRows').append(row);
    }
    $('retry').disabled=!last;$('events').textContent=JSON.stringify(ledger.pendingEvents(),null,2);
  }
  for(let id=0;id<npc.n;id++){const option=document.createElement('option');option.value=id;option.textContent=`人物${id}`;$('actor').append(option);}
  function execute(command){
    const result=ledger.execute(command);
    if(result.ok)message(result.replayed?'同じ操作を再送しました。配属・成功操作・履歴候補は増えていません。':command.action==='assign'?'配属を記録しました。人物の現在地や人口は変更していません。':'配属を解除しました。人物の現在地や人口は変更していません。');
    else message(text[result.code]||`操作できません：${result.code}`,false);
    $('lastOperation').textContent=`直前の操作ID：${command.operationId}`;render();return result;
  }
  function act(action){
    const used=new Set(ledger.save().operations.map(o=>o.command.operationId));let operationId;
    do{operationId=`test-op-${++counter}`;}while(used.has(operationId));
    last={action,operationId,actorId:Number($('actor').value),unitId:$('unit').value,personIds:[...document.querySelectorAll('[data-person]:checked')].map(x=>Number(x.dataset.person)),expectedRevision:ledger.revision};
    execute(last);
  }
  $('assign').onclick=()=>act('assign');$('release').onclick=()=>act('release');$('retry').onclick=()=>{if(last)execute(last);};
  $('save').onclick=()=>{$('snapshot').value=JSON.stringify(ledger.save(),null,2);message('配属台帳を保存テキストにしました。人口の保存データではありません。');};
  $('load').onclick=()=>{try{const loaded=AssignmentAPI.createAssignmentLedger(ports,JSON.parse($('snapshot').value));ledger=loaded;last=ledger.save().operations.at(-1)?.command||null;render();message('配属台帳を復元しました。現在の人口や位置は変更していません。');}catch{message('復元できませんでした。世界識別子・形式・人物や部隊の参照を確認してください。現在の台帳は保持しています。',false);}};
  $('download').onclick=()=>{const data=JSON.stringify(ledger.save(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='woh-test-assignment-ledger.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('ack').onclick=()=>{const first=ledger.pendingEvents()[0];if(first){ledger.acknowledgeEvent(first.id);message('履歴候補1件の受取確認を模擬しました。本作には送信していません。');}else message('未確認の履歴候補はありません。');render();};
  render();message('テスト世界を準備しました。人物を選び、配属・解除・保存を試せます。');
  window.__assignmentSandbox={people,units,get ledger(){return ledger;},get lastCommand(){return last;}};
})();
