// src/index.ts
import { execFile as execFile2 } from "node:child_process";

// src/config.ts
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ID = "dsh-zmtgzt";
var PLUGIN_VERSION = false ? "dev" : "0.1.0";
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
    dataDir: join(home, PLUGIN_ID)
  };
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
  return `${flat.slice(0, limit).trimEnd()}\u2026`;
}
var EaselRepo = class {
  constructor(root) {
    this.root = root;
  }
  skills;
  contract;
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
  }
  abs(rel) {
    return join2(this.root, rel);
  }
  /**
   * 读取常驻层契约：SOUL.md（人格）+ AGENTS.md（编排逻辑）。
   * 缺失的文件返回 undefined，由调用方决定降级形态。
   */
  async readContract() {
    if (this.contract) return this.contract;
    if (!this.available) return {};
    const [soul, agents] = await Promise.all([
      readOptional(this.abs(`${EASEL_WORKSPACE_DIR}/SOUL.md`)),
      readOptional(this.abs(`${EASEL_WORKSPACE_DIR}/AGENTS.md`))
    ]);
    this.contract = { ...soul ? { soul } : {}, ...agents ? { agents } : {} };
    return this.contract;
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
var BRIDGE_NOTE = `## \u672C\u63D2\u4EF6\u7684\u63A5\u5165\u65B9\u5F0F\uFF08dsh\uFF09

\u4EE5\u4E0A\u4E24\u8282\u662F Easel \u4ED3\u5E93\u4E2D \`openclaw/workspace/SOUL.md\` \u4E0E \`AGENTS.md\` \u7684\u539F\u6587\uFF0C
\u968F Easel \u66F4\u65B0\u81EA\u52A8\u540C\u6B65\uFF0C\u672C\u63D2\u4EF6\u4E0D\u4FDD\u5B58\u526F\u672C\u3002

\u5DEE\u5F02\u70B9\uFF1AEasel \u539F\u672C\u8FD0\u884C\u5728 OpenClaw \u4E0A\uFF0C\u672C\u63D2\u4EF6\u628A\u5B83\u63A5\u5165 dsh\uFF0C\u673A\u5236\u5BF9\u5E94\u5173\u7CFB\u662F\u2014\u2014

- **\u6280\u80FD**\uFF1AEasel \u4ED3\u5E93 \`skills/openclaw/<\u6280\u80FD\u540D>/SKILL.md\` \u5DF2\u6CE8\u518C\u4E3A dsh \u6280\u80FD\uFF0C\u6309\u9700\u52A0\u8F7D\u3002
  \u9700\u8981\u6B63\u6587\u6216 \`references/\` \u65F6\uFF0C\u7528 \`zmtgzt_skill\`\uFF08action=read / files\uFF09\u8BFB\u53D6\uFF0C
  \u4E0D\u8981\u51ED\u8BB0\u5FC6\u590D\u8FF0\u6280\u80FD\u5185\u5BB9\u3002
- **\u811A\u672C**\uFF1A\u786E\u5B9A\u6027\u811A\u672C\u7528 \`zmtgzt_run\` \u6267\u884C\uFF0C\u8DEF\u5F84\u4E3A \`skills/...\` \u6839\u76F8\u5BF9\u8DEF\u5F84
  \uFF08\u5982 \`skills/shared/scripts/manifest.py\`\uFF09\u3002\u5E38\u7528\u811A\u672C\u53E6\u6709\u4E13\u7528\u5DE5\u5177\uFF0C
  \u53C2\u6570\u4EE5\u811A\u672C\u81EA\u8EAB\u7684 \`--help\` \u4E3A\u51C6\uFF0C\u4E0D\u8981\u81C6\u9020\u53C2\u6570\u540D\u3002
- **\u9879\u76EE\u6839**\uFF1AAGENTS.md \u91CC\u8BF4\u7684"\u8FD0\u884C\u65F6\u9879\u76EE\u6839"\u5C31\u662F\u63D2\u4EF6\u914D\u7F6E\u7684 \`config.easelRoot\`\uFF0C
  \u811A\u672C\u6267\u884C\u5668\u5DF2\u56FA\u5B9A cwd \u5230\u8BE5\u76EE\u5F55\uFF0C\u65E0\u9700\u518D cd\u3002
- **\u753B\u50CF\u4E0E\u4EA7\u7269**\uFF1AEasel \u7684 \`profiles/<\u753B\u50CF>/\` \u4E0E \`outputs/<\u4E3B\u9898>/\` \u662F\u78C1\u76D8\u4E8B\u5B9E\uFF0C
  \u76F4\u63A5\u6309 AGENTS.md \u7684\u89C4\u5219\u8BFB\u5199\uFF1B\u63D2\u4EF6\u7684 \`zmtgzt_profile\` / \`zmtgzt_artifact\`
  \u63D0\u4F9B\u7ED3\u6784\u5316\u8BFB\u5199\u5165\u53E3\uFF0C\u4EA7\u7269\u6E05\u5355\u53EF\u76F4\u63A5\u8BFB \`manifest.py\` \u751F\u6210\u7684 manifest\u3002
- **\u73AF\u5883\u81EA\u68C0**\uFF1A\u4E0D\u786E\u5B9A\u73AF\u5883\u662F\u5426\u5C31\u7EEA\u65F6\u5148\u8DD1 \`zmtgzt_doctor\`\u3002`;
async function composeContract(repo) {
  if (!repo.available) {
    return {
      content: [
        "# Easel \u7F16\u6392\u5951\u7EA6\uFF08\u672A\u52A0\u8F7D\uFF09",
        "",
        "\u63D2\u4EF6\u672A\u627E\u5230 Easel \u4ED3\u5E93\uFF0C\u56E0\u6B64 **SOUL.md \u4E0E AGENTS.md \u5747\u672A\u6CE8\u5165**\u3002",
        "\u672C\u63D2\u4EF6\u4E0D\u5185\u7F6E\u8FD9\u4E24\u4EFD\u5951\u7EA6\u7684\u526F\u672C\u2014\u2014\u5B83\u4EEC\u5FC5\u987B\u6765\u81EA Easel \u5B98\u65B9\u4ED3\u5E93\uFF0C\u907F\u514D\u4E0E\u4E0A\u6E38\u6F02\u79FB\u3002",
        "",
        "\u4FEE\u590D\u65B9\u5F0F\uFF1A\u5728 dsh \u914D\u7F6E\u4E2D\u4E3A `dsh-zmtgzt` \u8BBE\u7F6E `config.easelRoot`\uFF0C",
        "\u6307\u5411\u672C\u5730 Easel \u4ED3\u5E93\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u8BE5\u76EE\u5F55\u4E0B\u5E94\u542B `openclaw/workspace/AGENTS.md`\uFF09\u3002",
        "\u914D\u7F6E\u540E\u8FD0\u884C `zmtgzt_doctor` \u786E\u8BA4\uFF0C\u518D\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u5373\u53EF\u6CE8\u5165\u3002",
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
    parts.push("<!-- \u4EE5\u4E0B\u6765\u81EA Easel \u4ED3\u5E93 openclaw/workspace/SOUL.md -->", soul.trim());
  }
  if (agents) {
    parts.push("<!-- \u4EE5\u4E0B\u6765\u81EA Easel \u4ED3\u5E93 openclaw/workspace/AGENTS.md -->", agents.trim());
  }
  if (!soul || !agents) {
    const missing = [!soul && "SOUL.md", !agents && "AGENTS.md"].filter(Boolean).join("\u3001");
    parts.push(
      `> \u6CE8\u610F\uFF1A\u672A\u80FD\u4ECE Easel \u4ED3\u5E93\u8BFB\u5230 ${missing}\uFF0C\u8BE5\u5C42\u5951\u7EA6\u7F3A\u5931\u3002\u8BF7\u786E\u8BA4 Easel \u7248\u672C\u5305\u542B \`openclaw/workspace/\` \u76EE\u5F55\uFF0C\u6216\u8FD0\u884C \`zmtgzt_doctor\` \u6392\u67E5\u3002`
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
    description: meta.description || `${meta.name}\uFF08Easel \u6280\u80FD\uFF09`,
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
      error: "Easel \u6839\u76EE\u5F55\u672A\u914D\u7F6E\uFF08config.easelRoot \u4E3A\u7A7A\uFF09\u3002",
      hint: "\u5728 dsh \u914D\u7F6E\u91CC\u4E3A dsh-zmtgzt \u8BBE\u7F6E config.easelRoot \u6307\u5411\u672C\u5730 Easel \u4ED3\u5E93\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u8BE5\u76EE\u5F55\u4E0B\u5E94\u6709 skills/ \u4E0E .env\uFF09\u3002\u53EF\u8FD0\u884C zmtgzt_doctor \u505A\u4E00\u6B21\u4F53\u68C0\u3002"
    };
  }
  try {
    await access(config.easelRoot, constants.R_OK);
  } catch {
    return {
      ok: false,
      kind: "root-missing",
      error: `Easel \u6839\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\uFF1A${config.easelRoot}`,
      hint: "\u786E\u8BA4\u8DEF\u5F84\u62FC\u5199\uFF0C\u5E76\u786E\u4FDD\u8BE5\u76EE\u5F55\u4E0B\u5B58\u5728 skills/ \u5B50\u76EE\u5F55\u4E0E .env \u6587\u4EF6\u3002",
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
      error: `\u811A\u672C\u8DEF\u5F84\u8D8A\u51FA Easel \u6839\u76EE\u5F55\uFF1A${scriptRelPath}`,
      hint: "\u811A\u672C\u8DEF\u5F84\u5FC5\u987B\u662F\u76F8\u5BF9 Easel \u6839\u76EE\u5F55\u7684\u76F8\u5BF9\u8DEF\u5F84\u3002",
      path: scriptRelPath
    };
  }
  try {
    await access(scriptPath, constants.R_OK);
  } catch {
    return {
      ok: false,
      kind: "script-missing",
      error: `\u811A\u672C\u4E0D\u5B58\u5728\uFF1A${scriptPath}`,
      hint: "\u786E\u8BA4 Easel \u4ED3\u5E93\u5B8C\u6574\uFF08\u542B skills/openclaw \u4E0E skills/shared\uFF09\uFF0C\u6216\u8BE5\u80FD\u529B\u5728\u5F53\u524D Easel \u7248\u672C\u4E2D\u5C1A\u672A\u63D0\u4F9B\u3002",
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
        error: "\u811A\u672C stdout \u4E0D\u662F\u5408\u6CD5 JSON\u3002",
        hint: "\u786E\u8BA4\u8BE5\u811A\u672C\u4EE5 JSON \u5F62\u5F0F\u8F93\u51FA\u7ED3\u679C\uFF08Easel \u811A\u672C\u7EA6\u5B9A\uFF1A\u5355\u884C JSON \u5230 stdout\uFF09\u3002",
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
      error: `\u627E\u4E0D\u5230 Python \u89E3\u91CA\u5668\uFF1A${config.pythonPath}`,
      hint: "\u628A config.pythonPath \u6307\u5411\u53EF\u7528\u7684 python\uFF08Windows \u5E38\u89C1\u4E3A py \u6216\u5B8C\u6574\u8DEF\u5F84\uFF09\u3002",
      path: config.pythonPath
    };
  }
  if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
    return {
      ok: false,
      kind: "aborted",
      error: "\u811A\u672C\u6267\u884C\u88AB\u53D6\u6D88\u3002",
      hint: "\u8C03\u7528\u65B9\u5DF2\u4E2D\u6B62\u672C\u6B21\u6267\u884C\uFF1B\u5982\u9700\u7EE7\u7EED\u8BF7\u91CD\u65B0\u53D1\u8D77\u3002",
      path: scriptPath
    };
  }
  if (err?.killed || err?.signal === "SIGTERM") {
    return {
      ok: false,
      kind: "timeout",
      error: `\u811A\u672C\u8D85\u8FC7 ${config.scriptTimeoutMs} ms \u672A\u7ED3\u675F\uFF0C\u5DF2\u88AB\u7EC8\u6B62\u3002`,
      hint: "\u53EF\u63D0\u9AD8 config.scriptTimeoutMs\uFF0C\u6216\u628A\u4EFB\u52A1\u62C6\u5C0F\u540E\u91CD\u8BD5\u3002",
      path: scriptPath,
      stderr
    };
  }
  return {
    ok: false,
    kind: "nonzero-exit",
    error: err?.message || "\u811A\u672C\u6267\u884C\u5931\u8D25\u3002",
    hint: "\u68C0\u67E5 stderr \u5C3E\u90E8\u4FE1\u606F\uFF1B\u591A\u6570\u60C5\u51B5\u662F\u7F3A\u5C11 API key \u6216\u8F93\u5165\u6587\u4EF6\u4E0D\u5B58\u5728\u3002",
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
\u6307\u5F15\uFF1A${failure.hint}` + (failure.stderr ? `
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
      description: "\u8BFB\u53D6 Easel \u4ED3\u5E93\u91CC\u7684\u6280\u80FD\u3002action=list \u5217\u51FA\u5168\u90E8\u6280\u80FD\uFF08\u540D\u79F0\u3001\u6240\u5C5E\u5C42\u3001\u7B80\u4ECB\uFF09\uFF1Baction=read \u53D6\u67D0\u4E2A SKILL.md \u6B63\u6587\uFF08\u6267\u884C\u6D41\u7A0B\uFF09\uFF1Baction=files \u5217\u51FA\u8BE5\u6280\u80FD\u7684 references/\uFF1Baction=file \u8BFB\u67D0\u4E2A reference \u6587\u4EF6\u3002\u4EFB\u52A1\u5F00\u59CB\u65F6\u5148 list \u627E\u7CBE\u786E\u5339\u914D\u7684\u6280\u80FD\uFF0C\u518D read \u7167\u7740\u6267\u884C\u2014\u2014\u4E0D\u8981\u51ED\u8BB0\u5FC6\u590D\u8FF0 Easel \u7684\u6280\u80FD\u5185\u5BB9\u3002",
      parameters: {
        action: e(["list", "read", "files", "file"], "\u64CD\u4F5C\u7C7B\u578B", true),
        name: s("\u6280\u80FD\u540D\uFF0C\u5982 skill-trending-topics\uFF08read / files / file \u65F6\u5FC5\u586B\uFF09"),
        layer: s("list \u65F6\u6309\u5C42\u8FC7\u6EE4\uFF1Adiscover / plan / produce / publish / attribute \u7B49"),
        file: s("action=file \u65F6\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u5982 references/hook-library.md")
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
          return notConfigured("\u8BFB\u53D6 Easel \u6280\u80FD");
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
        if (!name2) return { ok: false, error: "\u8BE5\u64CD\u4F5C\u9700\u8981 name" };
        if (action === "read") {
          const detail = await deps.repo.readSkill(name2);
          if (!detail) return { ok: false, error: `\u672A\u627E\u5230\u6280\u80FD\uFF1A${name2}`, hint: "\u5148\u7528 action=list \u67E5\u770B\u53EF\u7528\u6280\u80FD\u3002" };
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
          if (!detail) return { ok: false, error: `\u672A\u627E\u5230\u6280\u80FD\uFF1A${name2}` };
          return { ok: true, name: detail.name, references: detail.references };
        }
        const file = String(a.file ?? "").trim();
        if (!file) return { ok: false, error: "action=file \u9700\u8981 file" };
        const found = await deps.repo.readSkillFile(name2, file);
        if (!found) return { ok: false, error: `\u8BFB\u4E0D\u5230 ${name2}/${file}` };
        return { ok: true, name: name2, path: found.path, content: found.content };
      }
    }),
    // -----------------------------------------------------------------------
    // 2. 脚本执行
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_run",
      description: "\u6267\u884C Easel \u4ED3\u5E93\u91CC\u7684\u4EFB\u610F\u811A\u672C\uFF08\u786E\u5B9A\u6027 IO \u7684\u901A\u7528\u51FA\u53E3\uFF09\u3002\u4F20\u6839\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u4F8B\u5982 skills/shared/scripts/manifest.py\u3002\u53C2\u6570\u8D70 args\uFF08\u952E\u503C\u5BF9\uFF0C\u900F\u4F20\u4E3A --key value\uFF09\uFF1Bargparse \u5B50\u547D\u4EE4\u7528 subcommand\u3002\u53C2\u6570\u540D\u4EE5\u811A\u672C --help \u4E3A\u51C6\uFF0C\u4E0D\u8981\u81C6\u9020\u3002\u60F3\u5148\u770B\u6709\u54EA\u4E9B\u811A\u672C\u7528 zmtgzt_scripts\u3002",
      parameters: {
        script: sr("\u6839\u76F8\u5BF9\u811A\u672C\u8DEF\u5F84\uFF0C\u5982 skills/shared/scripts/output_paths.py"),
        subcommand: s("argparse \u5B50\u547D\u4EE4\uFF0C\u5982 record / meta / read / latest"),
        args: j('\u900F\u4F20\u7ED9\u811A\u672C\u7684\u53C2\u6570\u5BF9\u8C61\uFF0C\u5982 {"topic":"\u6625\u5B63\u901A\u52E4\u7A7F\u642D","layer":"produce"}')
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args, exec) {
        const a = args ?? {};
        const script = String(a.script ?? "").trim();
        if (!script) return { ok: false, error: "script \u4E3A\u5FC5\u586B" };
        const forwarded = a.args && typeof a.args === "object" ? a.args : {};
        const sub = a.subcommand ? [String(a.subcommand)] : void 0;
        return runEaselScript(deps.config, script, stripUndefined(forwarded), exec?.signal, sub);
      }
    }),
    defineTool({
      name: "zmtgzt_scripts",
      description: "\u5217\u51FA Easel \u4ED3\u5E93\u91CC\u53EF\u6267\u884C\u7684\u811A\u672C\uFF1Aaction=shared \u5217\u51FA skills/shared/scripts \u4E0B\u7684\u901A\u7528\u811A\u672C\uFF1Baction=skills \u5217\u51FA\u5404\u6280\u80FD\u81EA\u5E26\u7684 scripts/\u3002\u8981\u6267\u884C\u5176\u4E2D\u4EFB\u4F55\u4E00\u4E2A\u7528 zmtgzt_run\u3002",
      parameters: {
        action: e(["shared", "skills"], "\u5217\u51FA\u8303\u56F4", true)
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const action = String((args ?? {}).action ?? "shared");
        if (!deps.repo.available) return notConfigured("\u5217\u51FA Easel \u811A\u672C");
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
      description: '\u7F16\u6392\u4EA7\u7269\u767B\u8BB0\uFF08AGENTS.md \u89C4\u5B9A\u7684\u8DE8\u5C42\u4F20\u9012\u5951\u7EA6\uFF09\uFF1A\u628A"\u4EA7\u7269\u8DEF\u5F84 + \u4E00\u53E5\u7ED3\u8BBA"\u5199\u8FDB manifest\uFF0C\u4E0B\u6E38\u5148 read/latest \u8BFB\u4E0A\u6E38\uFF0C\u4E0D\u91CD\u65B0\u63A8\u5BFC\u3002\u8DE8\u4E24\u5C42\u4EE5\u4E0A\u4EFB\u52A1\u5FC5\u7528\u3002',
      parameters: {
        action: e(["record", "meta", "read", "latest"], "\u5B50\u547D\u4EE4", true),
        topic: s("\u4E3B\u9898\u540D\uFF0C\u51B3\u5B9A\u843D\u76D8\u76EE\u5F55 outputs/<\u4E3B\u9898>/"),
        layer: s("record \u65F6\u5FC5\u586B\uFF1A\u6280\u80FD\u6240\u5C5E\u5C42"),
        skill: s("record \u65F6\u5FC5\u586B\uFF1A\u6267\u884C\u7684 SKILL \u540D"),
        status: s("record \u72B6\u6001\uFF0C\u9ED8\u8BA4 done"),
        outputs: arr("\u4EA7\u7269\u6587\u4EF6\u540D\uFF0C\u591A\u4E2A\u7528\u6570\u7EC4"),
        upstream: arr("\u6D88\u8D39\u7684\u4E0A\u6E38\u4EA7\u7269\uFF0C\u591A\u4E2A\u7528\u6570\u7EC4"),
        summary: s("\u4E00\u53E5\u8BDD\u5173\u952E\u7ED3\u8BBA"),
        profile: s("\u753B\u50CF\u540D"),
        title: s("meta\uFF1A\u4EBA\u7C7B\u53EF\u8BFB\u6807\u9898"),
        platform: s("meta\uFF1A\u76EE\u6807\u5E73\u53F0"),
        kind: s("meta\uFF1A\u4EA7\u7269\u4F53\u88C1"),
        tags: arr("meta\uFF1A\u6807\u7B7E"),
        cover: s("meta\uFF1A\u5C01\u9762\u6587\u4EF6\u540D"),
        deliverables: arr("meta\uFF1A\u6700\u7EC8\u6210\u54C1\u6587\u4EF6\u540D")
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
      summary: (_v, a) => `manifest ${String(a.action)} \u5B8C\u6210\uFF08\u4E3B\u9898\uFF1A${String(a.topic ?? "-")}\uFF09\u3002`
    }),
    scriptTool(deps, {
      name: "zmtgzt_output_paths",
      description: "\u6821\u9A8C\u5E76\u89C4\u6574\u4EA7\u7269\u8DEF\u5F84\uFF08AGENTS.md \u8981\u6C42\u5199\u5165\u524D\u5148\u6821\u9A8C\uFF09\uFF1A\u7981\u6B62\u6CDB\u5316\u4E3B\u9898\u540D\u3001\u7981\u6B62\u4EA7\u7269\u6563\u843D\u5728 outputs/ \u6839\u76EE\u5F55\u3002\u8FD4\u56DE\u89C4\u8303\u5316\u540E\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u8D8A\u754C\u6216\u547D\u540D\u4E0D\u5408\u89C4\u4F1A\u88AB\u62D2\u7EDD\u3002",
      parameters: {
        path: sr("\u5F85\u6821\u9A8C\u7684\u4EA7\u7269\u8DEF\u5F84\uFF0C\u5982 outputs/\u6625\u5B63\u901A\u52E4\u7A7F\u642D/cover.png"),
        system: b("\u5141\u8BB8\u5199\u5165\u5DF2\u6CE8\u518C\u7684\u7CFB\u7EDF\u8DEF\u5F84\uFF08_analytics / _scratch \u7B49\uFF09")
      },
      script: "skills/shared/scripts/output_paths.py",
      summary: () => "\u8DEF\u5F84\u6821\u9A8C\u901A\u8FC7\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_model_registry",
      description: '\u8131\u654F\u67E5\u8BE2\u5DF2\u914D\u7F6E\u7684\u5A92\u4F53\u6A21\u578B provider\uFF08AGENTS.md \u89C4\u5B9A\uFF1A\u8C03\u7528\u89C6\u9891/\u97F3\u4E50/\u4E91 TTS \u524D\u5FC5\u987B\u5148\u67E5\uFF09\u3002\u53EA\u8FD4\u56DE"\u5FC5\u586B\u51ED\u8BC1\u9F50\u5168"\u7684 provider\uFF0C\u4E0D\u66B4\u9732 Key\u3002',
      parameters: {
        group: sr("\u6A21\u578B\u5206\u7EC4\uFF0C\u5982 video / music / tts"),
        "env-file": s("\u663E\u5F0F\u6307\u5B9A .env \u8DEF\u5F84\uFF1B\u9ED8\u8BA4\u9879\u76EE\u6839 .env")
      },
      script: "skills/shared/scripts/model_registry.py",
      subcommand: () => "configured",
      passthrough: ["group", "env-file"],
      summary: () => "\u5DF2\u8FD4\u56DE\u53EF\u7528\u7684 provider \u5217\u8868\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_persona_gate",
      description: "\u4EBA\u8BBE\u4E00\u81F4\u6027\u95E8\u7981\uFF08AGENTS.md \u89C4\u5B9A\u53D1\u5E03\u524D\u5FC5\u505A\uFF09\uFF1Aaction=check \u7528\u8BC4\u5206\u5224\u5B9A pass/warn\uFF1Baction=record \u8BB0\u5F55\u7559\u75D5\u3002\u6CE8\u610F\uFF1A\u53EA\u63D0\u9192\u3001\u4E0D\u963B\u65AD\u53D1\u5E03\uFF0C\u5185\u5BB9\u5B89\u5168\u786C\u95E8\u7981\u72EC\u7ACB\u751F\u6548\u3002",
      parameters: {
        action: e(["check", "record"], "\u5B50\u547D\u4EE4", true),
        score: n("check\uFF1A\u4EBA\u8BBE\u8BC4\u5206\uFF080-100\uFF0C80 \u53CA\u4EE5\u4E0A\u4E3A pass\uFF09"),
        topic: s("record\uFF1A\u4E3B\u9898"),
        profile: s("record\uFF1A\u753B\u50CF\u540D"),
        verdict: s("record\uFF1A\u7ED3\u8BBA"),
        deviations: s("record\uFF1A\u504F\u79BB\u70B9")
      },
      script: "skills/shared/scripts/persona_gate.py",
      subcommand: (a) => String(a.action ?? "check"),
      passthrough: ["score", "topic", "profile", "verdict", "deviations"],
      summary: () => "\u4EBA\u8BBE\u4E00\u81F4\u6027\u68C0\u67E5\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_content_guard",
      description: "\u53D1\u5E03\u524D\u654F\u611F\u4FE1\u606F\u626B\u63CF\uFF08AGENTS.md \u89C4\u5B9A\u7684\u786C\u95E8\u7981\uFF09\uFF1A\u626B\u63CF\u6587\u6848\u4E2D\u7684 API Key\u3001\u5185\u90E8 URL\u3001\u4EE3\u7406\u3001\u5185\u90E8\u7EDD\u5BF9\u8DEF\u5F84\u7B49\u3002\u547D\u4E2D\u4F1A\u4EE5\u9000\u51FA\u7801 7 \u7ED3\u675F\uFF0C\u5C5E\u4E8E\u9884\u671F\u7684\u62E6\u622A\u800C\u975E\u811A\u672C\u6545\u969C\u3002",
      parameters: {
        action: e(["scan", "dry-run", "list"], "\u5B50\u547D\u4EE4", true),
        text: s("\u5F85\u626B\u63CF\u6587\u672C\uFF08\u4E5F\u53EF\u7528 file \u6307\u5B9A\u6587\u4EF6\uFF09"),
        file: s("\u5F85\u626B\u63CF\u6587\u4EF6\u8DEF\u5F84")
      },
      script: "skills/shared/scripts/content_guard.py",
      subcommand: (a) => String(a.action ?? "scan"),
      passthrough: ["text", "file"],
      summary: () => "\u654F\u611F\u4FE1\u606F\u626B\u63CF\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_publish_log",
      description: "\u53D1\u5E03\u7559\u75D5\uFF08AGENTS.md \u89C4\u5B9A\u7684\u53D1\u5E03\u540E\u52A8\u4F5C\uFF09\uFF1A\u8BB0\u5F55\u5E73\u53F0\u3001\u6807\u9898\u3001\u753B\u50CF\u4E0E\u4EBA\u8BBE\u68C0\u67E5\u7ED3\u8BBA\u3002",
      parameters: {
        platform: sr("\u5E73\u53F0"),
        title: s("\u6807\u9898"),
        profile: s("\u753B\u50CF\u540D"),
        "persona-score": n("\u4EBA\u8BBE\u8BC4\u5206"),
        "persona-verdict": s("\u4EBA\u8BBE\u7ED3\u8BBA")
      },
      script: "skills/openclaw/skill-publish-log/scripts/log.py",
      subcommand: () => "record",
      passthrough: ["platform", "title", "profile", "persona-score", "persona-verdict"],
      summary: () => "\u53D1\u5E03\u8BB0\u5F55\u5DF2\u5199\u5165\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_news",
      description: "\u884C\u4E1A\u8D44\u8BAF\u805A\u5408\uFF08skill-news-intelligence \u7684\u811A\u672C\uFF09\uFF1Aaction=fetch \u6293\u53D6\u8D44\u8BAF\u6E90\uFF1Baction=briefing \u751F\u6210\u65E5\u62A5\u3002\u6CE8\u610F\u4E0E\u70ED\u70B9\u6280\u80FD skill-trending-topics \u7684\u533A\u522B\u2014\u2014\u540E\u8005\u662F\u5206\u949F\u7EA7\u70ED\u641C\u3001\u7EAF\u6D41\u7A0B\u6280\u80FD\uFF08\u7528 zmtgzt_skill \u8BFB\u53D6\u540E\u6309\u6D41\u7A0B\u6267\u884C\uFF09\u3002",
      parameters: {
        action: e(["fetch", "briefing"], "\u5B50\u547D\u4EE4", true),
        source: s("\u8D44\u8BAF\u6E90\u6216\u5173\u952E\u8BCD"),
        days: n("\u56DE\u770B\u5929\u6570")
      },
      script: (a) => String(a.action) === "briefing" ? "skills/openclaw/skill-news-intelligence/scripts/daily_briefing.py" : "skills/openclaw/skill-news-intelligence/scripts/fetch_news.py",
      passthrough: ["source", "days"],
      summary: () => "\u8D44\u8BAF\u4EFB\u52A1\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_card_audit",
      description: "\u5361\u7247\u6E32\u67D3\u540E\u7684\u81EA\u68C0\uFF08card-design \u89C4\u5B9A\u7684\u7B2C\u4E94\u6B65\uFF09\uFF1A\u68C0\u67E5\u6E32\u67D3\u7ED3\u679C\u662F\u5426\u8FBE\u6807\u3002",
      parameters: {
        path: sr("\u5F85\u5BA1\u8BA1\u7684\u5361\u7247\u6587\u4EF6\u6216\u76EE\u5F55\u8DEF\u5F84"),
        style: s("\u4F7F\u7528\u7684\u98CE\u683C\u540D")
      },
      script: "skills/openclaw/card-design/scripts/card_audit.py",
      passthrough: ["path", "style"],
      summary: () => "\u5361\u7247\u5BA1\u8BA1\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_novel_ops",
      description: '\u5C0F\u8BF4\u8FDE\u8F7D\u7684\u786E\u5B9A\u6027 IO\uFF08novel-writer \u7684\u6280\u80FD\u89C4\u5B9A"\u6587\u4EF6\u5373\u771F\u76F8"\uFF09\uFF1A\u7ACB\u9879\u642D\u9AA8\u67B6\u3001\u8FDB\u5EA6\u7BA1\u7406\u3001AI \u5473\u68C0\u67E5\u7B49\u3002\u521B\u610F\u5199\u4F5C\u672C\u8EAB\u7531\u4F60\u6309 SKILL.md \u5B8C\u6210\uFF0C\u4E0D\u8D70\u811A\u672C\u3002',
      parameters: {
        action: sr("\u5B50\u547D\u4EE4\uFF0C\u53D6\u503C\u4EE5\u811A\u672C --help \u4E3A\u51C6\uFF08\u5982 init / status / check\uFF09"),
        title: s("\u4E66\u540D"),
        topic: s("\u4E3B\u9898\u540D"),
        chapter: n("\u7AE0\u8282\u53F7")
      },
      script: "skills/openclaw/novel-writer/scripts/novel_ops.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["title", "topic", "chapter"],
      summary: () => "\u5C0F\u8BF4\u5DE5\u7A0B\u64CD\u4F5C\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_paper_ingest",
      description: "\u8BBA\u6587\u6293\u53D6\u4E0E\u89E3\u6790\uFF08paper-explainer\uFF09\uFF1A\u62C9\u53D6\u539F\u6587\u3001\u89E3\u6790 PDF\u3001\u4EA7\u51FA\u53EF\u590D\u7528\u7684 asset library\u3002\u89E3\u6790\u53EA\u505A\u4E00\u6B21\uFF0C\u89C6\u9891\u4E0E\u56FE\u6587\u4E24\u6761\u4EA7\u7EBF\u5171\u7528\u3002",
      parameters: {
        source: sr("arXiv \u94FE\u63A5\u3001DOI \u6216\u672C\u5730 PDF \u8DEF\u5F84"),
        topic: s("\u4E3B\u9898\u540D"),
        action: s("\u5B50\u547D\u4EE4\uFF0C\u53D6\u503C\u4EE5\u811A\u672C --help \u4E3A\u51C6")
      },
      script: "skills/openclaw/paper-explainer/scripts/paper_ingest.py",
      subcommand: (a) => a.action ? String(a.action) : void 0,
      passthrough: ["source", "topic"],
      summary: () => "\u8BBA\u6587\u89E3\u6790\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_data_report",
      description: "\u628A\u6570\u636E\u6587\u4EF6\u751F\u6210\u53EF\u89C6\u5316\u62A5\u544A\u9875\uFF08data-report\uFF09\u3002",
      parameters: {
        input: sr("\u6570\u636E\u6587\u4EF6\u8DEF\u5F84\uFF08CSV / Excel / JSON\uFF09"),
        topic: s("\u4E3B\u9898\u540D"),
        title: s("\u62A5\u544A\u6807\u9898")
      },
      script: "skills/openclaw/data-report/scripts/report.py",
      passthrough: ["input", "topic", "title"],
      summary: () => "\u62A5\u544A\u9875\u5DF2\u751F\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_assemble_video",
      description: "\u77ED\u89C6\u9891\u5408\u6210\u5408\u6D41\u70B9\uFF08auto-short-video \u7684\u6280\u80FD\u89C4\u5B9A\u5408\u6210\u524D\u786C\u62E6\u622A\u53EA\u6709 frame \u6CA1\u6709 clip \u7684\u955C\u5934\uFF09\u3002",
      parameters: {
        topic: sr("\u4E3B\u9898\u540D"),
        action: s("\u5B50\u547D\u4EE4\uFF0C\u53D6\u503C\u4EE5\u811A\u672C --help \u4E3A\u51C6"),
        storyboard: s("\u5206\u955C\u6587\u4EF6\u8DEF\u5F84")
      },
      script: "skills/openclaw/auto-short-video/scripts/assemble.py",
      subcommand: (a) => a.action ? String(a.action) : void 0,
      passthrough: ["topic", "storyboard"],
      summary: () => "\u89C6\u9891\u5408\u6210\u4EFB\u52A1\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_drama_ops",
      description: "\u77ED\u5267\u8D44\u4EA7 / \u5206\u955C / \u8FDB\u5EA6\u7BA1\u7406\uFF08short-drama\uFF09\u3002",
      parameters: {
        action: sr("\u5B50\u547D\u4EE4\uFF0C\u53D6\u503C\u4EE5\u811A\u672C --help \u4E3A\u51C6"),
        topic: s("\u4E3B\u9898\u540D"),
        episode: n("\u96C6\u53F7")
      },
      script: "skills/openclaw/short-drama/scripts/drama_ops.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["topic", "episode"],
      summary: () => "\u77ED\u5267\u5DE5\u7A0B\u64CD\u4F5C\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_dubbing",
      description: "\u77ED\u5267\u591A\u89D2\u8272\u914D\u97F3\uFF08short-drama \u89C4\u5B9A\u914D\u97F3\u5FC5\u987B\u7528\u4E91 provider\uFF0Cedge \u515C\u5E95\u4F1A\u88AB\u786C\u62E6\u622A\uFF09\u3002",
      parameters: {
        topic: sr("\u4E3B\u9898\u540D"),
        episode: n("\u96C6\u53F7"),
        dialogue: s("\u5BF9\u767D\u6587\u4EF6\u8DEF\u5F84")
      },
      script: "skills/openclaw/short-drama/scripts/dubbing.py",
      passthrough: ["topic", "episode", "dialogue"],
      summary: () => "\u591A\u89D2\u8272\u914D\u97F3\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_performance_review",
      description: "\u53D1\u5E03\u540E\u590D\u76D8\uFF08skill-social-performance-review\uFF09\u3002",
      parameters: {
        topic: s("\u4E3B\u9898\u540D"),
        platform: s("\u5E73\u53F0"),
        window: s("\u7EDF\u8BA1\u7A97\u53E3")
      },
      script: "skills/openclaw/skill-social-performance-review/scripts/review.py",
      passthrough: ["topic", "platform", "window"],
      summary: () => "\u590D\u76D8\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_publish_analytics",
      description: "\u53D1\u5E03\u6570\u636E\u5206\u6790\u4E0E\u7C89\u4E1D\u8BB0\u5F55\uFF08skill-publish-analytics\uFF09\u3002",
      parameters: {
        platform: s("\u5E73\u53F0"),
        window: s("\u7EDF\u8BA1\u7A97\u53E3")
      },
      script: "skills/openclaw/skill-publish-analytics/scripts/analyze.py",
      passthrough: ["platform", "window"],
      summary: () => "\u6570\u636E\u5206\u6790\u5B8C\u6210\u3002"
    }),
    scriptTool(deps, {
      name: "zmtgzt_assets",
      description: "\u7D20\u6750\u5E93\u7BA1\u7406\uFF08asset-manager\uFF09\uFF1A\u767B\u8BB0\u4E0E\u68C0\u7D22 assets/ \u4E0B\u7684\u7528\u6237\u7D20\u6750\u3002",
      parameters: {
        action: sr("\u5B50\u547D\u4EE4\uFF0C\u53D6\u503C\u4EE5\u811A\u672C --help \u4E3A\u51C6"),
        topic: s("\u4E3B\u9898\u540D"),
        path: s("\u7D20\u6750\u8DEF\u5F84")
      },
      script: "skills/openclaw/asset-manager/scripts/assets.py",
      subcommand: (a) => String(a.action ?? ""),
      passthrough: ["topic", "path"],
      summary: () => "\u7D20\u6750\u5E93\u64CD\u4F5C\u5B8C\u6210\u3002"
    }),
    // -----------------------------------------------------------------------
    // 4. 仓库状态：画像与产物
    // -----------------------------------------------------------------------
    defineTool({
      name: "zmtgzt_profile",
      description: "\u8BFB\u5199\u8D26\u53F7\u753B\u50CF\uFF08Easel \u7684 profiles/<\u753B\u50CF>/\uFF0C\u516D\u7EF4\u5404\u4E00\u4E2A md\uFF1Aidentity / style / audience / platforms / preferences / memory\uFF09\u3002action=list \u5217\u51FA\u5168\u90E8\u753B\u50CF\uFF1Baction=read \u8BFB\u4E00\u4E2A\u753B\u50CF\u7684\u5168\u90E8\u7EF4\u5EA6\uFF1Baction=write \u589E\u91CF\u5199\u4E00\u4E2A\u7EF4\u5EA6\u3002\u6309 AGENTS.md\uFF1A\u505A\u5185\u5BB9\u524D\u5148\u8BFB\u753B\u50CF\uFF0C\u4E0D\u8981\u51ED\u5BF9\u8BDD\u731C\u8D26\u53F7\u5B9A\u4F4D\u3002",
      parameters: {
        action: e(["list", "read", "write"], "\u64CD\u4F5C\u7C7B\u578B", true),
        name: s("\u753B\u50CF\u540D\uFF08read / write \u65F6\u5FC5\u586B\uFF09"),
        file: e(
          ["identity", "style", "audience", "platforms", "preferences", "memory"],
          "write \u65F6\u5FC5\u586B\uFF1A\u8981\u5199\u7684\u7EF4\u5EA6"
        ),
        content: s("write \u65F6\u7684\u6B63\u6587\u5185\u5BB9")
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const a = args ?? {};
        const action = String(a.action ?? "list");
        const root = deps.repo.rootDir;
        if (!root) return notConfigured("\u8BFB\u5199\u753B\u50CF");
        const dir = join4(root, "profiles");
        if (action === "list") {
          const names = await listDirs(dir);
          return { ok: true, root: dir, profiles: names.filter((n2) => !n2.startsWith("_")) };
        }
        const name2 = String(a.name ?? "").trim();
        if (!name2) return { ok: false, error: "\u8BE5\u64CD\u4F5C\u9700\u8981 name" };
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
              error: `\u753B\u50CF\u4E0D\u5B58\u5728\u6216\u4E3A\u7A7A\uFF1A${name2}`,
              hint: `Easel \u7684\u753B\u50CF\u6A21\u677F\u5728 profiles/_template/\uFF0C\u53EF\u5148\u53C2\u7167\u5B83\u521B\u5EFA\u3002`
            };
          }
          return { ok: true, name: name2, dir: `${dir}/${name2}`, dimensions: files };
        }
        const file = String(a.file ?? "").trim();
        const content = String(a.content ?? "");
        if (!file) return { ok: false, error: "write \u9700\u8981 file\uFF08\u7EF4\u5EA6\u540D\uFF09" };
        if (!content.trim()) return { ok: false, error: "write \u9700\u8981 content" };
        const written = await writeText(`${dir}/${name2}/${file}.md`, content);
        if (!written) {
          return {
            ok: false,
            error: "\u5199\u5165\u5931\u8D25",
            hint: "\u753B\u50CF\u5E94\u4F4D\u4E8E Easel \u4ED3\u5E93\u7684 profiles/ \u4E0B\uFF1B\u8BF7\u786E\u8BA4\u8BE5\u76EE\u5F55\u53EF\u5199\u3002"
          };
        }
        return { ok: true, name: name2, file, path: `${dir}/${name2}/${file}.md` };
      }
    }),
    defineTool({
      name: "zmtgzt_artifact",
      description: "\u67E5\u770B\u4EA7\u7269\u72B6\u6001\uFF1Aaction=list \u5217\u51FA outputs/ \u4E0B\u5168\u90E8\u9879\u76EE\uFF1Baction=read \u8BFB\u67D0\u9879\u76EE\u7684 manifest \u4E0E\u4EA7\u7269\u76EE\u5F55\u6811\u3002manifest \u7531 zmtgzt_manifest \u5199\u5165\uFF0C\u662F\u8DE8\u6280\u80FD\u4F20\u9012\u7684\u771F\u76F8\u6765\u6E90\u3002",
      parameters: {
        action: e(["list", "read"], "\u64CD\u4F5C\u7C7B\u578B", true),
        topic: s("\u4E3B\u9898\u540D\uFF08read \u65F6\u5FC5\u586B\uFF09")
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: stringify(value) }]
      },
      async execute(args) {
        const a = args ?? {};
        const action = String(a.action ?? "list");
        const root = deps.repo.rootDir;
        if (!root) return notConfigured("\u67E5\u770B\u4EA7\u7269");
        const outputs = join4(root, "outputs");
        if (action === "list") {
          const names = await listDirs(outputs);
          return { ok: true, root: outputs, projects: names };
        }
        const topic = String(a.topic ?? "").trim();
        if (!topic) return { ok: false, error: "read \u9700\u8981 topic" };
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
      description: "\u63D2\u4EF6\u4E0E\u73AF\u5883\u4F53\u68C0\uFF1A\u68C0\u67E5 Easel \u6839\u76EE\u5F55\u3001SOUL.md / AGENTS.md\u3001\u6280\u80FD\u76EE\u5F55\u3001Python \u89E3\u91CA\u5668\u3001.env \u4E0E\u5171\u4EAB\u811A\u672C\uFF0C\u5E76\u7ED9\u51FA\u9010\u9879\u4FEE\u590D\u6307\u5F15\u3002\u8C03\u7528\u5176\u5B83 zmtgzt_* \u5DE5\u5177\u524D\u4E0D\u786E\u5B9A\u73AF\u5883\u662F\u5426\u5C31\u7EEA\u65F6\u5148\u8DD1\u8FD9\u4E2A\u3002",
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
    error: `\u751F\u6548\u7684 Easel \u6839\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5${what}\u3002`,
    hint: "\u63D2\u4EF6\u968F\u5305\u81EA\u5E26 Easel \u5FEB\u7167\uFF0C\u6B63\u5E38\u5B89\u88C5\u5E94\u5F53\u5DF2\u81EA\u52A8\u91CA\u653E\u3002\u8BF7\u8FD0\u884C zmtgzt_doctor \u67E5\u770B\u5177\u4F53\u539F\u56E0\uFF1B\u82E5\u60F3\u6539\u7528\u81EA\u5907\u4ED3\u5E93\uFF0C\u8BBE\u7F6E config.easelRoot\u3002"
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
  lines.push(value?.healthy === true ? "\u73AF\u5883\u5C31\u7EEA\uFF0C\u53EF\u4EE5\u8C03\u7528\u811A\u672C\u7C7B\u5DE5\u5177\u3002" : "\u73AF\u5883\u5C1A\u672A\u5C31\u7EEA\u3002");
  const checks = Array.isArray(value?.checks) ? value.checks : [];
  for (const check of checks) {
    lines.push(`- ${check.ok === true ? "OK" : "NG"} ${String(check.name)}${check.detail ? `\uFF1A${String(check.detail)}` : ""}`);
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
var USER_DATA = /* @__PURE__ */ new Set([".env", "outputs", "profiles", "assets"]);
function ensureWorkspace(config) {
  const warnings = [];
  if (config.easelRoot) {
    if (existsSync2(join5(config.easelRoot, "openclaw", "workspace", "AGENTS.md"))) {
      return { root: config.easelRoot, source: "configured", createdEnv: false, warnings };
    }
    warnings.push(
      `config.easelRoot \u6307\u5411\u7684\u76EE\u5F55\u7F3A\u5C11 openclaw/workspace/AGENTS.md\uFF1A${config.easelRoot}\uFF0C\u5DF2\u56DE\u9000\u5230\u5185\u7F6E\u5FEB\u7167\u3002`
    );
  }
  const embedded = config.embeddedRoot;
  const workspace = config.workspaceDir;
  if (!existsSync2(embedded)) {
    warnings.push(
      `\u5185\u7F6E Easel \u5FEB\u7167\u7F3A\u5931\uFF1A${embedded}\u3002\u8BF7\u91CD\u65B0\u5B89\u88C5\u63D2\u4EF6\uFF0C\u6216\u8FD0\u884C node scripts/sync-easel.mjs \u751F\u6210\u3002`
    );
    return { root: workspace, source: "embedded", createdEnv: false, warnings };
  }
  const embeddedInfo = readSyncInfo(embedded);
  const commit = embeddedInfo?.commit;
  if (!config.releaseEmbedded) {
    warnings.push("releaseEmbedded \u4E3A false\uFF1A\u76F4\u63A5\u4F7F\u7528\u53EA\u8BFB\u7684\u5185\u7F6E\u5FEB\u7167\uFF0C\u4EA7\u7269\u4E0E .env \u5C06\u65E0\u5904\u5B58\u653E\u3002");
    return { root: embedded, source: "embedded", commit, createdEnv: false, warnings };
  }
  try {
    const result = releaseSnapshot(embedded, workspace);
    const createdEnv = ensureEnvFile(workspace);
    return { root: workspace, source: "embedded", commit, release: result, createdEnv, warnings };
  } catch (error) {
    warnings.push(`\u91CA\u653E\u5185\u7F6E\u5FEB\u7167\u5931\u8D25\uFF08${String(error)}\uFF09\uFF0C\u672C\u6B21\u76F4\u63A5\u4F7F\u7528\u53EA\u8BFB\u5FEB\u7167\u3002`);
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
  if (!missingCore && embeddedCommit && embeddedCommit === workspaceCommit) {
    return { updated: false, reason: `\u5DF2\u662F\u6700\u65B0\uFF08${embeddedCommit.slice(0, 10)}\uFF09` };
  }
  const reason = missingCore ? "\u9996\u6B21\u91CA\u653E" : embeddedCommit !== workspaceCommit ? `\u66F4\u65B0 ${String(workspaceCommit).slice(0, 10)} \u2192 ${String(embeddedCommit).slice(0, 10)}` : "\u8865\u9F50\u7F3A\u5931\u5185\u5BB9";
  for (const entry of RELEASE_ENTRIES) {
    if (USER_DATA.has(entry)) continue;
    const src = join5(embedded, entry);
    if (!existsSync2(src)) continue;
    const dest = join5(workspace, entry);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
  return { updated: true, reason };
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

// src/index.ts
var name = PLUGIN_ID;
var inject = ["tools"];
var HEALTH_PATH = "/api/zmtgzt/health";
var API_PREFIX = "/api/zmtgzt";
var CONTRACT_SKILL = "zmtgzt";
var REQUIRED_PATHS = [
  { path: `${EASEL_WORKSPACE_DIR}/SOUL.md`, label: "SOUL.md\uFF08\u4EBA\u683C\u5C42\uFF09" },
  { path: `${EASEL_WORKSPACE_DIR}/AGENTS.md`, label: "AGENTS.md\uFF08\u7F16\u6392\u5C42\uFF09" },
  { path: EASEL_SKILLS_DIR, label: "\u6280\u80FD\u76EE\u5F55 skills/openclaw" },
  { path: EASEL_SHARED_DIR, label: "\u5171\u4EAB\u811A\u672C skills/shared/scripts" },
  { path: ".env", label: ".env\uFF08API key\uFF09" }
];
async function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const workspace = ensureWorkspace(config);
  const repo = new EaselRepo(workspace.root);
  const doctor = () => runDoctor(config, repo, workspace);
  ctx.provide("zmtgztRepo", repo);
  ctx.provide("zmtgztWorkspace", workspace);
  if (workspace.release?.updated) {
    ctx.logger?.info?.(`[${PLUGIN_ID}] \u5DF2\u91CA\u653E\u5185\u7F6E Easel \u5FEB\u7167\uFF08${workspace.release.reason}\uFF09\u2192 ${workspace.root}`);
  }
  if (workspace.createdEnv) {
    ctx.logger?.warn?.(
      `[${PLUGIN_ID}] \u5DF2\u4ECE .env.example \u751F\u6210 ${workspace.root}/.env \u2014\u2014 \u811A\u672C\u7C7B\u5DE5\u5177\u9700\u8981\u4F60\u586B\u5165 API key \u540E\u624D\u80FD\u5DE5\u4F5C\u3002`
    );
  }
  for (const warning of workspace.warnings) {
    ctx.logger?.warn?.(`[${PLUGIN_ID}] ${warning}`);
  }
  const tools = createTools({ config, repo, doctor });
  try {
    for (const tool of tools) ctx.tools.register(tool);
    ctx.logger?.info?.(`[${PLUGIN_ID}] \u6CE8\u518C ${tools.length} \u4E2A\u5DE5\u5177\uFF08v${PLUGIN_VERSION}\uFF09`);
  } catch (error) {
    ctx.logger?.error?.(`[${PLUGIN_ID}] \u5DE5\u5177\u6CE8\u518C\u5931\u8D25\uFF1A${String(error)}`);
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
            description: "Easel \u7F16\u6392\u5951\u7EA6\uFF1AEasel \u4ED3\u5E93\u4E2D SOUL.md\uFF08\u4EBA\u683C\uFF09\u4E0E AGENTS.md\uFF08\u4E94\u5C42\u5206\u5DE5\u3001Plan Mode\u3001\u7EB5\u5411\u7F16\u6392\u3001\u53D1\u5E03\u5B89\u5168\u95E8\u7981\uFF09\u7684\u539F\u6587\uFF0C\u5916\u52A0\u672C\u63D2\u4EF6\u7684\u63A5\u5165\u8BF4\u660E\u3002\u505A\u4EFB\u4F55\u793E\u5A92\u5185\u5BB9\u4EFB\u52A1\u524D\u5148\u52A0\u8F7D\u3002",
            whenToUse: "\u7528\u6237\u8981\u505A\u793E\u5A92\u5185\u5BB9\uFF08\u627E\u70ED\u70B9\u3001\u5B9A\u7B56\u7565\u3001\u505A\u56FE\u6587/\u89C6\u9891/\u5C0F\u8BF4/\u77ED\u5267/\u8BBA\u6587\u89E3\u8BFB\u3001\u53D1\u5E03\u3001\u590D\u76D8\uFF09\u65F6\u4F7F\u7528\u3002",
            source: "runtime",
            provider: PLUGIN_ID,
            content: contract.content
          });
          registered += 1;
          ctx.logger?.info?.(
            `[${PLUGIN_ID}] \u5DF2\u6CE8\u5165\u7F16\u6392\u5951\u7EA6\uFF08SOUL=${contract.hasSoul} AGENTS=${contract.hasAgents}\uFF09`
          );
        } catch (error) {
          ctx.logger?.warn?.(`[${PLUGIN_ID}] \u5951\u7EA6\u6CE8\u518C\u5931\u8D25\uFF1A${String(error)}`);
        }
      }
      for (const meta of skills) {
        try {
          const reg = skillRegistrationOf(meta);
          skillCtx.skills.register({ ...reg, source: "runtime", provider: PLUGIN_ID, content: "" });
          registered += 1;
        } catch (error) {
          ctx.logger?.warn?.(`[${PLUGIN_ID}] \u6280\u80FD ${meta.name} \u6CE8\u518C\u8DF3\u8FC7\uFF1A${String(error)}`);
        }
      }
      ctx.logger?.info?.(`[${PLUGIN_ID}] \u6CE8\u518C ${registered} \u4E2A\u6280\u80FD\uFF08Easel \u6280\u80FD ${skills.length} \u4E2A\uFF09`);
    });
  }
  ctx.inject(["webServer"], (webCtx) => {
    const webServer = webCtx.webServer;
    if (!webServer?.register) {
      ctx.logger?.warn?.(`[${PLUGIN_ID}] ctx.webServer \u4E0D\u53EF\u7528\uFF08headless profile\uFF1F\uFF09\uFF0C\u8DF3\u8FC7 HTTP \u8DEF\u7531`);
      return;
    }
    registerRoutes(webServer, config, repo, doctor);
    ctx.logger?.info?.(`[${PLUGIN_ID}] \u8DEF\u7531\u5DF2\u6CE8\u518C\uFF1A${API_PREFIX}/*`);
  });
}
async function runDoctor(config, repo, workspace) {
  const checks = [];
  checks.push({
    name: "\u751F\u6548\u7684 Easel \u6839\u76EE\u5F55",
    ok: Boolean(workspace.root),
    detail: `${workspace.root}\uFF08${workspace.source === "configured" ? "\u81EA\u5907\u4ED3\u5E93" : "\u5185\u7F6E\u5FEB\u7167"}\uFF09`
  });
  if (workspace.source === "embedded") {
    checks.push({
      name: "\u5185\u7F6E\u5FEB\u7167\u7248\u672C",
      ok: Boolean(workspace.commit),
      detail: workspace.commit ? `${workspace.commit.slice(0, 10)}${workspace.release?.reason ? ` \xB7 ${workspace.release.reason}` : ""}` : "\u672A\u627E\u5230 SYNC-INFO.json\uFF08\u65E0\u6CD5\u786E\u8BA4\u4E0A\u6E38\u7248\u672C\uFF09"
    });
  }
  for (const item of REQUIRED_PATHS) {
    const ok = await repo.has(item.path);
    checks.push({ name: item.label, ok, detail: ok ? void 0 : `\u7F3A\u5931\uFF1A${item.path}` });
  }
  const python = await probePython(config.pythonPath);
  checks.push({ name: `Python \u53EF\u7528\uFF08${config.pythonPath}\uFF09`, ok: python.ok, detail: python.detail });
  const skills = await repo.listSkills();
  checks.push({
    name: "Easel \u6280\u80FD\u53EF\u626B\u63CF",
    ok: skills.length > 0,
    detail: skills.length ? `\u53D1\u73B0 ${skills.length} \u4E2A\u6280\u80FD\uFF0C\u5C42\uFF1A${[...new Set(skills.map((s2) => s2.layer ?? "?"))].sort().join("/")}` : `\u672A\u5728 ${EASEL_SKILLS_DIR} \u4E0B\u53D1\u73B0 SKILL.md`
  });
  const sharedScripts = await repo.listSharedScripts();
  checks.push({
    name: "\u5171\u4EAB\u811A\u672C\u53EF\u679A\u4E3E",
    ok: sharedScripts.length > 0,
    detail: sharedScripts.length ? `${sharedScripts.length} \u4E2A\u811A\u672C` : "\u672A\u53D1\u73B0 .py \u811A\u672C"
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
    hint: failed.length === 0 ? "\u73AF\u5883\u5C31\u7EEA\u3002\u53EF\u4EE5\u5148 zmtgzt_skill\uFF08action=list\uFF09\u770B\u6280\u80FD\uFF0C\u518D\u6309\u4EFB\u52A1 read \u5BF9\u5E94\u6280\u80FD\u3002" : [
      "\u4EE5\u4E0B\u9879\u672A\u901A\u8FC7\uFF0C\u9010\u9879\u4FEE\u590D\u540E\u91CD\u8DD1 zmtgzt_doctor\uFF1A",
      ...failed.map((c) => `- ${c.name}${c.detail ? `\uFF1A${c.detail}` : ""}`),
      "",
      workspace.source === "embedded" ? `\u5951\u7EA6\u4E0E\u6280\u80FD\u6765\u81EA\u5185\u7F6E\u5FEB\u7167\uFF08\u5DF2\u91CA\u653E\u5230 ${config.workspaceDir}\uFF09\uFF0C\u65E0\u9700 clone Easel\u3002` : `\u5F53\u524D\u4F7F\u7528\u81EA\u5907\u4ED3\u5E93\uFF1A${workspace.root}`,
      envMissing ? `\u811A\u672C\u7C7B\u5DE5\u5177\u9700\u8981 API key\uFF1A\u7F16\u8F91 ${workspace.root}/.env \u586B\u5165\u540E\u5373\u53EF\u3002
\u4E0D\u586B\u4E5F\u80FD\u7528\u6280\u80FD\u4E0E\u5951\u7EA6\uFF08\u7EAF\u6587\u5B57\u7C7B\u5DE5\u4F5C\u4E0D\u53D7\u5F71\u54CD\uFF09\u3002` : "",
      "Python \u89E3\u91CA\u5668\u53EF\u7528 config.pythonPath \u8986\u76D6\uFF08Windows \u5E38\u89C1\u4E3A py \u6216\u89E3\u91CA\u5668\u7EDD\u5BF9\u8DEF\u5F84\uFF09\u3002",
      "\u60F3\u6362\u6210\u81EA\u5907\u4ED3\u5E93\u6216\u8DDF\u8FDB\u6700\u65B0\u4E0A\u6E38\uFF1A\u8BBE\u7F6E config.easelRoot\uFF0C\u6216\u8FD0\u884C node scripts/sync-easel.mjs \u66F4\u65B0\u5185\u7F6E\u5FEB\u7167\u3002"
    ].filter(Boolean).join("\n")
  };
}
function probePython(pythonPath) {
  return new Promise((resolvePromise) => {
    execFile2(pythonPath, ["--version"], { timeout: 15e3, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ ok: false, detail: `${error.message}\uFF08\u53EF\u7528 config.pythonPath \u6307\u5B9A\u89E3\u91CA\u5668\uFF09` });
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
function registerRoutes(webServer, config, repo, doctor) {
  const root = config.easelRoot;
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
          json(res, 200, { ok: false, error: "easelRoot \u672A\u914D\u7F6E", profiles: [] });
          return;
        }
        const dir = `${root}/profiles`;
        if (req.method === "GET") {
          const { readdir: readdir3 } = await import("node:fs/promises");
          const names = await readdir3(dir, { withFileTypes: true }).then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort()).catch(() => []);
          json(res, 200, { ok: true, root: dir, profiles: names.filter((n2) => !n2.startsWith("_")) });
          return;
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const name2 = String(body.name ?? "").trim();
          const file = String(body.file ?? "").trim();
          const content = String(body.content ?? "");
          if (!name2 || !file) {
            json(res, 400, { ok: false, error: "name \u4E0E file \u4E3A\u5FC5\u586B" });
            return;
          }
          const { mkdir: mkdir2, writeFile: writeFile2 } = await import("node:fs/promises");
          const target = `${dir}/${name2}/${file}.md`;
          await mkdir2(`${dir}/${name2}`, { recursive: true });
          await writeFile2(target, content, "utf8");
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
          json(res, 400, { ok: false, error: "name \u5FC5\u586B" });
          return;
        }
        const { readFile: readFile3 } = await import("node:fs/promises");
        const dims = ["identity", "style", "audience", "platforms", "preferences", "memory"];
        const files = {};
        for (const dim of dims) {
          const text = await readFile3(`${root}/profiles/${name2}/${dim}.md`, "utf8").catch(() => void 0);
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
        const { readdir: readdir3 } = await import("node:fs/promises");
        const names = await readdir3(`${root}/outputs`, { withFileTypes: true }).then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort()).catch(() => []);
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
          json(res, 200, { ok: false, error: "easelRoot \u672A\u914D\u7F6E" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const topic = url.searchParams.get("topic") ?? "";
        if (!topic) {
          json(res, 400, { ok: false, error: "topic \u5FC5\u586B" });
          return;
        }
        const { readFile: readFile3, readdir: readdir3 } = await import("node:fs/promises");
        const dir = `${root}/outputs/${topic}`;
        let manifest = null;
        const raw = await readFile3(`${dir}/manifest.json`, "utf8").catch(() => void 0);
        if (raw) {
          try {
            manifest = JSON.parse(raw);
          } catch {
            manifest = { parseError: true };
          }
        }
        const entries = await readdir3(dir, { withFileTypes: true }).then((xs) => xs.map((x) => ({ name: x.name, isDir: x.isDirectory() }))).catch(() => []);
        json(res, 200, { ok: true, topic, dir, manifest, entries });
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
