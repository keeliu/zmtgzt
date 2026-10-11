# Spec Delta

## Purpose

界面交互 MUST NOT 依赖浏览器原生同步对话框。DSH Web 可能运行在 Electron 中，
而 Electron 不支持 `window.prompt`（返回 `null` 且不显示窗口），
`window.confirm` 同样不可依赖。凡需采集文本或二次确认的操作，一律使用自建组件。

## ADDED Requirements

### Requirement: 不使用原生对话框

客户端代码 MUST NOT 调用 `window.prompt`、`window.confirm` 或 `window.alert`
来完成业务交互。所有文本采集 SHALL 使用受控输入组件，
所有破坏性操作的确认 SHALL 使用界面内的二次确认态。

#### Scenario: 不出现原生对话框调用

- **WHEN** 检查构建产物
- **THEN** 其中不含 `window.prompt` / `window.confirm` / `window.alert` 的调用

### Requirement: 新建操作使用内联表单

「新建画像」与「新建主题」SHALL 在界面内展开输入框，接受名称并提交；
SHALL 提供取消操作且 MUST NOT 在未提交时产生副作用。

#### Scenario: 新建画像

- **WHEN** 用户点击「新建」并输入名称后提交
- **THEN** 新画像被创建并自动打开，输入框收起

#### Scenario: 取消不产生副作用

- **WHEN** 用户在表单中点击取消
- **THEN** 输入框收起且未创建任何资源

#### Scenario: 空名称被拒绝

- **WHEN** 用户提交空白名称
- **THEN** 不发起请求，界面提示名称不能为空

### Requirement: 表单需反馈校验与错误

内联表单 SHALL 呈现服务端返回的校验失败原因（例如主题名不合法），
MUST NOT 静默失败。

#### Scenario: 主题名非法时显示原因

- **WHEN** 用户提交的主题名被服务端拒绝（如使用泛化名或以下划线开头）
- **THEN** 表单内显示拒绝原因，输入内容保留以便修改

#### Scenario: 提交中禁用重复提交

- **WHEN** 用户提交表单且请求进行中
- **THEN** 提交按钮禁用，避免重复创建

### Requirement: 删除操作使用二次确认态

删除主题等破坏性操作 SHALL 使用界面内的二次确认态（或确认按钮变体），
SHALL 明确将要删除的对象名称与不可恢复性。

#### Scenario: 删除需两次确认

- **WHEN** 用户点击「删除主题」
- **THEN** 先进入确认态并显示主题名与「不可恢复」提示，再次确认后才执行删除

#### Scenario: 可退出确认态

- **WHEN** 用户在确认态点击取消
- **THEN** 回到常规状态，不执行删除
