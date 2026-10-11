# Tasks

## 1. 归档与准备

- [x] 1.1 建立变更 `enhance-channel-login`，写入 proposal / design / 三个能力规范
- [x] 1.2 `openspec validate enhance-channel-login --strict` 通过
- [x] 1.3 复核上游脚本真实接口（`xhs_publish.py login`、`weixin_mp_stats.py login`、
      `login_qr.py`、`login_state.py`、`skill-wechat-publisher/scripts/config.py`）

## 2. 登录诊断与预检（login-qr-display）

- [x] 2.1 新增 `src/preflight.ts`：探测 Python 可执行、`playwright`、`cv2`、`PIL`
- [x] 2.2 `AccountService.startLogin` 先跑预检；未通过则返回结构化失败并附缺失项与安装命令
- [x] 2.3 登录脚本 stdout/stderr 重定向到 `<dataDir>/login/<channelId>.log`
- [x] 2.4 监听子进程 `error` 事件，转为结构化错误（解释器不存在等）
- [x] 2.5 `startLogin` 支持 `mode: 'qr' | 'window'`，后者传 `--headed`
- [x] 2.6 状态缺失且进程已退出时，返回可归因的错误（而非 `unknown`）

## 3. 二维码在新前端呈现

- [x] 3.1 新增 `GET /api/zmtgzt/account/login/qr`，返回 PNG（不存在则 404）
- [x] 3.2 新增 `GET /api/zmtgzt/account/login/log`，返回最近一次登录日志
- [x] 3.3 前端登录会话区渲染 `<img>` 二维码，仅在有图时渲染，避免破图
- [x] 3.4 按状态机呈现各状态（含 `window_login`、`sms_required`、`verifying`）
- [x] 3.5 轮询在 `success` / `expired` / `error` 终止；提供「重新发起」入口
- [x] 3.6 提供「查看登录日志」展开区

## 4. 内联表单（inline-forms）

- [x] 4.1 提取通用内联表单小组件（输入 + 提交 + 取消 + 错误行）
- [x] 4.2 画像「新建」改为内联表单，支持错误显示与提交中禁用
- [x] 4.3 主题「新建」改为内联表单，展示服务端拒绝原因且保留输入
- [x] 4.4 主题「删除」改为二次确认态（显示主题名与不可恢复提示）
- [x] 4.5 移除全部 `window.prompt` / `window.confirm` / `window.alert`

## 5. 公众号双登录（wechat-api-credentials）

- [x] 5.1 新增 `src/wechat-config.ts`：`wechat-publisher.yaml` 的读取与行级补丁写入
- [x] 5.2 读取接口返回脱敏状态（是否已配置 / AppID 脱敏 / 账号键），不回传 AppSecret
- [x] 5.3 写入接口：校验入参、备份 `.bak`、按 D5 算法写入、设置 `default`
- [x] 5.4 凭证校验：调用 `cgi-bin/token`，区分成功 / 40001·40002 / 40164 / 网络不可达
- [x] 5.5 清除接口：移除目标账号凭证并刷新状态
- [x] 5.6 前端公众号卡片提供两种方式选择，含各自适用条件说明与凭证表单

## 6. 测试与验证

- [x] 6.1 `scripts/login-flow.mjs`：预检失败不启动进程、日志落盘、二维码端点、
      状态机驱动、子进程 error 处理
- [x] 6.2 `scripts/wechat-config.mjs`：YAML 行级补丁保留其它账号与其它顶层键、
      `.bak` 备份、脱敏、错误码分支（用打桩的 HTTP 替身）
- [x] 6.3 `scripts/ui-forms.mjs`：构建产物中不含原生对话框调用；内联表单存在
- [x] 6.4 既有五套测试（smoke / e2e / workbench / ui-entry / verify-real-data）保持全绿
- [x] 6.5 `npm run build` + `npm run check` 通过

## 7. 文档与发布

- [x] 7.1 中英 README 补充：登录排障（依赖预检、日志位置）、公众号两种方式
- [x] 7.2 更新 `dsh.plugin.json` 与市场条目描述
- [x] 7.3 版本号提升并推送

---

## 实现说明（2026-10-11）

34 项任务已在代码层完成。新增测试：

- `scripts/login-flow.mjs` —— 登录链路（预检、日志、退出归因、二维码与日志端点）
- `scripts/wechat-config.mjs` —— 公众号凭证（YAML 行级补丁、错误码分类、脱敏）
- `scripts/ui-entry.mjs` 新增 [E] 段 —— 产物中不得出现原生对话框

### 实现过程中由测试暴露的两个真实缺陷（已修）

1. **路由层用错了生效根。**
   `registerRoutes` 内写的是 `const root = config.easelRoot`，而内置快照场景下
   `config.easelRoot` 为空 —— `apply` 里早有正确的 `workspace.root`，却只传给了
   account / topics 服务。后果是：**以「装完即用、不 clone」方式安装时，
   所有文件类路由都会误报「未配置」**。已改为把生效根作为参数显式传入路由层。

2. **构建产物把中文转义成了 `\uXXXX`。**
   esbuild 默认 `charset: 'ascii'`。界面与提示大量使用中文，转义后产物更难读、
   体积更大，也无法按文本做回归断言。已改为 `charset: 'utf8'`。

### 如实标注的边界

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 预检拦截 / 日志落盘 / 退出归因 | ✅ 已测 | 用假解释器实测：不启动进程、不产生状态文件；脚本不写状态即退出时归因为 error |
| 二维码端点（200 / 404 / content-type） | ✅ 已测 | 未生成时 404，前端据此不渲染破图 |
| 登录状态解析（含 Windows BOM） | ✅ 已测 | qr_ready / success / 文件缺失 → unknown |
| YAML 行级补丁保留其它账号、顶层键与注释 | ✅ 已测 | 含 `image_generation`、`integrations`，写入前生成 `.bak` |
| 错误码分类（40164 不得归为凭证错误） | ✅ 已测 | 打桩 fetch 覆盖成功 / 40001 / 40002 / 40164 / 网络不可达 |
| 响应不含 AppSecret 明文 | ✅ 已测 | 查看接口与磁盘读取结果均验证 |
| **真实扫码登录** | ⚠️ 未端到端验证 | 需真机 + 已装 playwright/opencv + 可扫码账号；本环境不具备 |
| **真实发布到平台** | ⚠️ 未端到端验证 | 同上 |
| **官方 API 真实凭证** | ⚠️ 未端到端验证 | 需真实 AppID/AppSecret 与已登记的出口 IP |
| 短信验证码回填（`sms_required`） | ⚠️ 未实现 | 仅呈现该状态并提示；回填写入需先确认交互形态 |
