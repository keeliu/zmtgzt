# Spec Delta

## Purpose

引入「主题」这一一等概念：创作者为一个内容项目命名后，把主题与会话绑定，
该会话即按当前生效的 `SOUL.md` / `AGENTS.md` 契约与技能生成内容，产物落到该主题的目录下。

## ADDED Requirements

### Requirement: 主题的创建与管理

工作台 SHALL 支持创建、列出、重命名与删除主题。每个主题 SHALL 对应工作目录下的
`outputs/<主题名>/`，并 SHALL 在其中维护 `manifest.json`。

主题名 SHALL 满足 Easel 既有约束：人类可读的具体名称，MUST NOT 使用 `xhs` / `test` / `tmp` 一类的泛化名。

#### Scenario: 创建主题

- **WHEN** 用户输入「春季通勤穿搭」并确认创建
- **THEN** 工作目录下出现 `outputs/春季通勤穿搭/`，且其中存在 `manifest.json`

#### Scenario: 泛化主题名被拒绝

- **WHEN** 用户尝试以 `test` 作为主题名
- **THEN** 系统拒绝创建并说明原因

### Requirement: 主题与会话绑定

工作台 SHALL 允许把一个主题绑定到当前会话；绑定后该会话 SHALL 在后续任务中默认使用该主题的产物目录。
绑定关系 SHALL 持久化，重启后仍然有效；解绑或切换主题 SHALL 由用户显式操作触发。

#### Scenario: 绑定后产物进入主题目录

- **WHEN** 会话绑定了主题「春季通勤穿搭」后触发内容生成
- **THEN** 产物写入 `outputs/春季通勤穿搭/`

#### Scenario: 重启后绑定仍生效

- **WHEN** 用户绑定主题后重启 DSH 并回到该会话
- **THEN** 该会话仍显示已绑定的主题

#### Scenario: 未绑定主题时提示而非静默落盘

- **WHEN** 用户在未绑定主题的会话中触发需要落盘的任务
- **THEN** 系统提示先选择或创建主题，MUST NOT 把产物写入 `outputs/` 根目录

### Requirement: 在当前目录创建规划

除绑定既有主题外，工作台 SHALL 支持「在当前目录创建新规划」，即在会话的当前工作目录下
初始化一个主题目录并完成绑定。

#### Scenario: 当前目录下创建规划

- **WHEN** 用户选择在当前目录创建新规划并命名
- **THEN** 当前目录下生成该主题的目录与 manifest，并自动完成与会话的绑定

### Requirement: 主题触发技能生成内容

绑定主题的会话 SHALL 能按当前生效的契约与技能生成内容。生成前 SHALL 加载 `SOUL.md` 与 `AGENTS.md`，
生成后 SHALL 通过 `manifest.py record` 登记步骤与结论。

#### Scenario: 生成内容并登记

- **WHEN** 用户在已绑定主题的会话中要求生成小红书图文
- **THEN** 会话按 AGENTS.md 与对应技能执行，产物落盘并在 manifest 中留下步骤记录

### Requirement: 产物路径可指定且受校验

工作台 SHALL 允许查看主题的产物目录树与 manifest 记录；目标路径违反 outputs 布局约束时
SHALL 返回 Easel 校验脚本的结论，MUST NOT 静默接受。

#### Scenario: 查看产物树

- **WHEN** 用户在工作台打开某主题
- **THEN** 显示该主题目录下的文件树与 manifest 中的步骤记录

#### Scenario: 不合规路径被拒绝

- **WHEN** 目标路径违反 outputs 布局约束（如直接写在 `outputs/` 根）
- **THEN** 系统拒绝并返回校验脚本给出的原因
