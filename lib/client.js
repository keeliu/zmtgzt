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
var TABS = ["\u6280\u80FD\u5E93", "\u8D26\u53F7\u753B\u50CF", "\u9879\u76EE\u4EA7\u7269", "\u73AF\u5883\u4F53\u68C0"];
var DIMENSIONS = ["identity", "style", "audience", "platforms", "preferences", "memory"];
var DIM_LABELS = {
  identity: "\u8EAB\u4EFD\u5B9A\u4F4D",
  style: "\u5185\u5BB9\u98CE\u683C",
  audience: "\u76EE\u6807\u53D7\u4F17",
  platforms: "\u6D3B\u8DC3\u5E73\u53F0",
  preferences: "\u504F\u597D\u8FB9\u754C",
  memory: "\u957F\u671F\u8BB0\u5FC6"
};
async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  return await res.json();
}
function apply(ctx) {
  ctx.slots.inject(
    "conversation.view",
    () => ctx.slots.register(
      {
        name: "conversation.view",
        id: "dsh-zmtgzt",
        order: 30,
        label: () => "Easel \u5DE5\u4F5C\u53F0",
        slug: "easel",
        inject: (sessionId) => ({
          connection: ctx.connection,
          sessionId: String(sessionId ?? "")
        })
      },
      ZmtgztWorkbench
    )
  );
}
function ZmtgztWorkbench() {
  const [tab, setTab] = (0, import_react.useState)("\u6280\u80FD\u5E93");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: S.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 14 }, children: "Easel \u5DE5\u4F5C\u53F0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.version, children: "dsh-zmtgzt" })
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.body, children: [
      tab === "\u6280\u80FD\u5E93" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillsPane, {}),
      tab === "\u8D26\u53F7\u753B\u50CF" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfilePane, {}),
      tab === "\u9879\u76EE\u4EA7\u7269" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectsPane, {}),
      tab === "\u73AF\u5883\u4F53\u68C0" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoctorPane, {})
    ] })
  ] });
}
function SkillsPane() {
  const [skills, setSkills] = (0, import_react.useState)([]);
  const [layer, setLayer] = (0, import_react.useState)("");
  const [status, setStatus] = (0, import_react.useState)("\u52A0\u8F7D\u4E2D\u2026");
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/skills");
      setSkills(data.skills ?? []);
      setStatus(`\u5171 ${data.count ?? data.skills?.length ?? 0} \u4E2A\u6280\u80FD`);
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const layers = [...new Set(skills.map((s) => s.layer ?? "\u672A\u5206\u5C42"))].sort();
  const shown = layer ? skills.filter((s) => (s.layer ?? "\u672A\u5206\u5C42") === layer) : skills;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...S.formCol, width: "100%" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void load(), children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: { ...S.tab, ...layer === "" ? S.tabActive : null }, onClick: () => setLayer(""), children: "\u5168\u90E8" }),
      layers.map((name2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          style: { ...S.tab, ...layer === name2 ? S.tabActive : null },
          onClick: () => setLayer(name2),
          children: name2
        },
        name2
      )),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: status })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u6280\u80FD\u6B63\u6587\u4E0E references \u90FD\u5728 Easel \u4ED3\u5E93\u91CC\uFF0C\u63D2\u4EF6\u4E0D\u590D\u5236\u526F\u672C\u3002\u8981\u7528\u67D0\u4E2A\u6280\u80FD\uFF0C\u8BA9 agent \u8C03 zmtgzt_skill\uFF08action=read\uFF09\u3002" }),
    shown.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.skillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.skillHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.skillName, children: skill.name }),
        skill.layer && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.layerTag, children: skill.layer })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.skillDesc, children: skill.description })
    ] }, skill.name))
  ] });
}
function ProfilePane() {
  const [profiles, setProfiles] = (0, import_react.useState)([]);
  const [active, setActive] = (0, import_react.useState)("");
  const [dims, setDims] = (0, import_react.useState)({});
  const [dirty, setDirty] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("");
  const loadList = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/profile");
      setProfiles(data.profiles ?? []);
      if (data.error) setStatus(data.error);
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void loadList();
  }, [loadList]);
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.pane, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u753B\u50CF\uFF08",
          profiles.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void loadList(), children: "\u5237\u65B0" })
      ] }),
      profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u8FD8\u6CA1\u6709\u753B\u50CF\u3002Easel \u7684\u6A21\u677F\u5728 profiles/_template/\uFF0C\u590D\u5236\u4E00\u4EFD\u6539\u6210\u4F60\u7684\u8D26\u53F7\u540D\u5373\u53EF\u3002" }),
      profiles.map((name2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          style: { ...S.card, ...active === name2 ? S.cardActive : null },
          onClick: () => void open(name2),
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: name2 })
        },
        name2
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.formCol, children: [
      !active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u9009\u62E9\u5DE6\u4FA7\u753B\u50CF\u67E5\u770B\u516D\u7EF4\u5185\u5BB9\u3002" }),
      active && DIMENSIONS.map((dim) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.field, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
            DIM_LABELS[dim],
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
              "(",
              dim,
              ".md)"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void save(dim), children: dirty === dim ? "\u4FDD\u5B58*" : "\u4FDD\u5B58" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...S.input, minHeight: 70, resize: "vertical" },
            value: dims[dim] ?? "",
            placeholder: "\uFF08\u7A7A\uFF09",
            onChange: (e) => {
              setDims((prev) => ({ ...prev, [dim]: e.target.value }));
              setDirty(dim);
            }
          }
        )
      ] }, dim)),
      status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
    ] })
  ] });
}
function ProjectsPane() {
  const [projects, setProjects] = (0, import_react.useState)([]);
  const [topic, setTopic] = (0, import_react.useState)("");
  const [detail, setDetail] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("");
  const load = (0, import_react.useCallback)(async () => {
    try {
      const data = await api("/projects");
      setProjects(data.projects ?? []);
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const open = async (name2) => {
    setTopic(name2);
    try {
      const data = await api(`/project?topic=${encodeURIComponent(name2)}`);
      setDetail({ entries: data.entries ?? [], manifest: data.manifest });
    } catch (error) {
      setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
    }
  };
  const steps = detail?.manifest?.steps ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.pane, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.listCol, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u9879\u76EE\uFF08",
          projects.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.linkBtn, onClick: () => void load(), children: "\u5237\u65B0" })
      ] }),
      projects.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "outputs/ \u4E0B\u8FD8\u6CA1\u6709\u9879\u76EE\u3002" }),
      projects.map((name2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          style: { ...S.card, ...topic === name2 ? S.cardActive : null },
          onClick: () => void open(name2),
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: name2 })
        },
        name2
      ))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.formCol, children: [
      !detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u9009\u62E9\u5DE6\u4FA7\u9879\u76EE\u67E5\u770B manifest \u4E0E\u4EA7\u7269\u3002" }),
      detail && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "\u6267\u884C\u8BB0\u5F55\uFF08manifest.steps\uFF09" }),
        steps.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u5C1A\u65E0\u6B65\u9AA4\u8BB0\u5F55\u3002" }),
        steps.map((step, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.step, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.stepName, children: [
            step.skill ?? step.step ?? "\u2014",
            step.layer ? ` \xB7 ${step.layer}` : ""
          ] }),
          step.summary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.stepConclusion, children: step.summary })
        ] }, index)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: S.sectionTitle, children: "\u4EA7\u7269\u6587\u4EF6" }),
        detail.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: "\u76EE\u5F55\u4E3A\u7A7A\u3002" }),
        detail.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.fileRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.isDir ? "\u{1F4C1}" : "\u{1F4C4}" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.fileName, children: entry.name })
        ] }, entry.name))
      ] }),
      status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.muted, children: status })
    ] })
  ] });
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...S.formCol, width: "100%" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: S.primaryBtn, onClick: () => void run(), disabled: loading, children: loading ? "\u4F53\u68C0\u4E2D\u2026" : "\u91CD\u65B0\u4F53\u68C0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.badge, ...report?.healthy ? S.badgeOk : S.badgeBad }, children: report?.healthy ? "\u73AF\u5883\u5C31\u7EEA" : "\u5C1A\u672A\u5C31\u7EEA" }),
      typeof report?.skillCount === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.muted, children: [
        "\u5DF2\u53D1\u73B0 ",
        report.skillCount,
        " \u4E2A Easel \u6280\u80FD"
      ] })
    ] }),
    checks.map((check) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.checkRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.dot, background: check.ok ? "#2da44e" : "#cf222e" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { minWidth: 180 }, children: check.name }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.muted, children: check.detail ?? "" })
    ] }, check.name)),
    report?.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.hint, children: String(report.hint) })
  ] });
}
var border = "color-mix(in oklab, currentColor 18%, transparent)";
var subtle = "color-mix(in oklab, currentColor 8%, transparent)";
var activeBg = "color-mix(in oklab, currentColor 14%, transparent)";
var S = {
  root: { display: "flex", flexDirection: "column", height: "100%", fontSize: 13, color: "inherit" },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "10px 14px",
    borderBottom: `1px solid ${border}`
  },
  version: { fontSize: 11, opacity: 0.55 },
  tabs: { display: "flex", gap: 4, padding: "8px 12px 0" },
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
  body: { flex: 1, overflow: "auto", padding: 12 },
  pane: { display: "flex", gap: 16, alignItems: "flex-start" },
  listCol: { width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  formCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  colHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    opacity: 0.75
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  },
  cardActive: { background: activeBg },
  skillRow: {
    padding: "8px 10px",
    border: `1px solid ${border}`,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  skillHead: { display: "flex", alignItems: "center", gap: 8 },
  skillName: { fontWeight: 600, fontSize: 12, fontFamily: "ui-monospace, monospace" },
  layerTag: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 999,
    background: subtle,
    opacity: 0.8
  },
  skillDesc: { margin: 0, fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
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
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  primaryBtn: {
    padding: "5px 14px",
    borderRadius: 6,
    border: "none",
    background: "#2da44e",
    color: "#fff",
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
  sectionTitle: { margin: "8px 0 4px", fontSize: 12, opacity: 0.75 },
  step: {
    padding: "6px 8px",
    borderLeft: `2px solid ${border}`,
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  stepName: { fontWeight: 600, fontSize: 12 },
  stepConclusion: { margin: 0, fontSize: 12, opacity: 0.85 },
  fileRow: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0" },
  fileName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0" },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  badge: { padding: "2px 8px", borderRadius: 999, fontSize: 11 },
  badgeOk: { background: "rgba(45,164,78,.15)", color: "#2da44e" },
  badgeBad: { background: "rgba(207,34,46,.15)", color: "#cf222e" },
  hint: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    background: subtle,
    fontSize: 12,
    whiteSpace: "pre-wrap"
  }
};
return module.exports; } });
