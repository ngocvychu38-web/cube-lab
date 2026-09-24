const MAX_BODY_BYTES = 256 * 1024;
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const STUDIO_ENDPOINT = 'https://studio-monkeyqiu-3dcube.api-inference.modelscope.net/api/jev';

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

  const jevKey = request.headers.get('X-Jev-API-Key');
  if (!jevKey || /\s/.test(jevKey)) return send(401, { error: { message: '缺少有效的 Jev API Key' } });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return send(413, { error: { message: '请求过大' } });

  let body;
  try {
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return send(413, { error: { message: '请求过大' } });
    JSON.parse(body);
  } catch {
    return send(400, { error: { message: '无效 JSON' } });
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
