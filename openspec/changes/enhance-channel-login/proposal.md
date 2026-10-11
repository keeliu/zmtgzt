# Proposal

## Why

工作台上线后，用户在实际使用中报告三个问题。三者都已在代码里定位到具体成因（非推测）。

### 问题 1：小红书扫码登录不出二维码

两层原因叠加。

**第一层——前端从未渲染二维码。** 旧实现的登录会话区域只输出一行文字
「二维码由登录脚本生成在插件数据目录」，没有任何 `<img>` 或图片元素。
即使脚本成功产出 PNG，用户界面上也看不到。

**第二层——失败被完全吞掉。** `AccountService.startLogin` 以
`spawn(python, [...], { detached: true, stdio: 'ignore' })` 启动脚本：
stdout/stderr 全部丢弃，且**未监听子进程的 `error` 事件**
（Node 中未监听的 `error` 事件会升级为未捕获异常）。

而上游 `xhs_publish.py` 的 `cmd_login` 在**写第一个状态之前**就有一步可能失败：

```python
def cmd_login(a) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        _die(f"需要 playwright：{e}", 3)          # ← 在此退出
    ...
    login_state.write_status(sf, "starting", "正在启动…")   # ← 从未执行
```

因此当 Python 解释器路径不对、或 `playwright` / `opencv-python` / `Pillow` 未安装时，
进程直接退出、状态文件不存在，前端读到 `unknown`（用户界面所见），
而**失败原因无处可见**。

### 问题 2：画像 / 主题的「新建」按钮点击无反应

`ProfilePane.createProfile` 与 `TopicPane.createTopic` 使用 `window.prompt(...)`
采集名称。**Electron 不支持 `prompt`**（同步对话框），调用返回 `null` 且不显示窗口，
于是紧随其后的 `if (!name || !name.trim()) return` 直接返回——表现为「点击没反应」。
`TopicPane.removeTopic` 的 `window.confirm`、以及 `AccountPane` 的同类用法存在同样风险。

### 问题 3：公众号只有扫码一种登录方式

上游 `skill-wechat-publisher` 的 SKILL.md 明确记录**两条**发布路径：

- **默认：公众号后台会话**（`weixin_mp_stats.py login`）——免 `app_id`/`app_secret`、免 IP 白名单
- **回退：官方 HTTP API**（`publish.py --official-api`）——需要
  `skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml` 中的 `app_id`/`app_secret`，
  且需把出口 IP 加入公众号 IP 白名单

插件此前只暴露了第一条。用户希望两种方式都能用。

## What Changes

- **新增** 二维码展示：登录会话区渲染真实二维码图片（经 HTTP 端点取 PNG），
  在 `qr_ready` 状态自动出现，扫码成功后自动消失。
- **新增** 登录诊断可见性：脚本 stdout/stderr 落盘为日志文件并在界面可查；
  发起登录前预检 Python 解释器、`playwright`、二维码识别依赖（`opencv-python` / `Pillow`），
  未就绪时**不启动注定失败的登录**，而是给出可执行的修复指引。
- **新增** 有头（窗口）登录方式：本地有桌面时可改用 `login --headed`，
  在浏览器窗口内完成扫码或短信登录，作为 headless 抠图的备选路径。
- **修复** 子进程错误处理：监听 `error` 事件，把「解释器不存在」这类失败
  转成结构化错误面而不是未捕获异常。
- **修复** 用内联表单替换全部 `window.prompt` / `window.confirm`：
  新建画像、新建主题、删除主题改为自建输入框与二次确认态。
- **新增** 公众号双登录：账号页的公众号卡片提供「扫码登录后台会话」与
  「AppID + AppSecret（官方 API）」两种方式供用户选择；后者提供表单、
  写入 `wechat-publisher.yaml`，并调用官方 API 验证凭证、按错误码提示白名单问题。

## Capabilities

### New Capabilities

- `login-qr-display`：扫码登录的二维码呈现与失败可诊断——二维码图片获取与渲染、
  登录状态机驱动、依赖预检、脚本日志留存、有头备选路径。
- `inline-forms`：界面内的表单与确认——不依赖浏览器原生 `prompt` / `confirm`，
  新建与删除走自建输入与二次确认。
- `wechat-api-credentials`：公众号的两种登录方式——后台会话扫码，或
  AppID/AppSecret 官方 API 凭证（含写入配置文件、凭证校验、白名单提示）。

### Modified Capabilities

- `creator-account`：原规范只要求「扫码登录与登出」，本次扩展为
  「登录方式可选、失败必须可诊断、二维码必须可见」。相关 Requirement 以
  `login-qr-display` 与 `wechat-api-credentials` 两个新能力承接，原能力条目相应放宽。

## Impact

**受影响的代码与系统**

| 区域 | 处置 |
|---|---|
| `src/account.ts` | 新增依赖预检、日志落盘、二维码状态字段；新增公众号凭证读写与校验 |
| `src/index.ts` | 新增二维码图片端点、登录日志端点、公众号凭证读写端点 |
| `src/client/index.tsx` | 登录区渲染二维码与日志；替换 `prompt`/`confirm`；公众号卡片加方式选择与凭证表单 |
| 新增 `src/wechat-config.ts` | `wechat-publisher.yaml` 的读写与结构校验 |
| 新增 `src/preflight.ts` | Python / Playwright / 二维码依赖的可用性探测 |

**受影响的外部依赖与前置**

- **Python 侧依赖**：`xhs_publish.py login` 的 headless 抠图依赖
  `opencv-python` 与 `Pillow`（见 `skills/shared/scripts/login_qr.py` 的
  `save_qr` 直接 `import cv2`），浏览器自动化依赖 `playwright`。
  任一缺失都会导致登录失败——因此本变更把「预检」作为发起登录的前置条件。
- **公众号配置文件位置固定**：`config.py::_config_path()` 返回
  `skill-wechat-publisher/wechat-publisher.yaml`（`Path(__file__).parent.parent`），
  只查该路径。因此插件必须写入内置快照中的这一位置，而非插件自己的数据目录。
- **官方 API 的 IP 白名单**：微信 `cgi-bin/token` 在未登记出口 IP 时返回
  `40164`，凭证本身正确也会失败。界面必须把这种「非凭证错误」与凭证错误区分提示。

**不受影响**

- 登录态真相源仍是 `~/.easel-browser-profiles/`，插件不另建存储。
- Easel 既有技能、脚本与 `profiles/`、`outputs/` 布局不改动。
- 今日头条仍如实标注为「上游未实现」，不新建实现。
- 已注册的 `zmtgzt_*` 工具与工作台其余页面保持不变。
