// src/index.ts
import { execFile as execFile3 } from "node:child_process";
import { existsSync as existsSync5, readFileSync as readFileSync4 } from "node:fs";
import { join as join9 } from "node:path";

// src/config.ts
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ID = "dsh-zmtgzt";
var PLUGIN_VERSION = false ? "dev" : "0.3.0";
function dshHome() {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), ".dsh");
}
function embeddedEaselRoot() {
  return fileURLToPath(new URL("../vendor/easel/", import.meta.url));
}
function resolveConfig(input) {
  const home = dshHome();
  return {
    easelRoot: absolutize(input?.easelRoot),
    workspaceDir: absolutize(input?.workspaceDir) ?? join(home, PLUGIN_ID, "easel"),
    embeddedRoot: embeddedEaselRoot(),
    pythonPath: input?.pythonPath?.trim() || process.env.EASEL_PYTHON?.trim() || "python",
    scriptTimeoutMs: normalizeTimeout(input?.scriptTimeoutMs),
    registerEaselSkills: input?.registerEaselSkills !== false,
    skillLayers: Array.isArray(input?.skillLayers) ? input.skillLayers.map((x) => String(x).trim()).filter(Boolean) : [],
    injectOrchestration: input?.injectOrchestration !== false,
    releaseEmbedded: input?.releaseEmbedded !== false,
    extraChannels: normalizeExtraChannels(input?.extraChannels),
    dataDir: absolutize(input?.dataDir) ?? join(home, PLUGIN_ID)
  };
}
function normalizeExtraChannels(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name2 = typeof item.name === "string" ? item.name.trim() : "";
    const profile = typeof item.profile === "string" ? item.profile.trim() : "";
    if (!id || !name2 || !profile) continue;
    out.push({
      id,
      name: name2,
      profile,
      ...item.supportsLogin === true ? { supportsLogin: true } : {},
      ...item.supportsPublish === true ? { supportsPublish: true } : {},
      ...typeof item.loginScript === "string" ? { loginScript: item.loginScript } : {},
      ...typeof item.whoamiScript === "string" ? { whoamiScript: item.whoamiScript } : {},
      ...typeof item.publishScript === "string" ? { publishScript: item.publishScript } : {}
    });
  }
  return out;
}
function absolutize(value) {
  const trimmed = value?.trim();
  if (!trimmed) return void 0;
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return join(homedir(), trimmed.slice(2));
  return isAbsolute(trimmed) ? trimmed : resolve(trimmed);
}
function normalizeTimeout(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 3e5;
  return Math.min(Math.trunc(value), 36e5);
}

// src/repo.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join as join2, relative, resolve as resolve2, sep, basename } from "node:path";
var EASEL_SKILLS_DIR = "skills/openclaw";
var EASEL_SHARED_DIR = "skills/shared/scripts";
var EASEL_WORKSPACE_DIR = "openclaw/workspace";
var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  const lines = match[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1];
    const raw = kv[2];
    if (raw === ">-" || raw === ">" || raw === "|" || raw === "|-") {
      const parts = [];
      i += 1;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        parts.push(lines[i].trim());
        i += 1;
      }
      data[key] = raw.startsWith("|") ? parts.join("\n") : parts.join(" ");
      continue;
    }
    data[key] = raw.replace(/^["']|["']$/g, "");
    i += 1;
  }
  return { data, body: text.slice(match[0].length) };
}
function shortenDescription(description, limit = 180) {
  const flat = description.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).trimEnd()}…`;
}
var EaselRepo = class {
  constructor(root) {
    this.root = root;
  }
  skills;
  contract;
  contractPaths;
  /** 仓库根是否可用。 */
  get rootDir() {
    return this.root;
  }
  get available() {
    return Boolean(this.root && existsSync(this.root));
  }
  /** 清空缓存，让下次读取回到磁盘（Easel 更新后无需重启插件）。 */
  invalidate() {
    this.skills = void 0;
    this.contract = void 0;
    this.contractPaths = void 0;
  }
  abs(rel) {
    return join2(this.root, rel);
  }
  /**
   * 读取常驻层契约：SOUL.md（人格）+ AGENTS.md（编排逻辑）。
   *
   * 读取顺序为**工作目录根优先**——用户可能直接编辑根目录的版本，
   * 那份应当胜出；缺失时才回退到 `openclaw/workspace/` 下的快照副本。
   */
  async readContract() {
    if (this.contract) return this.contract;
    if (!this.available) return {};
    const [soul, agents] = await Promise.all([
      this.readContractFile("SOUL.md"),
      this.readContractFile("AGENTS.md")
    ]);
    this.contract = {
      ...soul ? { soul: soul.content } : {},
      ...agents ? { agents: agents.content } : {}
    };
    this.contractPaths = {
      ...soul ? { soul: soul.path } : {},
      ...agents ? { agents: agents.path } : {}
    };
    return this.contract;
  }
  /** 契约文件的**实际来源路径**，供自检展示（未读到时为空）。 */
  contractSourcePaths() {
    return { ...this.contractPaths ?? {} };
  }
  /** 单个契约文件的读取：根目录优先，`openclaw/workspace/` 回退。 */
  async readContractFile(name2) {
    const rootPath = this.abs(name2);
    const rootContent = await readOptional(rootPath);
    if (rootContent !== void 0) return { content: rootContent, path: rootPath };
    const fallbackPath = this.abs(`${EASEL_WORKSPACE_DIR}/${name2}`);
    const fallbackContent = await readOptional(fallbackPath);
    if (fallbackContent !== void 0) return { content: fallbackContent, path: fallbackPath };
    return void 0;
  }
  /**
   * 扫描 Easel 技能目录，解析每个 SKILL.md 的 frontmatter。
   * @returns 按 layer 再按名称排序的技能元数据；仓库不可用时为空数组。
   */
  async listSkills() {
    if (this.skills) return this.skills;
    if (!this.available) return [];
    const base = this.abs(EASEL_SKILLS_DIR);
    let entries;
    try {
      entries = await readdir(base);
    } catch {
      return [];
    }
    const metas = [];
    for (const entry of entries) {
      const dir = join2(base, entry);
      const skillPath = join2(dir, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      try {
        const text = await readFile(skillPath, "utf8");
        const { data } = parseFrontmatter(text);
        const name2 = (data.name || entry).trim();
        const description = (data.description || "").trim();
        metas.push({
          name: name2,
          description,
          whenToUse: shortenDescription(description),
          ...data.layer ? { layer: data.layer } : {},
          dir,
          skillPath
        });
      } catch {
        continue;
      }
    }
    metas.sort((a, b2) => {
      const layer = (a.layer ?? "~").localeCompare(b2.layer ?? "~");
      return layer !== 0 ? layer : a.name.localeCompare(b2.name);
    });
    this.skills = metas;
    return metas;
  }
  /** 按名称取一个技能的详情（含正文与 references 清单）。 */
  async readSkill(name2) {
    const metas = await this.listSkills();
    const meta = metas.find((m) => m.name === name2 || m.dir.endsWith(`${sep}${name2}`));
    if (!meta) return void 0;
    const text = await readFile(meta.skillPath, "utf8");
    const { body } = parseFrontmatter(text);
    return { ...meta, body: body.trim(), references: await this.listReferences(meta.dir) };
  }
  /** 列出技能目录下 references/ 的文件。 */
  async listReferences(dir) {
    const refDir = join2(dir, "references");
    try {
      const entries = await readdir(refDir, { withFileTypes: true });
      return entries.filter((e2) => e2.isFile()).map((e2) => `references/${e2.name}`).sort();
    } catch {
      return [];
    }
  }
  /**
   * 读取技能目录内的任意文件（references、example.md 等）。
   * 路径被限制在该技能目录内，阻断穿越。
   */
  async readSkillFile(name2, relPath) {
    const metas = await this.listSkills();
    const meta = metas.find((m) => m.name === name2);
    if (!meta) return void 0;
    const target = resolve2(meta.dir, relPath);
    if (target !== meta.dir && !target.startsWith(meta.dir + sep)) return void 0;
    const content = await readOptional(target);
    if (content === void 0) return void 0;
    return { path: relative(meta.dir, target), content };
  }
  /** 列出共享脚本目录下的全部 .py 文件（根相对路径）。 */
  async listSharedScripts() {
    if (!this.available) return [];
    const dir = this.abs(EASEL_SHARED_DIR);
    try {
      const entries = await readdir(dir);
      return entries.filter((e2) => e2.endsWith(".py")).map((e2) => `${EASEL_SHARED_DIR}/${e2}`).sort();
    } catch {
      return [];
    }
  }
  /** 列出某个技能自带脚本（根相对路径）；无 scripts/ 目录时返回空数组。 */
  async listSkillScripts(name2) {
    const metas = await this.listSkills();
    const meta = metas.find((m) => m.name === name2);
    if (!meta) return [];
    const scriptsDir = join2(meta.dir, "scripts");
    try {
      const entries = await readdir(scriptsDir);
      const base = `${EASEL_SKILLS_DIR}/${basename(meta.dir)}/scripts`;
      return entries.filter((e2) => e2.endsWith(".py")).map((e2) => `${base}/${e2}`).sort();
    } catch {
      return [];
    }
  }
  /** 判断仓库内某个相对路径是否存在（供 doctor 体检）。 */
  async has(relPath) {
    if (!this.available) return false;
    try {
      await stat(this.abs(relPath));
      return true;
    } catch {
      return false;
    }
  }
};
async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return void 0;
  }
}

// src/orchestration.ts
var BRIDGE_NOTE = `## 本插件的接入方式（dsh）

以上两节是 Easel 仓库中 \`openclaw/workspace/SOUL.md\` 与 \`AGENTS.md\` 的原文，
随 Easel 更新自动同步，本插件不保存副本。

差异点：Easel 原本运行在 OpenClaw 上，本插件把它接入 dsh，机制对应关系是——

- **技能**：Easel 仓库 \`skills/openclaw/<技能名>/SKILL.md\` 已注册为 dsh 技能，按需加载。
  需要正文或 \`references/\` 时，用 \`zmtgzt_skill\`（action=read / files）读取，
  不要凭记忆复述技能内容。
- **脚本**：确定性脚本用 \`zmtgzt_run\` 执行，路径为 \`skills/...\` 根相对路径
  （如 \`skills/shared/scripts/manifest.py\`）。常用脚本另有专用工具，
  参数以脚本自身的 \`--help\` 为准，不要臆造参数名。
- **项目根**：AGENTS.md 里说的"运行时项目根"就是插件配置的 \`config.easelRoot\`，
  脚本执行器已固定 cwd 到该目录，无需再 cd。
- **画像与产物**：Easel 的 \`profiles/<画像>/\` 与 \`outputs/<主题>/\` 是磁盘事实，
  直接按 AGENTS.md 的规则读写；插件的 \`zmtgzt_profile\` / \`zmtgzt_artifact\`
  提供结构化读写入口，产物清单可直接读 \`manifest.py\` 生成的 manifest。
- **环境自检**：不确定环境是否就绪时先跑 \`zmtgzt_doctor\`。`;
async function composeContract(repo) {
  if (!repo.available) {
    return {
      content: [
        "# Easel 编排契约（未加载）",
        "",
        "插件未找到 Easel 仓库，因此 **SOUL.md 与 AGENTS.md 均未注入**。",
        "本插件不内置这两份契约的副本——它们必须来自 Easel 官方仓库，避免与上游漂移。",
        "",
        "修复方式：在 dsh 配置中为 `dsh-zmtgzt` 设置 `config.easelRoot`，",
        "指向本地 Easel 仓库的绝对路径（该目录下应含 `openclaw/workspace/AGENTS.md`）。",
        "配置后运行 `zmtgzt_doctor` 确认，再重新加载插件即可注入。",
        "",
        BRIDGE_NOTE
      ].join("\n"),
      hasSoul: false,
      hasAgents: false
    };
  }
  const { soul, agents } = await repo.readContract();
  const parts = [];
  if (soul) {
    parts.push("<!-- 以下来自 Easel 仓库 openclaw/workspace/SOUL.md -->", soul.trim());
  }
  if (agents) {
    parts.push("<!-- 以下来自 Easel 仓库 openclaw/workspace/AGENTS.md -->", agents.trim());
  }
  if (!soul || !agents) {
    const missing = [!soul && "SOUL.md", !agents && "AGENTS.md"].filter(Boolean).join("、");
    parts.push(
      `> 注意：未能从 Easel 仓库读到 ${missing}，该层契约缺失。请确认 Easel 版本包含 \`openclaw/workspace/\` 目录，或运行 \`zmtgzt_doctor\` 排查。`
    );
  }
  parts.push(BRIDGE_NOTE);
  return {
    content: parts.join("\n\n"),
    hasSoul: Boolean(soul),
    hasAgents: Boolean(agents)
  };
}
function skillRegistrationOf(meta) {
  return {
    name: meta.name,
    description: meta.description || `${meta.name}（Easel 技能）`,
    whenToUse: meta.description || meta.name
  };
}

// src/tools.ts
import { mkdir, readdir as readdir2, readFile as readFile2, writeFile } from "node:fs/promises";
import { dirname, join as join4 } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/runner.ts
import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { isAbsolute as isAbsolute2, join as join3, resolve as resolve3, sep as sep2 } from "node:path";
var MAX_STDERR = 4e3;
async function probeRoot(config) {
  if (!config.easelRoot) {
    return {
      ok: false,
      kind: "not-configured",
      error: "Easel 根目录未配置（config.easelRoot 为空）。",
      hint: "在 dsh 配置里为 dsh-zmtgzt 设置 config.easelRoot 指向本地 Easel 仓库的绝对路径（该目录下应有 skills/ 与 .env）。可运行 zmtgzt_doctor 做一次体检。"
    };
  }
  try {
    await access(config.easelRoot, constants.R_OK);
  } catch {
    return {
      ok: false,
      kind: "root-missing",
      error: `Easel 根目录不存在或不可读：${config.easelRoot}`,
      hint: "确认路径拼写，并确保该目录下存在 skills/ 子目录与 .env 文件。",
      path: config.easelRoot
    };
  }
  return void 0;
}
function scriptPathOf(root, scriptRelPath) {
  const abs = isAbsolute2(scriptRelPath) ? resolve3(scriptRelPath) : resolve3(join3(root, scriptRelPath));
  if (abs !== root && !abs.startsWith(root + sep2)) return void 0;
  return abs;
}
async function runEaselScript(config, scriptRelPath, args = {}, signal, positional = []) {
  const rootFailure = await probeRoot(config);
  if (rootFailure) return rootFailure;
  const root = config.easelRoot;
  const scriptPath = scriptPathOf(root, scriptRelPath);
  if (!scriptPath) {
    return {
      ok: false,
      kind: "script-missing",
      error: `脚本路径越出 Easel 根目录：${scriptRelPath}`,
      hint: "脚本路径必须是相对 Easel 根目录的相对路径。",
      path: scriptRelPath
    };
  }
  try {
    await access(scriptPath, constants.R_OK);
  } catch {
    return {
      ok: false,
      kind: "script-missing",
      error: `脚本不存在：${scriptPath}`,
      hint: "确认 Easel 仓库完整（含 skills/openclaw 与 skills/shared），或该能力在当前 Easel 版本中尚未提供。",
      path: scriptPath
    };
  }
  const cliArgs = toCliArgs(args);
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execPython(config, scriptPath, cliArgs, root, signal, positional);
    const elapsedMs = Date.now() - startedAt;
    const parsed = parseJsonLoose(stdout);
    if (parsed === void 0) {
      return {
        ok: false,
        kind: "bad-json",
        error: "脚本 stdout 不是合法 JSON。",
        hint: "确认该脚本以 JSON 形式输出结果（Easel 脚本约定：单行 JSON 到 stdout）。",
        path: scriptPath,
        stderr: tail(stderr || stdout)
      };
    }
    return { ok: true, script: scriptRelPath, data: parsed, elapsedMs };
  } catch (error) {
    const failure = classifyError(error, scriptPath, config);
    return failure;
  }
}
function execPython(config, scriptPath, cliArgs, cwd, signal, positional = []) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      config.pythonPath,
      [scriptPath, ...positional, ...cliArgs],
      {
        cwd,
        timeout: config.scriptTimeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        signal
      },
      (error, stdout, stderr) => {
        if (error) {
          ;
          error.stderr = stderr;
          error.stdout = stdout;
          reject(error);
          return;
        }
        resolvePromise({ stdout, stderr });
      }
    );
    child.on("error", reject);
  });
}
function toCliArgs(args) {
  const out = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === void 0 || value === null) continue;
    out.push(`--${key}`);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out.push(String(value));
    } else {
      out.push(JSON.stringify(value));
    }
  }
  return out;
}
function parseJsonLoose(raw) {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return void 0;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line || line[0] !== "{" && line[0] !== "[") continue;
      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
    return void 0;
  }
}
function classifyError(error, scriptPath, config) {
  const err = error;
  const stderr = tail(err?.stderr ?? "");
  if (err?.code === "ENOENT") {
    return {
      ok: false,
      kind: "python-missing",
      error: `找不到 Python 解释器：${config.pythonPath}`,
      hint: "把 config.pythonPath 指向可用的 python（Windows 常见为 py 或完整路径）。",
      path: config.pythonPath
    };
  }
  if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
    return {
      ok: false,
      kind: "aborted",
      error: "脚本执行被取消。",
      hint: "调用方已中止本次执行；如需继续请重新发起。",
      path: scriptPath
    };
  }
  if (err?.killed || err?.signal === "SIGTERM") {
    return {
      ok: false,
      kind: "timeout",
      error: `脚本超过 ${config.scriptTimeoutMs} ms 未结束，已被终止。`,
      hint: "可提高 config.scriptTimeoutMs，或把任务拆小后重试。",
      path: scriptPath,
      stderr
    };
  }
  return {
    ok: false,
    kind: "nonzero-exit",
    error: err?.message || "脚本执行失败。",
    hint: "检查 stderr 尾部信息；多数情况是缺少 API key 或输入文件不存在。",
    path: scriptPath,
    stderr
  };
}
function tail(text) {
  const trimmed = text.trim();
  return trimmed.length <= MAX_STDERR ? trimmed : trimmed.slice(-MAX_STDERR);
}
function isEaselFailure(value) {
  return typeof value === "object" && value !== null && value.ok === false;
}
function failureText(failure) {
  return `[${failure.kind}] ${failure.error}
指引：${failure.hint}` + (failure.stderr ? `
stderr: ${failure.stderr}` : "");
}

// src/tools.ts
var s = (description) => ({ type: "string", description });
var sr = (description) => ({ type: "string", description, required: true });
var n = (description) => ({ type: "number", description });
var b = (description) => ({ type: "boolean", description });
var j = (description) => ({ type: "json", description });
var arr = (description) => ({ type: "array", items: { type: "string" }, description });
var e = (values, description, required = false) => ({
  type: "string",
  description,
  enum: values,
  ...required ? { required: true } : {}
});
function stringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function stripUndefined(args) {
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== void 0) out[key] = value;
  }
  return out;
}
function renderResult(summary) {
  return (_args, value) => {
    if (isEaselFailure(value)) return [{ type: "text", text: failureText(value) }];
    const body = stringify(value?.data ?? value);
    return [{ type: "text", text: summary ? `${summary}

${body}` : body }];
  };
}
function scriptTool(deps, spec) {
  return defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: "json" },
      render: (args, value) => {
        if (isEaselFailure(value)) return [{ type: "text", text: failureText(value) }];
        let summary;
        try {
          summary = spec.summary?.(value, args ?? {}) || void 0;
        } catch {
          summary = void 0;
        }
        return renderResult(summary)(args, value);
      }
    },
    async execute(args, exec) {
      const all = args ?? {};
      const keys = spec.passthrough ?? Object.keys(all).filter((k) => k !== "script" && k !== "subcommand");
      const forwarded = {};
      for (const key of keys) {
        if (all[key] !== void 0) forwarded[key] = all[key];
      }
      const scriptPath = typeof spec.script === "function" ? spec.script(all) : spec.script;
      const sub = spec.subcommand?.(all);
      return runEaselScript(
        deps.config,
        scriptPath,
        stripUndefined(forwarded),
        exec?.signal,
        sub ? [sub] : void 0
      );
    }
  });
}
function createTools(deps) {
  return [
    // -----------------------------------------------------------------------
    // 1. 技能读取：Easel 的技能正文与 references 都从磁盘取，不在插件里复制
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_skill",
      description: "读取 Easel 仓库里的技能。action=list 列出全部技能（名称、所属层、简介）；action=read 取某个 SKILL.md 正文（执行流程）；action=files 列出该技能的 references/；action=file 读某个 reference 文件。任务开始时先 list 找精确匹配的技能，再 read 照着执行——不要凭记忆复述 Easel 的技能内容。",
      parameters: {
        action: e(["list", "read", "files", "file"], "操作类型", true),
        name: s("技能名，如 skill-trending-topics（read / files / file 时必填）"),
        layer: s("list 时按层过滤：discover / plan / produce / publish / attribute 等"),
        file: s("action=file 时的相对路径，如 references/hook-library.md")
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [
          { type: "text", text: stringify(value) }
        ]
      },
      async execute(args) {
        const a = args ?? {};
        const action = String(a.action ?? "list");
        if (!deps.repo.available) {
          return notConfigured("读取 Easel 技能");
        }
        if (action === "list") {
          const layer = a.layer ? String(a.layer) : void 0;
          const skills = await deps.repo.listSkills();
          const filtered = layer ? skills.filter((sk) => sk.layer === layer) : skills;
          return {
            ok: true,
            total: filtered.length,
            layers: [...new Set(skills.map((sk) => sk.layer ?? "unknown"))].sort(),
            skills: filtered.map((sk) => ({
              name: sk.name,
              layer: sk.layer ?? null,
              description: sk.whenToUse
            }))
          };
        }
        const name2 = String(a.name ?? "").trim();
        if (!name2) return { ok: false, error: "该操作需要 name" };
        if (action === "read") {
          const detail = await deps.repo.readSkill(name2);
          if (!detail) return { ok: false, error: `未找到技能：${name2}`, hint: "先用 action=list 查看可用技能。" };
          return {
            ok: true,
            name: detail.name,
            layer: detail.layer ?? null,
            description: detail.description,
            references: detail.references,
            body: detail.body
          };
        }
        if (action === "files") {
          const detail = await deps.repo.readSkill(name2);
          if (!detail) return { ok: false, error: `未找到技能：${name2}` };
          return { ok: true, name: detail.name, references: detail.references };
        }
        const file = String(a.file ?? "").trim();
        if (!file) return { ok: false, error: "action=file 需要 file" };
        const found = await deps.repo.readSkillFile(name2, file);
        if (!found) return { ok: false, error: `读不到 ${name2}/${file}` };
        return { ok: true, name: name2, path: found.path, content: found.content };
      }
    }),
    // -----------------------------------------------------------------------
    // 2. 脚本执行
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_run",
      description: "执行 Easel 仓库里的任意脚本（确定性 IO 的通用出口）。传根相对路径，例如 skills/shared/scripts/manifest.py。参数走 args（键值对，透传为 --key value）；argparse 子命令用 subcommand。参数名以脚本 --help 为准，不要臆造。想先看有哪些脚本用 zmtgzt_scripts。",
      parameters: {
        script: sr("根相对脚本路径，如 skills/shared/scripts/output_paths.py"),
        subcommand: s("argparse 子命令，如 record / meta / read / latest"),
        args: j('透传给脚本的参数对象，如 {"topic":"春季通勤穿搭","layer":"produce"}')
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args, exec) {
        const a = args ?? {};
        const script = String(a.script ?? "").trim();
        if (!script) return { ok: false, error: "script 为必填" };
        const forwarded = a.args && typeof a.args === "object" ? a.args : {};
        const sub = a.subcommand ? [String(a.subcommand)] : void 0;
        return runEaselScript(deps.config, script, stripUndefined(forwarded), exec?.signal, sub);
      }
    }),
    defineTool({
      name: "zmtgzt_scripts",
      description: "列出 Easel 仓库里可执行的脚本：action=shared 列出 skills/shared/scripts 下的通用脚本；action=skills 列出各技能自带的 scripts/。要执行其中任何一个用 zmtgzt_run。",
      parameters: {
        action: e(["shared", "skills"], "列出范围", true)
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const action = String((args ?? {}).action ?? "shared");
        if (!deps.repo.available) return notConfigured("列出 Easel 脚本");
        if (action === "shared") {
          const scripts = await deps.repo.listSharedScripts();
          return { ok: true, scope: "skills/shared/scripts", count: scripts.length, scripts };
        }
        const skills = await deps.repo.listSkills();
        const withScripts = [];
        for (const skill of skills) {
          const scripts = await deps.repo.listSkillScripts(skill.name);
          if (scripts.length) withScripts.push({ skill: skill.name, scripts });
        }
        return { ok: true, scope: "skills/openclaw", count: withScripts.length, skills: withScripts };
      }
    }),
    // -----------------------------------------------------------------------
    // 3. 专用脚本工具：参数取自源码 argparse 或 AGENTS.md 的命令示例
    // -----------------------------------------------------------------------
    scriptTool(deps, {
      name: "zmtgzt_manifest",
      description: '编排产物登记（AGENTS.md 规定的跨层传递契约）：把"产物路径 + 一句结论"写进 manifest，下游先 read/latest 读上游，不重新推导。跨两层以上任务必用。',
      parameters: {
        action: e(["record", "meta", "read", "latest"], "子命令", true),
        topic: s("主题名，决定落盘目录 outputs/<主题>/"),
        layer: s("record 时必填：技能所属层"),
        skill: s("record 时必填：执行的 SKILL 名"),
        status: s("record 状态，默认 done"),
        outputs: arr("产物文件名，多个用数组"),
        upstream: arr("消费的上游产物，多个用数组"),
        summary: s("一句话关键结论"),
        profile: s("画像名"),
        title: s("meta：人类可读标题"),
        platform: s("meta：目标平台"),
        kind: s("meta：产物体裁"),
        tags: arr("meta：标签"),
        cover: s("meta：封面文件名"),
        deliverables: arr("meta：最终成品文件名")
      },
      script: "skills/shared/scripts/manifest.py",
      subcommand: (a) => String(a.action ?? "read"),
      passthrough: [
        "topic",
        "layer",
        "skill",
        "status",
        "outputs",
        "upstream",
        "summary",
        "profile",
        "title",
        "platform",
        "kind",
        "tags",
        "cover",
        "deliverables"
      ],
      summary: (_v, a) => `manifest ${String(a.action)} 完成（主题：${String(a.topic ?? "-")}）。`
    }),
    scriptTool(deps, {
      name: "zmtgzt_output_paths",
      description: "校验并规整产物路径（AGENTS.md 要求写入前先校验）：禁止泛化主题名、禁止产物散落在 outputs/ 根目录。返回规范化后的绝对路径，越界或命名不合规会被拒绝。",
      parameters: {
        path: sr("待校验的产物路径，如 outputs/春季通勤穿搭/cover.png"),
        system: b("允许写入已注册的系统路径（_analytics / _scratch 等）")
      },
      script: "skills/shared/scripts/output_paths.py",
      summary: () => "路径校验通过。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_model_registry",
      description: '脱敏查询已配置的媒体模型 provider（AGENTS.md 规定：调用视频/音乐/云 TTS 前必须先查）。只返回"必填凭证齐全"的 provider，不暴露 Key。',
      parameters: {
        group: sr("模型分组，如 video / music / tts"),
        "env-file": s("显式指定 .env 路径；默认项目根 .env")
      },
      script: "skills/shared/scripts/model_registry.py",
      subcommand: () => "configured",
      passthrough: ["group", "env-file"],
      summary: () => "已返回可用的 provider 列表。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_persona_gate",
      description: "人设一致性门禁（AGENTS.md 规定发布前必做）：action=check 用评分判定 pass/warn；action=record 记录留痕。注意：只提醒、不阻断发布，内容安全硬门禁独立生效。",
      parameters: {
        action: e(["check", "record"], "子命令", true),
        score: n("check：人设评分（0-100，80 及以上为 pass）"),
        topic: s("record：主题"),
        profile: s("record：画像名"),
        verdict: s("record：结论"),
        deviations: s("record：偏离点")
      },
      script: "skills/shared/scripts/persona_gate.py",
      subcommand: (a) => String(a.action ?? "check"),
      passthrough: ["score", "topic", "profile", "verdict", "deviations"],
      summary: () => "人设一致性检查完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_content_guard",
      description: "发布前敏感信息扫描（AGENTS.md 规定的硬门禁）：扫描文案中的 API Key、内部 URL、代理、内部绝对路径等。命中会以退出码 7 结束，属于预期的拦截而非脚本故障。",
      parameters: {
        action: e(["scan", "dry-run", "list"], "子命令", true),
        text: s("待扫描文本（也可用 file 指定文件）"),
        file: s("待扫描文件路径")
      },
      script: "skills/shared/scripts/content_guard.py",
      subcommand: (a) => String(a.action ?? "scan"),
      passthrough: ["text", "file"],
      summary: () => "敏感信息扫描完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_publish_log",
      description: "发布留痕（AGENTS.md 规定的发布后动作）：记录平台、标题、画像与人设检查结论。",
      parameters: {
        platform: sr("平台"),
        title: s("标题"),
        profile: s("画像名"),
        "persona-score": n("人设评分"),
        "persona-verdict": s("人设结论")
      },
      script: "skills/openclaw/skill-publish-log/scripts/log.py",
      subcommand: () => "record",
      passthrough: ["platform", "title", "profile", "persona-score", "persona-verdict"],
      summary: () => "发布记录已写入。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_news",
      description: "行业资讯聚合（skill-news-intelligence 的脚本）：action=fetch 抓取资讯源；action=briefing 生成日报。注意与热点技能 skill-trending-topics 的区别——后者是分钟级热搜、纯流程技能（用 zmtgzt_skill 读取后按流程执行）。",
      parameters: {
        action: e(["fetch", "briefing"], "子命令", true),
        source: s("资讯源或关键词"),
        days: n("回看天数")
      },
      script: (a) => String(a.action) === "briefing" ? "skills/openclaw/skill-news-intelligence/scripts/daily_briefing.py" : "skills/openclaw/skill-news-intelligence/scripts/fetch_news.py",
      passthrough: ["source", "days"],
      summary: () => "资讯任务完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_card_audit",
      description: "卡片渲染后的自检（card-design 规定的第五步）：检查渲染结果是否达标。",
      parameters: {
        path: sr("待审计的卡片文件或目录路径"),
        style: s("使用的风格名")
      },
      script: "skills/openclaw/card-design/scripts/card_audit.py",
      passthrough: ["path", "style"],
      summary: () => "卡片审计完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_novel_ops",
      description: '小说连载的确定性 IO（novel-writer 的技能规定"文件即真相"）：立项搭骨架、进度管理、AI 味检查等。创意写作本身由你按 SKILL.md 完成，不走脚本。',
      parameters: {
        action: sr("子命令，取值以脚本 --help 为准（如 init / status / check）"),
        title: s("书名"),
        topic: s("主题名"),
        chapter: n("章节号")
      },
      script: "skills/openclaw/novel-writer/scripts/novel_ops.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["title", "topic", "chapter"],
      summary: () => "小说工程操作完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_paper_ingest",
      description: "论文抓取与解析（paper-explainer）：拉取原文、解析 PDF、产出可复用的 asset library。解析只做一次，视频与图文两条产线共用。",
      parameters: {
        source: sr("arXiv 链接、DOI 或本地 PDF 路径"),
        topic: s("主题名"),
        action: s("子命令，取值以脚本 --help 为准")
      },
      script: "skills/openclaw/paper-explainer/scripts/paper_ingest.py",
      subcommand: (a) => a.action ? String(a.action) : void 0,
      passthrough: ["source", "topic"],
      summary: () => "论文解析完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_data_report",
      description: "把数据文件生成可视化报告页（data-report）。",
      parameters: {
        input: sr("数据文件路径（CSV / Excel / JSON）"),
        topic: s("主题名"),
        title: s("报告标题")
      },
      script: "skills/openclaw/data-report/scripts/report.py",
      passthrough: ["input", "topic", "title"],
      summary: () => "报告页已生成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_assemble_video",
      description: "短视频合成合流点（auto-short-video 的技能规定合成前硬拦截只有 frame 没有 clip 的镜头）。",
      parameters: {
        topic: sr("主题名"),
        action: s("子命令，取值以脚本 --help 为准"),
        storyboard: s("分镜文件路径")
      },
      script: "skills/openclaw/auto-short-video/scripts/assemble.py",
      subcommand: (a) => a.action ? String(a.action) : void 0,
      passthrough: ["topic", "storyboard"],
      summary: () => "视频合成任务完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_drama_ops",
      description: "短剧资产 / 分镜 / 进度管理（short-drama）。",
      parameters: {
        action: sr("子命令，取值以脚本 --help 为准"),
        topic: s("主题名"),
        episode: n("集号")
      },
      script: "skills/openclaw/short-drama/scripts/drama_ops.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["topic", "episode"],
      summary: () => "短剧工程操作完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_dubbing",
      description: "短剧多角色配音（short-drama 规定配音必须用云 provider，edge 兜底会被硬拦截）。",
      parameters: {
        topic: sr("主题名"),
        episode: n("集号"),
        dialogue: s("对白文件路径")
      },
      script: "skills/openclaw/short-drama/scripts/dubbing.py",
      passthrough: ["topic", "episode", "dialogue"],
      summary: () => "多角色配音完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_performance_review",
      description: "发布后复盘（skill-social-performance-review）。",
      parameters: {
        topic: s("主题名"),
        platform: s("平台"),
        window: s("统计窗口")
      },
      script: "skills/openclaw/skill-social-performance-review/scripts/review.py",
      passthrough: ["topic", "platform", "window"],
      summary: () => "复盘完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_publish_analytics",
      description: "发布数据分析与粉丝记录（skill-publish-analytics）。",
      parameters: {
        platform: s("平台"),
        window: s("统计窗口")
      },
      script: "skills/openclaw/skill-publish-analytics/scripts/analyze.py",
      passthrough: ["platform", "window"],
      summary: () => "数据分析完成。"
    }),
    scriptTool(deps, {
      name: "zmtgzt_assets",
      description: "素材库管理（asset-manager）：登记与检索 assets/ 下的用户素材。",
      parameters: {
        action: sr("子命令，取值以脚本 --help 为准"),
        topic: s("主题名"),
        path: s("素材路径")
      },
      script: "skills/openclaw/asset-manager/scripts/assets.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["topic", "path"],
      summary: () => "素材库操作完成。"
    }),
    // -----------------------------------------------------------------------
    // 4. 仓库状态：画像与产物
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_profile",
      description: "读写账号画像（Easel 的 profiles/<画像>/，六维各一个 md：identity / style / audience / platforms / preferences / memory）。action=list 列出全部画像；action=read 读一个画像的全部维度；action=write 增量写一个维度。按 AGENTS.md：做内容前先读画像，不要凭对话猜账号定位。",
      parameters: {
        action: e(["list", "read", "write"], "操作类型", true),
        name: s("画像名（read / write 时必填）"),
        file: e(
          ["identity", "style", "audience", "platforms", "preferences", "memory"],
          "write 时必填：要写的维度"
        ),
        content: s("write 时的正文内容")
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const a = args ?? {};
        const action = String(a.action ?? "list");
        const root = deps.repo.rootDir;
        if (!root) return notConfigured("读写画像");
        const dir = join4(root, "profiles");
        if (action === "list") {
          const names = await listDirs(dir);
          return { ok: true, root: dir, profiles: names.filter((n2) => !n2.startsWith("_")) };
        }
        const name2 = String(a.name ?? "").trim();
        if (!name2) return { ok: false, error: "该操作需要 name" };
        if (action === "read") {
          const dims = ["identity", "style", "audience", "platforms", "preferences", "memory"];
          const files = {};
          for (const dim of dims) {
            const content2 = await readTextIfExists(`${dir}/${name2}/${dim}.md`);
            if (content2 !== void 0) files[dim] = content2;
          }
          if (Object.keys(files).length === 0) {
            return {
              ok: false,
              error: `画像不存在或为空：${name2}`,
              hint: `Easel 的画像模板在 profiles/_template/，可先参照它创建。`
            };
          }
          return { ok: true, name: name2, dir: `${dir}/${name2}`, dimensions: files };
        }
        const file = String(a.file ?? "").trim();
        const content = String(a.content ?? "");
        if (!file) return { ok: false, error: "write 需要 file（维度名）" };
        if (!content.trim()) return { ok: false, error: "write 需要 content" };
        const written = await writeText(`${dir}/${name2}/${file}.md`, content);
        if (!written) {
          return {
            ok: false,
            error: "写入失败",
            hint: "画像应位于 Easel 仓库的 profiles/ 下；请确认该目录可写。"
          };
        }
        return { ok: true, name: name2, file, path: `${dir}/${name2}/${file}.md` };
      }
    }),
    defineTool({
      name: "zmtgzt_artifact",
      description: "查看产物状态：action=list 列出 outputs/ 下全部项目；action=read 读某项目的 manifest 与产物目录树。manifest 由 zmtgzt_manifest 写入，是跨技能传递的真相来源。",
      parameters: {
        action: e(["list", "read"], "操作类型", true),
        topic: s("主题名（read 时必填）")
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const a = args ?? {};
        const action = String(a.action ?? "list");
        const root = deps.repo.rootDir;
        if (!root) return notConfigured("查看产物");
        const outputs = join4(root, "outputs");
        if (action === "list") {
          const names = await listDirs(outputs);
          return { ok: true, root: outputs, projects: names };
        }
        const topic = String(a.topic ?? "").trim();
        if (!topic) return { ok: false, error: "read 需要 topic" };
        const manifestRaw = await readTextIfExists(`${outputs}/${topic}/manifest.json`);
        let manifest = null;
        if (manifestRaw) {
          try {
            manifest = JSON.parse(manifestRaw);
          } catch {
            manifest = { parseError: true, raw: manifestRaw.slice(0, 2e3) };
          }
        }
        return {
          ok: true,
          topic,
          dir: `${outputs}/${topic}`,
          manifest,
          entries: await listEntries(`${outputs}/${topic}`)
        };
      }
    }),
    // -----------------------------------------------------------------------
    // 5. 环境体检
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_doctor",
      description: "插件与环境体检：检查 Easel 根目录、SOUL.md / AGENTS.md、技能目录、Python 解释器、.env 与共享脚本，并给出逐项修复指引。调用其它 zmtgzt_* 工具前不确定环境是否就绪时先跑这个。",
      parameters: {},
      output: {
        schema: { type: "json" },
        render: (_args, value) => [
          { type: "text", text: doctorText(value) }
        ]
      },
      async execute() {
        return deps.doctor();
      }
    })
  ];
}
function notConfigured(what) {
  return {
    ok: false,
    kind: "not-configured",
    error: `生效的 Easel 根目录不可用，无法${what}。`,
    hint: "插件随包自带 Easel 快照，正常安装应当已自动释放。请运行 zmtgzt_doctor 查看具体原因；若想改用自备仓库，设置 config.easelRoot。"
  };
}
async function listDirs(path) {
  try {
    const entries = await readdir2(path, { withFileTypes: true });
    return entries.filter((x) => x.isDirectory()).map((x) => x.name).sort();
  } catch {
    return [];
  }
}
async function listEntries(path) {
  try {
    const entries = await readdir2(path, { withFileTypes: true });
    return entries.map((x) => ({ name: x.name, isDir: x.isDirectory() })).sort((a, b2) => a.isDir === b2.isDir ? a.name.localeCompare(b2.name) : a.isDir ? -1 : 1);
  } catch {
    return [];
  }
}
async function readTextIfExists(path) {
  try {
    return await readFile2(path, "utf8");
  } catch {
    return void 0;
  }
}
async function writeText(path, content) {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return true;
  } catch {
    return false;
  }
}
function doctorText(value) {
  const lines = [];
  lines.push(value?.healthy === true ? "环境就绪，可以调用脚本类工具。" : "环境尚未就绪。");
  const checks = Array.isArray(value?.checks) ? value.checks : [];
  for (const check of checks) {
    lines.push(`- ${check.ok === true ? "OK" : "NG"} ${String(check.name)}${check.detail ? `：${String(check.detail)}` : ""}`);
  }
  if (typeof value?.hint === "string" && value.hint) lines.push("", value.hint);
  return lines.join("\n");
}

// src/workspace.ts
import { cpSync, existsSync as existsSync2, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join as join5 } from "node:path";
var RELEASE_ENTRIES = [
  "openclaw",
  "docs",
  "skills",
  "LICENSE",
  ".env.example",
  "pyproject.toml",
  "SYNC-INFO.json"
];
var CONTRACT_FILES = ["SOUL.md", "AGENTS.md"];
var USER_DATA = /* @__PURE__ */ new Set([".env", "outputs", "profiles", "assets"]);
function ensureWorkspace(config) {
  const warnings = [];
  if (config.easelRoot) {
    if (existsSync2(join5(config.easelRoot, "openclaw", "workspace", "AGENTS.md"))) {
      return { root: config.easelRoot, source: "configured", createdEnv: false, warnings };
    }
    warnings.push(
      `config.easelRoot 指向的目录缺少 openclaw/workspace/AGENTS.md：${config.easelRoot}，已回退到内置快照。`
    );
  }
  const embedded = config.embeddedRoot;
  const workspace = config.workspaceDir;
  if (!existsSync2(embedded)) {
    warnings.push(
      `内置 Easel 快照缺失：${embedded}。请重新安装插件，或运行 node scripts/sync-easel.mjs 生成。`
    );
    return { root: workspace, source: "embedded", createdEnv: false, warnings };
  }
  const embeddedInfo = readSyncInfo(embedded);
  const commit = embeddedInfo?.commit;
  if (!config.releaseEmbedded) {
    warnings.push("releaseEmbedded 为 false：直接使用只读的内置快照，产物与 .env 将无处存放。");
    return { root: embedded, source: "embedded", commit, createdEnv: false, warnings };
  }
  try {
    const result = releaseSnapshot(embedded, workspace);
    const createdEnv = ensureEnvFile(workspace);
    return { root: workspace, source: "embedded", commit, release: result, createdEnv, warnings };
  } catch (error) {
    warnings.push(`释放内置快照失败（${String(error)}），本次直接使用只读快照。`);
    return { root: embedded, source: "embedded", commit, createdEnv: false, warnings };
  }
}
function releaseSnapshot(embedded, workspace) {
  mkdirSync(workspace, { recursive: true });
  const embeddedInfo = readSyncInfo(embedded);
  const workspaceInfo = readSyncInfo(workspace);
  const embeddedCommit = embeddedInfo?.commit;
  const workspaceCommit = workspaceInfo?.commit;
  const missingCore = !existsSync2(join5(workspace, "openclaw", "workspace", "AGENTS.md"));
  const versionChanged = Boolean(embeddedCommit) && embeddedCommit !== workspaceCommit;
  const needCopy = missingCore || versionChanged;
  const reason = missingCore ? "首次释放" : versionChanged ? `更新 ${String(workspaceCommit).slice(0, 10)} → ${String(embeddedCommit).slice(0, 10)}` : "已是最新";
  if (needCopy) {
    for (const entry of RELEASE_ENTRIES) {
      if (USER_DATA.has(entry)) continue;
      const src = join5(embedded, entry);
      if (!existsSync2(src)) continue;
      const dest = join5(workspace, entry);
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
  }
  const { released, kept } = releaseContractFiles(embedded, workspace);
  const updated = needCopy || released.length > 0;
  return {
    updated,
    reason: released.length > 0 && !needCopy ? `${reason}；补齐根目录契约` : reason,
    contractsReleased: released,
    contractsKept: kept
  };
}
function releaseContractFiles(embedded, workspace) {
  const sourceDir = join5(embedded, "openclaw", "workspace");
  const released = [];
  const kept = [];
  for (const name2 of CONTRACT_FILES) {
    const from = join5(sourceDir, name2);
    if (!existsSync2(from)) continue;
    const to = join5(workspace, name2);
    if (existsSync2(to)) {
      kept.push(name2);
      continue;
    }
    try {
      cpSync(from, to);
      released.push(name2);
    } catch {
    }
  }
  return { released, kept };
}
function ensureEnvFile(workspace) {
  const envPath = join5(workspace, ".env");
  const examplePath = join5(workspace, ".env.example");
  if (existsSync2(envPath) || !existsSync2(examplePath)) return false;
  try {
    cpSync(examplePath, envPath);
    return true;
  } catch {
    return false;
  }
}
function readSyncInfo(dir) {
  try {
    const raw = readFileSync(join5(dir, "SYNC-INFO.json"), "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return parsed;
  } catch {
    return void 0;
  }
}

// src/account.ts
import { spawn } from "node:child_process";
import { closeSync, existsSync as existsSync3, mkdirSync as mkdirSync2, openSync, readFileSync as readFileSync2, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join6 } from "node:path";

// src/preflight.ts
import { execFile as execFile2 } from "node:child_process";
var PROBE_SCRIPT = [
  "import json",
  'targets = [("playwright", "playwright"), ("cv2", "opencv-python"), ("PIL", "Pillow")]',
  "result = {}",
  "for module, package in targets:",
  "    try:",
  "        __import__(module)",
  "        result[package] = True",
  "    except Exception:",
  "        result[package] = False",
  "print(json.dumps(result))"
].join("\n");
var FIX_HINTS = {
  playwright: "pip install playwright 然后 playwright install chromium",
  "opencv-python": 'pip install "opencv-python>=4.8,<5"',
  Pillow: 'pip install "Pillow>=10,<13"'
};
function runPython(config, args, timeoutMs, signal) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolvePromise(value);
    };
    const onAbort = () => {
      try {
        child.kill();
      } catch {
      }
      done({ ok: false, stdout: "", stderr: "", error: "已取消" });
    };
    let child;
    try {
      child = execFile2(
        config.pythonPath,
        args,
        { cwd: config.easelRoot, timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const code = error.code;
            done({
              ok: false,
              stdout: String(stdout ?? ""),
              stderr: String(stderr ?? ""),
              error: code === "ENOENT" ? `找不到解释器：${config.pythonPath}` : String(stderr || error.message)
            });
            return;
          }
          done({ ok: true, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
        }
      );
    } catch (error) {
      done({ ok: false, stdout: "", stderr: "", error: String(error) });
      return;
    }
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
async function preflightLogin(config, requireQrDeps = true, signal) {
  const probes = [];
  const interpreter = await runPython(config, ["-c", "import sys; print(sys.version.split()[0])"], 3e4, signal);
  if (!interpreter.ok) {
    probes.push({
      name: `Python 解释器（${config.pythonPath}）`,
      ok: false,
      detail: interpreter.error ?? "无法执行",
      fix: "检查插件配置 config.pythonPath —— Windows 上常见需要写成 py 或解释器的绝对路径；确认该解释器已安装 playwright 与二维码识别依赖。"
    });
    return {
      ok: false,
      pythonPath: config.pythonPath,
      probes,
      hint: "登录脚本依赖 Python 运行时，当前解释器不可用，因此**未启动登录进程**（避免产生一个注定失败的后台任务）。请先修复上面的项，再重新点击登录。"
    };
  }
  probes.push({
    name: `Python 解释器（${config.pythonPath}）`,
    ok: true,
    detail: `Python ${interpreter.stdout.trim()}`
  });
  const modules = await runPython(config, ["-c", PROBE_SCRIPT], 6e4, signal);
  if (!modules.ok) {
    probes.push({
      name: "依赖探测",
      ok: false,
      detail: modules.error ?? "探测失败",
      fix: "确认解释器可正常执行内联脚本（未被安全策略拦截）。"
    });
  } else {
    let parsed = {};
    try {
      parsed = JSON.parse(modules.stdout.trim());
    } catch {
      parsed = {};
    }
    for (const [pkg, fix] of Object.entries(FIX_HINTS)) {
      const needed = requireQrDeps || pkg === "playwright";
      const ok = parsed[pkg] === true;
      probes.push({
        name: pkg,
        ok: ok || !needed,
        detail: ok ? "已安装" : needed ? "未安装或不可导入" : "未安装（当前方式不需要）",
        ...ok || !needed ? {} : { fix }
      });
    }
  }
  const failed = probes.filter((p) => !p.ok);
  return {
    ok: failed.length === 0,
    pythonPath: config.pythonPath,
    probes,
    ...failed.length ? {
      hint: `以下依赖缺失，**未启动登录进程**（避免产生注定失败的后台任务）：` + failed.map((f) => f.name).join("、") + "。按各项后的命令安装后重试。" + (requireQrDeps ? "注意 headless 扫码需要 opencv-python 与 Pillow 把二维码抠成图片；若不想装这两个，可改用「窗口登录」方式（需要本机有桌面环境）。" : "")
    } : {}
  };
}

// src/account.ts
var BUILTIN_CHANNELS = [
  {
    id: "xiaohongshu",
    name: "小红书",
    profile: "XiaohongshuProfile",
    supportsLogin: true,
    supportsPublish: true,
    loginScript: "skills/shared/scripts/xhs_publish.py",
    whoamiScript: "skills/shared/scripts/xhs_publish.py",
    publishScript: "skills/shared/scripts/xhs_publish.py"
  },
  {
    id: "wechat-mp",
    name: "微信公众号",
    profile: "WechatMpProfile",
    supportsLogin: true,
    supportsPublish: true,
    loginScript: "skills/shared/scripts/weixin_mp_stats.py",
    whoamiScript: "skills/shared/scripts/weixin_mp_stats.py",
    publishScript: "skills/shared/scripts/weixin_mp_stats.py"
  },
  {
    id: "toutiao",
    name: "今日头条",
    profile: "ToutiaoProfile",
    supportsLogin: false,
    supportsPublish: false,
    reason: "Easel 上游未提供今日头条的登录与发布实现：web_publisher.py 与 account_stats.py 的 PLATFORMS 中均无 toutiao，唯一提及它的 multi_publish.py 依赖 Wechatsync 扩展且标注为不可用。"
  }
];
var AccountService = class {
  constructor(config) {
    this.config = config;
  }
  /** Playwright 持久化目录根。 */
  get profileBase() {
    return join6(homedir2(), ".easel-browser-profiles");
  }
  /** 渠道表（内置 + 配置扩展）。 */
  channels() {
    const extra = (this.config.extraChannels ?? []).map((c) => ({ ...c }));
    return [...BUILTIN_CHANNELS, ...extra];
  }
  /** 按 id 取渠道定义。 */
  channel(id) {
    return this.channels().find((c) => c.id === id);
  }
  /** 列出各渠道状态（不启动浏览器，仅看本地登录态目录）。 */
  async list() {
    return this.channels().map((spec) => {
      const profileDir = join6(this.profileBase, spec.profile);
      return {
        id: spec.id,
        name: spec.name,
        supportsLogin: spec.supportsLogin,
        supportsPublish: spec.supportsPublish,
        profilePresent: existsSync3(profileDir),
        ...spec.reason ? { reason: spec.reason } : {},
        profileDir
      };
    });
  }
  /** 精确查询某渠道的身份（启动浏览器跑 whoami，较慢）。 */
  async whoami(id, signal) {
    const spec = this.channel(id);
    if (!spec) return { ok: false, kind: "not-configured", error: `未知渠道：${id}`, hint: "检查渠道 id。" };
    if (!spec.supportsLogin || !spec.whoamiScript) {
      return {
        ok: false,
        kind: "not-configured",
        error: `${spec.name} 不支持登录态查询。`,
        hint: spec.reason ?? "上游未实现该渠道。"
      };
    }
    return runEaselScript(this.config, spec.whoamiScript, {}, signal, ["whoami"]);
  }
  /**
   * 发起登录（扫码或窗口）。
   *
   * 登录是长流程（起浏览器 → 出二维码 → 等扫码 → 持久化），因此这里**后台起进程并立即返回**，
   * 由前端轮询 `statusFile` 获取进度——与 Easel 原本的 Web 后端做法一致。
   *
   * 相比旧实现的三处关键修正（均由真实使用暴露）：
   *   1. **先预检再启动**——上游脚本在写第一个状态之前就会因缺 playwright 直接退出，
   *      状态文件从不创建、前端只读到 `unknown`。预检把这一步提前并给出确切缺失项。
   *   2. **stdout/stderr 落盘**——旧实现 `stdio: 'ignore'` 把错误全丢了，无从排障。
   *   3. **监听 error 与 exit**——旧实现漏了这两处：解释器路径错误会产生未捕获异常；
   *      脚本崩溃则静默停在 `starting`。现在两者都会写成状态文件，前端能看到原因。
   */
  async startLogin(id, options = {}, signal) {
    const spec = this.channel(id);
    if (!spec) return { error: `未知渠道：${id}` };
    if (!spec.supportsLogin || !spec.loginScript) {
      return { error: `${spec.name} 不支持登录。`, hint: spec.reason ?? "上游未实现该渠道。" };
    }
    const root = this.config.easelRoot;
    if (!root) return { error: "生效根不可用", hint: "请先运行 zmtgzt_doctor 排查。" };
    const scriptPath = join6(root, spec.loginScript);
    if (!existsSync3(scriptPath)) {
      return {
        error: `登录脚本不存在：${scriptPath}`,
        hint: "内置快照可能不完整，请重装插件或重跑 sync-easel。"
      };
    }
    const mode = options.mode === "window" ? "window" : "qr";
    const report = await preflightLogin(this.config, mode === "qr", signal);
    if (!report.ok) {
      return {
        error: "运行环境未就绪，未启动登录进程。",
        ...report.hint ? { hint: report.hint } : {},
        preflight: report
      };
    }
    const sessionDir = join6(this.config.dataDir, "login");
    mkdirSync2(sessionDir, { recursive: true });
    const qrOut = join6(sessionDir, `${id}.png`);
    const statusFile = join6(sessionDir, `${id}.json`);
    const logPath = join6(sessionDir, `${id}.log`);
    rmSync2(qrOut, { force: true });
    rmSync2(statusFile, { force: true });
    writeFileSync2(
      logPath,
      `[dsh-zmtgzt] ${(/* @__PURE__ */ new Date()).toISOString()} 启动 ${spec.name} 登录（方式：${mode}）
解释器：${this.config.pythonPath}
脚本：${scriptPath}

`,
      "utf8"
    );
    const args = [scriptPath, "login", "--qr-out", qrOut, "--status-file", statusFile, "--timeout", "240"];
    if (mode === "window") args.push("--headed");
    let child;
    try {
      const fd = openSync(logPath, "a");
      child = spawn(this.config.pythonPath, args, {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", fd, fd]
      });
      closeSync(fd);
    } catch (error) {
      const message = `无法启动登录脚本：${String(error)}`;
      this.writeFailureStatus(statusFile, message);
      return { error: message, hint: "检查配置中的 pythonPath 与文件执行权限。" };
    }
    child.on("error", (error) => {
      const code = error.code;
      const message = code === "ENOENT" ? `找不到 Python 解释器：${this.config.pythonPath}。请在插件配置里修正 pythonPath。` : `无法启动登录脚本：${error.message}`;
      this.writeFailureStatus(statusFile, message);
    });
    child.on("exit", (code, signalName) => {
      const current = this.loginStatus(id);
      if (current.state === "unknown" || current.state === "starting") {
        this.writeFailureStatus(
          statusFile,
          `登录脚本已退出（${code ?? signalName ?? "未知原因"}），且未写入状态。常见原因是缺少 Python 依赖，请查看登录日志：${logPath}`
        );
      }
    });
    child.unref();
    return {
      channelId: id,
      mode,
      qrOut,
      statusFile,
      logPath,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /** 由插件侧写入失败状态，格式与上游 login_state.py 的协议一致。 */
  writeFailureStatus(statusFile, message) {
    try {
      writeFileSync2(
        statusFile,
        JSON.stringify({ state: "error", message, qr: "", ts: Math.floor(Date.now() / 1e3) }),
        "utf8"
      );
    } catch {
    }
  }
  /** 二维码 PNG 路径（供 HTTP 端点读取）。 */
  qrPath(id) {
    return join6(this.config.dataDir, "login", `${id}.png`);
  }
  /** 读取某渠道最近一次登录的脚本日志（排障用）。 */
  readLoginLog(id) {
    const path = join6(this.config.dataDir, "login", `${id}.log`);
    try {
      const raw = readFileSync2(path, "utf8");
      const limit = 2e4;
      const truncated = raw.length > limit;
      return {
        path,
        content: truncated ? `…（仅显示最后 ${limit} 字符）
${raw.slice(-limit)}` : raw,
        exists: true,
        truncated
      };
    } catch {
      return { path, content: "", exists: false, truncated: false };
    }
  }
  /** 读取扫码登录的当前状态（前端轮询）。 */
  loginStatus(id) {
    const sessionDir = join6(this.config.dataDir, "login");
    const qrOut = join6(sessionDir, `${id}.png`);
    const statusFile = join6(sessionDir, `${id}.json`);
    try {
      const raw = readFileSync2(statusFile, "utf8");
      const data = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const state = data.state ?? "unknown";
      return { state, message: data.message ?? "", qr: data.qr ?? "", qrOut };
    } catch {
      return { state: "unknown", message: "", qr: "", qrOut };
    }
  }
  /**
   * 登出：删除该渠道的持久化目录。
   * 只删 `~/.easel-browser-profiles/<profile>`，不动其它渠道与用户其它数据。
   */
  async logout(id) {
    const spec = this.channel(id);
    if (!spec) return { ok: false, error: `未知渠道：${id}` };
    const profileDir = join6(this.profileBase, spec.profile);
    try {
      rmSync2(profileDir, { recursive: true, force: true });
      rmSync2(join6(this.config.dataDir, "login", `${id}.json`), { force: true });
      rmSync2(join6(this.config.dataDir, "login", `${id}.png`), { force: true });
      rmSync2(join6(this.config.dataDir, "login", `${id}.log`), { force: true });
      return { ok: true, removed: profileDir };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
  /** 读取创作数据（粉丝 / 获赞 / 作品列表）。 */
  async stats(id, signal) {
    const spec = this.channel(id);
    if (!spec) return { ok: false, kind: "not-configured", error: `未知渠道：${id}`, hint: "检查渠道 id。" };
    if (!spec.supportsLogin) {
      return {
        ok: false,
        kind: "not-configured",
        error: `${spec.name} 不支持创作数据查询。`,
        hint: spec.reason ?? "上游未实现该渠道。"
      };
    }
    return runEaselScript(
      this.config,
      "skills/shared/scripts/account_stats.py",
      { platform: id === "wechat-mp" ? "weixin-mp" : id },
      signal,
      ["fetch"]
    );
  }
  /** 探测 Playwright 运行时是否可用（`check` 子命令）。 */
  async checkRuntime(signal) {
    const spec = this.channels().find((c) => c.supportsLogin);
    if (!spec?.loginScript) {
      return { ok: false, kind: "not-configured", error: "没有可用的渠道脚本", hint: "内置快照可能不完整。" };
    }
    return runEaselScript(this.config, spec.loginScript, {}, signal, ["check"]);
  }
};

// src/topics.ts
import { mkdir as mkdir2, readdir as readdir3, readFile as readFile3, rename, rm, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import { join as join7, resolve as resolve4, sep as sep3 } from "node:path";
var GENERIC_PROJECT_NAMES = /* @__PURE__ */ new Set([
  "output",
  "outputs",
  "result",
  "results",
  "temp",
  "tmp",
  "test",
  "demo",
  "xhs",
  "douyin",
  "video",
  "audio",
  "image",
  "images",
  "project",
  "untitled",
  "主题",
  "主题名",
  "项目",
  "测试",
  "临时"
]);
var SYSTEM_PREFIX = "_";
var TopicStore = class _TopicStore {
  constructor(outputsRoot) {
    this.outputsRoot = outputsRoot;
  }
  /** 产物根目录。 */
  get root() {
    return this.outputsRoot;
  }
  /**
   * 校验并规范化主题名。
   * 规则与 Easel `output_paths.py` 对齐：非空、非泛化名、非以 `_` 开头、不含路径分隔符。
   */
  static checkName(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, normalized: "", reason: "主题名不能为空" };
    const normalized = trimmed.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "");
    if (!normalized) return { ok: false, normalized: "", reason: "主题名全是非法字符" };
    if (normalized.startsWith(SYSTEM_PREFIX)) {
      return { ok: false, normalized, reason: '主题名不能以 "_" 开头（该前缀保留给系统目录）' };
    }
    if (GENERIC_PROJECT_NAMES.has(normalized.toLowerCase()) || GENERIC_PROJECT_NAMES.has(normalized)) {
      return {
        ok: false,
        normalized,
        reason: `"${normalized}" 属于泛化名，请使用人类可读的具体主题名（如「春季通勤穿搭」）`
      };
    }
    if (normalized.length > 120) {
      return { ok: false, normalized, reason: "主题名过长（上限 120 字符）" };
    }
    return { ok: true, normalized };
  }
  /** 主题目录的绝对路径；主题名非法时返回 undefined。 */
  dirOf(name2) {
    const check = _TopicStore.checkName(name2);
    if (!check.ok) return void 0;
    const dir = resolve4(join7(this.outputsRoot, check.normalized));
    const root = resolve4(this.outputsRoot);
    if (dir !== root && !dir.startsWith(root + sep3)) return void 0;
    return dir;
  }
  /** 列出全部主题。 */
  async list() {
    let entries;
    try {
      const dirents = await readdir3(this.outputsRoot, { withFileTypes: true });
      entries = dirents.filter((d) => d.isDirectory() && !d.name.startsWith(SYSTEM_PREFIX)).map((d) => d.name);
    } catch {
      return [];
    }
    const rows = [];
    for (const name2 of entries) {
      const dir = join7(this.outputsRoot, name2);
      const manifest = await this.readManifest(dir);
      const files = await readdir3(dir).catch(() => []);
      rows.push({
        name: name2,
        dir,
        steps: manifest?.steps?.length ?? 0,
        ...manifest?.updatedAt ? { updatedAt: manifest.updatedAt } : {},
        hasContent: files.some((f) => f !== "manifest.json")
      });
    }
    return rows.sort((a, b2) => (b2.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }
  /**
   * 创建主题。
   * @param rawName - 用户输入的主题名。
   * @param baseDir - 可选：在此目录下创建（用于「在当前目录创建新规划」）；
   *                  省略时创建在产物根下。
   */
  async create(rawName, baseDir) {
    const check = _TopicStore.checkName(rawName);
    if (!check.ok) return { ok: false, reason: check.reason ?? "主题名非法" };
    const dir = baseDir ? resolve4(join7(baseDir, check.normalized)) : this.dirOf(check.normalized);
    if (!dir) return { ok: false, reason: "主题名非法" };
    try {
      await mkdir2(dir, { recursive: true });
    } catch (error) {
      return { ok: false, reason: `无法创建目录：${String(error)}` };
    }
    const manifestPath = join7(dir, "manifest.json");
    const exists = await stat2(manifestPath).then(
      () => true,
      () => false
    );
    if (!exists) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const manifest = { topic: check.normalized, dir, createdAt: now, updatedAt: now, steps: [] };
      try {
        const tmp = `${manifestPath}.${process.pid}.tmp`;
        await writeFile2(tmp, JSON.stringify(manifest, null, 2), "utf8");
        await rename(tmp, manifestPath);
      } catch (error) {
        return { ok: false, reason: `无法写入 manifest：${String(error)}` };
      }
    }
    return {
      ok: true,
      topic: { name: check.normalized, dir, steps: 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), hasContent: false }
    };
  }
  /** 重命名主题（含其目录与 manifest 中的 topic 字段）。 */
  async rename(rawName, nextRawName) {
    const from = this.dirOf(rawName);
    if (!from) return { ok: false, reason: "原名非法" };
    const check = _TopicStore.checkName(nextRawName);
    if (!check.ok) return { ok: false, reason: check.reason ?? "新名非法" };
    const to = this.dirOf(check.normalized);
    if (!to) return { ok: false, reason: "新名非法" };
    try {
      await rename(from, to);
    } catch (error) {
      return { ok: false, reason: `重命名失败：${String(error)}` };
    }
    const manifestPath = join7(to, "manifest.json");
    const manifest = await this.readManifest(to);
    if (manifest) {
      manifest.topic = check.normalized;
      manifest.dir = to;
      manifest.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const tmp = `${manifestPath}.${process.pid}.tmp`;
        await writeFile2(tmp, JSON.stringify(manifest, null, 2), "utf8");
        await rename(tmp, manifestPath);
      } catch {
      }
    }
    return {
      ok: true,
      topic: {
        name: check.normalized,
        dir: to,
        steps: manifest?.steps?.length ?? 0,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        hasContent: (await readdir3(to).catch(() => [])).some((f) => f !== "manifest.json")
      }
    };
  }
  /** 删除主题目录。 */
  async remove(rawName) {
    const dir = this.dirOf(rawName);
    if (!dir) return { ok: false, reason: "主题名非法" };
    try {
      await rm(dir, { recursive: true, force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `删除失败：${String(error)}` };
    }
  }
  /** 读取某主题的 manifest。 */
  async readManifest(dir) {
    try {
      const raw = await readFile3(join7(dir, "manifest.json"), "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
      return parsed;
    } catch {
      return void 0;
    }
  }
  /** 列出主题目录的条目（目录优先）。 */
  async entries(rawName) {
    const dir = this.dirOf(rawName);
    if (!dir) return [];
    try {
      const dirents = await readdir3(dir, { withFileTypes: true });
      const rows = await Promise.all(
        dirents.map(async (d) => {
          const info = await stat2(join7(dir, d.name)).catch(() => void 0);
          return { name: d.name, isDir: d.isDirectory(), size: info?.size ?? 0 };
        })
      );
      return rows.sort((a, b2) => a.isDir === b2.isDir ? a.name.localeCompare(b2.name) : a.isDir ? -1 : 1);
    } catch {
      return [];
    }
  }
};

// src/session-bindings.ts
import { mkdir as mkdir3, readFile as readFile4, rename as rename2, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
var EMPTY_STATE = { version: 1, bindings: {} };
var WriteQueue = class {
  tail = Promise.resolve();
  run(task) {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => void 0);
    return next;
  }
};
var SessionBindingStore = class {
  constructor(file) {
    this.file = file;
  }
  queue = new WriteQueue();
  async read() {
    try {
      const raw = await readFile4(this.file, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
      if (!parsed || typeof parsed.bindings !== "object" || parsed.bindings === null) {
        return { ...EMPTY_STATE, bindings: {} };
      }
      const bindings = {};
      for (const [key, value] of Object.entries(parsed.bindings)) {
        if (value && typeof value.topic === "string" && typeof value.dir === "string") {
          bindings[key] = {
            topic: value.topic,
            dir: value.dir,
            boundAt: typeof value.boundAt === "string" ? value.boundAt : (/* @__PURE__ */ new Date()).toISOString()
          };
        }
      }
      return { version: 1, bindings };
    } catch {
      return { ...EMPTY_STATE, bindings: {} };
    }
  }
  async write(state) {
    await mkdir3(dirname2(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile3(tmp, JSON.stringify(state, null, 2), "utf8");
    await rename2(tmp, this.file);
  }
  /** 读取某会话的绑定。 */
  async get(sessionId) {
    const state = await this.read();
    return state.bindings[sessionId];
  }
  /** 绑定（或覆盖）某会话的主题。 */
  set(sessionId, topic, dir) {
    return this.queue.run(async () => {
      const state = await this.read();
      const binding = { topic, dir, boundAt: (/* @__PURE__ */ new Date()).toISOString() };
      state.bindings[sessionId] = binding;
      await this.write(state);
      return binding;
    });
  }
  /** 解除绑定。 */
  remove(sessionId) {
    return this.queue.run(async () => {
      const state = await this.read();
      if (!state.bindings[sessionId]) return { removed: false };
      delete state.bindings[sessionId];
      await this.write(state);
      return { removed: true };
    });
  }
  /** 列出全部绑定。 */
  async list() {
    const state = await this.read();
    return { ...state.bindings };
  }
};

// src/wechat-config.ts
import { copyFileSync, existsSync as existsSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join8 } from "node:path";
var WECHAT_CONFIG_REL = "skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml";
var INDENT_ACCOUNT = "  ";
var INDENT_FIELD = "    ";
function indentOf(line) {
  return line.length - line.trimStart().length;
}
function isBlank(line) {
  return line.trim() === "";
}
function unquote(value) {
  const v = value.trim();
  const quoted = v.length >= 2 && (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'"));
  if (!quoted) return v;
  return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function quote(value) {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_\-./@+]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function wechatConfigPath(root) {
  return join8(root, WECHAT_CONFIG_REL);
}
function parseWechatConfig(text) {
  const lines = text.split(/\r?\n/);
  const accounts = [];
  let defaultKey = "";
  let current = null;
  let inAccounts = false;
  for (const line of lines) {
    if (isBlank(line) || /^\s*#/.test(line)) continue;
    const indent = indentOf(line);
    const body = line.trim();
    if (indent === 0) {
      inAccounts = /^accounts\s*:/.test(body);
      const dm = /^default\s*:\s*(.*)$/.exec(body);
      if (dm) defaultKey = unquote(dm[1]);
      current = null;
      continue;
    }
    if (!inAccounts) {
      current = null;
      continue;
    }
    if (indent <= 2) {
      const keyText = body.replace(/:\s*.*$/, "").trim();
      if (!keyText) continue;
      current = { key: unquote(keyText), appId: "", hasSecret: false, author: "", theme: "" };
      accounts.push(current);
      continue;
    }
    if (current) {
      const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(body);
      if (!m) continue;
      const field = m[1];
      const value = unquote(m[2]);
      if (field === "app_id") current.appId = value;
      else if (field === "app_secret") current.hasSecret = value.length > 0;
      else if (field === "author") current.author = value;
      else if (field === "theme") current.theme = value;
    }
  }
  return { defaultKey, accounts };
}
function readWechatConfig(root) {
  const path = wechatConfigPath(root);
  if (!existsSync4(path)) {
    return { path, exists: false, defaultKey: "", accounts: [] };
  }
  try {
    const parsed = parseWechatConfig(readFileSync3(path, "utf8"));
    return { path, exists: true, ...parsed };
  } catch {
    return { path, exists: true, defaultKey: "", accounts: [] };
  }
}
function patchWechatConfig(text, target) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
  let accountsAt = lines.findIndex((l) => indentOf(l) === 0 && /^accounts\s*:/.test(l.trim()));
  if (accountsAt === -1) {
    if (lines.length) lines.push("");
    lines.push("accounts:");
    accountsAt = lines.length - 1;
  }
  let blockEnd = lines.length;
  for (let i = accountsAt + 1; i < lines.length; i += 1) {
    if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
      blockEnd = i;
      break;
    }
  }
  let accountAt = -1;
  for (let i = accountsAt + 1; i < blockEnd; i += 1) {
    if (isBlank(lines[i]) || indentOf(lines[i]) !== 2) continue;
    const key = unquote(lines[i].trim().replace(/:\s*.*$/, "").trim());
    if (key === target.key) {
      accountAt = i;
      break;
    }
  }
  const fields = [
    ["app_id", target.appId || void 0],
    ["app_secret", target.appSecret || void 0],
    ["author", target.author || void 0],
    ["theme", target.theme || void 0]
  ];
  if (accountAt === -1) {
    const block = [];
    if (blockEnd > accountsAt + 1) block.push("");
    block.push(`${INDENT_ACCOUNT}${target.key}:`);
    for (const [field, value] of fields) {
      if (value === void 0) continue;
      block.push(`${INDENT_FIELD}${field}: ${quote(value)}`);
    }
    lines.splice(blockEnd, 0, ...block);
  } else {
    let acctEnd = blockEnd;
    for (let i = accountAt + 1; i < blockEnd; i += 1) {
      if (!isBlank(lines[i]) && indentOf(lines[i]) <= 2) {
        acctEnd = i;
        break;
      }
    }
    for (const [field, value] of fields) {
      if (value === void 0) continue;
      let fieldAt = -1;
      for (let i = accountAt + 1; i < acctEnd; i += 1) {
        if (new RegExp(`^\\s*${field}\\s*:`).test(lines[i])) {
          fieldAt = i;
          break;
        }
      }
      if (fieldAt >= 0) {
        lines[fieldAt] = `${INDENT_FIELD}${field}: ${quote(value)}`;
      } else {
        lines.splice(acctEnd, 0, `${INDENT_FIELD}${field}: ${quote(value)}`);
        acctEnd += 1;
      }
    }
  }
  const defaultAt = lines.findIndex((l) => indentOf(l) === 0 && /^default\s*:/.test(l.trim()));
  if (defaultAt >= 0) lines[defaultAt] = `default: ${quote(target.key)}`;
  else lines.unshift(`default: ${quote(target.key)}`);
  return lines.join(eol) + eol;
}
function writeWechatAccount(root, target) {
  const path = wechatConfigPath(root);
  let backup;
  try {
    const existing = existsSync4(path) ? readFileSync3(path, "utf8") : "";
    if (existing) {
      backup = `${path}.bak`;
      copyFileSync(path, backup);
    }
    const next = patchWechatConfig(existing, target);
    writeFileSync3(path, next, "utf8");
    return { ok: true, path, ...backup ? { backup } : {} };
  } catch (error) {
    return { ok: false, path, ...backup ? { backup } : {}, error: String(error) };
  }
}
function removeWechatAccount(root, key) {
  const path = wechatConfigPath(root);
  if (!existsSync4(path)) return { ok: true, path };
  try {
    const text = readFileSync3(path, "utf8");
    const backup = `${path}.bak`;
    copyFileSync(path, backup);
    const lines = text.split(/\r?\n/);
    const accountsAt = lines.findIndex((l) => indentOf(l) === 0 && /^accounts\s*:/.test(l.trim()));
    if (accountsAt >= 0) {
      let blockEnd = lines.length;
      for (let i = accountsAt + 1; i < lines.length; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
          blockEnd = i;
          break;
        }
      }
      let accountAt = -1;
      for (let i = accountsAt + 1; i < blockEnd; i += 1) {
        if (isBlank(lines[i]) || indentOf(lines[i]) !== 2) continue;
        if (unquote(lines[i].trim().replace(/:\s*.*$/, "").trim()) === key) {
          accountAt = i;
          break;
        }
      }
      if (accountAt >= 0) {
        let acctEnd = blockEnd;
        for (let i = accountAt + 1; i < blockEnd; i += 1) {
          if (!isBlank(lines[i]) && indentOf(lines[i]) <= 2) {
            acctEnd = i;
            break;
          }
        }
        let start = accountAt;
        if (start > accountsAt + 1 && isBlank(lines[start - 1])) start -= 1;
        lines.splice(start, acctEnd - start);
      }
    }
    const defaultAt = lines.findIndex((l) => indentOf(l) === 0 && /^default\s*:/.test(l.trim()));
    if (defaultAt >= 0 && unquote(lines[defaultAt].trim().replace(/^default\s*:\s*/, "")) === key) {
      lines.splice(defaultAt, 1);
    }
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
    writeFileSync3(path, lines.join(text.includes("\r\n") ? "\r\n" : "\n") + "\n", "utf8");
    return { ok: true, path, backup };
  } catch (error) {
    return { ok: false, path, error: String(error) };
  }
}
async function verifyWechatCredentials(appId, appSecret, timeoutMs = 15e3) {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    return {
      ok: false,
      kind: "network",
      message: `无法连接微信接口：${error instanceof Error ? error.message : String(error)}`,
      hint: "检查网络或代理设置；官方 API 需要能访问 api.weixin.qq.com。凭证未被判定为错误。"
    };
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    return {
      ok: false,
      kind: "unknown",
      message: `微信接口返回了无法解析的内容（HTTP ${response.status}）。`,
      hint: String(error)
    };
  }
  if (typeof data.access_token === "string" && data.access_token) {
    return { ok: true, kind: "ok", message: "凭证有效，可用于官方 API 发布草稿。" };
  }
  const errcode = Number(data.errcode);
  const errmsg = typeof data.errmsg === "string" ? data.errmsg : "";
  if (errcode === 40001 || errcode === 40002) {
    return {
      ok: false,
      kind: "invalid-credentials",
      errcode,
      message: `AppID 或 AppSecret 不正确（errcode ${errcode}${errmsg ? `：${errmsg}` : ""}）`,
      hint: "请在公众号后台「设置与开发 → 基本配置」核对 AppID 与 AppSecret。注意 AppSecret 只在重置时显示一次。"
    };
  }
  if (errcode === 40164) {
    return {
      ok: false,
      kind: "ip-not-whitelisted",
      errcode,
      message: `凭证本身有效，但当前出口 IP 未加入公众号 IP 白名单（errcode 40164${errmsg ? `：${errmsg}` : ""}）`,
      hint: "在公众号后台「设置与开发 → 基本配置 → IP 白名单」中加入本机出口 IP 后重试。这不是凭证错误。"
    };
  }
  return {
    ok: false,
    kind: "unknown",
    errcode: Number.isFinite(errcode) ? errcode : void 0,
    message: `校验未通过${Number.isFinite(errcode) ? `（errcode ${errcode}${errmsg ? `：${errmsg}` : ""}）` : ""}`
  };
}
function maskAppId(appId) {
  if (!appId) return "";
  if (appId.length <= 12) return `${appId.slice(0, 3)}***`;
  return `${appId.slice(0, 6)}…${appId.slice(-4)}`;
}

// src/index.ts
var name = PLUGIN_ID;
var inject = ["tools"];
var HEALTH_PATH = "/api/zmtgzt/health";
var API_PREFIX = "/api/zmtgzt";
var CONTRACT_SKILL = "zmtgzt";
var REQUIRED_PATHS = [
  { path: EASEL_SKILLS_DIR, label: "技能目录 skills/openclaw" },
  { path: EASEL_SHARED_DIR, label: "共享脚本 skills/shared/scripts" },
  { path: ".env", label: ".env（API key）" }
];
async function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const workspace = ensureWorkspace(config);
  const repo = new EaselRepo(workspace.root);
  const doctor = () => runDoctor(config, repo, workspace);
  const root = workspace.root;
  const account = new AccountService({ ...config, easelRoot: root });
  const topics = new TopicStore(join9(root, "outputs"));
  const bindings = new SessionBindingStore(join9(config.dataDir, "bindings.json"));
  ctx.provide("zmtgztRepo", repo);
  ctx.provide("zmtgztWorkspace", workspace);
  ctx.provide("zmtgztAccount", account);
  ctx.provide("zmtgztTopics", topics);
  ctx.provide("zmtgztBindings", bindings);
  if (workspace.release?.updated) {
    ctx.logger?.info?.(`[${PLUGIN_ID}] 已释放内置 Easel 快照（${workspace.release.reason}）→ ${workspace.root}`);
  }
  if (workspace.createdEnv) {
    ctx.logger?.warn?.(
      `[${PLUGIN_ID}] 已从 .env.example 生成 ${workspace.root}/.env —— 脚本类工具需要你填入 API key 后才能工作。`
    );
  }
  for (const warning of workspace.warnings) {
    ctx.logger?.warn?.(`[${PLUGIN_ID}] ${warning}`);
  }
  const tools = createTools({ config, repo, doctor });
  try {
    for (const tool of tools) ctx.tools.register(tool);
    ctx.logger?.info?.(`[${PLUGIN_ID}] 注册 ${tools.length} 个工具（v${PLUGIN_VERSION}）`);
  } catch (error) {
    ctx.logger?.error?.(`[${PLUGIN_ID}] 工具注册失败：${String(error)}`);
    throw error;
  }
  if (config.injectOrchestration || config.registerEaselSkills) {
    const [contract, allSkills] = await Promise.all([
      config.injectOrchestration ? composeContract(repo) : Promise.resolve(void 0),
      config.registerEaselSkills ? repo.listSkills() : Promise.resolve([])
    ]);
    const skills = config.skillLayers.length ? allSkills.filter((sk) => sk.layer && config.skillLayers.includes(sk.layer)) : allSkills;
    ctx.inject(["skills"], (skillCtx) => {
      let registered = 0;
      if (contract) {
        try {
          skillCtx.skills.register({
            name: CONTRACT_SKILL,
            description: "Easel 编排契约：Easel 仓库中 SOUL.md（人格）与 AGENTS.md（五层分工、Plan Mode、纵向编排、发布安全门禁）的原文，外加本插件的接入说明。做任何社媒内容任务前先加载。",
            whenToUse: "用户要做社媒内容（找热点、定策略、做图文/视频/小说/短剧/论文解读、发布、复盘）时使用。",
            source: "runtime",
            provider: PLUGIN_ID,
            content: contract.content
          });
          registered += 1;
          ctx.logger?.info?.(
            `[${PLUGIN_ID}] 已注入编排契约（SOUL=${contract.hasSoul} AGENTS=${contract.hasAgents}）`
          );
        } catch (error) {
          ctx.logger?.warn?.(`[${PLUGIN_ID}] 契约注册失败：${String(error)}`);
        }
      }
      for (const meta of skills) {
        try {
          const reg = skillRegistrationOf(meta);
          skillCtx.skills.register({ ...reg, source: "runtime", provider: PLUGIN_ID, content: "" });
          registered += 1;
        } catch (error) {
          ctx.logger?.warn?.(`[${PLUGIN_ID}] 技能 ${meta.name} 注册跳过：${String(error)}`);
        }
      }
      ctx.logger?.info?.(`[${PLUGIN_ID}] 注册 ${registered} 个技能（Easel 技能 ${skills.length} 个）`);
    });
  }
  ctx.inject(["webServer"], (webCtx) => {
    const webServer = webCtx.webServer;
    if (!webServer?.register) {
      ctx.logger?.warn?.(`[${PLUGIN_ID}] ctx.webServer 不可用（headless profile？），跳过 HTTP 路由`);
      return;
    }
    registerRoutes(webServer, config, root, repo, doctor, account, topics, bindings);
    ctx.logger?.info?.(`[${PLUGIN_ID}] 路由已注册：${API_PREFIX}/*`);
  });
}
async function runDoctor(config, repo, workspace) {
  const checks = [];
  checks.push({
    name: "生效的 Easel 根目录",
    ok: Boolean(workspace.root),
    detail: `${workspace.root}（${workspace.source === "configured" ? "自备仓库" : "内置快照"}）`
  });
  if (workspace.source === "embedded") {
    checks.push({
      name: "内置快照版本",
      ok: Boolean(workspace.commit),
      detail: workspace.commit ? `${workspace.commit.slice(0, 10)}${workspace.release?.reason ? ` · ${workspace.release.reason}` : ""}` : "未找到 SYNC-INFO.json（无法确认上游版本）"
    });
  }
  const contract = await repo.readContract();
  const sources = repo.contractSourcePaths();
  checks.push({
    name: "SOUL.md（人格层）",
    ok: Boolean(contract.soul),
    detail: sources.soul ?? "未找到（根目录与 openclaw/workspace/ 均缺失）"
  });
  checks.push({
    name: "AGENTS.md（编排层）",
    ok: Boolean(contract.agents),
    detail: sources.agents ?? "未找到（根目录与 openclaw/workspace/ 均缺失）"
  });
  for (const item of REQUIRED_PATHS) {
    const ok = await repo.has(item.path);
    checks.push({ name: item.label, ok, detail: ok ? void 0 : `缺失：${item.path}` });
  }
  const python = await probePython(config.pythonPath);
  checks.push({ name: `Python 可用（${config.pythonPath}）`, ok: python.ok, detail: python.detail });
  const skills = await repo.listSkills();
  checks.push({
    name: "Easel 技能可扫描",
    ok: skills.length > 0,
    detail: skills.length ? `发现 ${skills.length} 个技能，层：${[...new Set(skills.map((s2) => s2.layer ?? "?"))].sort().join("/")}` : `未在 ${EASEL_SKILLS_DIR} 下发现 SKILL.md`
  });
  const sharedScripts = await repo.listSharedScripts();
  checks.push({
    name: "共享脚本可枚举",
    ok: sharedScripts.length > 0,
    detail: sharedScripts.length ? `${sharedScripts.length} 个脚本` : "未发现 .py 脚本"
  });
  const failed = checks.filter((c) => !c.ok);
  const envMissing = failed.some((c) => c.name.startsWith(".env"));
  return {
    healthy: failed.length === 0,
    plugin: PLUGIN_ID,
    version: PLUGIN_VERSION,
    easelRoot: workspace.root,
    rootSource: workspace.source,
    embeddedCommit: workspace.commit ?? null,
    workspaceDir: config.workspaceDir,
    pythonPath: config.pythonPath,
    scriptTimeoutMs: config.scriptTimeoutMs,
    skillCount: skills.length,
    sharedScriptCount: sharedScripts.length,
    warnings: workspace.warnings,
    checks,
    hint: failed.length === 0 ? "环境就绪。可以先 zmtgzt_skill（action=list）看技能，再按任务 read 对应技能。" : [
      "以下项未通过，逐项修复后重跑 zmtgzt_doctor：",
      ...failed.map((c) => `- ${c.name}${c.detail ? `：${c.detail}` : ""}`),
      "",
      workspace.source === "embedded" ? `契约与技能来自内置快照（已释放到 ${config.workspaceDir}），无需 clone Easel。` : `当前使用自备仓库：${workspace.root}`,
      envMissing ? `脚本类工具需要 API key：编辑 ${workspace.root}/.env 填入后即可。
不填也能用技能与契约（纯文字类工作不受影响）。` : "",
      "Python 解释器可用 config.pythonPath 覆盖（Windows 常见为 py 或解释器绝对路径）。",
      "想换成自备仓库或跟进最新上游：设置 config.easelRoot，或运行 node scripts/sync-easel.mjs 更新内置快照。"
    ].filter(Boolean).join("\n")
  };
}
function probePython(pythonPath) {
  return new Promise((resolvePromise) => {
    execFile3(pythonPath, ["--version"], { timeout: 15e3, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ ok: false, detail: `${error.message}（可用 config.pythonPath 指定解释器）` });
        return;
      }
      resolvePromise({ ok: true, detail: (stdout || stderr || "").trim() || "ok" });
    });
  });
}
function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}
function binary(res, status, contentType, body) {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}
function wechatStatus(root) {
  const view = readWechatConfig(root);
  return {
    path: view.path,
    exists: view.exists,
    defaultKey: view.defaultKey,
    accounts: view.accounts.map((account) => ({
      key: account.key,
      appIdMasked: maskAppId(account.appId),
      hasSecret: account.hasSecret,
      author: account.author,
      theme: account.theme,
      configured: Boolean(account.appId && account.hasSecret)
    }))
  };
}
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
function registerRoutes(webServer, config, root, repo, doctor, account, topics, bindings) {
  webServer.register({
    kind: "exact",
    path: HEALTH_PATH,
    handler: (_req, res) => {
      json(res, 200, {
        plugin: PLUGIN_ID,
        version: PLUGIN_VERSION,
        ok: true,
        easelRoot: root ?? null
      });
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/doctor`,
    handler: async (_req, res) => {
      try {
        json(res, 200, await doctor());
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/skills`,
    handler: async (_req, res) => {
      const skills = await repo.listSkills();
      json(res, 200, {
        ok: true,
        count: skills.length,
        skills: skills.map((s2) => ({ name: s2.name, layer: s2.layer ?? null, description: s2.whenToUse }))
      });
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/profile`,
    handler: async (req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: "easelRoot 未配置", profiles: [] });
          return;
        }
        const dir = `${root}/profiles`;
        if (req.method === "GET") {
          const { readdir: readdir4 } = await import("node:fs/promises");
          const names = await readdir4(dir, { withFileTypes: true }).then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort()).catch(() => []);
          json(res, 200, { ok: true, root: dir, profiles: names.filter((n2) => !n2.startsWith("_")) });
          return;
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const name2 = String(body.name ?? "").trim();
          const file = String(body.file ?? "").trim();
          const content = String(body.content ?? "");
          if (!name2 || !file) {
            json(res, 400, { ok: false, error: "name 与 file 为必填" });
            return;
          }
          const { mkdir: mkdir4, writeFile: writeFile4 } = await import("node:fs/promises");
          const target = `${dir}/${name2}/${file}.md`;
          await mkdir4(`${dir}/${name2}`, { recursive: true });
          await writeFile4(target, content, "utf8");
          json(res, 200, { ok: true, path: target });
          return;
        }
        res.writeHead(405);
        res.end();
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/profile-read`,
    handler: async (req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, profiles: {} });
          return;
        }
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const name2 = url.searchParams.get("name") ?? "";
        if (!name2) {
          json(res, 400, { ok: false, error: "name 必填" });
          return;
        }
        const { readFile: readFile5 } = await import("node:fs/promises");
        const dims = ["identity", "style", "audience", "platforms", "preferences", "memory"];
        const files = {};
        for (const dim of dims) {
          const text = await readFile5(`${root}/profiles/${name2}/${dim}.md`, "utf8").catch(() => void 0);
          if (text !== void 0) files[dim] = text;
        }
        json(res, 200, { ok: true, name: name2, dimensions: files });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/projects`,
    handler: async (_req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: true, projects: [] });
          return;
        }
        const { readdir: readdir4 } = await import("node:fs/promises");
        const names = await readdir4(`${root}/outputs`, { withFileTypes: true }).then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort()).catch(() => []);
        json(res, 200, { ok: true, root: `${root}/outputs`, projects: names });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/project`,
    handler: async (req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: "easelRoot 未配置" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const topic = url.searchParams.get("topic") ?? "";
        if (!topic) {
          json(res, 400, { ok: false, error: "topic 必填" });
          return;
        }
        const { readFile: readFile5, readdir: readdir4 } = await import("node:fs/promises");
        const dir = `${root}/outputs/${topic}`;
        let manifest = null;
        const raw = await readFile5(`${dir}/manifest.json`, "utf8").catch(() => void 0);
        if (raw) {
          try {
            manifest = JSON.parse(raw);
          } catch {
            manifest = { parseError: true };
          }
        }
        const entries = await readdir4(dir, { withFileTypes: true }).then((xs) => xs.map((x) => ({ name: x.name, isDir: x.isDirectory() }))).catch(() => []);
        json(res, 200, { ok: true, topic, dir, manifest, entries });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account`,
    handler: async (_req, res) => {
      try {
        json(res, 200, { ok: true, channels: await account.list() });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/login`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        const body = await readJsonBody(req);
        const channelId = String(body.channelId ?? "");
        const mode = body.mode === "window" ? "window" : "qr";
        const session = await account.startLogin(channelId, { mode });
        if ("error" in session) {
          json(res, 400, { ok: false, ...session });
          return;
        }
        json(res, 200, { ok: true, session });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/login/qr`,
    handler: (req, res) => {
      const url = new URL(req.url ?? "/", "http://dsh.internal");
      const channelId = url.searchParams.get("channelId") ?? "";
      try {
        const qrPath = account.qrPath(channelId);
        if (!channelId || !existsSync5(qrPath)) {
          json(res, 404, { ok: false, error: "二维码尚未生成" });
          return;
        }
        binary(res, 200, "image/png", readFileSync4(qrPath));
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/login/log`,
    handler: (req, res) => {
      const url = new URL(req.url ?? "/", "http://dsh.internal");
      const channelId = url.searchParams.get("channelId") ?? "";
      json(res, 200, { ok: true, ...account.readLoginLog(channelId) });
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/login/status`,
    handler: (req, res) => {
      const url = new URL(req.url ?? "/", "http://dsh.internal");
      const channelId = url.searchParams.get("channelId") ?? "";
      json(res, 200, { ok: true, ...account.loginStatus(channelId) });
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/logout`,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req);
        json(res, 200, await account.logout(String(body.channelId ?? "")));
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/whoami`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const result = await account.whoami(url.searchParams.get("channelId") ?? "");
        json(res, 200, result);
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/stats`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const result = await account.stats(url.searchParams.get("channelId") ?? "");
        json(res, 200, result);
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/wechat`,
    handler: async (req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: "生效根不可用", config: null });
          return;
        }
        if (req.method === "GET") {
          json(res, 200, { ok: true, config: wechatStatus(root) });
          return;
        }
        const body = await readJsonBody(req);
        const key = String(body.key ?? "default").trim() || "default";
        const appId = String(body.appId ?? "").trim();
        const appSecret = String(body.appSecret ?? "").trim();
        const author = String(body.author ?? "").trim();
        const theme = String(body.theme ?? "").trim();
        if (!appId || !appSecret) {
          json(res, 400, { ok: false, error: "AppID 与 AppSecret 均为必填。", config: wechatStatus(root) });
          return;
        }
        const check = await verifyWechatCredentials(appId, appSecret);
        if (!check.ok) {
          json(res, 400, {
            ok: false,
            error: check.message,
            ...check.hint ? { hint: check.hint } : {},
            check,
            config: wechatStatus(root)
          });
          return;
        }
        const written = writeWechatAccount(root, { key, appId, appSecret, author, theme });
        if (!written.ok) {
          json(res, 500, { ok: false, error: written.error ?? "写入失败", config: wechatStatus(root) });
          return;
        }
        json(res, 200, { ok: true, check, written, config: wechatStatus(root) });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/account/wechat/remove`,
    handler: async (req, res) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: "生效根不可用" });
          return;
        }
        const body = await readJsonBody(req);
        const key = String(body.key ?? "").trim();
        if (!key) {
          json(res, 400, { ok: false, error: "key 必填" });
          return;
        }
        const result = removeWechatAccount(root, key);
        json(res, result.ok ? 200 : 500, { ...result, config: wechatStatus(root) });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/topic`,
    handler: async (req, res) => {
      try {
        if (req.method === "GET") {
          const url = new URL(req.url ?? "/", "http://dsh.internal");
          const want = url.searchParams.get("name");
          if (want) {
            const dir = topics.dirOf(want);
            if (!dir) {
              json(res, 400, { ok: false, error: "主题名非法" });
              return;
            }
            json(res, 200, {
              ok: true,
              name: want,
              dir,
              manifest: await topics.readManifest(dir) ?? null,
              entries: await topics.entries(want)
            });
            return;
          }
          json(res, 200, { ok: true, root: topics.root, topics: await topics.list() });
          return;
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const action = String(body.action ?? "create");
          if (action === "create") {
            const result = await topics.create(String(body.name ?? ""), body.baseDir ? String(body.baseDir) : void 0);
            json(res, result.ok ? 200 : 400, result);
            return;
          }
          if (action === "rename") {
            const result = await topics.rename(String(body.name ?? ""), String(body.nextName ?? ""));
            json(res, result.ok ? 200 : 400, result);
            return;
          }
          if (action === "remove") {
            const result = await topics.remove(String(body.name ?? ""));
            json(res, result.ok ? 200 : 400, result);
            return;
          }
          json(res, 400, { ok: false, error: `未知操作：${action}` });
          return;
        }
        res.writeHead(405);
        res.end();
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
  webServer.register({
    kind: "exact",
    path: `${API_PREFIX}/binding`,
    handler: async (req, res) => {
      try {
        if (req.method === "GET") {
          const url = new URL(req.url ?? "/", "http://dsh.internal");
          const sessionId = url.searchParams.get("sessionId");
          if (sessionId) {
            const binding = await bindings.get(sessionId);
            json(res, 200, { ok: true, sessionId, binding: binding ?? null });
            return;
          }
          json(res, 200, { ok: true, bindings: await bindings.list() });
          return;
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const sessionId = String(body.sessionId ?? "").trim();
          if (!sessionId) {
            json(res, 400, { ok: false, error: "sessionId 为必填" });
            return;
          }
          if (body.action === "unbind") {
            json(res, 200, { ok: true, ...await bindings.remove(sessionId) });
            return;
          }
          const topicName = String(body.topic ?? "").trim();
          const dir = topics.dirOf(topicName);
          if (!dir) {
            json(res, 400, { ok: false, error: `主题名非法：${topicName}` });
            return;
          }
          const created = await topics.create(topicName);
          if (!created.ok) {
            json(res, 400, { ok: false, error: created.reason });
            return;
          }
          const binding = await bindings.set(sessionId, topicName, dir);
          json(res, 200, { ok: true, sessionId, binding });
          return;
        }
        res.writeHead(405);
        res.end();
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
      }
    }
  });
}
export {
  HEALTH_PATH,
  apply,
  inject,
  name
};
