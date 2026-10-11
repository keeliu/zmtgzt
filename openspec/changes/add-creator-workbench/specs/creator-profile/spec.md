# Spec Delta

## Purpose

让创作者在工作台内直接维护账号画像的六个维度，而不必手工编辑 `profiles/` 下的 markdown 文件。
画像数据仍落在 Easel 既有目录结构中，格式与技能读取期望保持一致。

## ADDED Requirements

### Requirement: 画像的六维维护

工作台 SHALL 提供画像的创建、查看、编辑与删除；每个画像 SHALL 对应
`profiles/<画像名>/` 下的六个维度文件：`identity.md`、`style.md`、`audience.md`、
`platforms.md`、`preferences.md`、`memory.md`。

#### Scenario: 创建画像

- **WHEN** 用户创建工作台中的新画像并填写定位
- **THEN** `profiles/<画像名>/identity.md` 被创建并写入该内容

#### Scenario: 编辑单个维度

- **WHEN** 用户编辑「内容风格」维度并保存
- **THEN** `profiles/<画像名>/style.md` 被更新，其余维度文件不变

#### Scenario: 删除画像

- **WHEN** 用户删除一个画像
- **THEN** 该画像目录被移除，且列表中不再出现

### Requirement: 模板对齐

新建画像时系统 SHALL 参照 `profiles/_template/` 的结构生成初始文件，使用户从与 Easel 一致的骨架开始。
`_template` 本身 MUST NOT 出现在可编辑的画像列表中。

#### Scenario: 新画像含六个维度文件

- **WHEN** 用户创建新画像
- **THEN** 六个维度文件均存在（可为空内容）

#### Scenario: 模板不被当作画像

- **WHEN** 用户查看画像列表
- **THEN** 列表中不包含 `_template`

### Requirement: 与技能读取格式一致

画像文件的写入格式 SHALL 与 Easel 技能读取时预期的一致，MUST NOT 引入技能无法识别的结构。
系统 SHALL NOT 在维度文件中注入插件自有的元数据区块。

#### Scenario: 技能能读取工作台写入的画像

- **WHEN** 用户在工作台编辑画像后，于会话中触发依赖画像的技能
- **THEN** 技能能读取到工作台写入的内容

#### Scenario: 不注入插件私有字段

- **WHEN** 审阅工作台写入后的画像文件
- **THEN** 文件内容不含插件自有的标记区块或非 Easel 约定的元数据

### Requirement: 画像与平台偏好

「偏好平台」维度 SHALL 以多选方式维护，可选值 SHALL 来自 Easel 支持的平台集合，
且与账号页的渠道名称保持一致。

#### Scenario: 选择偏好平台

- **WHEN** 用户为画像勾选「小红书」与「微信公众号」
- **THEN** `platforms.md` 记录这两个值，且账号页可据此提示关联

### Requirement: 画像即改即用

保存画像后，后续会话 SHALL 立即读取到最新内容，MUST NOT 需要重启进程或重新释放快照。

#### Scenario: 保存后立即可用

- **WHEN** 用户保存画像修改后立刻在会话中使用该画像
- **THEN** 读取到的是修改后的内容

### Requirement: 写入的原子性

画像写入 SHALL 采用先写临时文件再改名的方式，避免中断导致文件半截；
并发保存同一文件时 SHALL 串行处理。

#### Scenario: 写入中断不留下损坏文件

- **WHEN** 写入过程中进程被中断
- **THEN** 原文件内容保持完整，磁盘上不残留半截内容作为最终结果
