# dsh-zmtgzt

把 [Easel](https://github.com/ZJU-REAL/Easel)（开源社媒内容智能体）接进 DeepSeek Harness 的 dsh 插件。

**装完即用，无需先 clone Easel。** 插件随包自带一份 Easel 快照（114 个技能、契约、147 个脚本），首次启动自动释放到可写目录。插件自己不撰写任何 Easel 内容——快照由 `scripts/sync-easel.mjs` 从官方仓库同步。

- **契约注入**——读 `openclaw/workspace/SOUL.md` 与 `AGENTS.md`，**原文**注册为运行时技能
- **技能注册**——扫描 `skills/openclaw/<技能名>/SKILL.md`，逐个注册为 dsh 技能，按需加载
- **23 个 `zmtgzt_*` 工具**——技能读取、脚本执行、manifest / 画像 / 产物三类状态入口
- **Web 视图**（`conversation.view` 槽）：技能库、账号画像、项目产物、环境体检

## 安装

```sh
dsh plugin add dsh-zmtgzt
```

就这两步。首次启动插件会把内置快照释放到 `~/.dsh/zmtgzt/easel/`（可配置），并自动生成一份 `.env`——想跑脚本类工具时把它填上即可。

想改用自备仓库（例如跟进最新上游）再配置 `easelRoot`：

```yaml
# 在 dsh profile 配置里
- insert:
    - id: dsh-zmtgzt
      name: dsh-zmtgzt
      config:
        easelRoot: /绝对路径/Easel   # 可选；设置后覆盖内置快照
```

然后跑一次 `zmtgzt_doctor` 确认。

## 自媒体工作台

插件在 DSH **侧边栏**注册入口「自媒体工作台」（不再占用会话页签），点击后打开工作台页面。
功能以面板内子导航组织：

| 子页面 | 作用 |
| --- | --- |
| 总览 | 环境状态、生效根、快捷入口 |
| 账号 | 微信公众号 / 小红书的扫码登录、登出与登录态查看 |
| 画像 | 六维账号画像的增删改查（写入 `profiles/<画像>/*.md`） |
| 主题 | 主题创建与删除、**绑定到当前会话**、产物树与 manifest 查看 |
| 环境自检 | 生效根来源、契约实际路径、技能与脚本可用性 |

### 主题与会话绑定

「主题」对应 `outputs/<主题名>/`。在某个会话里打开工作台、把主题绑定到该会话后，
该会话产出内容时默认使用该主题的产物目录。绑定关系持久化在
`~/.dsh/dsh-zmtgzt/bindings.json`，重启后仍然有效。

主题名有约束：必须是人类可读的具体名称，`test` / `tmp` / `xhs` 一类泛化名会被拒绝
（规则与 Easel 的 `output_paths.py` 一致，插件不另立一套）。

### 契约文件现在在工作目录根

首次释放快照时，`SOUL.md` 与 `AGENTS.md` 会**额外复制一份到工作目录根**
（`~/.dsh/dsh-zmtgzt/easel/`），便于直接查看与编辑。插件注入契约时**优先读取根目录版本**，
根目录缺失才回退到 `openclaw/workspace/` 下的快照副本。

你对根目录版本的编辑**不会被快照更新覆盖**——那是你的内容。当前实际生效的是哪一份，
在「环境自检」页可以直接看到路径。

### 渠道支持现状

| 渠道 | 登录与账号维护 | 发布 | 依据 |
| --- | --- | --- | --- |
| 微信公众号 | ✅ 两种方式 | ✅ | `weixin_mp_stats.py` 的 `login` / `whoami` / `stats` / `publish`；另有官方 API 路径，见下 |
| 小红书 | ✅ | ✅ | `xhs_publish.py` 提供 `login` / `whoami` / `publish` |
| 今日头条 | ❌ | ❌ | `web_publisher.py` 与 `account_stats.py` 的平台表中都**没有** `toutiao` |

头条不是"以后再说"，是**当前确实没有可用实现**——唯一提及它的 `multi_publish.py` 被其
SKILL 标注为「当前环境不可用」，且依赖 Wechatsync 扩展。所以工作台不为它渲染任何按钮，只标注原因。
如果你自行补齐了脚本，可通过配置 `extraChannels` 接入，无需改插件代码。

发布链路必经既有门禁：`content_guard.py` 的敏感信息扫描（硬拦）与 `persona_gate.py` 的
人设检查（只提醒不阻断），插件**不提供绕过开关**。

### 公众号：两种登录方式任选

| 方式 | 需要什么 | 适合 |
| --- | --- | --- |
| **扫码登录后台会话** | 一个能扫码的微信 | 默认。免 AppID/AppSecret、免 IP 白名单 |
| **官方 API 凭证** | AppID + AppSecret，并把本机出口 IP 加进公众号后台白名单 | 无人值守/自动化；或不依赖浏览器会话 |

第二种在账号页的公众号卡片里填写，保存前会调用微信 `cgi-bin/token` 校验。凭证写入上游
唯一识别的路径 `skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml`；写入采用
**行级补丁**并留 `.bak` 备份，因此不会动你在该文件里的其它账号、`image_generation` 等
其它顶层键，也不会丢注释。

校验失败按错误码分开提示：`40001`/`40002` 是凭证问题；**`40164` 是「凭证本身正确、
但出口 IP 未登记白名单」**——两者不能混为一谈，否则你会反复核对 AppID/Secret 却找不到原因。

> 按上游约定，AppSecret 在该 YAML 中为明文存储（微信官方 API 的常规做法）。
> 插件不回传明文到前端，只显示脱敏后的 AppID。

### 登录排障

点登录没出二维码时，按这个顺序看：

1. **界面会先做环境预检**。缺 Python / `playwright` / `opencv-python` / `Pillow` 时，
   插件**不启动注定失败的登录进程**，而是逐项列出缺失项与安装命令。
   - headless 扫码需要 `opencv-python` 与 `Pillow` 把二维码从页面里抠出来；
   - 不想装这两个，用「**窗口登录**」按钮，弹出浏览器窗口在窗口内扫码/短信登录。
2. **每次登录的脚本输出都落盘**：`<插件数据目录>/login/<渠道>.log`，界面上有「查看登录日志」。
   上游脚本在写第一个状态之前就可能因缺依赖退出——没有日志就只能看到 `unknown`。
3. 二维码图片经 `/api/zmtgzt/account/login/qr` 提供，**未生成时返回 404**，界面据此不渲染破图。

## 工具

### 技能读取——Easel 的技能直接来自磁盘

| 工具 | 用途 |
| --- | --- |
| `zmtgzt_skill` | `list` 列出全部技能（名称/层/简介）· `read` 读 SKILL.md 正文 · `files` 列 references · `file` 读某个 reference |

Easel 有约 114 个技能，其中**大多数是提示词驱动的流程**（一份 SKILL.md + `references/`），由模型读流程后执行；少数自带脚本，见下。

### 脚本执行

| 工具 | 用途 |
| --- | --- |
| `zmtgzt_run` | 按仓库相对路径执行任意 Easel 脚本，支持 `args` 与 `subcommand` |
| `zmtgzt_scripts` | 列出可用脚本（共享脚本 / 各技能自带脚本） |

### 专用脚本工具

参数全部取自脚本自身的 `argparse` 定义或 `AGENTS.md` 里的命令示例，没有臆造。

| 工具 | 包装的脚本 |
| --- | --- |
| `zmtgzt_manifest` | `shared/scripts/manifest.py`——跨层传递契约（record / meta / read / latest） |
| `zmtgzt_output_paths` | `shared/scripts/output_paths.py`——写入前校验产物路径 |
| `zmtgzt_model_registry` | `shared/scripts/model_registry.py`——查询已配置的媒体 provider（脱敏） |
| `zmtgzt_persona_gate` | `shared/scripts/persona_gate.py`——发布前人设一致性检查 |
| `zmtgzt_content_guard` | `shared/scripts/content_guard.py`——发布前敏感信息扫描 |
| `zmtgzt_publish_log` | `skill-publish-log/scripts/log.py`——发布留痕 |
| `zmtgzt_news` | `skill-news-intelligence/scripts/`——资讯抓取 / 日报 |
| `zmtgzt_card_audit` | `card-design/scripts/card_audit.py`——卡片渲染后自检 |
| `zmtgzt_novel_ops` | `novel-writer/scripts/novel_ops.py`——小说搭骨架与进度 |
| `zmtgzt_paper_ingest` | `paper-explainer/scripts/paper_ingest.py`——论文抓取与解析 |
| `zmtgzt_data_report` | `data-report/scripts/report.py`——数据生成报告页 |
| `zmtgzt_assemble_video` | `auto-short-video/scripts/assemble.py`——视频合成 |
| `zmtgzt_drama_ops` | `short-drama/scripts/drama_ops.py`——短剧资产与进度 |
| `zmtgzt_dubbing` | `short-drama/scripts/dubbing.py`——多角色配音 |
| `zmtgzt_performance_review` | `skill-social-performance-review/scripts/review.py` |
| `zmtgzt_publish_analytics` | `skill-publish-analytics/scripts/analyze.py` |
| `zmtgzt_assets` | `asset-manager/scripts/assets.py`——素材库 |

### 仓库状态

| 工具 | 用途 |
| --- | --- |
| `zmtgzt_profile` | 读写 `profiles/<画像>/{identity,style,audience,platforms,preferences,memory}.md` |
| `zmtgzt_artifact` | 列出 `outputs/` 项目，读某个项目的 manifest 与产物 |
| `zmtgzt_doctor` | 环境体检，逐项给出修复指引 |

## 契约如何送达模型

Easel 的 prompt stack 是四层（见其 `docs/prompt-stack.md`）。dsh 没有 `registerInstruction`，也没有全局 `USER.md`，因此映射关系是：

| Easel 层 | dsh 实现 |
| --- | --- |
| Layer 1 `SOUL.md`（人格） | 从仓库读取，**原文**注入契约技能 |
| Layer 2 `AGENTS.md`（编排） | 同上，原文注入，不做概括 |
| Layer 3 `CONTEXT.md`（项目路径） | 由 `config.easelRoot` 替代；脚本执行器已把 cwd 固定到该目录，因此 AGENTS.md 里"先 cd 到项目根"的规则自动满足 |
| Layer 4 `SKILL`（按需） | `skills/openclaw/<技能名>/SKILL.md` 逐个注册为 dsh 技能，正文与 `references/` 从磁盘读 |

插件自己写的文字只有一段"接入说明"，讲的是上述机制。它**不含任何业务编排规则**——那些属于 `AGENTS.md`，就留在那里。

## 配置

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `easelRoot` | — | 自备 Easel 仓库的绝对路径。**设置后覆盖内置快照**。 |
| `workspaceDir` | `~/.dsh/zmtgzt/easel` | 内置快照的释放位置；`.env`、`outputs/`、`profiles/` 都落在这里 |
| `releaseEmbedded` | `true` | 是否在启动时释放/更新内置快照。关掉则直接以只读快照为根 |
| `pythonPath` | `python` | Python 解释器（Windows 常需 `py` 或完整路径） |
| `scriptTimeoutMs` | `300000` | 单次脚本超时 |
| `registerEaselSkills` | `true` | 是否把技能注册为 dsh 技能 |
| `skillLayers` | `[]`（全部） | 只注册指定层，如 `[discover, plan]`，可缩短技能目录 |
| `injectOrchestration` | `true` | 是否注入 SOUL + AGENTS 契约 |

## 内容来源与更新

插件自带 `vendor/easel/`（Easel 快照，Apache-2.0，见 `THIRD-PARTY-NOTICES.md`）。
释放到工作目录时严格区分两类内容：

| 类别 | 处理方式 |
| --- | --- |
| 快照内容（`openclaw/`、`docs/`、`skills/`、`LICENSE`、`SYNC-INFO.json`） | 发现版本变化时覆盖 |
| 用户数据（`.env`、`outputs/`、`profiles/`、`assets/`） | **永不触碰** |

跟上游同步：

```sh
node scripts/sync-easel.mjs               # 同步最新 main
node scripts/sync-easel.mjs --ref v1.2.0  # 同步指定分支/标签
```

脚本会更新 `vendor/easel/` 并在 `SYNC-INFO.json` 记录来源 commit；插件下次启动即自动释放新版本。

### 关于脚本类工具的依赖

内置快照解决了"内容从哪来"，但**脚本能跑还需要运行环境**：Python 3、`pyproject.toml` 里声明的依赖、以及 `.env` 中的 API key。这部分装插件解决不了。首次释放会自动生成 `.env`，填好即可。

未配置时不会坏：脚本工具返回结构化的 `{ ok: false, kind, error, hint }`，纯文字类工作（找热点、定策略、写文案、策划）完全不受影响。

## 开发

```sh
npm install --legacy-peer-deps   # 只需 esbuild；宿主包保持 external
npm run build                    # → lib/index.js、lib/client.js
npm run check                    # 两个 bundle 的语法检查
node scripts/smoke.mjs           # 注册契约（约 20 条断言）
node scripts/e2e.mjs             # 针对 mock Easel 仓库的行为验证（约 35 条断言）
```

`lib/` 是刻意提交的：插件安装后无需构建即可加载。

## 版本支持

**支持的 dsh 版本：`>= 0.1.0-rc.6`**（涵盖 0.1.x 与 0.2.x 的全部 rc / alpha 版本）

验证方式：逐一比对了官方包在 `0.1.0-rc.6` 与 `0.2.0-rc.2` 两个版本的类型定义，本插件用到的全部接口在两版上形态一致：

| 接口 | 来源包 | 0.1.0-rc.6 | 0.2.0-rc.2 |
| --- | --- | --- | --- |
| `defineTool({name, description, parameters, output:{schema, render}, execute})` | `@deepseek-ai/dsh-tools` | ✅ | ✅ |
| `ctx.tools.register(def)` → disposer | `@deepseek-ai/dsh-tools` | ✅ | ✅ |
| `ctx.skills.register({name, description, whenToUse, source, provider, content})` | `@deepseek-ai/dsh-skill` | ✅ | ✅ |
| `ctx.webServer.register({kind, path, handler})` | `@deepseek-ai/dsh-host-webserver` | ✅ | ✅ |
| `ctx.provide(name, value)` | `@deepseek-ai/cordis` | ✅ | ✅ |

唯一差异是 0.2.x 新增的两个**可选**字段（工具的 `deferLoading`、路由的 `kind: 'global'`），本插件均未使用，因此不构成兼容性障碍。

插件不锁定 dsh 上界：`engines.dsh` 声明为 `>= 0.1.0-rc.6`，`peerDependencies` 同时接受 `^0.1.0-rc.6` 与 `^0.2.0-rc.2`，并全部标记为 optional——由宿主提供，插件不自行安装。

### 其他要求

- Node.js 22+
- 本地 [Easel](https://github.com/ZJU-REAL/Easel) 仓库（脚本类工具与技能注册需要）

## 许可

MIT。Easel 本身是 Apache-2.0，由你自行获取，本插件不重新分发它。
