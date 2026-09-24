# ModelScope Studio 部署记录

## 当前进度

- Skill：[ModelScope Studio 部署](https://modelscope.cn/skills/modelscope/modelscope-studio)，本次按其 OpenAPI 部署流程和 Docker Studio 要求准备。
- 项目类型：Node.js Web 应用，包含静态 3D 页面和 Jev API 同源代理；应使用 Docker Studio，静态站点类型无法运行代理服务。
- 已添加 `Dockerfile`，使用 Node 22 Alpine、Node 内置模块、`0.0.0.0:7860` 和 `/health` 健康检查。
- 本地开发仍使用 `127.0.0.1:8787`，生产服务按请求的同源 Origin 校验平台转发请求。
- 创建 ModelScope Studio 前需要 `MODELSCOPE_API_KEY`，以及完成 ModelScope 账号实名认证和阿里云账号绑定（Docker Studio 平台要求）。当前尚未发现本机 ModelScope 凭据，尚未创建或发布 Studio。
- 新 Studio 默认按 Skill 建议为私有；发布后可再决定是否公开。

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

凭据可用后，先通过 `GET /openapi/v1/users/me` 验证身份，再查询 Docker 硬件可用项和 Studio 是否已存在。若新建，选择免费硬件并按用户选择的可见性创建 `cube-lab`；若硬件列表只提供付费规格，先停止并说明费用，取得明确授权前不选用。

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
