window.__ModuleLoader__.load({ id: 'dsh-zmtgzt', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-zmtgzt-client";
var inject = ["slots", "connection", "locale"];
var API = "/api/zmtgzt";
var TITLE_ZH = "自媒体工作台";
var PANEL_ID = "zmtgzt-workbench";
var PANEL_ORDER = 30;
var selectPanel = null;
var TABS = ["总览", "账号", "画像", "主题", "环境自检"];
async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  return await res.json();
}
function apply(ctx) {
  const slots = ctx?.slots;
  if (!slots?.inject || !slots?.register) return;
  try {
    const layout = ctx.get?.("layout");
    if (typeof layout?.selectPanel === "function") {
      selectPanel = (id) => layout.selectPanel(id);
    }
  } catch {
  }
  const label = () => TITLE_ZH;
  let panellistLive = false;
  let footerDispose = null;
  slots.inject("main", () => slots.register({ name: "main", key: PANEL_ID }, WorkbenchPanel));
  slots.inject("sidebar.panellist", () => {
    panellistLive = true;
    if (footerDispose) {
      try {
        footerDispose();
      } catch {
      }
      footerDispose = null;
    }
    return slots.register(
      { name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label },
      WorkbenchIcon
    );
  });
  slots.inject("sidebar.footer.action", () => {
    if (panellistLive) return;
    footerDispose = slots.register(
      { name: "sidebar.footer.action", id: PANEL_ID, order: PANEL_ORDER, label },
      WorkbenchFooterEntry
    );
    return footerDispose;
  });
  try {
    ctx.logger?.info?.(
      "[dsh-zmtgzt] 工作台入口：首选 sidebar.panellist（左侧导航「插件」同位），降级 sidebar.footer.action"
    );
  } catch {
  }
}
function WorkbenchIcon({ size = 16, active }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": "true",
      style: { display: "block", opacity: active ? 1 : 0.72 },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1.4", y: "1.9", width: "13.2", height: "12.2", rx: "2.4", stroke: "currentColor", strokeWidth: "1.3" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.4 6.1h13.2", stroke: "currentColor", strokeWidth: "1.3" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.2 6.1v8", stroke: "currentColor", strokeWidth: "1.3" })
      ]
    }
  );
}
function WorkbenchFooterEntry({ wide = true }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      onClick: () => selectPanel?.(PANEL_ID),
      title: TITLE_ZH,
      "aria-label": TITLE_ZH,
      style: { ...S.entryBtn, justifyContent: wide ? "flex-start" : "center" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkbenchIcon, { size: 16 }),
        wide && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.entryLabel, children: TITLE_ZH })
      ]
    }
  );
}
function WorkbenchPanel() {
  const [tab, setTab] = (0, import_react.useState)("总览");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: S.panel, "aria-label": TITLE_ZH, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: S.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 14 }, children: TITLE_ZH }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.version, children: "dsh-zmtgzt" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => selectPanel?.("conversation"), children: "返回对话" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { style: S.tabs, children: TABS.map((label) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        onClick: () => setTab(label),
        style: { ...S.tab, ...tab === label ? S.tabActive : null },
        children: label
      },
      label
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.body, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PaneBoundary, { children: [
      tab === "总览" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewPane, { onNavigate: setTab }),
      tab === "账号" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountPane, {}),
      tab === "画像" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfilePane, {}),
      tab === "主题" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TopicPane, {}),
      tab === "环境自检" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoctorPane, {})
    ] }, tab) })
  ] });
}
var PaneBoundary = class extends import_react.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.errorBox, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "此页面渲染出错" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: String(this.state.error.message ?? this.state.error) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "其它子页面仍可正常使用。" })
      ] });
    }
    return this.props.children;
  }
};
function InlineForm({
  placeholder,
  submitLabel = "确定",
  onSubmit,
  onCancel
}) {
  const [value, setValue] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("名称不能为空");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(trimmed);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.inlineForm, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        autoFocus: true,
        style: S.input,
        placeholder,
        value,
        disabled: busy,
        onChange: (event) => {
          setValue(event.target.value);
          if (error) setError("");
        },
        onKeyDown: (event) => {
          if (event.key === "Enter") void submit();
          if (event.key === "Escape") onCancel();
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, disabled: busy, onClick: () => void submit(), children: busy ? "处理中…" : submitLabel }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, disabled: busy, onClick: onCancel, children: "取消" })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.errorText, children: error })
  ] });
}
function OverviewPane({ onNavigate }) {
  const [doctor, setDoctor] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    void api("/doctor").then(setDoctor).catch(() => void 0);
  }, []);
  const healthy = doctor?.healthy === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...healthy ? S.badgeOk : S.badgeBad }, children: healthy ? "环境就绪" : "环境待修复" }),
      typeof doctor?.skillCount === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
        doctor.skillCount,
        " 个技能可用"
      ] }),
      doctor?.embeddedCommit && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
        "快照 ",
        String(doctor.embeddedCommit).slice(0, 10)
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "从哪开始" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "工作台负责维护「账号」「画像」「主题」三件事；内容生成仍在对话里完成—— 绑定主题后，会话会按当前生效的 SOUL.md / AGENTS.md 与技能产出，产物落到该主题目录。" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => onNavigate("账号"), children: "去维护账号" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => onNavigate("主题"), children: "去管理主题" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => onNavigate("环境自检"), children: "查看自检" })
      ] })
    ] }),
    doctor?.easelRoot && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "生效根" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.mono, children: String(doctor.easelRoot) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
        "来源：",
        doctor.rootSource === "configured" ? "自备仓库" : "内置快照",
        doctor.workspaceDir ? ` · 工作目录 ${String(doctor.workspaceDir)}` : ""
      ] })
    ] })
  ] });
}
var QR_STATES = /* @__PURE__ */ new Set(["qr_ready", "window_login"]);
var TERMINAL_STATES = /* @__PURE__ */ new Set(["success", "expired", "error"]);
function AccountPane() {
  const [channels, setChannels] = (0, import_react.useState)([]);
  const [status, setStatus] = (0, import_react.useState)("");
  const [login, setLogin] = (0, import_react.useState)(null);
  const [log, setLog] = (0, import_react.useState)(null);
  const [wechat, setWechat] = (0, import_react.useState)(null);
  const pollRef = (0, import_react.useRef)(null);
  const stopPolling = (0, import_react.useCallback)(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/account");
      setChannels(data.channels ?? []);
      setStatus("");
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    }
    try {
      const res = await api("/account/wechat");
      setWechat(res.config ?? null);
    } catch {
      setWechat(null);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
    return stopPolling;
  }, [load, stopPolling]);
  const startLogin = async (id, mode = "qr") => {
    try {
      const res = await api("/account/login", {
        method: "POST",
        body: JSON.stringify({ channelId: id, mode })
      });
      if (!res.ok) {
        setLogin({
          channelId: id,
          mode,
          state: "error",
          message: res.error ?? "发起登录失败",
          nonce: Date.now(),
          ...res.preflight?.probes ? { probes: res.preflight.probes } : {},
          ...res.hint ? { hint: res.hint } : {}
        });
        return;
      }
      setLog(null);
      setLogin({ channelId: id, mode, state: "starting", message: "已启动登录流程…", nonce: Date.now() });
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await api(
            `/account/login/status?channelId=${encodeURIComponent(id)}`
          );
          setLogin((prev) => {
            if (!prev) return prev;
            const changed = prev.state !== st.state;
            return {
              ...prev,
              state: st.state,
              message: st.message,
              // 仅在状态变化时换 nonce，避免每 2 秒重新拉一次二维码图片
              ...changed ? { nonce: Date.now() } : {}
            };
          });
          if (st.state === "success") {
            stopPolling();
            setLogin(null);
            await load();
          } else if (TERMINAL_STATES.has(st.state)) {
            stopPolling();
          }
        } catch {
        }
      }, 2e3);
    } catch (error) {
      setStatus(`发起登录失败：${String(error)}`);
    }
  };
  const showLog = async (id) => {
    try {
      const res = await api(
        `/account/login/log?channelId=${encodeURIComponent(id)}`
      );
      setLog({
        channelId: id,
        path: res.path,
        content: res.exists ? res.content || "（日志为空）" : "（尚无日志：本次会话还没发起过登录）"
      });
    } catch (error) {
      setLog({ channelId: id, path: "", content: `读取日志失败：${String(error)}` });
    }
  };
  const logout = async (id) => {
    try {
      await api("/account/logout", { method: "POST", body: JSON.stringify({ channelId: id }) });
      await load();
    } catch (error) {
      setStatus(`登出失败：${String(error)}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void load(), children: "刷新" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: "登录态存放在 ~/.easel-browser-profiles/，与 Easel 脚本共用" })
    ] }),
    channels.map((channel) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: channel.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            style: {
              ...S.badge,
              ...!channel.supportsLogin ? S.badgeMuted : channel.profilePresent ? S.badgeOk : S.badgeWarn
            },
            children: !channel.supportsLogin ? "暂不支持" : channel.profilePresent ? "已登录" : "未登录"
          }
        ),
        channel.supportsLogin && channel.supportsPublish && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...S.badgeMuted }, children: "可发布" })
      ] }),
      channel.reason && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: channel.reason }),
      channel.supportsLogin && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => void startLogin(channel.id, "qr"), children: "扫码登录" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => void startLogin(channel.id, "window"), children: "窗口登录" }),
          channel.profilePresent && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.dangerBtn, onClick: () => void logout(channel.id), children: "登出" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.mono, children: channel.profileDir })
      ] }),
      channel.id === "wechat-mp" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WechatApiSection, { config: wechat, onRefresh: () => void load() })
    ] }, channel.id)),
    login && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoginSessionCard, { login, onShowLog: showLog }),
    log && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
          "登录日志（",
          log.channelId,
          "）"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => setLog(null), children: "收起" })
      ] }),
      log.path && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.mono, children: log.path }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: S.logBox, children: log.content })
    ] }),
    status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
  ] });
}
function LoginSessionCard({
  login,
  onShowLog
}) {
  const showQr = QR_STATES.has(login.state);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
        "登录中（",
        login.channelId,
        " · ",
        login.mode === "window" ? "窗口登录" : "扫码登录",
        "）"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...login.state === "error" ? S.badgeBad : S.badgeMuted }, children: login.state })
    ] }),
    login.message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: login.message }),
    showQr && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.qrWrap, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "img",
        {
          src: `${API}/account/login/qr?channelId=${encodeURIComponent(login.channelId)}&n=${login.nonce}`,
          alt: "登录二维码",
          style: S.qrImg,
          onError: (event) => {
            event.currentTarget.style.visibility = "hidden";
          },
          onLoad: (event) => {
            event.currentTarget.style.visibility = "visible";
          }
        },
        login.nonce
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "用手机扫描上方二维码完成登录。二维码有时效（约几分钟），过期请重新发起。" })
    ] }),
    login.state === "window_login" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "请在弹出的浏览器窗口中完成登录（扫码或短信验证），不要关闭那个窗口。" }),
    login.state === "unknown" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "未读到登录状态：脚本可能尚未启动或已提前退出。请查看下方登录日志确认原因。" }),
    login.probes && login.probes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.subCard, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 12 }, children: "环境预检" }),
      login.probes.map((probe) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.probeRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.dot, background: probe.ok ? "#2da44e" : "#cf222e" } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.probeName, children: probe.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: probe.detail ?? "" }),
        probe.fix && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.fixText, children: [
          "→ ",
          probe.fix
        ] })
      ] }, probe.name))
    ] }),
    login.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.hint, children: login.hint }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => onShowLog(login.channelId), children: "查看登录日志" }) })
  ] });
}
function WechatApiSection({
  config,
  onRefresh
}) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [key, setKey] = (0, import_react.useState)("default");
  const [appId, setAppId] = (0, import_react.useState)("");
  const [appSecret, setAppSecret] = (0, import_react.useState)("");
  const [author, setAuthor] = (0, import_react.useState)("");
  const [theme, setTheme] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [hint, setHint] = (0, import_react.useState)("");
  const [done, setDone] = (0, import_react.useState)("");
  const accounts = config?.accounts ?? [];
  const submit = async () => {
    setError("");
    setHint("");
    setDone("");
    if (!appId.trim() || !appSecret.trim()) {
      setError("AppID 与 AppSecret 均为必填。");
      return;
    }
    setBusy(true);
    try {
      const res = await api("/account/wechat", {
        method: "POST",
        body: JSON.stringify({ key: key.trim() || "default", appId, appSecret, author, theme })
      });
      if (!res.ok) {
        setError(res.error ?? "保存失败");
        if (res.hint) setHint(res.hint);
        return;
      }
      setAppSecret("");
      setDone("凭证已保存，并已通过微信接口校验。");
      onRefresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (accountKey) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await api("/account/wechat/remove", {
        method: "POST",
        body: JSON.stringify({ key: accountKey })
      });
      onRefresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.subCard, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 13 }, children: "官方 API 凭证（另一种方式）" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => setOpen(!open), children: open ? "收起" : "配置" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "上面的「扫码登录」走公众号后台会话，免 AppID/AppSecret、免 IP 白名单。 也可改用官方 HTTP API：需填写 AppID 与 AppSecret，并把本机出口 IP 加进公众号后台的 IP 白名单。两种方式任选其一即可。" }),
    accounts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.stack, children: accounts.map((account) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...account.configured ? S.badgeOk : S.badgeWarn }, children: account.configured ? "凭证已配置" : "缺少密钥" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.mono, children: [
        account.key,
        account.appIdMasked ? ` · AppID ${account.appIdMasked}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.dangerBtn, disabled: busy, onClick: () => void remove(account.key), children: "清除" })
    ] }, account.key)) }),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.formGrid, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
          "账号键（对应配置里的 accounts 键名）",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: S.input,
              value: key,
              placeholder: "default",
              onChange: (event) => setKey(event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
          "AppID",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: S.input,
              value: appId,
              placeholder: "wx 开头的一串字符",
              onChange: (event) => setAppId(event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
          "AppSecret",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: S.input,
              type: "password",
              value: appSecret,
              placeholder: "只在重置时显示一次，请从后台复制",
              onChange: (event) => setAppSecret(event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
          "作者名（可选）",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: S.input,
              value: author,
              onChange: (event) => setAuthor(event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
          "排版主题（可选）",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: S.input,
              value: theme,
              onChange: (event) => setTheme(event.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, disabled: busy, onClick: () => void submit(), children: busy ? "校验并保存中…" : "校验并保存" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: "保存前会调用微信接口校验凭证有效性" })
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.errorText, children: error }),
    hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.hint, children: hint }),
    done && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.okText, children: done }),
    config?.path && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.mono, children: [
      "配置文件：",
      config.path
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "说明：按上游约定，AppSecret 以明文保存在该 YAML 中（微信官方 API 的常规做法）。" })
  ] });
}
var DIMENSIONS = ["identity", "style", "audience", "platforms", "preferences", "memory"];
var DIM_LABELS = {
  identity: "身份定位",
  style: "内容风格",
  audience: "目标受众",
  platforms: "活跃平台",
  preferences: "偏好边界",
  memory: "长期记忆"
};
function ProfilePane() {
  const [profiles, setProfiles] = (0, import_react.useState)([]);
  const [active, setActive] = (0, import_react.useState)("");
  const [dims, setDims] = (0, import_react.useState)({});
  const [dirty, setDirty] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("");
  const [creating, setCreating] = (0, import_react.useState)(false);
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/profile");
      setProfiles(data.profiles ?? []);
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const open = async (name2) => {
    setActive(name2);
    setDirty(null);
    try {
      const data = await api(
        `/profile-read?name=${encodeURIComponent(name2)}`
      );
      setDims(data.dimensions ?? {});
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    }
  };
  const save = async (dim) => {
    try {
      await api("/profile", {
        method: "POST",
        body: JSON.stringify({ name: active, file: dim, content: dims[dim] ?? "" })
      });
      setDirty(null);
      setStatus("已保存");
    } catch (error) {
      setStatus(`保存失败：${String(error)}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.split, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "画像（",
          profiles.length,
          "）"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => setCreating(!creating), children: creating ? "取消" : "新建" })
      ] }),
      creating && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        InlineForm,
        {
          placeholder: "新画像名称（如「职场干货」）",
          submitLabel: "创建",
          onCancel: () => setCreating(false),
          onSubmit: async (value) => {
            await api("/profile", {
              method: "POST",
              body: JSON.stringify({ name: value, file: "identity", content: "" })
            });
            await load();
            await open(value);
          }
        }
      ),
      profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "还没有画像。新建一个，内容创作会读它。" }),
      profiles.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          style: { ...S.listItem, ...active === item ? S.listItemActive : null },
          onClick: () => void open(item),
          children: item
        },
        item
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.detailCol, children: [
      !active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "选择左侧画像查看六维内容。" }),
      active && DIMENSIONS.map((dim) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.field, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
            DIM_LABELS[dim],
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
              dim,
              ".md"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void save(dim), children: dirty === dim ? "保存*" : "保存" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...S.input, minHeight: 64, resize: "vertical" },
            value: dims[dim] ?? "",
            placeholder: "（空）",
            onChange: (event) => {
              setDims((prev) => ({ ...prev, [dim]: event.target.value }));
              setDirty(dim);
            }
          }
        )
      ] }, dim)),
      status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
    ] })
  ] });
}
function TopicPane() {
  const [topics, setTopics] = (0, import_react.useState)([]);
  const [active, setActive] = (0, import_react.useState)("");
  const [entries, setEntries] = (0, import_react.useState)([]);
  const [steps, setSteps] = (0, import_react.useState)([]);
  const [status, setStatus] = (0, import_react.useState)("");
  const [creating, setCreating] = (0, import_react.useState)(false);
  const [confirming, setConfirming] = (0, import_react.useState)(null);
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/topic");
      setTopics(data.topics ?? []);
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const openTopic = async (name2) => {
    setActive(name2);
    try {
      const data = await api(`/topic?name=${encodeURIComponent(name2)}`);
      setEntries(data.entries ?? []);
      setSteps(data.manifest?.steps ?? []);
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    }
  };
  const removeTopic = async (name2) => {
    await api("/topic", { method: "POST", body: JSON.stringify({ action: "remove", name: name2 }) });
    setConfirming(null);
    if (active === name2) {
      setActive("");
      setEntries([]);
      setSteps([]);
    }
    await load();
  };
  const bindToSession = async (name2) => {
    const sessionId = readSessionId();
    if (!sessionId) {
      setStatus("未能取得当前会话 id，无法绑定。请在会话内打开工作台后重试。");
      return;
    }
    const res = await api("/binding", {
      method: "POST",
      body: JSON.stringify({ sessionId, topic: name2 })
    });
    setStatus(res.ok ? `已绑定到当前会话：${name2}` : res.error ?? "绑定失败");
  };
  const unbind = async () => {
    const sessionId = readSessionId();
    if (!sessionId) return;
    await api("/binding", { method: "POST", body: JSON.stringify({ sessionId, action: "unbind" }) });
    setStatus("已解除绑定");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.split, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "主题（",
          topics.length,
          "）"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => setCreating(!creating), children: creating ? "取消" : "新建" })
      ] }),
      creating && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        InlineForm,
        {
          placeholder: "新主题名称（如「春季通勤穿搭」）",
          submitLabel: "创建",
          onCancel: () => setCreating(false),
          onSubmit: async (value) => {
            const res = await api("/topic", {
              method: "POST",
              body: JSON.stringify({ action: "create", name: value })
            });
            if (!res.ok) throw new Error(res.reason ?? "创建失败");
            await load();
            await openTopic(value);
          }
        }
      ),
      topics.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "还没有主题。主题对应 outputs/<主题名>/，绑定会话后产物会落到该目录。" }),
      topics.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          style: { ...S.listItem, ...active === item.name ? S.listItemActive : null },
          onClick: () => void openTopic(item.name),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
              item.steps,
              " 步",
              item.updatedAt ? ` · ${item.updatedAt.slice(0, 10)}` : ""
            ] })
          ]
        },
        item.name
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.detailCol, children: [
      !active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "选择左侧主题查看产物与执行记录。" }),
      active && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: active }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void bindToSession(active), children: "绑定到当前会话" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => void unbind(), children: "解除绑定" }),
          confirming === active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { style: S.dangerBtn, onClick: () => void removeTopic(active), children: [
              "确认删除「",
              active,
              "」（不可恢复）"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => setConfirming(null), children: "取消" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => setConfirming(active), children: "删除主题" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "执行记录" }),
        steps.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "尚无步骤记录（由 manifest.py 写入）。" }),
        steps.map((step, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.step, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.stepName, children: [
            String(step.skill ?? step.step ?? "—"),
            step.layer ? ` · ${String(step.layer)}` : ""
          ] }),
          Boolean(step.summary ?? step.conclusion) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.stepText, children: String(step.summary ?? step.conclusion) })
        ] }, index)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "产物文件" }),
        entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "目录为空。" }),
        entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.fileRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.isDir ? "📁" : "📄" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.fileName, children: entry.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: entry.isDir ? "" : formatSize(entry.size) })
        ] }, entry.name))
      ] }),
      status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
    ] })
  ] });
}
function readSessionId() {
  try {
    const url = new URL(window.location.href);
    for (const key of ["sessionId", "session", "id"]) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    const match = /\/sessions?\/([^/?#]+)/.exec(url.pathname);
    if (match) return match[1];
  } catch {
  }
  return null;
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function DoctorPane() {
  const [report, setReport] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const run = (0, import_react.useCallback)(async () => {
    setLoading(true);
    try {
      setReport(await api("/doctor"));
    } catch (error) {
      setReport({ healthy: false, hint: String(error) });
    } finally {
      setLoading(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void run();
  }, [run]);
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void run(), disabled: loading, children: loading ? "体检中…" : "重新体检" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...report?.healthy ? S.badgeOk : S.badgeBad }, children: report?.healthy ? "环境就绪" : "尚未就绪" })
    ] }),
    report?.easelRoot && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "生效根" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.mono, children: String(report.easelRoot) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
        "来源：",
        report.rootSource === "configured" ? "自备仓库" : "内置快照",
        report.embeddedCommit ? ` · 快照 ${String(report.embeddedCommit).slice(0, 10)}` : ""
      ] })
    ] }),
    checks.map((check) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.checkRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.dot, background: check.ok ? "#2da44e" : "#cf222e" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { minWidth: 190 }, children: check.name }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: check.detail ?? "" })
    ] }, check.name)),
    Array.isArray(report?.warnings) && report.warnings.map((warning, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
      "⚠ ",
      warning
    ] }, index)),
    report?.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.hint, children: String(report.hint) })
  ] });
}
var border = "color-mix(in oklab, currentColor 18%, transparent)";
var subtle = "color-mix(in oklab, currentColor 8%, transparent)";
var activeBg = "color-mix(in oklab, currentColor 14%, transparent)";
var S = {
  entryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left"
  },
  entryLabel: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // 主区域面板：填满宿主给 main 面板的容器，不再自带浮层与宽度
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "hidden"
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "10px 14px",
    borderBottom: `1px solid ${border}`
  },
  version: { fontSize: 11, opacity: 0.55 },
  tabs: { display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap" },
  tab: {
    background: "transparent",
    border: `1px solid ${border}`,
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    color: "inherit",
    fontSize: 12
  },
  tabActive: { background: activeBg, fontWeight: 600 },
  body: { flex: 1, overflow: "auto", padding: 14 },
  stack: { display: "flex", flexDirection: "column", gap: 10 },
  split: { display: "flex", gap: 16, alignItems: "flex-start" },
  listCol: { width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  detailCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  colHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    opacity: 0.75
  },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${border}`
  },
  listItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 13
  },
  listItemActive: { background: activeBg },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, opacity: 0.75 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "inherit",
    fontSize: 13,
    fontFamily: "inherit"
  },
  primaryBtn: {
    padding: "5px 14px",
    borderRadius: 6,
    border: "none",
    background: "#2da44e",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12
  },
  ghostBtn: {
    padding: "5px 12px",
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 12
  },
  dangerBtn: {
    padding: "5px 12px",
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "#cf222e",
    cursor: "pointer",
    fontSize: 12
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "inherit",
    opacity: 0.75,
    cursor: "pointer",
    fontSize: 12,
    textDecoration: "underline"
  },
  muted: { fontSize: 11, opacity: 0.6, margin: 0 },
  mono: { fontSize: 11, opacity: 0.6, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" },
  sectionTitle: { margin: "8px 0 4px", fontSize: 12, opacity: 0.75 },
  step: {
    padding: "6px 8px",
    borderLeft: `2px solid ${border}`,
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  stepName: { fontWeight: 600, fontSize: 12 },
  stepText: { margin: 0, fontSize: 12, opacity: 0.85 },
  fileRow: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0" },
  fileName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", flexWrap: "wrap" },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  badge: { padding: "2px 8px", borderRadius: 999, fontSize: 11 },
  badgeOk: { background: "rgba(45,164,78,.16)", color: "#2da44e" },
  badgeWarn: { background: "rgba(191,135,0,.16)", color: "#bf8700" },
  badgeBad: { background: "rgba(207,34,46,.16)", color: "#cf222e" },
  badgeMuted: { background: subtle, opacity: 0.8 },
  hint: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    background: subtle,
    fontSize: 12,
    whiteSpace: "pre-wrap"
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: subtle,
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  // --- 内联表单 ---
  inlineForm: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: subtle
  },
  formGrid: { display: "flex", flexDirection: "column", gap: 8 },
  errorText: { margin: 0, fontSize: 12, color: "#cf222e" },
  okText: { margin: 0, fontSize: 12, color: "#2da44e" },
  // --- 登录会话：二维码、预检、日志 ---
  subCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 10px",
    marginTop: 6,
    borderRadius: 8,
    border: `1px dashed ${border}`
  },
  qrWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0" },
  qrImg: {
    width: 200,
    height: 200,
    objectFit: "contain",
    borderRadius: 8,
    background: "#ffffff",
    padding: 6,
    border: `1px solid ${border}`
  },
  logBox: {
    margin: 0,
    maxHeight: 240,
    overflow: "auto",
    padding: 8,
    borderRadius: 6,
    background: subtle,
    fontFamily: "ui-monospace, monospace",
    fontSize: 11,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all"
  },
  probeRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 },
  probeName: { minWidth: 150 },
  fixText: { fontSize: 11, opacity: 0.8, fontFamily: "ui-monospace, monospace" }
};
return module.exports; } });
