# ModelScope Studio 部署记录

## 当前进度

- Skill：[ModelScope Studio 部署](https://modelscope.cn/skills/modelscope/modelscope-studio)，本次按其 OpenAPI 部署流程和 Docker Studio 要求准备。
- 项目类型：Node.js Web 应用，包含静态 3D 页面和 Jev API 同源代理；应使用 Docker Studio，静态站点类型无法运行代理服务。
- 已添加 `Dockerfile`，使用 Node 22 Alpine、Node 内置模块、`0.0.0.0:7860` 和 `/health` 健康检查。
- 本地开发仍使用 `127.0.0.1:8787`，生产服务按请求的同源 Origin 校验平台转发请求。
- Studio：<https://modelscope.cn/studios/monkeyqiu/3dcube>，所有者 `monkeyqiu`，SDK 类型 Docker，可见性公开。
- 免费规格：`platform/2v-cpu-8g-mem`。
- 部署状态：2026-09-24 检查时，Studio/runtime 为 `Running`；Docker build 日志成功，公开 `/health` 返回 `200`。
- ModelScope 账号 API Key 在本机 `.env.modelscope` 验证通过；Studio 创建 API 被平台要求改用官网操作，因此用户从官网建好 Studio 并上传文件。
- 曾因客户端把 Jev Key 放在 `Authorization` 头而收到 ModelScope 403。ModelScope 把它作为平台 SDK Token 处理。已将前端到代理的头改为 `X-Jev-API-Key`，仅 Node 转发到 Jev 时转换为 Bearer Authorization；该修复需同步并重新部署后生效。

## 部署前准备

1. 登录 ModelScope，获取站点对应的 API Key。当前默认站点为 `https://modelscope.cn`。
2. 完成账号实名认证及阿里云账号绑定，确保可创建 Docker Studio。
3. 不要把 Key 发在聊天中，也不要提交到 Git。可以在项目根目录建立仅本机使用的 `.env.modelscope` 文件：

   ```sh
   printf 'MODELSCOPE_API_KEY=%s\n' '在这里替换成你的 ModelScope API Key' > .env.modelscope
   chmod 600 .env.modelscope
   ```

   `.env.modelscope` 已被 `.gitignore` 中的 `.env.*` 忽略。使用完成后可删除该文件。

## Skill 工作流

Studio 已经创建。后续同步修改时先检查硬件及 Studio 现状；如果硬件列表只提供付费规格，先停止并说明费用，取得明确授权前不选用。

同步代码至 Studio 的 Git 仓库 `master` 分支（不强推），再调用部署接口，读取运行日志直至状态为 `Running`。部署 URL 以 ModelScope 返回的 Studio 信息为准。生产镜像只打包网页运行必需的文件，不打包文档目录和 `.env` 文件。

## 本地容器核对

有 Docker 的环境可运行：

```sh
docker build -t cube-lab:local .
docker run --rm -p 7860:7860 cube-lab:local
```

然后在另一终端打开 `http://127.0.0.1:7860/health`，应返回包含 `"ok":true` 的 JSON。无需把 Jev Key 作为容器环境变量传入：浏览器中由使用者自行设置，并由同源代理按该次请求转发。

## 参考

- [ModelScope Studio Docker 说明](https://modelscope.cn/docs/studios/docker)
- [ModelScope Studio Skill](https://modelscope.cn/skills/modelscope/modelscope-studio)
