# Proposal

## Why

用户问：能不能在 dsh 里直接把内容发到小红书。

**能力早就在上游，但插件这一侧把它挡住了。** 实测定位到两个缺口，其中第一个是致命的。

### 缺口 1（致命）：flag 型参数根本传不进去

`src/runner.ts` 的 `toCliArgs` 对布尔值输出「`--key` + 值」：

```ts
out.push(`--${key}`)
if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
  out.push(String(value))          // ← true 变成字符串 "true"
}
```

而 argparse 里 `--exec` 是 `action="store_true"`，语义是「有无这个 flag」，不接受值。
真实脚本实测：

```
$ python3 skills/shared/scripts/xhs_publish.py publish --title T --content C --images ./a.jpg --exec true
xhs_publish.py: error: unrecognized arguments: true        ← 参数解析直接失败

$ python3 skills/shared/scripts/xhs_publish.py publish --title T --content C --images ./a.jpg --exec
ERROR: 文件不存在：/tmp/easel-full/a.jpg                   ← 解析通过，进入真正逻辑
```

小红书发布**必须** `--exec` 才不是 dry-run，所以只要这个 bug 在，**发布永远不可能成功**。
同一个 bug 也影响 `--headed`、`--no-proxy`、`--allow-unsafe`、`--skip-ai-score`、
`--official-api` 等所有 flag —— 也就是说上一轮刚加的「窗口登录」（`--headed`）其实也没生效，
只是扫码登录默认走 qr 才没暴露。

### 缺口 2：没有发布专用工具

23 个工具里有 `zmtgzt_publish_log`（发布留痕）与 `zmtgzt_publish_analytics`（发布后分析），
**唯独没有发布本身**。只能靠通用执行器 `zmtgzt_run` 手写完整参数，容易错且无法固化门禁顺序。

### 上游实际具备的能力（已核对源码）

| 平台 | 脚本 | 能力 |
| --- | --- | --- |
| 小红书 | `skills/shared/scripts/xhs_publish.py` | `plan`（离线预检）、`publish`（图文）、`publish-video`（视频）；发布成功校验（URL 离开 `/publish/publish` 才算成功）、反检测、话题联想绑定 |
| 微信公众号 | `skills/shared/scripts/weixin_mp_stats.py` | `publish`：用后台会话**建草稿**（免 AppID/Secret、免白名单） |
| 微信公众号 | `skills/openclaw/skill-wechat-publisher/scripts/publish.py` | 更完整：`--input`/`--html`/`--brief` 三种输入、`--type news|newspic`、排版主题、AI 味检测、`--official-api` 走官方 API（需凭证 + IP 白名单） |

两个平台都内置了发布前门禁：小红书 `content_guard.py` 扫描（`--exec` 时硬拦，
`--allow-unsafe` 放行），公众号侧默认 AI 味检测达阈值即阻止（`--skip-ai-score` 跳过）。

## What Changes

- **修复** `toCliArgs` 的布尔序列化：`true` 只输出 `--flag`（不带值），`false` 完全跳过。
  这是所有 flag 参数可用的前提，也是发布能跑通的关键。
- **新增** `zmtgzt_publish` 工具：一个工具覆盖两个平台，默认 dry-run（只预检），
  显式确认后才真发；发布前按 AGENTS.md 顺序串联门禁，发布后串联留痕。
- **新增** 工作台「发布」页：选主题与产物 → 选平台 → 填标题正文 → 预检 → 确认发布 →
  显示结果与**需要人工完成的后续步骤**。
- **如实标注** 公众号发布的产物是**草稿**而非群发（`weixin_mp_stats.py` 注释与
  `publish.py --exec` 的帮助文本均写明「创建微信草稿」），用户仍需到公众号后台手动群发。
- **如实标注** 小红书自动化发布存在平台风控/限流/封号风险（上游 SKILL 明确警告），
  插件提供能力但不代为承担风险，也不隐藏该警告。

## Capabilities

### New Capabilities

- `publish-tooling`：发布工具层——flag 参数正确传递、跨平台发布工具、默认 dry-run 与
  显式确认、门禁串联、发布留痕、平台能力边界如实呈现。
- `publish-console`：工作台发布页——产物选择、内容编辑、预检展示、确认发布、
  结果与后续步骤呈现。

### Modified Capabilities

- `login-qr-display`：其规格中「有头窗口登录」依赖 `--headed`，而该 flag 直到本次修复
  才真正可传。能力本身不变，但可验证性由本次的 `publish-tooling` 承担。

## Impact

**受影响的代码与系统**

| 区域 | 处置 |
| --- | --- |
| `src/runner.ts` | 修 `toCliArgs` 的布尔分支（本次关键修复） |
| `src/tools.ts` | 新增 `zmtgzt_publish` 工具 |
| `src/publish.ts`（新增） | 发布编排：平台映射、参数装配、门禁顺序、结果解析 |
| `src/index.ts` | 新增发布相关 HTTP 路由（预检 / 执行 / 留痕） |
| `src/client/index.tsx` | 新增「发布」页 |
| `openspec` | 本变更归档 |

**受影响的外部依赖与前置**

- **登录态**：两个平台都要求已登录（小红书 `~/.easel-browser-profiles/XiaohongshuProfile`；
  公众号后台会话或官方 API 凭证），未登录时脚本返回明确错误。
- **媒体文件必须真实存在**：小红书 `_publish` 会校验图片路径（实测返回「文件不存在」），
  因此发布页需从主题产物里选取，不能凭字符串填路径。
- **出口 IP**：小红书对机房/代理出口报「安全限制·IP 存在风险」，需干净网络；
  公众号官方 API 需把出口 IP 加进白名单。

**不受影响**

- 剧本、技能与 `vendor/easel/` 快照内容不改动。
- 已有 23 个工具与工作台其余页面保持不变（本次为新增）。
- 门禁不提供绕过开关的态度不变：`--allow-unsafe` / `--skip-ai-score` 这类上游开关
  **不在插件界面暴露**，需要时只能在对话里显式调用工具并说明理由。
