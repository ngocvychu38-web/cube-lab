# Jev 接口请求与返回示例

## 示例来源

本文提供三个完整请求，分别对应底层十字、底层角块和最后的顶棱归位。请求由项目当前规划器对人工构造的合法魔方状态生成，包含全部 26 个小块和 54 张贴纸，没有省略背面状态。

**这些不是用户当前魔方的抓包记录。返回 JSON 是协议示例，没有调用真实 Jev；其中 `confidence: 0.9` 是演示值，不是模型实测结果。** 示例中的颜色字段使用中文色名，身份和判断仍由 `homeFace` 与 `normal` 决定。

文件约定：

- `*.request.json`：可发送的完整请求体，`state` 是 JSON 字符串。
- `*.context.json`：将该请求的 `state` 解码后排版，便于阅读，不能直接替代完整请求体。
- `*.response.example.json`：假设模型选择该候选时的返回示例。

生成方法：在项目根目录运行 `node docs/generate-jev-examples.cjs`。此命令只生成文档素材，不访问网络、不读取 API Key、不修改游戏运行状态；不代表完成了端到端测试。

## 1. 调用方式

浏览器发送到本地代理，代理再转发到 Jev：

```http
POST http://127.0.0.1:8787/api/jev
Content-Type: application/json
Authorization: Bearer <用户自己填写的API_KEY>
```

上游：`POST https://api.typesafe.ai/v1/systemone`。请求体顶层为：

```javascript
{
  model: 'jev-latest',
  state: JSON.stringify(context),
  questions: {
    plan: { type: 'choice', instructions: '当前阶段选择规则', criteria: { /* 候选ID及描述 */ } }
  }
}
```

Key 放在请求头，不放进上下文、示例文件或源码。`state` 中包含完整规则、阶段、版本、进度、贴纸、最近方案和候选。

## 2. 示例一：底层十字从 3/4 到 4/4

从已复原状态转动一次 `F`，得到此示例输入。DF 黄绿棱未归位，DR、DB、DL 已正确。规划器给出 `F'`，要求保留已有三条底棱。

- [完整请求](jev-examples/01-cross.request.json)
- [完整上下文，解码便于阅读](jev-examples/01-cross.context.json)
- [返回示例](jev-examples/01-cross.response.example.json)

请求的 `questions` 部分如下，其余完整内容见上述文件：

```json
{
  "plan": {
    "type": "choice",
    "instructions": "选择一个已模拟验证的底层十字方案：先优先更大的afterCount，再优先更少moves。仅在需要中止时选PAUSE。",
    "criteria": {
      "plan_1": "黄绿棱块：F'；完成 3/4 → 4/4；1 次转动；已验证保留 DR,DB,DL。",
      "PAUSE": "暂停本轮操作（不是完成）"
    }
  }
}
```

假设返回：

```json
{
  "model": "jev-latest",
  "answers": {
    "plan": { "type": "choice", "choice": "plan_1", "confidence": 0.9 }
  }
}
```

执行器确认版本未变化后，查找本轮 `plan_1`，播放 `F'`，再根据真实状态核对底层十字 4/4。返回值本身不构成完成证明。

## 3. 示例二：保留十字，补齐最后一个底角

从已复原状态执行 `R U' R'` 构造输入。底层十字完整，底角 3/4；DFR 黄绿红角未完成。方案为 `R U R'`。

- [完整请求](jev-examples/02-corners.request.json)
- [完整上下文](jev-examples/02-corners.context.json)
- [返回示例](jev-examples/02-corners.response.example.json)

请求中的候选说明：

```json
{
  "corner_plan_1": "黄绿红角块：R U R'；底角 3/4 → 4/4；3 次转动；保留十字及 DRB,DBL,DLF。",
  "PAUSE": "暂停本轮操作（不是完成）"
}
```

假设返回：

```json
{
  "model": "jev-latest",
  "answers": {
    "plan": { "type": "choice", "choice": "corner_plan_1", "confidence": 0.9 }
  }
}
```

执行器逐次播放 `R`、`U`、`R'` 并核对状态。这个短公式完成后检查十字、原有三个底角和目标底角。如果用户在公式中途点击停止，会等到安全公式边界再停止。

## 4. 示例三：第七步完成整个魔方

从已复原状态执行 Ua 的逆序逆转动作构造输入。前两层、白色顶面和四个顶角保持正确，顶棱 1/4。候选使用一次 Ua，预期顶棱达到 4/4。

- [完整请求](jev-examples/03-top-edges.request.json)
- [完整上下文](jev-examples/03-top-edges.context.json)
- [返回示例](jev-examples/03-top-edges.response.example.json)

请求中的候选说明：

```json
{
  "permutation_plan_1": "顶层棱块归位：R U' R U R U R U' R' U' R2；1/4 → 4/4；保留完整前两层、白色顶面及四个已归位顶角。",
  "PAUSE": "暂停，不代表完成"
}
```

假设返回：

```json
{
  "model": "jev-latest",
  "answers": {
    "plan": { "type": "choice", "choice": "permutation_plan_1", "confidence": 0.9 }
  }
}
```

执行器执行 11 次动作，逐次比较真实状态与模拟状态。公式结束后还要检查全部 54 张贴纸和 26 个小块位置；只有程序检查通过才显示整个魔方复原。

这三个教学输入都很简单，因此各只有一个执行候选及 `PAUSE`。实际复杂状态可能生成多个候选，模型按完成数量优先、动作更少其次的规则选择；候选数以每轮实际请求为准。

## 5. 暂停和异常返回

对于以上任一请求，模型也可以返回：

```json
{
  "answers": {
    "plan": { "type": "choice", "choice": "PAUSE" }
  }
}
```

这会暂停当前阶段及一键任务，不执行新动作，也不宣称复原。`confidence` 可以缺省。

以下是无效选择的示例，即使置信度很高也会被拒绝：

```json
{
  "answers": {
    "plan": { "type": "choice", "choice": "unknown_plan", "confidence": 1 }
  }
}
```

原因：ID 不在本轮候选中。模型直接返回 `"R U R'"` 也不能替代候选 ID。缺少 `answers.plan.choice`、`type` 不是 `choice`、非 JSON 响应或 HTTP 错误同样会中止执行。

## 6. 如何看真实调用结果

当前左侧日志保存候选、选中的 ID、置信度及实际动作，可导出 JSON；它不保存完整的原始 HTTP 请求与响应。需要核对真实接口报文时，可在浏览器开发者工具 Network 中查看 `/api/jev` 的 Payload 和 Response。分享记录时去除 Authorization 请求头和其他个人信息。

本文示例完整说明协议格式与执行含义；真实 Jev 输出应以实际调用返回为准。
