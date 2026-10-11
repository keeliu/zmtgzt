# Design

## Context

插件当前形态：23 个 `zmtgzt_*` 工具 + 一个注册在 `conversation.view` 的会话页签视图 +
内置 Easel 快照（114 技能 / 147 脚本）。契约与技能从生效根读取，生效根由
`src/workspace.ts` 决定（自备 `easelRoot` 优先，否则释放内置快照到 `workspaceDir`）。

本次要把它从「技能注入器」补齐为「自媒体工作台」。约束来自三方面：

1. **DSH 侧**：槽位与布局 API 必须以实测为准。已在真实插件中确认可用的槽位只有
   `conversation.view`、`sidebar.footer.action`、`shell.overlay`；`sidebar.panellist`
   在本地检索不到任何证据。
2. **Easel 侧**：账号登录态、画像、产物都是磁盘事实，插件只能读写、不应另建一套。
3. **上游同步**：`vendor/easel/` 是快照，用户对契约的修改不能因快照更新而丢失。

## Goals / Non-Goals

**Goals**

- 入口迁到侧边栏，命名「自媒体工作台」，功能以子导航组织
- 账号（公众号 / 小红书 / 头条）、画像、主题三者可在界面维护
- 契约文件对用户可见可改，且默认加载用户的版本
- 主题与会话可绑定，产物按主题落盘

**Non-Goals**

- 不新写今日头条的发布实现（Easel 无可用实现，改造成本高且风控复杂）
- 不改动 `vendor/easel/` 快照内容，不 fork Easel 的技能与脚本
- 不接管 DSH 的会话存储、模型配置与主题系统
- 不为每个平台各做一个入口，全部收敛进工作台子导航

## Decisions

### D1：入口槽位采用「优先顶部、回退底部」

`sidebar.footer.action` 已在 `dsh-worktable` 中实测可用（它以 `order: 20` 注册成功），
但它在侧边栏**底部**，与「左上角入口」的诉求不符。侧边栏顶部的动作槽位在本地未能验证存在。

因此注册逻辑为：按候选列表依次尝试 `sidebar.header.action` → `sidebar.footer.action`，
取首个 `ctx.slots.register` 不抛错的槽位；实际锚点写入工作台「环境自检」页。

**取舍**：不硬编码未验证的槽位名。若顶部槽位在用户的 DSH 版本上存在，自然生效；
不存在则静默回退，且状态可查——而不是让入口整个消失。

### D2：工作台页面用 `shell.overlay` 还是主区域

`shell.overlay` 是覆盖式浮层（worktable 用它做分屏），语义是「浮在会话之上」，
与「在左侧打开页面、可返回对话」的诉求不同。因此工作台采用**页面内视图切换**：
入口点击后由客户端在自身容器内切换工作台/对话两种呈现，而不是覆盖整屏。

**取舍**：不依赖未验证的 `ctx.layout` 全局面板键位；代价是无法真正替换中栏，
但在所有 DSH 版本上都能工作。

### D3：契约加载顺序为「根目录优先」

释放快照时，除写入 `openclaw/workspace/{SOUL,AGENTS}.md`（技能内部相对引用依赖此路径）外，
额外复制一份到 `workspaceDir/{SOUL,AGENTS}.md`。

读取顺序：`workspaceDir/SOUL.md` → `workspaceDir/openclaw/workspace/SOUL.md`，AGENTS.md 同理。

**关键点**：快照更新时 MUST NOT 覆盖根目录已存在的契约文件——那是用户的编辑成果。
判定方式：根目录文件存在即视为用户版本，跳过覆盖；`SYNC-INFO.json` 仍照常更新以便追踪版本。

### D4：主题与会话的绑定持久化

绑定关系存于插件数据目录：`~/.dsh/zmtgzt/bindings.json`，结构为
`{ "<sessionId>": { "topic": "<主题名>", "dir": "<产物根的绝对路径>", "boundAt": "<ISO8601>" } }`。

**为什么不存进 Easel 的目录**：绑定是「DSH 会话 ↔ 主题」的映射，不属于 Easel 的数据模型；
写进 `outputs/` 会污染产物结构。

写入同样采用临时文件 + rename，并与画像写入共用串行队列，避免并发损坏。

### D5：服务端路由按资源划分

| 路由 | 用途 |
|---|---|
| `GET /api/zmtgzt/account` | 各渠道登录态与账号信息 |
| `POST /api/zmtgzt/account/login` | 发起扫码登录，返回二维码 |
| `GET /api/zmtgzt/account/login/status` | 轮询登录结果 |
| `POST /api/zmtgzt/account/logout` | 登出 |
| `GET/POST /api/zmtgzt/profile` | 画像列表 / 读写单维度 |
| `GET/POST /api/zmtgzt/topic` | 主题列表 / 创建、重命名、删除 |
| `POST /api/zmtgzt/binding` | 绑定 / 解绑会话与主题 |
| `GET /api/zmtgzt/project` | 产物树与 manifest |
| `GET /api/zmtgzt/doctor` | 自检（含契约实际路径与入口锚点） |

所有读写经 `deps.repo.rootDir` 定位，沿用现有生效根语义。

### D6：今日头条只做账号维护

调研结论：`skill-wechat-publisher/scripts/multi_publish.py` 的 `SUPPORTED_PLATFORMS`
虽含 `toutiao`，但该脚本在其 SKILL.md 中被标注为「阶段七：多平台同步（可选，默认不启用，
当前环境不可用）」，且依赖 Wechatsync Chrome 扩展 + `@wechatsync/cli`。

结论：**不新建头条发布实现**。工作台对头条提供账号维护（登录、状态），
发布入口不渲染，并在条目上明示原因。这是「如实呈现」而非能力缺失的隐瞒。

### D7：发布门禁沿用既有脚本，不提供绕过

发布链路必经 `content_guard.py`（敏感信息扫描，命中 exit 7）与 `persona_gate.py`
（人设一致性，低于 80 分 warn）。前者硬拦、后者只提醒——与 AGENTS.md 的规定一致。
插件 MUST NOT 暴露 `--allow-unsafe` 一类的绕过开关。

## Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 侧边栏顶部槽位名猜错 | 入口落到预期外位置 | 候选列表 + 静默回退 + 自检页显示实际锚点 |
| Playwright 与 Chromium 未安装 | 账号页与发布不可用 | 自检页提前探测并给出安装指引；不假设可用 |
| 扫码登录依赖交互 | 无法在测试中端到端验证 | 测试覆盖「发起登录返回二维码」与「状态轮询」两段，扫码本身由用户完成 |
| 用户改了根目录契约后与上游语义偏离 | 技能行为与上游不一致 | 自检页对比根目录版本与快照版本的差异并提示 |
| 主题绑定表被并发写坏 | 绑定丢失 | 临时文件 + rename + 串行队列 |
| 工作台子页面异常清空主区域 | 界面不可用 | 每个子页面包错误边界，异常限制在页面内 |
