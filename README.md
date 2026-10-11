# dsh-zmtgzt

A DeepSeek Harness (dsh) plugin that runs the [Easel](https://github.com/ZJU-REAL/Easel) social-content agent inside dsh.

**Install and go — no Easel clone required.** The plugin ships an Easel snapshot (114 skills, the contract, 147 scripts) and releases it to a writable directory on first start. The plugin authors none of that content itself: the snapshot is synced from upstream by `scripts/sync-easel.mjs`.

- **Contract injection** — `openclaw/workspace/SOUL.md` and `AGENTS.md` are injected verbatim as a runtime skill
- **Skill registration** — every `skills/openclaw/<name>/SKILL.md` is scanned and registered as a dsh skill, loaded on demand
- **24 `zmtgzt_*` tools** — skill reading, script execution, **publishing**, and the manifest / profile / artifact surfaces
- **A "自媒体工作台" (Creator Workbench) entry in the left nav**, beside the built-in "Plugins" row: overview / accounts / profiles / topics / publishing / environment check

## Install

```sh
dsh plugin add dsh-zmtgzt
```

That's it. On first start the plugin releases the bundled snapshot to `~/.dsh/zmtgzt/easel/` (configurable) and generates a `.env` from `.env.example` — fill it in when you want the script-backed tools to work.

To use your own checkout instead (e.g. to track upstream closely), set `easelRoot`:

```yaml
# in your dsh profile config
- insert:
    - id: dsh-zmtgzt
      name: dsh-zmtgzt
      config:
        easelRoot: /absolute/path/to/Easel   # optional; overrides the bundled snapshot
```

Then run `zmtgzt_doctor` to confirm.

## Creator Workbench

The plugin registers a **sidebar** entry named「自媒体工作台」(Creator Workbench) — it no longer takes a
conversation tab. Clicking it opens the workbench panel, organized as in-panel sub-navigation:

| Sub-page | Purpose |
| --- | --- |
| Overview | Environment status, effective root, shortcuts |
| Accounts | QR login / logout and login state for WeChat MP and Xiaohongshu |
| Profiles | CRUD for the six profile dimensions (written to `profiles/<name>/*.md`) |
| Topics | Create / delete topics, **bind a topic to the current session**, browse artifacts and manifest |
| Doctor | Effective root and its source, actual contract paths, skill and script availability |

### Topics and session binding

A topic maps to `outputs/<topic-name>/`. Bind a topic to a session from the workbench and that session
defaults to the topic's artifact directory. Bindings persist in `~/.dsh/dsh-zmtgzt/bindings.json`,
so they survive a restart.

Topic names must be human-readable: generic names like `test`, `tmp` or `xhs` are rejected
(rules mirror Easel's `output_paths.py` rather than inventing a second convention).

### Contract files now live at the workspace root

On first release, `SOUL.md` and `AGENTS.md` are additionally copied to the **workspace root**
(`~/.dsh/dsh-zmtgzt/easel/`) so you can see and edit them directly. Contract injection reads the root
copy first, falling back to `openclaw/workspace/` only when it's absent.

Your edits to the root copy are **never overwritten** by snapshot updates. The Doctor page shows
exactly which copy is in effect.

### Channel support status

| Channel | Login / account | Publishing | Basis |
| --- | --- | --- | --- |
| WeChat MP | ✅ two ways | ✅ | `weixin_mp_stats.py` provides `login` / `whoami` / `stats` / `publish`; plus an official-API path, below |
| Xiaohongshu | ✅ | ✅ | `xhs_publish.py` provides `login` / `whoami` / `publish` |
| Toutiao | ❌ | ❌ | Neither `web_publisher.py` nor `account_stats.py` lists `toutiao` in `PLATFORMS` |

Toutiao isn't "coming later" — there is **no working implementation upstream**. The only script
mentioning it, `multi_publish.py`, is marked unavailable by its own SKILL and depends on a Wechatsync
extension. So the workbench renders no buttons for it, just the reason. If you supply your own script,
declare it via `extraChannels` — no plugin changes needed.

Publishing always passes through the existing gates: `content_guard.py` sensitive-content scan (hard
block) and `persona_gate.py` persona check (advisory only). The plugin exposes **no bypass switch**.

### WeChat MP: pick either login route

| Route | What it needs | Best for |
| --- | --- | --- |
| **Scan to log in (backend session)** | A phone that can scan | Default. No AppID/AppSecret, no IP allowlist |
| **Official API credentials** | AppID + AppSecret, plus this machine's egress IP added to the MP allowlist | Unattended/automated use, or no browser session |

The second is entered on the MP card in the Accounts page and is verified against WeChat's
`cgi-bin/token` before saving. Credentials go to the one path upstream recognises,
`skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml`, written with a **line-level patch**
and a `.bak` backup — so your other accounts, other top-level keys such as `image_generation`, and
your comments are all left alone.

Verification failures are reported per error code: `40001`/`40002` mean bad credentials, while
**`40164` means "credentials are fine, the egress IP isn't allowlisted"** — conflating the two sends
you hunting through AppID/AppSecret for nothing.

> As per upstream convention, the AppSecret is stored in plain text in that YAML (standard practice
> for the WeChat official API). The plugin never returns it to the frontend, only a masked AppID.

### Troubleshooting login

When no QR code appears, check in this order:

1. **The UI runs an environment preflight first.** If Python / `playwright` / `opencv-python` /
   `Pillow` are missing, the plugin **does not start a doomed login process** — it lists the missing
   items with install commands.
   - Headless scanning needs `opencv-python` and `Pillow` to crop the QR code out of the page.
   - Prefer not to install them? Use **Window login**, which opens a real browser window for you to
     scan or confirm by SMS.
2. **Every login's script output is written to disk**: `<plugin data dir>/login/<channel>.log`,
   reachable via "View login log" in the UI. Upstream's script can exit before writing its first
   status — without the log you'd only ever see `unknown`.
3. The QR image is served from `/api/zmtgzt/account/login/qr` and **returns 404 when not yet
   generated**, so the UI never renders a broken image.

### Publishing

Both the workbench's **Publish** page and the `zmtgzt_publish` tool can publish. The flow is
fixed as **preflight → confirm → publish**: without the confirm flag it only dry-runs and has
no external effect.

| Platform | Artifact | Prerequisites |
| --- | --- | --- |
| Xiaohongshu · image | Public note (irreversible) | Logged in; title ≤ 20 (full-width count); at least one image |
| Xiaohongshu · video | Public note | Logged in; a video file |
| WeChat MP | **Draft** (you still publish it manually in the MP console) | Backend session logged in, or AppID/AppSecret with the egress IP allowlisted |

**The gates cannot be bypassed.** Upstream scripts run the pre-publish checks: Xiaohongshu scans
for leaked internal information (**hard block**), WeChat MP runs an AI-tone check (blocked at the
threshold). The plugin exposes **no** `--allow-unsafe` / `--skip-ai-score` escape hatch — if you
really need one, call the generic runner explicitly in the conversation and say why.

**Media is picked from topic artifacts.** The scripts verify that paths exist, so the Publish page
only lists real files under `outputs/<topic>/` rather than letting you type a path.

> ⚠ Automated posting to Xiaohongshu carries platform risk (rate limiting, account restrictions) —
> upstream's own SKILL warns about this. Start with a test account and low volume, and review the
> final content by hand. The plugin provides the capability but does not take on that risk for you.


## Tools

### Skill reading — the Easel skills, served from disk

| Tool | Purpose |
| --- | --- |
| `zmtgzt_skill` | `list` all skills (name, layer, blurb) · `read` a SKILL.md body · `files` list its references · `file` read one reference |

The Easel repo has ~114 skills. Most of them are **prompt-driven workflows** (a SKILL.md plus `references/`) rather than scripts — the model reads the skill and executes its steps. A minority ship real scripts; those are wrapped below.

### Script execution

| Tool | Purpose |
| --- | --- |
| `zmtgzt_run` | Run any Easel script by repo-relative path, with `args` and an optional `subcommand` |
| `zmtgzt_scripts` | List available scripts (`shared`, or per-skill) |

### Dedicated script tools

Parameters come from the scripts' own `argparse` definitions or from command examples in `AGENTS.md` — none are invented.

| Tool | Wraps |
| --- | --- |
| `zmtgzt_manifest` | `shared/scripts/manifest.py` — the cross-layer handoff (record / meta / read / latest) |
| `zmtgzt_output_paths` | `shared/scripts/output_paths.py` — validate output paths before writing |
| `zmtgzt_model_registry` | `shared/scripts/model_registry.py` — list configured media providers (redacted) |
| `zmtgzt_persona_gate` | `shared/scripts/persona_gate.py` — persona consistency gate before publishing |
| `zmtgzt_content_guard` | `shared/scripts/content_guard.py` — sensitive-content scan before publishing |
| `zmtgzt_publish_log` | `skill-publish-log/scripts/log.py` — publishing record |
| `zmtgzt_news` | `skill-news-intelligence/scripts/` — fetch news / build a briefing |
| `zmtgzt_card_audit` | `card-design/scripts/card_audit.py` — post-render card self-check |
| `zmtgzt_novel_ops` | `novel-writer/scripts/novel_ops.py` — novel scaffolding and progress |
| `zmtgzt_paper_ingest` | `paper-explainer/scripts/paper_ingest.py` — paper fetching and parsing |
| `zmtgzt_data_report` | `data-report/scripts/report.py` — data to HTML report |
| `zmtgzt_assemble_video` | `auto-short-video/scripts/assemble.py` — video assembly |
| `zmtgzt_drama_ops` | `short-drama/scripts/drama_ops.py` — drama assets and progress |
| `zmtgzt_dubbing` | `short-drama/scripts/dubbing.py` — multi-role dubbing |
| `zmtgzt_performance_review` | `skill-social-performance-review/scripts/review.py` |
| `zmtgzt_publish_analytics` | `skill-publish-analytics/scripts/analyze.py` |
| `zmtgzt_assets` | `asset-manager/scripts/assets.py` — asset library |

### Repository state

| Tool | Purpose |
| --- | --- |
| `zmtgzt_profile` | Read/write `profiles/<name>/{identity,style,audience,platforms,preferences,memory}.md` |
| `zmtgzt_artifact` | List `outputs/` projects, read a project's manifest and entries |
| `zmtgzt_doctor` | Environment check with per-item fix guidance |

## How the contract reaches the model

Easel's prompt stack is four layers (see its `docs/prompt-stack.md`). dsh has no `registerInstruction` and no global `USER.md`, so the mapping is:

| Easel layer | dsh implementation |
| --- | --- |
| Layer 1 `SOUL.md` (persona) | Read from the repo, injected verbatim into the contract skill |
| Layer 2 `AGENTS.md` (orchestration) | Same — verbatim, not summarised |
| Layer 3 `CONTEXT.md` (project paths) | Replaced by `config.easelRoot`; the script runner pins `cwd` there, so AGENTS.md's "cd to project root" rule is already satisfied |
| Layer 4 `SKILL` (on demand) | Every `skills/openclaw/<name>/SKILL.md` registered as a dsh skill; bodies and `references/` read from disk |

The only text the plugin writes itself is a short bridge note explaining these mechanics. It contains **no** business orchestration rules — those belong to `AGENTS.md` and stay there.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `easelRoot` | — | Absolute path to your own Easel checkout. **Overrides the bundled snapshot.** |
| `workspaceDir` | `~/.dsh/zmtgzt/easel` | Where the snapshot is released; `.env`, `outputs/`, `profiles/` live here |
| `releaseEmbedded` | `true` | Release/update the bundled snapshot on start. When false, the read-only snapshot is used directly |
| `pythonPath` | `python` | Python interpreter (Windows often needs `py` or a full path) |
| `scriptTimeoutMs` | `300000` | Per-invocation script timeout |
| `registerEaselSkills` | `true` | Register the repo's skills as dsh skills |
| `skillLayers` | `[]` (all) | Restrict registration to certain layers, e.g. `[discover, plan]` |
| `injectOrchestration` | `true` | Inject the SOUL + AGENTS contract |

## Where the content comes from, and how to update it

The plugin bundles `vendor/easel/` (an Easel snapshot, Apache-2.0 — see `THIRD-PARTY-NOTICES.md`). Releasing it keeps two things strictly apart:

| Category | Behaviour |
| --- | --- |
| Snapshot content (`openclaw/`, `docs/`, `skills/`, `LICENSE`, `SYNC-INFO.json`) | Overwritten when the version changes |
| Your data (`.env`, `outputs/`, `profiles/`, `assets/`) | **Never touched** |

To move to a newer upstream:

```sh
node scripts/sync-easel.mjs               # latest main
node scripts/sync-easel.mjs --ref v1.2.0  # a specific branch or tag
```

The script refreshes `vendor/easel/` and records the source commit in `SYNC-INFO.json`; the plugin releases the new version on its next start.

### A note on script dependencies

The bundled snapshot answers "where does the content come from", but **running the scripts still needs a runtime**: Python 3, the dependencies in `pyproject.toml`, and API keys in `.env`. Installing the plugin can't supply those. A `.env` is generated on first release — fill it in and you're set.

Nothing breaks if you don't: script tools return a structured `{ ok: false, kind, error, hint }`, and text-only work (trend research, strategy, copywriting, planning) is unaffected.

## Development

```sh
npm install --legacy-peer-deps   # only esbuild; host packages stay external
npm run build                    # → lib/index.js, lib/client.js
npm run check                    # syntax check on both bundles
node scripts/smoke.mjs           # registration contract (~20 assertions)
node scripts/e2e.mjs             # behaviour against a mock Easel checkout (~35 assertions)
```

`lib/` is committed so the plugin installs and loads without a build step.

## Version support

**Supported dsh versions: `>= 0.1.0-rc.6`** (covering all 0.1.x and 0.2.x rc / alpha releases).

Verified by diffing the official type definitions at `0.1.0-rc.6` and `0.2.0-rc.2` — every interface this plugin uses has the same shape in both:

| Interface | Package | 0.1.0-rc.6 | 0.2.0-rc.2 |
| --- | --- | --- | --- |
| `defineTool({name, description, parameters, output:{schema, render}, execute})` | `@deepseek-ai/dsh-tools` | ✅ | ✅ |
| `ctx.tools.register(def)` → disposer | `@deepseek-ai/dsh-tools` | ✅ | ✅ |
| `ctx.skills.register({name, description, whenToUse, source, provider, content})` | `@deepseek-ai/dsh-skill` | ✅ | ✅ |
| `ctx.webServer.register({kind, path, handler})` | `@deepseek-ai/dsh-host-webserver` | ✅ | ✅ |
| `ctx.provide(name, value)` | `@deepseek-ai/cordis` | ✅ | ✅ |

The only differences are two **optional** fields added in 0.2.x (a tool's `deferLoading`, a route's `kind: 'global'`). Neither is used here, so they don't affect compatibility.

No upper bound is pinned: `engines.dsh` is `>= 0.1.0-rc.6`, and `peerDependencies` accepts both `^0.1.0-rc.6` and `^0.2.0-rc.2`, all marked optional — these are host-provided and never installed by the plugin.

### Other requirements

- Node.js 22+
- A local [Easel](https://github.com/ZJU-REAL/Easel) checkout (needed for script-backed tools and skill registration)

## License

MIT. Easel itself is Apache-2.0 and is fetched by you, not redistributed here.
