# dsh-easel-orchestrator

A DeepSeek Harness (dsh) plugin that runs the [Easel](https://github.com/ZJU-REAL/Easel) social-content agent inside dsh.

**It ships no Easel content.** The contract and every skill are read from a local Easel checkout at runtime, so the plugin never drifts from upstream. What the plugin provides is the seam between the two runtimes: contract injection, skill registration, and script execution.

- **Contract injection** — `openclaw/workspace/SOUL.md` and `AGENTS.md` are read from your Easel checkout and registered as a runtime skill, verbatim
- **Skill registration** — every `skills/openclaw/<name>/SKILL.md` is scanned and registered as a dsh skill, loaded on demand
- **23 `easel_*` tools** — skill reading, script execution, and the manifest / profile / artifact surfaces
- **A web view** in the `conversation.view` slot: skill library, account profiles, project artifacts, environment check

## Install

```sh
git clone https://github.com/ZJU-REAL/Easel   # the official upstream

dsh plugin add dsh-easel-orchestrator
```

Point the plugin at your checkout:

```yaml
# in your dsh profile config
- insert:
    - id: dsh-easel-orchestrator
      name: dsh-easel-orchestrator
      config:
        easelRoot: /absolute/path/to/Easel
```

Then run `easel_doctor` to confirm.

## Tools

### Skill reading — the Easel skills, served from disk

| Tool | Purpose |
| --- | --- |
| `easel_skill` | `list` all skills (name, layer, blurb) · `read` a SKILL.md body · `files` list its references · `file` read one reference |

The Easel repo has ~114 skills. Most of them are **prompt-driven workflows** (a SKILL.md plus `references/`) rather than scripts — the model reads the skill and executes its steps. A minority ship real scripts; those are wrapped below.

### Script execution

| Tool | Purpose |
| --- | --- |
| `easel_run` | Run any Easel script by repo-relative path, with `args` and an optional `subcommand` |
| `easel_scripts` | List available scripts (`shared`, or per-skill) |

### Dedicated script tools

Parameters come from the scripts' own `argparse` definitions or from command examples in `AGENTS.md` — none are invented.

| Tool | Wraps |
| --- | --- |
| `easel_manifest` | `shared/scripts/manifest.py` — the cross-layer handoff (record / meta / read / latest) |
| `easel_output_paths` | `shared/scripts/output_paths.py` — validate output paths before writing |
| `easel_model_registry` | `shared/scripts/model_registry.py` — list configured media providers (redacted) |
| `easel_persona_gate` | `shared/scripts/persona_gate.py` — persona consistency gate before publishing |
| `easel_content_guard` | `shared/scripts/content_guard.py` — sensitive-content scan before publishing |
| `easel_publish_log` | `skill-publish-log/scripts/log.py` — publishing record |
| `easel_news` | `skill-news-intelligence/scripts/` — fetch news / build a briefing |
| `easel_card_audit` | `card-design/scripts/card_audit.py` — post-render card self-check |
| `easel_novel_ops` | `novel-writer/scripts/novel_ops.py` — novel scaffolding and progress |
| `easel_paper_ingest` | `paper-explainer/scripts/paper_ingest.py` — paper fetching and parsing |
| `easel_data_report` | `data-report/scripts/report.py` — data to HTML report |
| `easel_assemble_video` | `auto-short-video/scripts/assemble.py` — video assembly |
| `easel_drama_ops` | `short-drama/scripts/drama_ops.py` — drama assets and progress |
| `easel_dubbing` | `short-drama/scripts/dubbing.py` — multi-role dubbing |
| `easel_performance_review` | `skill-social-performance-review/scripts/review.py` |
| `easel_publish_analytics` | `skill-publish-analytics/scripts/analyze.py` |
| `easel_assets` | `asset-manager/scripts/assets.py` — asset library |

### Repository state

| Tool | Purpose |
| --- | --- |
| `easel_profile` | Read/write `profiles/<name>/{identity,style,audience,platforms,preferences,memory}.md` |
| `easel_artifact` | List `outputs/` projects, read a project's manifest and entries |
| `easel_doctor` | Environment check with per-item fix guidance |

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
| `easelRoot` | — | Absolute path to the Easel checkout. Required for anything script- or skill-backed. |
| `pythonPath` | `python` | Python interpreter (Windows often needs `py` or a full path). |
| `scriptTimeoutMs` | `300000` | Per-invocation script timeout. |
| `registerEaselSkills` | `true` | Register the repo's skills as dsh skills. |
| `skillLayers` | `[]` (all) | Restrict registration to certain layers, e.g. `[discover, plan]`. |
| `injectOrchestration` | `true` | Inject the SOUL + AGENTS contract. |

### Without `easelRoot`

Nothing breaks. Script tools return a structured `{ ok: false, kind, error, hint }` value instead of throwing, the contract skill states plainly that `SOUL.md` / `AGENTS.md` were not loaded (rather than substituting a hand-written contract), and `easel_doctor` prints the exact fix.

## Development

```sh
npm install --legacy-peer-deps   # only esbuild; host packages stay external
npm run build                    # → lib/index.js, lib/client.js
npm run check                    # syntax check on both bundles
node scripts/smoke.mjs           # registration contract (~20 assertions)
node scripts/e2e.mjs             # behaviour against a mock Easel checkout (~35 assertions)
```

`lib/` is committed so the plugin installs and loads without a build step.

## Requirements

- dsh `>= 0.1.0-rc.6`, Node.js 22+
- A local [Easel](https://github.com/ZJU-REAL/Easel) checkout

## License

MIT. Easel itself is Apache-2.0 and is fetched by you, not redistributed here.
