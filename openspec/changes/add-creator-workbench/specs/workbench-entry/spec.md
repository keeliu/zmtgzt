# Spec Delta

## Purpose

把插件入口从「会话区页签」迁移到 DSH 侧边栏的全局入口，统一命名为「自媒体工作台」，
点击后在主区域打开工作台页面，并提供返回对话的路径。工作台承载账号、画像、主题等全部功能，
不再占用会话视图的页签位。

## ADDED Requirements

### Requirement: 侧边栏工作台入口

系统 SHALL 用官方的**两段式注册**提供入口（与内置「插件」条目同一机制）：

1. `sidebar.panellist`（`kind: list`, `scope: root`）注册一个**图标条目**，
   条目 MUST 携带 `id`，SHOULD 携带 `order` 与 `label`。宿主渲染行与按钮、
   从条目 metadata 解析 label、并在点击时选中该面板 ——
   插件 MUST NOT 自行绘制整行按钮或承担点击路由。
2. `main`（`kind: keyed`, `scope: root`）用**同一个 id** 作为 `key` 注册面板主体。

条目 id 与 `main` 的 key MUST 完全一致；不一致时宿主选中条目将找不到面板。

图标条目组件 SHALL 只渲染图标，并接受宿主提供的 `{ size, active }`；
`active` 为真时 SHOULD 呈现选中态。

#### Scenario: 入口与内置「插件」条目同位

- **WHEN** 用户查看左侧导航栏
- **THEN** 「自媒体工作台」条目出现在侧边栏全局条目区域（与内置「插件」条目同区），且带图标

#### Scenario: 点击条目的选中由宿主驱动

- **WHEN** 用户点击「自媒体工作台」条目
- **THEN** 宿主以该条目 id 为 key 渲染 `main` 面板，主区域显示工作台

#### Scenario: id 与 key 一致

- **WHEN** 检查注册结果
- **THEN** `sidebar.panellist` 条目的 `id` 与 `main` 注册项的 `key` 为同一字符串

### Requirement: 入口注册的降级与槽位合法性

插件 MUST NOT 注册到宿主未声明的槽位。由于 `slots.inject` 对未声明槽位既不触发也不抛错，
入口的降级 MUST NOT 依赖「注册时逐个 try/catch 后取第一个候选」——该写法会永远停在第一个候选，
使降级分支永不执行。

入口 SHALL 首选 `sidebar.panellist`；宿主未声明该槽位时（早期版本），SHALL 降级注册到
`sidebar.footer.action`。两条路径 SHALL 可并存而不互相阻塞；当 `sidebar.panellist` 生效时
MUST 撤销已注册的降级入口，避免同一功能出现两个入口。

降级入口 SHALL 通过 layout 服务选中主面板，且 MUST NOT 因 layout 服务缺失而阻断首选路径。

#### Scenario: 宿主无 panellist 时降级

- **WHEN** 宿主未声明 `sidebar.panellist` 但声明了 `sidebar.footer.action`
- **THEN** 入口注册到 `sidebar.footer.action`，点击后仍能在主区域打开工作台

#### Scenario: 两路同时可用时不出现重复入口

- **WHEN** 宿主同时声明了两个槽位
- **THEN** 只保留 `sidebar.panellist` 入口，降级入口被撤销

#### Scenario: 不注册到未声明槽位

- **WHEN** 插件初始化
- **THEN** 不存在对 `sidebar.header.action` 这类宿主未声明槽位的注册尝试

### Requirement: 工作台页面在主区域打开

点击工作台入口后，系统 SHALL 在主内容区域渲染工作台页面。工作台页面 SHALL 提供返回对话的操作，
该操作 MUST NOT 切换或清空当前会话。

#### Scenario: 点击入口打开工作台

- **WHEN** 用户点击「自媒体工作台」入口
- **THEN** 主区域显示工作台页面

#### Scenario: 返回对话不改变会话

- **WHEN** 用户在工作台中点击返回对话
- **THEN** 主区域恢复为进入前的会话，其草稿与滚动位置保持不变

### Requirement: 面板内子导航

工作台 SHALL 把功能区域组织为页面内子导航，MUST NOT 在侧边栏为每个功能区各注册一个入口。
子导航 SHALL 至少覆盖：总览、账号、画像、主题、产物、环境自检。同一时刻 SHALL 只呈现一个子页面。

#### Scenario: 切换子页面不改变侧边栏

- **WHEN** 用户在工作台内切换到「画像」子页面
- **THEN** 主区域显示画像页面，侧边栏入口数量不变

#### Scenario: 子导航覆盖全部功能区

- **WHEN** 用户展开工作台子导航
- **THEN** 总览、账号、画像、主题、产物、环境自检均可达

### Requirement: 主题令牌约束

工作台 SHALL 只使用 DSH 主题令牌取色，MUST NOT 使用自建固定色。切换明暗主题时其配色 SHALL 跟随变化。

#### Scenario: 明暗主题切换时配色跟随

- **WHEN** 用户切换 DSH 的明暗主题
- **THEN** 工作台配色随之变化，无固定色块残留

### Requirement: 面板故障隔离

工作台任一子页面渲染失败时，系统 SHALL 把错误限制在该子页面内并呈现可读错误态，
MUST NOT 让异常逃逸到面板挂载点导致主区域空白。

#### Scenario: 子页面抛错时其余功能可用

- **WHEN** 某子页面渲染抛出异常
- **THEN** 该子页面显示错误态，子导航与返回对话仍可操作

### Requirement: 移除会话页签入口

本插件 MUST NOT 继续在 `conversation.view` 槽注册视图；升级后旧入口 SHALL 不再出现。

#### Scenario: 升级后旧页签消失

- **WHEN** 用户从带有 `conversation.view` 旧入口的版本升级
- **THEN** 会话视图页签中不再出现本插件的入口，功能全部可从侧边栏工作台访问
