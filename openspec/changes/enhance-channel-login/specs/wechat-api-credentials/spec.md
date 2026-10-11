# Spec Delta

## Purpose

公众号 SHALL 提供两种登录方式供用户按条件选择，两种方式对应上游
`skill-wechat-publisher` 已实现的两条发布路径：

- **后台会话**（`weixin_mp_stats.py login`）：扫码登录公众号后台，免 AppID/AppSecret、免 IP 白名单
- **官方 API**（`publish.py --official-api`）：填写 AppID/AppSecret，需在公众号后台登记出口 IP 白名单

## ADDED Requirements

### Requirement: 两种登录方式由用户选择

公众号渠道 SHALL 同时提供「扫码登录后台会话」与「AppID + AppSecret」两种方式，
界面 SHALL 明示二者的差异与适用条件，MUST NOT 只提供其中一种。

界面 SHALL 说明：后台会话方式免凭证与白名单；官方 API 方式需凭证并需登记出口 IP 白名单。

#### Scenario: 两种方式均可选

- **WHEN** 用户展开公众号渠道
- **THEN** 可分别选择扫码登录或填写凭证两种方式

#### Scenario: 适用条件可见

- **WHEN** 用户查看两种方式的说明
- **THEN** 明确显示各自是否需要凭证、是否需要 IP 白名单

### Requirement: 凭证写入上游约定的位置

凭证 SHALL 写入上游 `config.py` 唯一查找的路径：
`skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml`（位于生效根之下）。
MUST NOT 写入插件自己的数据目录，否则上游脚本读不到。

写入 SHALL 保留文件中的其它账号与其它字段，MUST NOT 整体覆盖用户已有配置。

文件结构 SHALL 符合上游约定：

```yaml
default: <账号键>
accounts:
  <账号键>:
    app_id: <AppID>
    app_secret: <AppSecret>
    author: <作者名，可选>
    theme: <主题，可选>
```

#### Scenario: 首次配置创建文件

- **WHEN** 用户在尚无 `wechat-publisher.yaml` 的情况下提交凭证
- **THEN** 按上游结构创建该文件，并设置 `default` 指向所填账号

#### Scenario: 已有配置时保留其它账号

- **WHEN** 文件中已存在其它账号，用户新增或更新一个账号
- **THEN** 其它账号与其字段保持不变

#### Scenario: 凭证不出现在前端响应中

- **WHEN** 界面读取公众号配置状态
- **THEN** 仅返回是否已配置与 AppID 的脱敏形式，MUST NOT 回传完整的 AppSecret

### Requirement: 凭证需校验并区分错误类型

提交凭证后系统 SHALL 调用微信官方接口校验有效性
（`cgi-bin/token`，`grant_type=client_credential`）。

系统 SHALL 区分以下结果并分别提示：

| 结果 | 提示 |
| --- | --- |
| 成功 | 凭证有效，可用于官方 API 发布 |
| `40001` / `40002` | AppID 或 AppSecret 不正确 |
| `40164` | 出口 IP 未加入白名单，需在公众号后台登记 |
| 网络不可达 | 无法连接微信接口，检查网络或代理 |

对 `40164`，界面 SHALL 明确说明「凭证本身正确，问题在 IP 白名单」，
MUST NOT 归因为凭证错误。

#### Scenario: 凭证错误提示明确

- **WHEN** 校验返回 `40001` 或 `40002`
- **THEN** 提示 AppID 或 AppSecret 不正确，并保留已填内容

#### Scenario: 白名单未配置时区分提示

- **WHEN** 校验返回 `40164`
- **THEN** 提示出口 IP 未登记白名单，并说明凭证本身有效

#### Scenario: 网络不可达不误判为凭证错误

- **WHEN** 请求微信接口超时或连接失败
- **THEN** 提示网络或代理问题，MUST NOT 提示凭证错误

### Requirement: 配置状态可查看与清除

界面 SHALL 显示公众号官方 API 的配置状态（已配置 / 未配置、AppID 脱敏、账号键），
并 SHALL 提供清除该凭证的操作。

#### Scenario: 显示脱敏状态

- **WHEN** 用户查看公众号渠道
- **THEN** 显示是否已配置凭证及脱敏后的 AppID

#### Scenario: 清除凭证

- **WHEN** 用户执行清除
- **THEN** 移除该账号的凭证字段（或该账号条目），并刷新状态为未配置
