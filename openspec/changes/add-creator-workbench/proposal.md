# Proposal

## Why

插件当前只做「能力注册 + 契约注入」，没有任何界面，创作者拿到的是一堆 `zmtgzt_*` 工具，
却看不到自己的账号、画像与产物。具体缺口：

- **契约不可见**：`SOUL.md` 与 `AGENTS.md` 藏在释放目录的 `openclaw/workspace/` 下，
  用户既看不到也改不了；改契约必须手工翻两层目录，且改完无法确认是否生效。
- **账号无法维护**：Easel 的七个平台登录态依赖 `~/.easel-browser-profiles/` 下的持久化目录，
  原本由 Easel 自己的 Web「账号」页操作。该页面在改造成插件时未被迁移，导致用户只能手工跑脚本登录。
- **画像无法维护**：六维画像虽然已能通过工具读写，但没有界面，创作者要编辑 markdown 文件才能调整人设。
- **没有主题概念**：Easel 以 `outputs/<主题名>/` 组织内容项目，但插件没有把「主题」暴露给用户，
  产物落盘靠模型自行判断，容易出现主题漂移或散落在 outputs 根目录。
- **入口位置不当**：插件视图注册在 `conversation.view`，与对话界面争抢页签位置，
  而这类跨会话的全局功能更适合放在侧边栏入口。

## What Changes

- **新增** 侧边栏工作台入口「自媒体工作台」，点击后在主区域打开工作台页面，并提供返回对话的路径。
- **移除** `conversation.view` 槽位上的旧入口，功能全部迁入工作台。
- **新增** 工作台「账号」页：公众号 / 小红书 / 今日头条三个渠道的登录、登出、状态与创作数据查看。
- **新增** 工作台「画像」页：六维画像的增删改查，写入格式与 Easel 技能读取格式一致。
- **新增** 工作台「主题」页：主题的创建、绑定会话、在当前目录创建新规划，以及产物目录与 manifest 查看。
- **新增** 工作台「环境自检」页：展示生效根来源、契约文件实际路径、技能与脚本可用性。
- **变更** 契约文件释放位置：额外释放一份到工作目录根，插件注入时优先读取根目录版本，
  用户编辑后不会被快照更新覆盖。
- **如实标注** 今日头条在 Easel 上游**既无登录实现也无发布实现**（`web_publisher.py` 与
  `account_stats.py` 的平台表中都不含 `toutiao`），工作台将其标注为「暂不支持」并不渲染任何操作按钮；
  同时提供配置扩展点，用户自行补齐脚本后无需改插件即可接入。

## Capabilities

### New Capabilities

- `workbench-entry`：入口位置、命名与页面呈现——侧边栏入口、「自媒体工作台」命名、主区域页面、
  面板内子导航、主题令牌约束、故障隔离，以及移除会话页签入口。
- `creator-account`：渠道账号的绑定、登录与维护——以 Easel 既有 Playwright 持久化目录为登录态真相源、
  扫码登录与登出、创作数据读取，以及平台支持范围如实呈现与发布前门禁不可绕过。
- `creator-profile`：六维画像的工作台维护——增删改查、模板对齐、与技能读取格式一致、
  即改即用与写入原子性。
- `creator-topic`：主题一等概念——创建与管理、与会话的双向绑定、在当前目录创建规划、
  以主题触发技能生成内容、产物路径校验。
- `contract-loading`：契约文件位置与加载优先级——释放到工作目录根、默认加载根目录版本、
  缺失时回退，并在自检中报告契约来源。

### Modified Capabilities

（无。本仓库尚无已归档的 `openspec/specs/` 能力，本次改动全部为新增能力。）

## Impact

**受影响的代码与系统**

| 区域 | 处置 |
|---|---|
| `src/client/index.tsx` | 重写：从 `conversation.view` 单页迁为侧边栏入口 + 多子页面工作台 |
| `src/index.ts` | 新增账号、画像、主题三组 HTTP 路由；契约加载顺序调整 |
| `src/workspace.ts` | 释放时额外输出根目录契约文件；保护用户对契约的编辑 |
| `src/repo.ts` | 契约读取支持根目录优先、`openclaw/workspace/` 回退 |
| 新增 `src/account.ts` | 账号登录态探测、扫码登录编排、登出、创作数据读取 |
| 新增 `src/topics.ts` | 主题的创建、绑定持久化、产物树与 manifest 读取 |
| 新增 `src/session-bindings.ts` | 会话与主题绑定关系的持久化 |
| `package.json` | `dsh.client.inject` 需按实际槽位调整 |

**受影响的外部依赖与前置**

- **今日头条完全缺失**：实测 `web_publisher.py` 与 `account_stats.py` 的 `PLATFORMS` 字典中
  均无 `toutiao` 条目；唯一提及它的 `skill-wechat-publisher/scripts/multi_publish.py` 被其 SKILL.md
  标注为「阶段七…默认不启用，当前环境不可用」，且依赖 Wechatsync Chrome 扩展 + `@wechatsync/cli`。
  本变更不新建头条实现（缺少可验证的账号与选择器，未经验证的发布脚本只会产生失败调用），
  改为如实标注 + 提供配置扩展点。
- **Python 运行时**：账号与发布链路全部经 Easel 的 Python 脚本执行，依赖 Python 3 与
  `pyproject.toml` 中的依赖（含 Playwright 与 Chromium 内核）。未就绪时相关页面如实报告不可用。
- **DSH 槽位**：已验证可用的槽位为 `sidebar.footer.action`（侧边栏底部）与 `shell.overlay`（浮层）。
  侧边栏**顶部**入口槽位在本机未能验证存在，因此入口注册采用「优先顶部、回退 `sidebar.footer.action`」，
  并在自检页注明实际锚点。
- **登录态目录**：`~/.easel-browser-profiles/` 位于用户主目录，插件只读写、不改结构。

**不受影响**

- Easel 既有技能、脚本与 `profiles/`、`outputs/` 目录布局不改动。
- `vendor/easel/` 快照内容不改动，仍由 `scripts/sync-easel.mjs` 同步上游。
- 已注册的 23 个 `zmtgzt_*` 工具保持不变，仅新增工作台所需的读写入口。
