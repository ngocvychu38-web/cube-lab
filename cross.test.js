const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('./cross-planner.js');
const Controller=require('./cross-controller.js');

function solved(){
  const state=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    const position=[x,y,z],stickers=Object.entries(P.NORMALS).filter(([,n])=>n.reduce((s,v,i)=>s+v*position[i],0)===1).map(([homeFace,normal])=>({homeFace,color:P.COLORS[homeFace],normal:normal.slice()}));
    if(stickers.length)state.push({position,stickers});
  }
  return state;
}
function sequence(state,moves){return moves.reduce((s,m)=>P.move(s,m),state);}
let seed=93241;
function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;}
function scramble(){let state=solved();for(let i=0;i<25;i++)state=P.move(state,P.MOVES[Math.floor(random()*18)]);return state;}
function harness(initial,respond){
  let state=P.clone(initial),revision=0,locked=false,updates=[],events=[],requests=[],controller;
  const api={snapshot:()=>P.clone(state),revision:()=>revision,idle:()=>true,lock:x=>{locked=x;},update:x=>updates.push(x),log:(m,d)=>events.push({m,...d}),
    async execute(m){state=P.move(state,m);revision++;},
    async fetch(url,options){const payload=JSON.parse(options.body);requests.push(payload);return respond?respond({payload,options,api,controller,mutate:()=>{state=P.move(state,'U');revision++;}}):{ok:true,text:async()=>JSON.stringify({model:'jev-test',answers:{plan:{type:'choice',choice:Object.keys(payload.questions.plan.criteria)[0],confidence:.9}}})};}};
  controller=Controller.create(api);
  return {controller,api,events,updates,requests,getState:()=>state,get locked(){return locked;}};
}
const config={model:'jev-latest',apiKey:'test-placeholder',transport:'http://local-test/api/jev'};

test('standard turns, sticker integrity, D face alone is not an aligned cross',()=>{
  const base=solved();P.validate(base);assert.equal(base.flatMap(p=>p.stickers).length,54);
  for(const m of P.MOVES){const inverse=m.endsWith('2')?m:m.endsWith("'")?m[0]:m+"'";assert.equal(P.key(sequence(base,[m,inverse])),P.key(base));P.validate(P.move(base,m));}
  for(const f of ['U','D','L','R','F','B'])assert.equal(P.key(sequence(base,[f,f,f,f])),P.key(base));
  assert.equal(P.status(P.move(base,'U')).count,4);
  assert.equal(P.status(P.move(base,'D')).count,0);
  const df=P.status(P.move(base,'F')).edges.find(e=>e.id==='DF');assert.deepEqual(df.position,[-1,0,1]);
});

test('all offered plans make progress and preserve completed edges over 60 seeded scrambles',async()=>{
  for(let sample=0;sample<60;sample++){
    let state=scramble(),rounds=0;
    while(!P.status(state).complete){
      const before=P.status(state),plans=await P.plan(state);
      assert.ok(plans.length>0&&plans.length<=4);
      for(const plan of plans){
        const afterState=sequence(state,plan.moves),after=P.status(afterState);
        assert.ok(after.count>before.count);assert.ok(after.edges.find(e=>e.id===plan.targetId).solved);
        assert.ok(before.edges.filter(e=>e.solved).every(e=>after.edges.find(a=>a.id===e.id).solved));
        assert.equal(P.key(afterState),plan.expectedKey);P.validate(afterState);
      }
      state=sequence(state,plans[Math.floor(random()*plans.length)].moves);rounds++;assert.ok(rounds<=4);
    }
  }
  assert.deepEqual(await P.plan(solved()),[]);
});

test('Jev plan selection → execution → cross verification stops before stage 2',async()=>{
  const h=harness(scramble());await h.controller.start(config);
  assert.ok(P.status(h.getState()).complete);assert.equal(h.locked,false);
  assert.ok(h.requests.length>=1&&h.requests.length<=4);
  assert.equal(h.events.at(-1).type,'complete');
  for(const request of h.requests){const state=JSON.parse(request.state);assert.equal(state.stage.number,1);assert.equal(state.cube.flatMap(p=>p.stickers).length,54);assert.ok(state.candidates.length);assert.equal(request.messages,undefined);}
  assert.ok(h.updates.some(x=>x.phase==='executing'&&x.step===1));
  assert.equal(JSON.stringify(h.events).includes(config.apiKey),false);
});

test('completed cross makes no API request',async()=>{
  const h=harness(solved());await h.controller.start({...config,apiKey:''});assert.equal(h.requests.length,0);assert.equal(h.events.at(-1).type,'complete');
});

test('reject stale replies and fabricated plans before any execution',async()=>{
  for(const stale of [true,false]){
    const initial=scramble();const h=harness(initial,async({payload,mutate})=>{
      if(stale)mutate();return {ok:true,text:async()=>JSON.stringify({answers:{plan:{type:'choice',choice:stale?Object.keys(payload.questions.plan.criteria)[0]:'invented'}}})};
    });
    await h.controller.start(config);assert.equal(h.events.at(-1).type,'error');assert.equal(h.events.filter(e=>e.type==='move-start').length,0);assert.equal(h.locked,false);
  }
});

test('HTTP errors, invalid JSON and pause never imply success',async()=>{
  const responses=[{ok:false,status:401,text:async()=>JSON.stringify({error:{message:'unauthorized'}})}, {ok:true,text:async()=>'invalid'}, {ok:true,text:async()=>JSON.stringify({answers:{plan:{type:'choice',choice:'PAUSE'}}})}];
  for(const response of responses){const initial=scramble(),h=harness(initial,async()=>response);await h.controller.start(config);assert.equal(P.key(initial),P.key(h.getState()));assert.equal(h.locked,false);assert.ok(!h.events.some(e=>e.type==='complete'));}
});

test('stop while waiting cancels request; stop during move commits one turn then halts',async()=>{
  const h=harness(scramble(),async({options,controller})=>{
    const result=new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{const e=new Error('abort');e.name='AbortError';reject(e);},{once:true}));
    controller.stop();return result;
  });
  await h.controller.start(config);assert.equal(h.events.at(-1).type,'stopped');assert.equal(h.locked,false);
  const h2=harness(scramble()),execute=h2.api.execute;
  h2.api.execute=async m=>{await execute(m);h2.controller.stop();};
  await h2.controller.start(config);assert.equal(h2.events.filter(e=>e.type==='move-end').length,1);assert.equal(h2.events.at(-1).type,'stopped');assert.equal(h2.locked,false);
});

test('divergent real move stops before another turn',async()=>{
  const h=harness(scramble()),execute=h.api.execute;h.api.execute=async m=>execute(m[0]==='U'?'R':'U');
  await h.controller.start(config);assert.equal(h.events.at(-1).type,'error');assert.equal(h.events.filter(e=>e.type==='move-start').length,1);
});
