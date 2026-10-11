# Spec Delta

## Purpose

让创作者能直接看到并编辑 Easel 的契约文件（`SOUL.md` 与 `AGENTS.md`），且插件默认加载它们——
不必深入到 `vendor/` 或释放目录的子路径里去找。

## ADDED Requirements

### Requirement: 契约文件位于工作目录根

插件 SHALL 把 `SOUL.md` 与 `AGENTS.md` 释放到工作目录根（`workspaceDir` 的直接子路径），
使用户无需展开 `openclaw/workspace/` 即可看到与编辑。原 `openclaw/workspace/` 下的副本
SHALL 保留，以兼容 Easel 技能内的相对引用。

#### Scenario: 首次释放后根目录可见

- **WHEN** 插件首次释放内置快照
- **THEN** `workspaceDir/SOUL.md` 与 `workspaceDir/AGENTS.md` 均存在

#### Scenario: 用户编辑后不被覆盖

- **WHEN** 用户编辑 `workspaceDir/AGENTS.md` 后插件再次释放快照
- **THEN** 用户编辑的版本被保留，插件以该版本为准

### Requirement: 默认加载根目录契约

插件注入编排契约时 SHALL 优先读取工作目录根的 `SOUL.md` 与 `AGENTS.md`；
根目录缺失该项时 SHALL 回退到 `openclaw/workspace/` 下的同名文件。

#### Scenario: 优先使用根目录版本

- **WHEN** 根目录与 `openclaw/workspace/` 下的 AGENTS.md 内容不同
- **THEN** 注入的是根目录版本

#### Scenario: 根目录缺失时回退

- **WHEN** 根目录未提供 SOUL.md
- **THEN** 插件回退读取 `openclaw/workspace/SOUL.md` 并正常注入

### Requirement: 契约来源可查

`zmtgzt_doctor` SHALL 报告每个契约文件的实际来源路径，使用户能确认当前生效的是哪一份。

#### Scenario: 体检显示契约路径

- **WHEN** 用户运行 `zmtgzt_doctor`
- **THEN** 输出中包含 SOUL.md 与 AGENTS.md 各自的实际读取路径
