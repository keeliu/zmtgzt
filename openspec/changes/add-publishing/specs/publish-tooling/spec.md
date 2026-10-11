# Spec Delta

## Purpose

让「发布」在 dsh 里真正可用：参数能正确传到脚本、门禁顺序固定、默认不误发、
平台差异如实呈现。覆盖小红书（图文/视频）与微信公众号（草稿）。

## ADDED Requirements

### Requirement: flag 型参数必须正确传递

参数序列化 SHALL 区分「带值参数」与「flag 参数」。布尔值为 `true` 时 SHALL 只输出
`--flag` 本身而 MUST NOT 追加值；为 `false` 时 SHALL 完全跳过该参数。

理由：argparse 的 `store_true` 语义是「有无该 flag」，传 `--exec true` 会被当作多出的
位置参数而报 `unrecognized arguments: true`，导致命令解析失败、功能完全不可用。

#### Scenario: true 只输出裸 flag

- **WHEN** 调用方传入 `{ exec: true }`
- **THEN** 生成的命令行含 `--exec`，且其后不跟 `true` 之类的值

#### Scenario: false 不产生参数

- **WHEN** 调用方传入 `{ headed: false }`
- **THEN** 命令行中不出现 `--headed`

#### Scenario: 带值参数不受影响

- **WHEN** 传入 `{ title: '标题', count: 20 }`
- **THEN** 生成 `--title 标题 --count 20`

### Requirement: 跨平台发布工具

系统 SHALL 提供发布工具并以参数区分平台，至少覆盖小红书与微信公众号。
工具 SHALL 只包装仓库中真实存在的发布脚本，参数名 MUST 取自各自 argparse 定义。

#### Scenario: 平台与脚本映射固定

- **WHEN** 以某平台与内容类型调用发布工具
- **THEN** 按下表固定映射调用脚本

  | 平台 | 内容类型 | 脚本与子命令 |
  | --- | --- | --- |
  | 小红书 | 图文 | `skills/shared/scripts/xhs_publish.py publish` |
  | 小红书 | 视频 | `skills/shared/scripts/xhs_publish.py publish-video` |
  | 小红书 | 预检 | `skills/shared/scripts/xhs_publish.py plan` |
  | 微信公众号 | 草稿（后台会话） | `skills/shared/scripts/weixin_mp_stats.py publish` |
  | 微信公众号 | 草稿（官方 API） | `skills/openclaw/skill-wechat-publisher/scripts/publish.py` |

#### Scenario: 小红书图文发布

- **WHEN** 以 `platform: xiaohongshu`、`type: image` 调用并给出标题、正文、至少一张图片
- **THEN** 调用 `xhs_publish.py publish`，且媒体为真实存在的文件路径

#### Scenario: 视频发布

- **WHEN** 以 `type: video` 调用并给出视频路径
- **THEN** 调用 `xhs_publish.py publish-video`

#### Scenario: 未知平台被拒绝

- **WHEN** 传入未支持的平台
- **THEN** 返回明确错误并列出支持的平台，MUST NOT 静默失败

### Requirement: 默认不发布，必须显式确认

发布工具 SHALL 默认以 dry-run 运行（仅预检与步骤预览），MUST NOT 在未显式确认的情况下
真正发布。确认 SHALL 通过独立参数表达，且该参数在工具描述中明确标注后果。

#### Scenario: 未确认时只预检

- **WHEN** 调用发布工具但未传确认参数
- **THEN** 只输出预检与步骤预览，不产生任何发布副作用

#### Scenario: 确认后才真正发布

- **WHEN** 传入确认参数且预检通过
- **THEN** 执行真实发布并返回结果

#### Scenario: 预检未通过不进发布

- **WHEN** 标题超长、媒体文件不存在等前置校验失败
- **THEN** 直接返回失败，MUST NOT 继续调用发布

### Requirement: 发布前门禁按固定顺序串联

发布前 SHALL 按 AGENTS.md 规定的顺序执行检查：

1. `content_guard.py` 敏感信息扫描（**硬门禁**）——检出 API Key、内部 URL、代理 IP、
   模型名等内部设置泄露时，真实发布 MUST 被阻断
2. `persona_gate.py` 人设一致性（**仅提醒**）——不阻断发布，但结论 SHALL 随结果返回

插件 MUST NOT 在界面或工具默认路径上暴露绕过硬门禁的开关
（上游存在 `--allow-unsafe` / `--skip-ai-score`，但 SHALL NOT 由工作台提供入口）。

#### Scenario: 硬门禁命中时阻断

- **WHEN** 待发内容被内容安全扫描判定为泄露内部信息
- **THEN** 真实发布被阻断，返回命中项与说明

#### Scenario: 人设检查不阻断

- **WHEN** 人设检查给出低于阈值的评分
- **THEN** 发布仍可进行，但结果中显著呈现该评分与偏离点

#### Scenario: 界面不提供绕过入口

- **WHEN** 检查工作台发布页的可操作项
- **THEN** 不存在「跳过分禁」「强制发布」一类开关

### Requirement: 发布后可留痕

真实发布成功后，系统 SHALL 记录发布留痕（平台、标题、画像、人设检查结论）。
留痕 SHALL 仅记录原始数据，MUST NOT 回写或篡改内容产物。

#### Scenario: 成功后写入留痕

- **WHEN** 发布成功
- **THEN** 留痕被写入，且可在后续查询中读到该条记录

#### Scenario: 预检或失败不留痕

- **WHEN** 仅执行预检，或发布失败
- **THEN** 不写入成功留痕

### Requirement: 平台能力边界如实呈现

工具与界面 SHALL 如实标注各平台的产物语义，MUST NOT 让用户误以为已完成群发。

- 微信公众号：产物为**草稿**，需用户到公众号后台手动群发
- 小红书：为真实发布，但 SHALL 提示平台风控/限流/封号风险

#### Scenario: 公众号结果标明是草稿

- **WHEN** 公众号发布成功
- **THEN** 结果明确说明「已创建草稿」，并给出需人工群发的后续步骤

#### Scenario: 风险提示可见

- **WHEN** 用户在小红书发布界面操作
- **THEN** 可见平台风控风险提示

### Requirement: 失败必须可归因

发布失败时 SHALL 返回脚本的真实错误信息（含 stderr 摘要），MUST NOT 只报「发布失败」。
常见失败（未登录、图片不存在、标题超长、登录目录被占用）SHALL 给出对应的修复指引。

#### Scenario: 未登录时提示先登录

- **WHEN** 脚本报告未登录
- **THEN** 返回「请先扫码登录」并指向工作台账号页

#### Scenario: 媒体缺失时指明路径

- **WHEN** 图片或视频路径不存在
- **THEN** 返回缺失的具体路径，而不是笼统失败

#### Scenario: 保留脚本原始输出

- **WHEN** 发布失败
- **THEN** 返回内容包含脚本输出的关键行，便于定位
