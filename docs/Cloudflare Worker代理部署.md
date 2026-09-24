# Cloudflare Worker Jev 代理部署

## 为什么要单独代理

ModelScope Docker Studio 的 `.ms.show` 页面入口会拦截网页对 `/api/jev` 的直接请求，并要求使用 Studio 专用 API 域及 ModelScope Token。浏览器直接请求专用域时，预检请求会先被 401 拦截。独立 Worker 可在服务器端完成这次鉴权转发，避免浏览器跨域预检阻断。Worker 不持久化两个 Token；临时验证时 ModelScope Token 会从浏览器传给 Worker，再用于 Studio API 鉴权。

## 在 Cloudflare 创建

1. 登录 Cloudflare Dashboard，打开 **Workers & Pages**，创建一个 Worker。
2. 在 Worker 编辑器中用 `cloudflare-worker/worker.js` 的全部内容替换示例代码并部署。
3. 在 Worker 的 Settings / Variables 中添加文本变量 `ALLOWED_ORIGINS`，值设为：

   ```text
   https://monkeyqiu-3dcube.ms.show
   ```

   如果浏览器 Network 面板中失败请求的 `Origin` 与此不同，只加入你自己应用的准确 Origin（不要设为 `*`）。修改变量后重新部署/重启 Worker。

4. 复制 Cloudflare 分配的 Worker HTTPS 根地址，格式类似 `https://cube-proxy.<你的账号>.workers.dev`。不要在地址后加 `/api/jev`。
5. 打开魔方页面的 **AI 设置**，将 Worker 根地址填入“代理服务地址”，填入 Jev API Key，保存，再点击 AI 操作。

Worker 实际接收路径为 `/api/jev`。它只接受允许列表中的浏览器 Origin 和 POST JSON。若 AI 设置里填写了 ModelScope Token，Worker 将该 Token 作为 `Authorization`、Jev Key 作为 `X-Jev-API-Key`，请求 Studio 专用 API 域；若没有填写 ModelScope Token，则 Worker 直接将 Jev Key 作为 Bearer Key 请求 Jev。返回内容和 HTTP 状态会透传给网页。

## 临时验证 ModelScope Token

在 AI 设置里填写 Cloudflare Worker 根地址、ModelScope Token 和 Jev API Key 后保存并启动 AI 操作。ModelScope Token 只用于这次验证链路，保存在当前浏览器本地并随请求经过 Worker；它不会进入代码或仓库。验证后在设置中清空 ModelScope Token 并保存。若要撤销已输入的 Token，可在设置中清空并保存，然后从当前浏览器移除旧的 `cubeLab.aiConfig.v1` 本地存储项。

## 排错

- Worker 返回 `Origin not allowed`：在浏览器 Network 请求 Headers 中查看 `Origin`，将准确的站点 Origin 加入 `ALLOWED_ORIGINS`。
- 浏览器仍显示 `403`：打开该 POST 的 Response；若正文为 Jev 上游错误，检查 Jev Key/账户权限；若为 Worker JSON 错误，检查路径、Origin 变量和部署状态。
- `ERR_CONNECTION_CLOSED` 的 `gm.mmstat.com` 是 ModelScope 统计请求，与 Jev 代理无关。

## 凭据安全

不要把 ModelScope Token 发到聊天、写进网页源代码或提交到仓库。Jev Key 保存在使用者当前浏览器本地，并随每次操作提交给 Worker；Worker 仅在内存中用于本次转发，不记录请求头或正文。Worker 地址本身不是密码。
