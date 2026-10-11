# 第三方组件声明

## Easel — `vendor/easel/`

本插件的 `vendor/easel/` 目录包含 **Easel** 项目的快照。

| 项 | 值 |
| --- | --- |
| 项目 | Easel（开源社媒内容智能体） |
| 来源 | <https://github.com/ZJU-REAL/Easel> |
| 许可 | Apache License 2.0 —— 全文见 `vendor/easel/LICENSE` |
| 版权 | 归 ZJU-REAL 及 Easel 贡献者所有 |
| 同步方式 | 由 `scripts/sync-easel.mjs` 从上游拉取 |
| 同步版本 | 见 `vendor/easel/SYNC-INFO.json`（记录 commit、分支、时间） |

### 包含的内容

- `openclaw/`、`docs/`、`skills/` —— 契约文档、技能定义（`SKILL.md` 与 `references/`）与 Python 脚本
- `pyproject.toml`、`.env.example` —— Python 依赖声明与环境变量模板

### 未包含的内容

`assets/`、`web/`、`tests/`、`outputs/`、`profiles/` 等运行时与媒体资源不在分发范围内，
以控制包体积（这些目录在上游合计约 450 MB）。

### 许可合规说明

Apache-2.0 允许在保留版权声明与许可全文的前提下再分发。本插件据此做到：

- 完整保留 `vendor/easel/LICENSE`
- 保留上游的版权与署名信息（见 `SYNC-INFO.json` 与各文件原有头部）
- **未修改**快照内容，仅按目录原样同步

本插件自身代码采用 MIT 许可（见根目录 `LICENSE`）。两部分许可相互独立：
`vendor/easel/` 下的内容适用 Apache-2.0，其余适用 MIT。

### 如何更新

```sh
node scripts/sync-easel.mjs           # 同步最新 main
node scripts/sync-easel.mjs --ref v1.2.0   # 同步指定分支/标签
```

更新后 `SYNC-INFO.json` 会记录新的 commit，插件下次启动会自动把新快照释放到工作目录。
