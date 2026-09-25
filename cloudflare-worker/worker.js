const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const STUDIO_API_ENDPOINT = 'https://studio-monkeyqiu-3dcube.api-inference.modelscope.net/api/jev';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MAX_BODY_BYTES = 256 * 1024;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function allowedOrigins(env) {
  return new Set((env.ALLOWED_ORIGINS || 'https://monkeyqiu-3dcube.ms.show')
    .split(',').map(value => value.trim()).filter(Boolean));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/jev') return new Response('Not found', { status: 404 });

    const origin = request.headers.get('Origin') || '';
    const origins = allowedOrigins(env);
    if (!origin || !origins.has(origin)) return json(403, { error: { message: 'Origin not allowed' } });
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Jev-API-Key, X-DeepSeek-API-Key, X-ModelScope-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { error: { message: 'Method not allowed' } }, cors);

    const deepseekKey=request.headers.get('X-DeepSeek-API-Key');
    if(deepseekKey&&!/\s/.test(deepseekKey)){
      try{
        const body=await request.text();if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)return json(413,{error:{message:'Request too large'}},cors);
        const parsed=JSON.parse(body);if(parsed.provider!=='deepseek'||!parsed.payload)return json(400,{error:{message:'Invalid DeepSeek request'}},cors);
        const upstream=await fetch(DEEPSEEK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${deepseekKey}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:'Strictly choose one candidate id or PAUSE from context. Return JSON only; never output move sequences.'},{role:'user',content:JSON.stringify(parsed.payload)}],response_format:{type:'json_object'},temperature:0}),signal:AbortSignal.timeout(55000)});
        const result=await upstream.json();if(!upstream.ok)return json(upstream.status,{error:{message:result.error?.message||'DeepSeek API request failed'}},cors);
        let choice;try{choice=JSON.parse(result.choices?.[0]?.message?.content||'{}')}catch{return json(502,{error:{message:'DeepSeek returned invalid JSON'}},cors);}
        if(typeof choice.choice!=='string')return json(502,{error:{message:'DeepSeek choice missing'}},cors);
        return json(200,{model:result.model||'deepseek-flash',answers:{plan:{type:'choice',choice:choice.choice,confidence:Number.isFinite(choice.confidence)?choice.confidence:null}}},cors);
      }catch(error){return json(502,{error:{message:error.name==='TimeoutError'?'DeepSeek request timed out':'Proxy could not connect to DeepSeek'}},cors);}
    }
    const jevKey = request.headers.get('X-Jev-API-Key');
    if (!jevKey || /\s/.test(jevKey)) return json(401, { error: { message: 'Missing Jev API Key' } }, cors);
    const modelScopeToken = request.headers.get('X-ModelScope-Token');
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) return json(413, { error: { message: 'Request too large' } }, cors);

    let body;
    try {
      body = await request.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json(413, { error: { message: 'Request too large' } }, cors);
      JSON.parse(body);
    } catch {
      return json(400, { error: { message: 'Invalid JSON' } }, cors);
    }

    try {
      const upstream = await fetch(modelScopeToken ? STUDIO_API_ENDPOINT : JEV_ENDPOINT, {
        method: 'POST',
        headers: modelScopeToken
          ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${modelScopeToken}`, 'X-Jev-API-Key': jevKey }
          : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jevKey}` },
        body,
        signal: AbortSignal.timeout(55000),
      });
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return json(502, { error: { message: error.name === 'TimeoutError' ? 'Jev request timed out' : 'Proxy could not connect to Jev' } }, cors);
    }
  },
};
