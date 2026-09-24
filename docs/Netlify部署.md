# Netlify 部署

本项目由静态 3D 页面和 Jev API 代理组成。Netlify 部署不能只发布 HTML；仓库已配置 Netlify Function 接管 `/api/jev`。

## GitHub 仓库

仓库：<https://github.com/ngocvychu38-web/cube-lab>

## 首次创建站点

1. 在 [Netlify](https://app.netlify.com/) 选择 **Add new site → Import an existing project**，连接 GitHub 并选 `ngocvychu38-web/cube-lab`。
2. 选择生产分支 `main`。
3. Netlify 会读取仓库根目录的 `netlify.toml`：构建命令为 `node scripts/build-netlify.mjs`，发布目录为 `dist`，Functions 目录为 `netlify/functions`；无需额外填写。
4. 点击部署。构建脚本只把 HTML、游戏逻辑 JS 和音频复制到 `dist`，避免将 Docker 服务端源码和文档发布到站点 CDN。
5. 部署成功后打开 `https://<你的站点>.netlify.app/api/jev`。应返回 `{"ok":true,"service":"cube-lab-jev-proxy"}`，确认 API Function 已启动。
6. 在站点页面 AI 设置中填写 Jev Key，代理服务地址留空，点击 AI 操作。留空时页面同源请求 Netlify Function。

## 代理行为

- 未设置 ModelScope Token：Netlify Function 将 `X-Jev-API-Key` 转为 Jev 上游的 Bearer Authorization，调用 `https://api.typesafe.ai/v1/systemone`。
- 临时设置了 ModelScope Token：Function 改调该 Studio 的 `api-inference` 域名，将 ModelScope Token 用于上游 Studio 鉴权，并将 Jev Key 继续放在 `X-Jev-API-Key`。浏览器只访问同源 Netlify URL，不会遇到 API 域的跨域预检。
- 两种 Key 都不会写入构建产物或日志。网页 AI 设置保存在使用者当前浏览器本地；临时验证后清除 ModelScope Token 并保存。

普通同步 Netlify Function 最长运行时间为 60 秒；代理请求在 55 秒主动超时，给平台留出响应时间。参考 [Netlify Functions 配置](https://docs.netlify.com/build/functions/configuration/) 和 [Functions 用量说明](https://docs.netlify.com/build/functions/usage-and-billing/)。

## 本地准备

运行 `node scripts/build-netlify.mjs` 可生成忽略提交的 `dist/` 静态目录。Netlify 页面功能可本地直接通过 Node 静态服务器查看；如需本地验证 Function 路由，可安装 Netlify CLI 并运行 `netlify dev`。

部署完成后可绑定自定义域名，Netlify 会提供 HTTPS。不要在仓库或 Netlify 公开变量中硬编码任何 Token。
