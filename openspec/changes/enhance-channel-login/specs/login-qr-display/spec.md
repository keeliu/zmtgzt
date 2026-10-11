# Spec Delta

## Purpose

让扫码登录在界面上**真正可用**：二维码可见、进度可读、失败可诊断。
覆盖小红书与公众号两个走浏览器会话的渠道。

## ADDED Requirements

### Requirement: 二维码必须可见

登录进入 `qr_ready` 状态后，界面 SHALL 渲染二维码**图片**，MUST NOT 仅以文字提示
「二维码已生成在某个目录」代替。

二维码图片 SHALL 经插件自身的 HTTP 端点提供（内容类型为 `image/png`），
使浏览器无需直接访问宿主文件系统。

#### Scenario: 进入 qr_ready 后出现二维码

- **WHEN** 登录脚本写入状态 `qr_ready` 且二维码 PNG 已生成
- **THEN** 登录会话区域显示该二维码图片，可被手机直接扫描

#### Scenario: 二维码尚未就绪时不渲染空图

- **WHEN** 登录处于 `starting` 状态、二维码文件尚不存在
- **THEN** 界面显示进行中提示，且不渲染破图（不产生加载失败的 `img`）

#### Scenario: 登录成功后二维码消失

- **WHEN** 登录状态变为 `success`
- **THEN** 二维码与登录会话区域一并移除，渠道状态刷新为已登录

### Requirement: 登录状态由状态文件驱动

界面 SHALL 轮询登录状态文件，并按下述状态呈现：

| 状态 | 界面呈现 |
| --- | --- |
| `starting` | 进行中提示 |
| `qr_ready` | 二维码图片 |
| `window_login` | 提示到浏览器窗口完成登录 |
| `scanned` | 已扫码、等待确认 |
| `sms_required` | 需要短信验证码 |
| `verifying` | 校验中 |
| `success` | 关闭会话并刷新渠道状态 |
| `expired` / `error` | 终止轮询并显示原因 |

轮询 SHALL 在有界时间内停止，MUST NOT 无限轮询。

#### Scenario: 错误状态终止轮询

- **WHEN** 状态变为 `error` 或 `expired`
- **THEN** 前端停止轮询并展示该状态携带的 message

### Requirement: 失败必须可诊断

系统 SHALL 在发起登录**之前**预检运行环境，至少覆盖：

- Python 解释器可执行
- `playwright` 可导入
- 二维码识别依赖 `opencv-python`（`cv2`）与 `Pillow` 可导入

任一不满足时，系统 MUST NOT 启动注定失败的登录进程，SHALL 直接返回结构化失败
并附可执行的修复指引（包含缺失项与安装命令）。

登录脚本的 stdout 与 stderr SHALL 落盘保存，并 SHALL 可从界面读取查看。

#### Scenario: 缺 playwright 时给出明确指引

- **WHEN** 用户点击扫码登录，但预检发现 `playwright` 不可导入
- **THEN** 不启动登录进程，界面显示缺失项与安装命令（如 `pip install playwright` 及
  `playwright install chromium`），而不是停留在 `unknown`

#### Scenario: 状态文件缺失时归因到脚本退出

- **WHEN** 轮询发现状态文件不存在且子进程已退出
- **THEN** 界面 SHALL 显示「脚本未写入状态即退出」并给出日志文件的查看入口，
  MUST NOT 仅显示 `unknown`

#### Scenario: 脚本日志可查看

- **WHEN** 用户展开「登录日志」
- **THEN** 可见该渠道最近一次登录的 stdout/stderr 内容

### Requirement: 子进程异常必须被捕获

启动登录脚本时 SHALL 监听子进程的 `error` 事件。解释器不存在等启动失败
SHALL 转为结构化错误面，MUST NOT 产生未捕获异常。

#### Scenario: 解释器路径错误不崩溃

- **WHEN** 配置的 Python 解释器路径不存在
- **THEN** 返回结构化错误并提示检查 `pythonPath` 配置，插件其余功能不受影响

### Requirement: 有头窗口登录作为备选

系统 SHALL 允许用户选择有头（headed）方式登录：在本地图形环境中弹出浏览器窗口，
用户在窗口内完成扫码或短信验证。该方式 SHALL 与 headless 抠图方式并列提供，
由用户按环境选择。

#### Scenario: 选择窗口登录

- **WHEN** 用户选择「窗口登录」方式
- **THEN** 脚本以 headed 模式启动，状态进入 `window_login`，界面提示在窗口内完成登录

#### Scenario: 无桌面环境时窗口登录不可用

- **WHEN** 运行环境无图形界面（如纯服务器）
- **THEN** 界面仍以 headless 抠图方式为主，并在窗口登录不可用时给出说明
