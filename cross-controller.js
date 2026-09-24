(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./cross-planner.js'));
  else root.CrossController=factory(root.CrossPlanner);
})(typeof globalThis==='object'?globalThis:this,function(DefaultPlanner){
  'use strict';
  function create(api,P=DefaultPlanner){
    const stage=P.STAGE||{number:1,name:'底层十字',itemName:'底棱',completion:'四个底棱位置、黄色朝向、侧色对齐全部通过。自动停止于第1步。'};
    let running=false,aborter=null;
    const abortCheck=()=>{if(aborter.signal.aborted){const e=new Error('用户停止');e.name='AbortError';throw e;}};
    const log=(message,details={})=>api.log(message,{time:new Date().toISOString(),stage:stage.number,...details});
    const update=data=>api.update({running,stage,...data});
    async function choose(payload,config,signal){
      const timeout=new AbortController();let timedOut=false;
      const onAbort=()=>timeout.abort();signal.addEventListener('abort',onAbort,{once:true});
      const timer=setTimeout(()=>{timedOut=true;timeout.abort();},60000);
      try{
        const response=await (api.fetch||fetch)(config.transport,{method:'POST',headers:{'Content-Type':'application/json','X-Jev-API-Key':config.apiKey},
          body:JSON.stringify(payload),signal:timeout.signal});
        const text=await response.text();
        let body;try{body=JSON.parse(text);}catch{if(response.ok)throw new Error('Jev 响应不是 JSON');}
        if(!response.ok){
          const reason=typeof body?.error?.message==='string'?body.error.message:typeof body?.detail==='string'?body.detail:'';
          throw new Error('Jev HTTP '+response.status+(reason?'：'+reason.slice(0,250):''));
        }
        const answer=body.answers?.plan;
        if(answer?.type!=='choice'||typeof answer.choice!=='string')throw new Error('Jev 响应缺少有效的 answers.plan.choice');
        return {choice:answer.choice,confidence:Number.isFinite(answer.confidence)?answer.confidence:null,model:body.model||config.model};
      }catch(e){
        if(signal.aborted){e.name='AbortError';throw e;}
        if(timedOut)throw new Error('Jev 请求超过60秒，已暂停；可以重试');
        if(e instanceof TypeError)throw new Error('无法连接本地服务，请通过 http://127.0.0.1:8787/ 打开游戏并确认服务已启动');
        throw e;
      }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
    }
    async function start(config){
      if(running||!api.idle())return {status:'busy'};
      running=true;aborter=new AbortController();api.lock(true);
      let applied=0,round=0,completed=false;
      const recent=[],seen=new Set();
      try{
        P.validate(api.snapshot());
        if(P.ready)P.ready(api.snapshot());
        log('开始第'+stage.number+'步：'+stage.name+'（D 黄、U 白）',{type:'start',initialState:api.snapshot(),revision:api.revision()});
        while(round<4){
          abortCheck();const snapshot=api.snapshot(),baseline=P.status(snapshot),revision=api.revision();
          if(baseline.complete){completed=true;break;}
          if(!config.apiKey)throw new Error('请先在 AI 设置中填写 API Key');
          const stateKey=P.key(snapshot);if(seen.has(stateKey))throw new Error('检测到重复状态，已暂停以避免循环');seen.add(stateKey);
          round++;
          update({phase:'planning',round,baseline:baseline.count,progress:baseline,step:0,total:0,activePlan:null,candidates:[]});
          log('第 '+round+' 轮：当前完成 '+baseline.count+'/4，正在生成并模拟候选方案',{type:'planning',revision});
          const candidates=await P.plan(snapshot,{signal:aborter.signal});abortCheck();
          if(!candidates.length)throw new Error('未找到经过验证的候选方案，已暂停');
          if(api.revision()!==revision||P.key(api.snapshot())!==stateKey)throw new Error('当前状态已变化，请重新开始规划');
          update({phase:'deciding',round,baseline:baseline.count,progress:baseline,candidates});
          log('已验证 '+candidates.length+' 个候选，等待 Jev 选择',{type:'candidates',revision,candidates:candidates.map(({expectedKey,...p})=>p)});
          const payload=P.request(snapshot,candidates,{revision,model:config.model,recent});
          const answer=await choose(payload,config,aborter.signal);abortCheck();
          if(api.revision()!==revision||P.key(api.snapshot())!==stateKey)throw new Error('Jev 回复对应旧状态，未执行，请重新开始');
          if(answer.choice==='PAUSE'){
            log('Jev 选择暂停，'+stage.name+'尚未完成',{type:'paused',answer});
            update({phase:'paused',progress:P.status(api.snapshot())});return {status:'paused'};
          }
          const selected=candidates.find(p=>p.id===answer.choice);
          if(!selected)throw new Error('Jev 返回了候选之外的方案，已拒绝执行');
          let expected=snapshot;
          const predicted=selected.moves.reduce((s,m)=>P.move(s,m),snapshot);
          if(P.key(predicted)!==selected.expectedKey)throw new Error('方案模拟结果不一致，已拒绝执行');
          log('Jev 选择 '+selected.id+'：'+selected.target+' · '+selected.moves.join(' ')+(answer.confidence!==null?'（置信度 '+(answer.confidence*100).toFixed(1)+'%）':''),{type:'selected',answer,plan:selected.id});
          update({phase:'executing',round,baseline:baseline.count,activePlan:selected,step:0,total:selected.moves.length,confidence:answer.confidence});
          const safeStops=new Set(selected.safeStops||selected.moves.map((_,i)=>i+1));
          for(let i=0;i<selected.moves.length;i++){
            // Finish the current protected formula before honoring a stop.
            if(i===0||safeStops.has(i))abortCheck();
            const notation=selected.moves[i];
            const segment=selected.segments?.find(s=>s.endsAt>=i+1);
            update({phase:aborter.signal.aborted?'stopping':'executing',step:i+1,notation,segment:segment?.name||''});
            log('正在执行 '+(i+1)+'/'+selected.moves.length+'：'+notation,{type:'move-start',plan:selected.id,move:notation});
            expected=P.move(expected,notation);
            await api.execute(notation);
            applied++;
            if(P.key(api.snapshot())!==P.key(expected)||api.revision()!==revision+i+1)throw new Error('实际转动与模拟不一致，已立即停止');
            const actual=P.status(api.snapshot());
            update({progress:actual});
            if(selected.safeStops&&safeStops.has(i+1)&&(actual.prerequisiteComplete===false||selected.protected.some(id=>!(actual.items||actual.edges).find(e=>e.id===id)?.solved)))throw new Error('公式结束后的前置阶段保护检查失败，已停止');
            log('已执行 '+notation+'；实际'+stage.itemName+' '+actual.count+'/4'+(i+1<selected.moves.length?'（方案执行中）':''),{type:'move-end',move:notation,revision:api.revision(),count:actual.count});
          }
          abortCheck();const actual=P.status(api.snapshot());
          if(P.key(api.snapshot())!==selected.expectedKey||actual.count<=baseline.count||actual.prerequisiteComplete===false||selected.protected.some(id=>!(actual.items||actual.edges).find(e=>e.id===id)?.solved))throw new Error('方案未达到预期或损坏已完成部分，已暂停');
          recent.push({target:selected.target,moves:selected.moves,before:baseline.count,after:actual.count});
          log('方案通过检查：'+baseline.count+'/4 → '+actual.count+'/4，'+(stage.protection?stage.protection+'保留':stage.number===2?'底层十字和已有底角保留':'已有底棱保留'),{type:'verified',before:baseline.count,after:actual.count});
          update({phase:'verified',progress:actual,baseline:actual.count});
        }
        const finalProgress=P.status(api.snapshot());completed=finalProgress.complete;
        if(!completed)throw new Error('已达到4轮方案上限，尚未完成');
        const completion=config.continuous?stage.completion.replace(/自动停止于第\d步。/,'本阶段完成。'):stage.completion;
        log(stage.name+'完成：'+completion,{type:'complete',applied,round,finalState:api.snapshot(),...(finalProgress.wholeCube?{wholeCube:finalProgress.wholeCube}:{})});
        update({phase:'complete',progress:finalProgress,baseline:4});
        return {status:'complete',progress:finalProgress};
      }catch(e){
        const stopped=e.name==='AbortError';
        // Never persist credentials even if a remote error happens to echo them.
        const message=config.apiKey?String(e.message).split(config.apiKey).join('[隐藏]'):String(e.message);
        log(stopped?'已停止；'+(stage.number>1?'已停在完整公式边界，前置阶段保留':'当前完整转动已保留')+'，下次从实际状态重新规划':'已暂停：'+message,{type:stopped?'stopped':'error',error:!stopped,finalState:api.snapshot()});
        update({phase:stopped?'stopped':'error',error:stopped?'':message,progress:P.status(api.snapshot())});
        return {status:stopped?'stopped':'error'};
      }finally{running=false;api.lock(false);update({running:false});}
    }
    function stop(){if(!running)return;aborter.abort();update({phase:'stopping'});}
    return {start,stop,get running(){return running;}};
  }
  return {create};
});
