/* Pure cube model and exact search for the four D-layer edges. No rendering or network. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrossPlanner = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NORMALS = { U: [0,1,0], D: [0,-1,0], L: [-1,0,0], R: [1,0,0], F: [0,0,1], B: [0,0,-1] };
  const AXES = { U: [1,1,-1], D: [1,-1,1], L: [0,-1,1], R: [0,1,-1], F: [2,1,-1], B: [2,-1,1] };
  const COLORS = { U:'白', D:'黄', L:'橙', R:'红', F:'绿', B:'蓝' };
  const MOVES = Object.keys(AXES).flatMap(f => [f, f+"'", f+'2']);
  const TARGETS = ['F','R','B','L'].map(face => ({ id:'D'+face, face, name:'黄'+COLORS[face]+'棱块', position:NORMALS.D.map((v,i) => v+NORMALS[face][i]) }));
  const equal = (a,b) => a.every((v,i) => v === b[i]);
  const clone = state => JSON.parse(JSON.stringify(state));
  function rotate(v, axis, sign) {
    const [x,y,z] = v;
    const result = axis === 0 ? (sign > 0 ? [x,-z,y] : [x,z,-y])
      : axis === 1 ? (sign > 0 ? [z,y,-x] : [-z,y,x])
      : (sign > 0 ? [-y,x,z] : [y,-x,z]);
    return result.map(v => v || 0);
  }
  function moveInfo(move) {
    if (!MOVES.includes(move)) throw new Error('非法转动：'+move);
    const [axis,layer,sign] = AXES[move[0]];
    return { axis, layer, sign:sign*(move.endsWith("'")?-1:1), times:move.endsWith('2')?2:1 };
  }
  function move(state, notation) {
    const next = clone(state), info = moveInfo(notation);
    for (const p of next) if (p.position[info.axis] === info.layer) {
      for (let t=0;t<info.times;t++) {
        p.position = rotate(p.position, info.axis, info.sign);
        p.stickers.forEach(s => { s.normal = rotate(s.normal, info.axis, info.sign); });
      }
    }
    return next;
  }
  function key(state) {
    return JSON.stringify(state.map(p => [p.stickers.map(s=>s.homeFace).sort().join(''),p.position,
      p.stickers.map(s=>[s.homeFace,s.normal]).sort((a,b)=>a[0].localeCompare(b[0]))]).sort((a,b)=>a[0].localeCompare(b[0])));
  }
  function status(state) {
    const edges = TARGETS.map(target => {
      const p = state.find(p=>p.stickers.length===2 && p.stickers.some(s=>s.homeFace==='D') && p.stickers.some(s=>s.homeFace===target.face));
      if (!p) throw new Error('魔方状态缺少 '+target.name);
      const down = p.stickers.find(s=>s.homeFace==='D'), side=p.stickers.find(s=>s.homeFace===target.face);
      const positionCorrect=equal(p.position,target.position), yellowDown=equal(down.normal,NORMALS.D), sideAligned=equal(side.normal,NORMALS[target.face]);
      return {...target, position:p.position.slice(), targetPosition:target.position.slice(), yellowNormal:down.normal.slice(), sideNormal:side.normal.slice(), positionCorrect, yellowDown, sideAligned, solved:positionCorrect&&yellowDown&&sideAligned};
    });
    return {edges, count:edges.filter(e=>e.solved).length, complete:edges.every(e=>e.solved)};
  }
  function validate(state) {
    if (!Array.isArray(state)||state.length!==26) throw new Error('魔方状态应包含26个可见小块');
    const cells=new Set(), identities=new Set(), counts=Object.fromEntries(Object.keys(NORMALS).map(f=>[f,0]));
    for(const p of state){
      if (!Array.isArray(p.position)||p.position.length!==3||!p.position.every(v=>[-1,0,1].includes(v))) throw new Error('小块位置非法');
      const cell=p.position.join(',');if(cells.has(cell))throw new Error('小块位置重复');cells.add(cell);
      if(p.stickers.length!==p.position.filter(v=>v!==0).length)throw new Error('贴纸数与小块位置不符');
      const identity=p.stickers.map(s=>s.homeFace).sort().join('');if(identities.has(identity))throw new Error('小块身份重复');identities.add(identity);
      const directions=new Set();
      for(const s of p.stickers){
        if(!NORMALS[s.homeFace]||!Object.values(NORMALS).some(n=>equal(n,s.normal)))throw new Error('贴纸方向非法');
        const n=s.normal.join(',');if(directions.has(n)||s.normal.reduce((sum,v,i)=>sum+v*p.position[i],0)!==1)throw new Error('贴纸未朝向外表面');directions.add(n);counts[s.homeFace]++;
      }
      if(p.stickers.length===1&&(!equal(p.position,NORMALS[p.stickers[0].homeFace])||!equal(p.stickers[0].normal,p.position)))throw new Error('中心方向不正确');
    }
    if(Object.values(counts).some(n=>n!==9))throw new Error('六色贴纸应各有9张');
    status(state);
  }

  // Each edge has 12 positions × 2 possible directions for its yellow sticker.
  const edgeStates=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    const position=[x,y,z];if(position.filter(v=>v!==0).length!==2)continue;
    position.forEach((v,i)=>{if(v){const normal=[0,0,0];normal[i]=v;edgeStates.push({position,normal});}});
  }
  const edgeCode = (p,n) => edgeStates.findIndex(s=>equal(s.position,p)&&equal(s.normal,n));
  const transitions=edgeStates.map(s=>MOVES.map(m=>{
    const info=moveInfo(m);let p=s.position,n=s.normal;
    if(p[info.axis]===info.layer)for(let i=0;i<info.times;i++){p=rotate(p,info.axis,info.sign);n=rotate(n,info.axis,info.sign)}
    return edgeCode(p,n);
  }));
  const goalCodes=TARGETS.map(t=>edgeCode(t.position,NORMALS.D));
  const tables=new Map();
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
  function abortIfNeeded(signal){if(signal?.aborted){const e=new Error('操作已停止');e.name='AbortError';throw e;}}
  function encode(codes){return codes.reduce((value,code,i)=>value+code*24**i,0);}
  function transitionCode(code,count,m){let out=0,factor=1;for(let i=0;i<count;i++){out+=transitions[code%24][m]*factor;code=Math.floor(code/24);factor*=24;}return out;}
  async function tableFor(indices,signal){
    const cacheKey=indices.join(',');if(tables.has(cacheKey))return tables.get(cacheKey);
    const size=24**indices.length, dist=new Uint8Array(size);dist.fill(255);
    const queue=new Uint32Array(size),goal=encode(indices.map(i=>goalCodes[i]));let head=0,tail=1;queue[0]=goal;dist[goal]=0;
    while(head<tail){
      const code=queue[head++],d=dist[code]+1;
      for(let m=0;m<MOVES.length;m++){
        const next=transitionCode(code,indices.length,m);
        if(dist[next]===255){dist[next]=d;queue[tail++]=next;}
      }
      if(head%2048===0){abortIfNeeded(signal);await yieldUI();}
    }
    abortIfNeeded(signal);const table={dist,goal,count:indices.length};tables.set(cacheKey,table);return table;
  }
  function pathFrom(codes,table){
    let code=encode(codes);if(table.dist[code]===255)throw new Error('底棱状态不可达');const path=[];
    while(code!==table.goal){
      let found=false;
      for(let m=0;m<MOVES.length;m++){
        const next=transitionCode(code,table.count,m);
        if(table.dist[next]===table.dist[code]-1){path.push(MOVES[m]);code=next;found=true;break;}
      }
      if(!found)throw new Error('没有找到使目标前进的方案');
    }
    return path;
  }
  async function plan(state,{signal}={}){
    validate(state);abortIfNeeded(signal);const before=status(state);if(before.complete)return [];
    const protectedIndices=before.edges.flatMap((e,i)=>e.solved?[i]:[]), plans=[];
    for(let target=0;target<4;target++){
      if(before.edges[target].solved)continue;
      abortIfNeeded(signal);
      const indices=[...protectedIndices,target].sort((a,b)=>a-b);
      const table=await tableFor(indices,signal);
      const sequence=pathFrom(indices.map(i=>edgeCode(before.edges[i].position,before.edges[i].yellowNormal)),table);
      const afterState=sequence.reduce((s,m)=>move(s,m),state), after=status(afterState);
      if(!after.edges[target].solved||after.count<=before.count||protectedIndices.some(i=>!after.edges[i].solved))throw new Error('候选方案未通过保护检查');
      if(plans.some(p=>p.moves.join(' ')===sequence.join(' ')))continue;
      plans.push({id:'plan_'+(plans.length+1),targetId:TARGETS[target].id,target:TARGETS[target].name,moves:sequence,
        beforeCount:before.count,afterCount:after.count,protected:protectedIndices.map(i=>TARGETS[i].id),
        completed:after.edges.filter(e=>e.solved).map(e=>e.id), expectedKey:key(afterState)});
    }
    return plans;
  }
  const RULES=[
    '只执行七步法第1步：底层十字。底面D=黄、顶面U=白、F=绿、R=红、B=蓝、L=橙。',
    '标准Singmaster记号：字母为正对该面的顺时针90°，撇号为逆时针90°，2为180°；拖动视角不改变面定义。',
    '完成需DF、DR、DB、DL四个底棱均位置正确，黄色朝D，另一色贴纸对齐对应侧面中心。仅底部看似十字不算完成。',
    '候选方案根据当前真实状态搜索，已逐步模拟；每个方案结束后至少多完成一个底棱，并恢复所有先前完成底棱。',
    '完整方案途中允许临时打破十字；执行时不换计划，方案结束后才重新规划。角块和其他棱块在第1步不要求复原。',
    '只选择候选方案ID。优先完成更多底棱，其次用更少转动；不倒放打乱记录、不自行生成转动，不开始第2步。',
    'PAUSE表示暂停，不能用来宣称复原。程序独立核对完成条件，置信度不等于完成证明。'
  ].join('\n');
  function request(state,plans,{revision,model,recent=[]}={}){
    return {model,state:JSON.stringify({rules:RULES,stage:{number:1,name:'底层十字'},revision,
      coordinates:'x向右，y向上，z向前；position和normal是整数坐标',
      progress:status(state),cube:state,recentPlans:recent.slice(-4),
      candidates:plans.map(({expectedKey,...p})=>p)}),
      questions:{plan:{type:'choice',instructions:'选择一个已模拟验证的底层十字方案：先优先更大的afterCount，再优先更少moves。仅在需要中止时选PAUSE。',
        criteria:Object.fromEntries([...plans.map(p=>[p.id,`${p.target}：${p.moves.join(' ')}；完成 ${p.beforeCount}/4 → ${p.afterCount}/4；${p.moves.length} 次转动；已验证保留 ${p.protected.join(',')||'无已有底棱'}。`]),['PAUSE','暂停本轮操作（不是完成）']])}}};
  }
  return {MOVES,NORMALS,TARGETS,COLORS,move,key,status,validate,plan,request,clone,RULES};
});
