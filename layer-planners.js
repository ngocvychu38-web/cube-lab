/* Beginner-method stages 3–7. Search only at complete algorithm boundaries. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./cross-planner.js'),require('./corner-planner.js'));
  else root.LayerPlanners=factory(root.CrossPlanner,root.CornerPlanner);
})(typeof globalThis==='object'?globalThis:this,function(Cube,Corners){
  'use strict';
  const equal=(a,b)=>a.every((v,i)=>v===b[i]);
  const sides=['F','R','B','L'];
  const sidePairs=sides.map((f,i)=>[f,sides[(i+1)%4]]);
  const position=fs=>fs.reduce((p,f)=>p.map((v,i)=>v+Cube.NORMALS[f][i]),[0,0,0]);
  const piece=(state,fs)=>{
    const p=state.find(p=>p.stickers.length===fs.length&&fs.every(f=>p.stickers.some(s=>s.homeFace===f)));
    if(!p)throw new Error('缺少小块 '+fs.join(''));return p;
  };
  const correct=p=>p.stickers.every(s=>equal(s.normal,Cube.NORMALS[s.homeFace]));
  const abort=signal=>{if(signal?.aborted){const e=new Error('操作已停止');e.name='AbortError';throw e;}};
  const apply=(state,moves)=>moves.reduce((s,m)=>Cube.move(s,m),state);
  const inverse=moves=>moves.slice().reverse().map(m=>m.endsWith('2')?m:m.endsWith("'")?m[0]:m+"'");
  function algorithms(definitions){
    const result=['U',"U'",'U2'].map(m=>({name:'顶层对位 '+m,moves:[m]}));
    for(const [name,text] of definitions)for(let rotation=0;rotation<4;rotation++){
      const moves=text.split(' ').map(m=>sides.includes(m[0])?sides[(sides.indexOf(m[0])+rotation)%4]+m.slice(1):m);
      result.push({name:name+'（以 '+sides[rotation]+' 为前面）',moves});
      result.push({name:name+' · 逆公式（以 '+sides[rotation]+' 为前面）',moves:inverse(moves)});
    }
    return result;
  }
  function middleStatus(state){
    const prerequisite=Corners.status(state);
    const items=sidePairs.map(fs=>{const p=piece(state,fs);return {id:fs.join(''),name:fs.map(f=>Cube.COLORS[f]).join('')+'中棱',position:p.position.slice(),targetPosition:position(fs),stickers:Cube.clone(p.stickers),solved:equal(p.position,position(fs))&&correct(p)};});
    return {items,count:items.filter(p=>p.solved).length,prerequisiteComplete:prerequisite.complete,complete:prerequisite.complete&&items.every(p=>p.solved)};
  }
  function topStatus(state,corners){
    const prerequisite=corners?topStatus(state,false):middleStatus(state);
    const identities=corners?sidePairs.map(fs=>['U',...fs]):sides.map(f=>['U',f]);
    const items=identities.map(fs=>{const p=piece(state,fs),white=p.stickers.find(s=>s.homeFace==='U');return {id:fs.join(''),name:fs.map(f=>Cube.COLORS[f]).join('')+(corners?'顶角':'顶棱'),position:p.position.slice(),whiteNormal:white.normal.slice(),stickers:Cube.clone(p.stickers),solved:p.position[1]===1&&equal(white.normal,Cube.NORMALS.U)};});
    const count=items.filter(p=>p.solved).length;
    let shape=corners?count+' 个顶角白色朝上':count===4?'十字':count===0?'点':count===2?'折线':'非标准形态';
    if(!corners&&count===2){const [a,b]=items.filter(p=>p.solved);if(a.position[0]===-b.position[0]&&a.position[2]===-b.position[2])shape='一字';}
    if(!prerequisite.complete)shape='前置阶段尚未恢复';
    return {items,count,shape,prerequisiteComplete:prerequisite.complete,complete:prerequisite.complete&&count===4};
  }
  function wholeCubeStatus(state){
    const stickers=state.flatMap(p=>p.stickers);
    const faces=Object.entries(Cube.NORMALS).map(([face,normal])=>{
      const visible=stickers.filter(s=>equal(s.normal,normal));
      const count=visible.filter(s=>s.homeFace===face).length;
      return {id:face,name:Cube.COLORS[face]+'色 '+face+' 面',count,total:9,complete:visible.length===9&&count===9};
    });
    const count=faces.reduce((sum,f)=>sum+f.count,0);
    return {faces,count,total:54,complete:state.length===26&&stickers.length===54&&faces.every(f=>f.complete)&&state.every(p=>equal(p.position,position(p.stickers.map(s=>s.homeFace))))};
  }
  function permutationStatus(state,corners){
    const prerequisite=corners?topStatus(state,true):permutationStatus(state,true);
    const identities=corners?sidePairs.map(fs=>['U',...fs]):sides.map(f=>['U',f]);
    const items=identities.map(fs=>{
      const p=piece(state,fs),targetPosition=position(fs);
      return {id:fs.join(''),name:fs.map(f=>Cube.COLORS[f]).join('')+(corners?'顶角':'顶棱'),
        position:p.position.slice(),targetPosition,stickers:Cube.clone(p.stickers),
        solved:equal(p.position,targetPosition)&&correct(p)};
    });
    const count=items.filter(p=>p.solved).length;
    const wholeCube=corners?undefined:wholeCubeStatus(state);
    return {items,count,prerequisiteComplete:prerequisite.complete,
      complete:prerequisite.complete&&count===4&&(corners||wholeCube.complete),
      ...(wholeCube?{wholeCube}:{})};
  }
  const middleMacros=algorithms([
    ['中棱向右插入',"U R U' R' U' F' U F"],
    ['中棱向左插入',"U' L' U L U F U' F'"]
  ]);
  const crossMacros=algorithms([['顶棱定向',"F R U R' U' F'"]]);
  const faceMacros=algorithms([['顶角定向（小鱼）',"R U R' U R U2 R'"]]);
  // T perm swaps two top corners and two top edges while retaining orientation.
  // Ua and its inverse cycle three edges, leaving all corners fixed.
  const cornerPermutationMacros=algorithms([['顶角换位（T公式）',"R U R' U' R' F R2 U' R' U' R U R' F'"]]);
  const edgePermutationMacros=algorithms([['顶棱三循环（Ua公式）',"R U' R U R U R U' R' U' R2"]]).filter(m=>m.moves.length>1);

  // Project away permutations that do not affect the current objective. Every
  // visited representative still carries the full cube for protection checks.
  function topProjection(state,corners){
    const slots=corners?sidePairs.map(fs=>position(['U',...fs])):sides.map(f=>position(['U',f]));
    return slots.map(slot=>{
      const p=state.find(p=>equal(p.position,slot)),white=p?.stickers.find(s=>s.homeFace==='U');
      if(!white)throw new Error('顶层状态不满足前置条件');
      return white.normal.findIndex(v=>v!==0);
    }).join(',');
  }
  function permutationProjection(state,corners){
    const slots=corners?sidePairs.map(fs=>position(['U',...fs])):sides.map(f=>position(['U',f]));
    return slots.map(slot=>{
      const p=state.find(p=>equal(p.position,slot));
      if(!p||!p.stickers.some(s=>s.homeFace==='U'))throw new Error('顶层排列不满足前置条件');
      return p.stickers.map(s=>s.homeFace).sort().join('');
    }).join('/');
  }
  async function search(initial,{macros,project,goal,allowed,signal}){
    const first=project(initial),nodes=new Map([[first,{state:initial,cost:0,path:[]}]]),visited=new Set();
    while(true){
      abort(signal);let id=null,current=null;
      for(const [key,node] of nodes)if(!visited.has(key)&&(!current||node.cost<current.cost)){id=key;current=node;}
      if(!current)throw new Error('当前状态没有可用的保留前置阶段的公式路径');
      if(goal(current.state))return current.path;
      visited.add(id);
      if(visited.size>128)throw new Error('规划状态超出本阶段边界，已暂停');
      for(const macro of macros){
        const next=apply(current.state,macro.moves);if(!allowed(next))continue;
        const key=project(next),cost=current.cost+macro.moves.length;
        if(!nodes.has(key)||cost<nodes.get(key).cost)nodes.set(key,{state:next,cost,path:[...current.path,macro]});
      }
      if(visited.size%4===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  function candidate(state,path,P,protectedIds,target,id){
    const before=P.status(state);let next=state,turns=0;
    const segments=[],safeStops=[];
    for(const macro of path){
      next=apply(next,macro.moves);const checkpoint=P.status(next);
      if(!checkpoint.prerequisiteComplete||protectedIds.some(id=>!checkpoint.items.find(p=>p.id===id)?.solved))throw new Error('公式未通过已完成部分的保护检查');
      turns+=macro.moves.length;safeStops.push(turns);segments.push({...macro,moves:macro.moves.slice(),endsAt:turns});
    }
    const after=P.status(next);
    if(after.count<=before.count)throw new Error('候选方案没有取得阶段进展');
    if(P.STAGE.number>=4&&!after.complete)throw new Error('候选方案尚未达到本阶段完整完成条件');
    return {id,target:target.name,targetId:target.id,moves:segments.flatMap(s=>s.moves),segments,safeStops,
      beforeCount:before.count,afterCount:after.count,protected:protectedIds,protectedDescription:P.STAGE.protection,
      completed:after.items.filter(p=>p.solved).map(p=>p.id),expectedKey:Cube.key(next)};
  }
  const commonRules=[
    '固定D黄、U白、F绿、R红、B蓝、L橙，x右y上z前；改变视角不改变面定义。',
    '使用标准U D L R F B外层转动：正对该面的顺时针90°，撇号逆时针90°，2为180°。',
    '候选由当前54张真实贴纸模拟得出，每段公式末尾核对前置阶段；中途允许暂时打破已完成部分，不在公式中途改换计划。',
    '只选择候选ID或PAUSE，不生成额外转动，不倒放打乱记录，不越过当前阶段。优先afterCount较大，再优先moves较少。',
    'PAUSE只表示暂停。模型置信度不代替程序的真实状态完成检查。停止操作将在当前完整公式结束、前置阶段恢复后生效。'
  ];
  function create(number,name,itemName,previousName,status,macros,rules){
    const protection={3:'完整底层及已有正确中棱',4:'完整前两层',5:'完整前两层及顶层十字',6:'完整前两层及白色顶面',7:'完整前两层、白色顶面及四个已归位顶角'}[number];
    const P={...Cube,status,STAGE:{number,name,itemName,protection,completion:protection+'保留，'+name+'全部检查通过。自动停止于第'+number+'步。'}};
    P.validate=state=>{Cube.validate(state);status(state);};
    P.ready=state=>{if(!status(state).prerequisiteComplete)throw new Error('请先完成第'+(number-1)+'步'+previousName);};
    P.RULES=['只执行七步法第'+number+'步：'+name+'。前提：'+previousName+'已完成。',...commonRules,...rules].join('\n');
    P.request=(state,plans,{revision,model,recent=[]}={})=>({model,state:JSON.stringify({rules:P.RULES,stage:{number,name},revision,
      coordinates:'x向右，y向上，z向前；整数位置和贴纸法向量',prerequisite:{stage:number-1,name:previousName,complete:status(state).prerequisiteComplete,mustPreserve:protection},
      progress:status(state),cube:state,recentPlans:recent.slice(-4),candidates:plans.map(({expectedKey,...p})=>p)}),
      questions:{plan:{type:'choice',instructions:'选择已模拟验证的'+name+'方案；优先完成更多目标，其次实际转动更少。需要暂停才选择PAUSE。',criteria:Object.fromEntries([...plans.map(p=>[p.id,`${p.target}：${p.moves.join(' ')}；${p.beforeCount}/4 → ${p.afterCount}/4；保留${protection}。`]),['PAUSE','暂停，不代表完成']])}}});
    P.plan=async(state,{signal}={})=>{
      P.validate(state);P.ready(state);abort(signal);const before=status(state);if(before.complete)return [];
      const plans=[];
      if(number===3){
        const protectedIds=before.items.filter(p=>p.solved).map(p=>p.id);
        for(const target of before.items.filter(p=>!p.solved)){
          const fs=target.id.split('');
          const path=await search(state,{macros,signal,
            project:s=>{const p=piece(s,fs);return p.position.join(',')+'/'+p.stickers.find(t=>t.homeFace===fs[0]).normal.join(',');},
            goal:s=>status(s).items.find(p=>p.id===target.id).solved,
            allowed:s=>{const p=status(s);return p.prerequisiteComplete&&protectedIds.every(id=>p.items.find(p=>p.id===id).solved);}});
          plans.push(candidate(state,path,P,protectedIds,target,'middle_plan_'+(plans.length+1)));
        }
      }else{
        // A full orientation plan can cross equal-count or lower-count patterns.
        // Search to the complete pattern, not a greedy single-formula gain.
        // Stage 7 cannot use standalone U setups: they would displace corners.
        for(const setup of number===7?[[]]:[[],['U'],["U'"],['U2']]){
          abort(signal);const start=apply(state,setup);
          const path=await search(start,{macros,signal,project:s=>number>=6?permutationProjection(s,number===6):topProjection(s,number===5),goal:s=>status(s).complete,allowed:s=>status(s).prerequisiteComplete});
          const prefix=setup.length?[{name:'顶层形态对位 '+setup[0],moves:setup}]:[];
          const plan=candidate(state,[...prefix,...path],P,[],{id:number>=6?'top_permutation':'top_orientation',name},(number>=6?'permutation_plan_':'orientation_plan_')+(plans.length+1));
          if(!plans.some(p=>p.moves.join(' ')===plan.moves.join(' ')))plans.push(plan);
        }
      }
      abort(signal);return plans;
    };
    return P;
  }
  const middle=create(3,'中层棱块','中棱','底层一面',middleStatus,middleMacros,[
    '目标FR、RB、BL、LF四个不含白黄的中层棱块位置和两色方向正确，底层保持完整。',
    '目标在U层时先对齐侧色，再向左或向右插入；错槽或翻转的中棱先取出。按实际状态搜索公式，每套结束至少新增一个正确中棱，保护已有正确中棱。'
  ]);
  const topCross=create(4,'顶层十字','朝上顶棱','中层棱块',s=>topStatus(s,false),crossMacros,[
    '识别白色顶棱的点、折线、一字、十字形态，用U对位及F R U R\' U\' F\'定向公式及其旋转、逆公式完成白色十字。',
    '保持前两层完整，只要求四个顶棱白色朝U；顶棱侧色顺序和顶角此步不要求复原。整套候选搜索至十字，不以单个公式的计数贪心判断进展。'
  ]);
  const topFace=create(5,'顶面同色','朝上顶角','顶层十字',s=>topStatus(s,true),faceMacros,[
    '保持前两层和白色顶层十字，识别四个顶角白色法向量，用U对位、小鱼公式R U R\' U R U2 R\'及旋转、逆公式调整顶角朝向。',
    '顶角朝上个数可能暂时下降；规划必须搜索到四个顶角白色全部朝U，不能只追求下一公式计数增加。',
    '完成标准是U面九张白色贴纸朝上且前两层正确；此时顶角、顶棱的侧色顺序可能仍未归位，不得宣称整个魔方复原，不开始第6或7步。'
  ]);
  const topCorners=create(6,'顶层角块归位','归位顶角','顶面同色',s=>permutationStatus(s,true),cornerPermutationMacros,[
    '目标UFR、URB、UBL、ULF四个顶角处于各自三色中心对应的槽位，白色朝U，两个侧色均对齐。仅白色朝上不算角块归位。',
    '使用U层对位和T换位公式R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'，以及四个侧向重命名与逆公式，搜索完整顶角排列。',
    '每段公式结束保持前两层和顶面同色；本阶段允许顶棱位置交换，也允许已正确的顶角临时换位，整套方案结束要求四个顶角全部归位。不能因单次公式归位数未增加而中途换计划。',
    '完成第6步后停止，顶棱侧色的最终排列交给第7步，不能提前宣称整个魔方已复原。'
  ]);
  const topEdges=create(7,'顶层棱块归位','归位顶棱','顶层角块归位',s=>permutationStatus(s,false),edgePermutationMacros,[
    '目标UF、UR、UB、UL四个顶棱位置与两色朝向正确，保持前两层、顶面同色及四个顶角归位。',
    '用Ua三棱循环R U\' R U R U R U\' R\' U\' R2、逆公式Ub及四个侧向重命名搜索顶棱排列。对棱互换和邻棱双交换可由多个三循环组成。',
    '不能单独转U对位，因为这会打乱已归位顶角；选择算法的侧向版本，不改变全局面定义。每段公式结束重新检查所有顶角与前两层。',
    '部分顶棱可在中间公式后暂时失去正确位置，整套候选必须到达四棱完全归位。只有六个面分别9张贴纸均对齐对应中心、全部54张贴纸正确且26个小块位置正确，才能宣布整个魔方复原。'
  ]);
  topEdges.STAGE.completion='六面各9张贴纸全部对齐中心，54/54张贴纸及所有小块位置通过检查，整个魔方已复原。';
  return {middle,topCross,topFace,topCorners,topEdges};
});
