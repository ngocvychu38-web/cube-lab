const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 7860 : 8787));
const production = process.env.NODE_ENV === 'production';
const listenHost = production ? '0.0.0.0' : '127.0.0.1';

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (!production) {
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const allowedOrigins = new Set(['null', `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
    if (!allowedHosts.has(req.headers.host)) return send(res, 403, 'text/plain', 'Invalid host');
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return send(res, 403, 'text/plain', 'Origin not allowed');
  } else if (req.headers.origin) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers.host || '');
    if (!['http', 'https'].includes(forwardedProto) || req.headers.origin !== `${forwardedProto}://${host}`)
      return send(res, 403, 'text/plain', 'Origin not allowed');
  }
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS' && req.url === '/api/jev') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Jev-API-Key, X-DeepSeek-API-Key, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.writeHead(204);res.end();return;
  }
  if (req.method === 'POST' && req.url === '/api/jev') {
    const deepseekApiKey=req.headers['x-deepseek-api-key'];
    if(typeof deepseekApiKey==='string'&&/^\S+$/.test(deepseekApiKey)){
      let raw='';req.setEncoding('utf8');req.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>256*1024){send(res,413,'application/json',JSON.stringify({error:{message:'请求过大'}}));req.destroy();}});
      req.on('end',async()=>{try{
        const parsed=JSON.parse(raw);if(parsed.provider!=='deepseek'||!parsed.payload)throw new Error('无效 DeepSeek 请求');
        const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+deepseekApiKey},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:'严格依据上下文候选方案选择一个候选 id 或 PAUSE，只输出 JSON，不得输出转动公式。'},{role:'user',content:JSON.stringify(parsed.payload)}],response_format:{type:'json_object'},temperature:0}),signal:AbortSignal.timeout(55000)});
        const result=await upstream.json();if(!upstream.ok)return send(res,upstream.status,'application/json',JSON.stringify({error:{message:result.error?.message||'DeepSeek API 请求失败'}}));
        let choice;try{choice=JSON.parse(result.choices?.[0]?.message?.content||'{}')}catch{return send(res,502,'application/json',JSON.stringify({error:{message:'DeepSeek 未返回有效 JSON'}}));}
        if(typeof choice.choice!=='string')return send(res,502,'application/json',JSON.stringify({error:{message:'DeepSeek 缺少候选选择'}}));
        send(res,200,'application/json',JSON.stringify({model:result.model||'deepseek-flash',answers:{plan:{type:'choice',choice:choice.choice,confidence:Number.isFinite(choice.confidence)?choice.confidence:null}}}));
      }catch(error){if(!res.destroyed)send(res,502,'application/json',JSON.stringify({error:{message:error.message||'无法连接 DeepSeek'}}));}});return;
    }
    const jevApiKey = req.headers['x-jev-api-key'];
    if (typeof jevApiKey !== 'string' || !/^\S+$/.test(jevApiKey)) return send(res, 401, 'application/json', JSON.stringify({error:{message:'缺少 API Key'}}));
    let raw = '', bytes = 0, oversized = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > 256 * 1024) {
        if (!oversized) send(res, 413, 'application/json', JSON.stringify({error:{message:'请求过大'}}));
        oversized = true;return;
      }
      raw += chunk;
    });
    req.on('end', async () => {
      if (oversized) return;
      try { JSON.parse(raw); } catch { return send(res, 400, 'application/json', JSON.stringify({error:{message:'无效 JSON'}})); }
      const aborter = new AbortController(), timer = setTimeout(() => aborter.abort(), 55000);
      res.on('close', () => { if (!res.writableEnded) aborter.abort(); });
      try {
        const upstream = await fetch('https://api.typesafe.ai/v1/systemone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + jevApiKey
          },
          body: raw,
          signal: aborter.signal
        });
        const text = await upstream.text();
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store'
        });
        res.end(text);
      } catch (error) {
        if (!res.destroyed) send(res, 502, 'application/json', JSON.stringify({ error: { message: error.name === 'AbortError' ? 'Jev 请求超时或已取消' : '本地服务无法连接 Jev，请检查网络' } }));
      } finally { clearTimeout(timer); }
    });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const audioAssets={'/assets/audio/rubik-turn-90.wav':'rubik-turn-90.wav','/assets/audio/rubik-turn-180.wav':'rubik-turn-180.wav'};
  if((req.method==='GET'||req.method==='HEAD')&&audioAssets[url.pathname]){
    return send(res,200,'audio/wav',req.method==='HEAD'?'':fs.readFileSync(path.join(root,'assets','audio',audioAssets[url.pathname])));
  }
  const assets = {'/':'index.html','/index.html':'index.html','/cross-planner.js':'cross-planner.js','/corner-planner.js':'corner-planner.js','/layer-planners.js':'layer-planners.js','/cross-controller.js':'cross-controller.js'};
  if ((req.method === 'GET' || req.method === 'HEAD') && assets[url.pathname]) {
    const file = assets[url.pathname];
    send(res, 200, file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', req.method === 'HEAD' ? '' : fs.readFileSync(path.join(root, file)));
    return;
  }
  if(req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, 'application/json', JSON.stringify({ok:true,app:'cube-lab',feature:'seven-step',stages:[1,2,3,4,5,6,7]}));
    return;
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(port, listenHost, () => {
  console.log(`Cube Lab listening at ${listenHost}:${port}`);
});
