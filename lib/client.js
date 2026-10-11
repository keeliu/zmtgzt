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
var TITLE_ZH = "\u81EA\u5A92\u4F53\u5DE5\u4F5C\u53F0";
var ENTRY_SLOTS = ["sidebar.header.action", "sidebar.footer.action"];
var TABS = ["\u603B\u89C8", "\u8D26\u53F7", "\u753B\u50CF", "\u4E3B\u9898", "\u73AF\u5883\u81EA\u68C0"];
var openState = false;
var openListeners = /* @__PURE__ */ new Set();
function setOpen(next) {
  if (openState === next) return;
  openState = next;
  for (const listener of openListeners) {
    try {
      listener();
    } catch {
    }
  }
}
function useOpenState() {
  const [value, setValue] = (0, import_react.useState)(openState);
  (0, import_react.useEffect)(() => {
    const listener = () => setValue(openState);
    openListeners.add(listener);
    return () => {
      openListeners.delete(listener);
    };
  }, []);
  return value;
}
async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  return await res.json();
}
function apply(ctx) {
  const title = () => TITLE_ZH;
  let anchor = null;
  for (const slot of ENTRY_SLOTS) {
    try {
      ctx.slots.inject(
        slot,
        () => ctx.slots.register(
          {
            name: slot,
            id: "dsh-zmtgzt",
            order: 30,
            label: title
          },
          WorkbenchEntry
        ),
        "dsh-zmtgzt: sidebar entry"
      );
      anchor = slot;
      break;
    } catch {
      continue;
    }
  }
  try {
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "dsh-zmtgzt-workbench",
          order: 90
        },
        WorkbenchPanel
      ),
      "dsh-zmtgzt: workbench panel"
    );
  } catch {
  }
  try {
    ctx.effect?.(() => () => setOpen(false), "dsh-zmtgzt: reset panel state");
    ctx.logger?.info?.(`[dsh-zmtgzt] \u5DE5\u4F5C\u53F0\u5165\u53E3\u951A\u70B9\uFF1A${anchor ?? "\u672A\u6CE8\u518C\u6210\u529F"}`);
  } catch {
  }
}
function WorkbenchEntry() {
  const open = useOpenState();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      onClick: () => setOpen(!open),
      title: TITLE_ZH,
      "aria-label": TITLE_ZH,
      "aria-pressed": open,
      style: { ...S.entryBtn, ...open ? S.entryBtnActive : null },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.entryIcon, "aria-hidden": "true", children: "\u25C6" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.entryLabel, children: TITLE_ZH })
      ]
    }
  );
}
function WorkbenchPanel() {
  const open = useOpenState();
  const [tab, setTab] = (0, import_react.useState)("\u603B\u89C8");
  if (!open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.overlayBackdrop, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: S.panel, role: "dialog", "aria-label": TITLE_ZH, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: S.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 14 }, children: TITLE_ZH }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.version, children: "dsh-zmtgzt" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.closeBtn, onClick: () => setOpen(false), "aria-label": "\u5173\u95ED", children: "\xD7" })
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
      tab === "\u603B\u89C8" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewPane, { onNavigate: setTab }),
      tab === "\u8D26\u53F7" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountPane, {}),
      tab === "\u753B\u50CF" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfilePane, {}),
      tab === "\u4E3B\u9898" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TopicPane, {}),
      tab === "\u73AF\u5883\u81EA\u68C0" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoctorPane, {})
    ] }, tab) })
  ] }) });
}
var PaneBoundary = class extends import_react.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.errorBox, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u6B64\u9875\u9762\u6E32\u67D3\u51FA\u9519" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: String(this.state.error.message ?? this.state.error) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u5176\u5B83\u5B50\u9875\u9762\u4ECD\u53EF\u6B63\u5E38\u4F7F\u7528\u3002" })
      ] });
    }
    return this.props.children;
  }
};
function OverviewPane({ onNavigate }) {
  const [doctor, setDoctor] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    void api("/doctor").then(setDoctor).catch(() => void 0);
  }, []);
  const healthy = doctor?.healthy === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...healthy ? S.badgeOk : S.badgeBad }, children: healthy ? "\u73AF\u5883\u5C31\u7EEA" : "\u73AF\u5883\u5F85\u4FEE\u590D" }),
      typeof doctor?.skillCount === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
        doctor.skillCount,
        " \u4E2A\u6280\u80FD\u53EF\u7528"
      ] }),
      doctor?.embeddedCommit && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
        "\u5FEB\u7167 ",
        String(doctor.embeddedCommit).slice(0, 10)
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u4ECE\u54EA\u5F00\u59CB" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u5DE5\u4F5C\u53F0\u8D1F\u8D23\u7EF4\u62A4\u300C\u8D26\u53F7\u300D\u300C\u753B\u50CF\u300D\u300C\u4E3B\u9898\u300D\u4E09\u4EF6\u4E8B\uFF1B\u5185\u5BB9\u751F\u6210\u4ECD\u5728\u5BF9\u8BDD\u91CC\u5B8C\u6210\u2014\u2014 \u7ED1\u5B9A\u4E3B\u9898\u540E\uFF0C\u4F1A\u8BDD\u4F1A\u6309\u5F53\u524D\u751F\u6548\u7684 SOUL.md / AGENTS.md \u4E0E\u6280\u80FD\u4EA7\u51FA\uFF0C\u4EA7\u7269\u843D\u5230\u8BE5\u4E3B\u9898\u76EE\u5F55\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => onNavigate("\u8D26\u53F7"), children: "\u53BB\u7EF4\u62A4\u8D26\u53F7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => onNavigate("\u4E3B\u9898"), children: "\u53BB\u7BA1\u7406\u4E3B\u9898" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => onNavigate("\u73AF\u5883\u81EA\u68C0"), children: "\u67E5\u770B\u81EA\u68C0" })
      ] })
    ] }),
    doctor?.easelRoot && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u751F\u6548\u6839" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.mono, children: String(doctor.easelRoot) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
        "\u6765\u6E90\uFF1A",
        doctor.rootSource === "configured" ? "\u81EA\u5907\u4ED3\u5E93" : "\u5185\u7F6E\u5FEB\u7167",
        doctor.workspaceDir ? ` \xB7 \u5DE5\u4F5C\u76EE\u5F55 ${String(doctor.workspaceDir)}` : ""
      ] })
    ] })
  ] });
}
function AccountPane() {
  const [channels, setChannels] = (0, import_react.useState)([]);
  const [status, setStatus] = (0, import_react.useState)("");
  const [login, setLogin] = (0, import_react.useState)(null);
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
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
    return stopPolling;
  }, [load, stopPolling]);
  const startLogin = async (id) => {
    try {
      const res = await api("/account/login", {
        method: "POST",
        body: JSON.stringify({ channelId: id })
      });
      if (!res.ok) {
        setStatus(res.error ?? "\u53D1\u8D77\u767B\u5F55\u5931\u8D25");
        return;
      }
      setLogin({ channelId: id, state: "starting", message: "\u5DF2\u542F\u52A8\u626B\u7801\u6D41\u7A0B\u2026" });
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        const st = await api(
          `/account/login/status?channelId=${encodeURIComponent(id)}`
        );
        setLogin({ channelId: id, state: st.state, message: st.message });
        if (st.state === "success") {
          stopPolling();
          setLogin(null);
          await load();
        } else if (st.state === "expired" || st.state === "error") {
          stopPolling();
        }
      }, 2e3);
    } catch (error) {
      setStatus(`\u53D1\u8D77\u767B\u5F55\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const logout = async (id) => {
    try {
      await api("/account/logout", { method: "POST", body: JSON.stringify({ channelId: id }) });
      await load();
    } catch (error) {
      setStatus(`\u767B\u51FA\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.stack, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void load(), children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: "\u767B\u5F55\u6001\u5B58\u653E\u5728 ~/.easel-browser-profiles/\uFF0C\u4E0E Easel \u811A\u672C\u5171\u7528" })
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
            children: !channel.supportsLogin ? "\u6682\u4E0D\u652F\u6301" : channel.profilePresent ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55"
          }
        ),
        channel.supportsLogin && channel.supportsPublish && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...S.badgeMuted }, children: "\u53EF\u53D1\u5E03" })
      ] }),
      channel.reason && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: channel.reason }),
      channel.supportsLogin && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => void startLogin(channel.id), children: "\u626B\u7801\u767B\u5F55" }),
          channel.profilePresent && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.dangerBtn, onClick: () => void logout(channel.id), children: "\u767B\u51FA" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.mono, children: channel.profileDir })
      ] })
    ] }, channel.id)),
    login && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
        "\u626B\u7801\u767B\u5F55\u4E2D\uFF08",
        login.channelId,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
        "\u72B6\u6001\uFF1A",
        login.state,
        login.message ? ` \xB7 ${login.message}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u4E8C\u7EF4\u7801\u7531\u767B\u5F55\u811A\u672C\u751F\u6210\u5728\u63D2\u4EF6\u6570\u636E\u76EE\u5F55\u3002\u957F\u65F6\u95F4\u65E0\u8FDB\u5C55\u8BF7\u68C0\u67E5 Python \u4E0E Playwright \u662F\u5426\u5C31\u7EEA\u3002" })
    ] }),
    status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
  ] });
}
var DIMENSIONS = ["identity", "style", "audience", "platforms", "preferences", "memory"];
var DIM_LABELS = {
  identity: "\u8EAB\u4EFD\u5B9A\u4F4D",
  style: "\u5185\u5BB9\u98CE\u683C",
  audience: "\u76EE\u6807\u53D7\u4F17",
  platforms: "\u6D3B\u8DC3\u5E73\u53F0",
  preferences: "\u504F\u597D\u8FB9\u754C",
  memory: "\u957F\u671F\u8BB0\u5FC6"
};
function ProfilePane() {
  const [profiles, setProfiles] = (0, import_react.useState)([]);
  const [active, setActive] = (0, import_react.useState)("");
  const [dims, setDims] = (0, import_react.useState)({});
  const [dirty, setDirty] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("");
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/profile");
      setProfiles(data.profiles ?? []);
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
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
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const save = async (dim) => {
    try {
      await api("/profile", {
        method: "POST",
        body: JSON.stringify({ name: active, file: dim, content: dims[dim] ?? "" })
      });
      setDirty(null);
      setStatus("\u5DF2\u4FDD\u5B58");
    } catch (error) {
      setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const createProfile = async () => {
    const name2 = window.prompt("\u65B0\u753B\u50CF\u540D\u79F0\uFF08\u5982\u300C\u804C\u573A\u5E72\u8D27\u300D\uFF09");
    if (!name2 || !name2.trim()) return;
    try {
      await api("/profile", {
        method: "POST",
        body: JSON.stringify({ name: name2.trim(), file: "identity", content: "" })
      });
      await load();
      await open(name2.trim());
    } catch (error) {
      setStatus(`\u521B\u5EFA\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.split, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u753B\u50CF\uFF08",
          profiles.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void createProfile(), children: "\u65B0\u5EFA" })
      ] }),
      profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u8FD8\u6CA1\u6709\u753B\u50CF\u3002\u65B0\u5EFA\u4E00\u4E2A\uFF0C\u5185\u5BB9\u521B\u4F5C\u4F1A\u8BFB\u5B83\u3002" }),
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
      !active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u9009\u62E9\u5DE6\u4FA7\u753B\u50CF\u67E5\u770B\u516D\u7EF4\u5185\u5BB9\u3002" }),
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void save(dim), children: dirty === dim ? "\u4FDD\u5B58*" : "\u4FDD\u5B58" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...S.input, minHeight: 64, resize: "vertical" },
            value: dims[dim] ?? "",
            placeholder: "\uFF08\u7A7A\uFF09",
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
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/topic");
      setTopics(data.topics ?? []);
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
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
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const createTopic = async () => {
    const name2 = window.prompt("\u65B0\u4E3B\u9898\u540D\u79F0\uFF08\u4EBA\u7C7B\u53EF\u8BFB\u7684\u5177\u4F53\u540D\u79F0\uFF0C\u5982\u300C\u6625\u5B63\u901A\u52E4\u7A7F\u642D\u300D\uFF09");
    if (!name2 || !name2.trim()) return;
    const res = await api("/topic", {
      method: "POST",
      body: JSON.stringify({ action: "create", name: name2.trim() })
    });
    if (!res.ok) {
      setStatus(res.reason ?? "\u521B\u5EFA\u5931\u8D25");
      return;
    }
    setStatus("");
    await load();
    await openTopic(name2.trim());
  };
  const removeTopic = async (name2) => {
    if (!window.confirm(`\u786E\u8BA4\u5220\u9664\u4E3B\u9898\u300C${name2}\u300D\u53CA\u5176\u5168\u90E8\u4EA7\u7269\uFF1F`)) return;
    await api("/topic", { method: "POST", body: JSON.stringify({ action: "remove", name: name2 }) });
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
      setStatus("\u672A\u80FD\u53D6\u5F97\u5F53\u524D\u4F1A\u8BDD id\uFF0C\u65E0\u6CD5\u7ED1\u5B9A\u3002\u8BF7\u5728\u4F1A\u8BDD\u5185\u6253\u5F00\u5DE5\u4F5C\u53F0\u540E\u91CD\u8BD5\u3002");
      return;
    }
    const res = await api("/binding", {
      method: "POST",
      body: JSON.stringify({ sessionId, topic: name2 })
    });
    setStatus(res.ok ? `\u5DF2\u7ED1\u5B9A\u5230\u5F53\u524D\u4F1A\u8BDD\uFF1A${name2}` : res.error ?? "\u7ED1\u5B9A\u5931\u8D25");
  };
  const unbind = async () => {
    const sessionId = readSessionId();
    if (!sessionId) return;
    await api("/binding", { method: "POST", body: JSON.stringify({ sessionId, action: "unbind" }) });
    setStatus("\u5DF2\u89E3\u9664\u7ED1\u5B9A");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.split, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u4E3B\u9898\uFF08",
          topics.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void createTopic(), children: "\u65B0\u5EFA" })
      ] }),
      topics.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u8FD8\u6CA1\u6709\u4E3B\u9898\u3002\u4E3B\u9898\u5BF9\u5E94 outputs/<\u4E3B\u9898\u540D>/\uFF0C\u7ED1\u5B9A\u4F1A\u8BDD\u540E\u4EA7\u7269\u4F1A\u843D\u5230\u8BE5\u76EE\u5F55\u3002" }),
      topics.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          style: { ...S.listItem, ...active === item.name ? S.listItemActive : null },
          onClick: () => void openTopic(item.name),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
              item.steps,
              " \u6B65",
              item.updatedAt ? ` \xB7 ${item.updatedAt.slice(0, 10)}` : ""
            ] })
          ]
        },
        item.name
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.detailCol, children: [
      !active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u9009\u62E9\u5DE6\u4FA7\u4E3B\u9898\u67E5\u770B\u4EA7\u7269\u4E0E\u6267\u884C\u8BB0\u5F55\u3002" }),
      active && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.row, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: active }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void bindToSession(active), children: "\u7ED1\u5B9A\u5230\u5F53\u524D\u4F1A\u8BDD" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.ghostBtn, onClick: () => void unbind(), children: "\u89E3\u9664\u7ED1\u5B9A" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.dangerBtn, onClick: () => void removeTopic(active), children: "\u5220\u9664\u4E3B\u9898" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "\u6267\u884C\u8BB0\u5F55" }),
        steps.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u5C1A\u65E0\u6B65\u9AA4\u8BB0\u5F55\uFF08\u7531 manifest.py \u5199\u5165\uFF09\u3002" }),
        steps.map((step, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.step, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.stepName, children: [
            String(step.skill ?? step.step ?? "\u2014"),
            step.layer ? ` \xB7 ${String(step.layer)}` : ""
          ] }),
          Boolean(step.summary ?? step.conclusion) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.stepText, children: String(step.summary ?? step.conclusion) })
        ] }, index)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "\u4EA7\u7269\u6587\u4EF6" }),
        entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u76EE\u5F55\u4E3A\u7A7A\u3002" }),
        entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.fileRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.isDir ? "\u{1F4C1}" : "\u{1F4C4}" }),
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void run(), disabled: loading, children: loading ? "\u4F53\u68C0\u4E2D\u2026" : "\u91CD\u65B0\u4F53\u68C0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...report?.healthy ? S.badgeOk : S.badgeBad }, children: report?.healthy ? "\u73AF\u5883\u5C31\u7EEA" : "\u5C1A\u672A\u5C31\u7EEA" })
    ] }),
    report?.easelRoot && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u751F\u6548\u6839" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.mono, children: String(report.easelRoot) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
        "\u6765\u6E90\uFF1A",
        report.rootSource === "configured" ? "\u81EA\u5907\u4ED3\u5E93" : "\u5185\u7F6E\u5FEB\u7167",
        report.embeddedCommit ? ` \xB7 \u5FEB\u7167 ${String(report.embeddedCommit).slice(0, 10)}` : ""
      ] })
    ] }),
    checks.map((check) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.checkRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.dot, background: check.ok ? "#2da44e" : "#cf222e" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { minWidth: 190 }, children: check.name }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: check.detail ?? "" })
    ] }, check.name)),
    Array.isArray(report?.warnings) && report.warnings.map((warning, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: S.muted, children: [
      "\u26A0 ",
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
  entryBtnActive: { background: activeBg, fontWeight: 600 },
  entryIcon: { opacity: 0.8 },
  entryLabel: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  overlayBackdrop: {
    position: "fixed",
    inset: 0,
    background: "color-mix(in oklab, currentColor 25%, transparent)",
    display: "flex",
    justifyContent: "flex-start",
    zIndex: 60
  },
  panel: {
    width: "min(920px, 88vw)",
    height: "100%",
    background: "Canvas",
    color: "CanvasText",
    borderRight: `1px solid ${border}`,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 0 32px rgba(0,0,0,.18)",
    overflow: "hidden"
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "10px 14px",
    borderBottom: `1px solid ${border}`
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    opacity: 0.7
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
  }
};
return module.exports; } });
