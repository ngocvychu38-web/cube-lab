const MAX_BODY_BYTES = 256 * 1024;
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const STUDIO_ENDPOINT = 'https://studio-monkeyqiu-3dcube.api-inference.modelscope.net/api/jev';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

function send(status, payload) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default async function jevProxy(request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== requestUrl.origin) return send(403, { error: { message: 'Origin not allowed' } });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method === 'GET') return send(200, { ok: true, service: 'cube-lab-jev-proxy' });
  if (request.method !== 'POST') return send(405, { error: { message: 'Method not allowed' } });

  const deepseekKey = request.headers.get('X-DeepSeek-API-Key');
  const provider = deepseekKey ? 'deepseek' : 'jev';
  const jevKey = request.headers.get('X-Jev-API-Key');
  if (provider === 'jev' && (!jevKey || /\s/.test(jevKey))) return send(401, { error: { message: '缺少有效的 Jev API Key' } });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return send(413, { error: { message: '请求过大' } });

  let body;
  try {
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return send(413, { error: { message: '请求过大' } });
    const parsed = JSON.parse(body);
    if(provider==='deepseek'&&parsed.provider!=='deepseek')return send(400,{error:{message:'无效 DeepSeek 请求'}});
    if(provider==='deepseek'&&(!deepseekKey||/\s/.test(deepseekKey)))return send(401,{error:{message:'缺少有效的 DeepSeek API Key'}});
  } catch {
    return send(400, { error: { message: '无效 JSON' } });
  }

  if(provider==='deepseek'){
    let context;try{context=JSON.stringify(body&&JSON.parse(body).payload||{});}catch{return send(400,{error:{message:'无效 DeepSeek 上下文'}});}
    try{
      const upstream=await fetch(DEEPSEEK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${deepseekKey}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:'严格依据用户上下文里的候选方案做选择。只输出 JSON 对象，choice 必须是一个候选 id 或 PAUSE；不得输出公式。'},{role:'user',content:context}],response_format:{type:'json_object'},temperature:0}),signal:AbortSignal.timeout(55000)});
      const text=await upstream.text();let result;try{result=JSON.parse(text);}catch{return send(upstream.status||502,{error:{message:'DeepSeek 返回无法解析的响应'}});}
      if(!upstream.ok)return send(upstream.status,{error:{message:result.error?.message||'DeepSeek API 请求失败'}});
      let choice;try{choice=JSON.parse(result.choices?.[0]?.message?.content||'{}');}catch{return send(502,{error:{message:'DeepSeek 未返回有效 JSON'}});}
      if(typeof choice.choice!=='string')return send(502,{error:{message:'DeepSeek 缺少候选选择'}});
      return send(200,{model:result.model||'deepseek-flash',answers:{plan:{type:'choice',choice:choice.choice,confidence:Number.isFinite(choice.confidence)?choice.confidence:null}}});
    }catch(error){return send(502,{error:{message:error.name==='TimeoutError'?'DeepSeek 请求超过 55 秒':'代理无法连接 DeepSeek'}});}
  }
  const modelScopeToken = request.headers.get('X-ModelScope-Token');
  const target = modelScopeToken ? STUDIO_ENDPOINT : JEV_ENDPOINT;
  const headers = modelScopeToken
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${modelScopeToken}`, 'X-Jev-API-Key': jevKey }
    : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jevKey}` };

  try {
    const upstream = await fetch(target, {
      method: 'POST', headers, body,
      signal: AbortSignal.timeout(55_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Jev 请求超过 55 秒' : '代理无法连接上游服务';
    return send(502, { error: { message } });
  }
}

export const config = { path: '/api/jev', method: ['GET', 'POST', 'OPTIONS'] };
