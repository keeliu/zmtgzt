/**
 * 原子工具层。
 *
 * 与最初设想的关键差异（经核对 ZJU-REAL/Easel 仓库）：
 *   Easel 的 114 个技能里，**绝大多数是给 LLM 执行的提示词流程**（SKILL.md + references/），
 *   只有约 35 个技能带可执行脚本。因此本插件不再"一个技能包一个脚本工具"，
 *   而是分成三类：
 *     1. 技能读取（easel_skill）——把 Easel 技能正文与 references 取给模型，按 SKILL.md 执行
 *     2. 脚本执行（easel_run + 若干专用工具）——只包装仓库里真实存在的脚本
 *     3. 仓库状态读写（manifest / profile / artifact）
 *   全部参数以 Easel 源码中的 argparse 与 AGENTS.md 的命令示例为准，不臆造。
 * @module dsh-easel-orchestrator/tools
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from './config.ts'
import { failureText, isEaselFailure, runEaselScript, type ScriptArgs } from './runner.ts'
import type { EaselRepo } from './easel-repo.ts'

/** 工具运行期依赖。 */
export interface ToolDeps {
  config: ResolvedConfig
  repo: EaselRepo
  doctor: () => Promise<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// 参数 schema 速记（dsh 的 spec DSL：type + description + required 标注）
// ---------------------------------------------------------------------------

type Prop = Record<string, unknown>

const s = (description: string): Prop => ({ type: 'string', description })
const sr = (description: string): Prop => ({ type: 'string', description, required: true })
const n = (description: string): Prop => ({ type: 'number', description })
const b = (description: string): Prop => ({ type: 'boolean', description })
const j = (description: string): Prop => ({ type: 'json', description })
const arr = (description: string): Prop => ({ type: 'array', items: { type: 'string' }, description })
const e = (values: readonly string[], description: string, required = false): Prop => ({
  type: 'string',
  description,
  enum: values,
  ...(required ? { required: true } : {}),
})

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stripUndefined(args: Record<string, unknown>): ScriptArgs {
  const out: ScriptArgs = {}
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/** 渲染一个"执行结果"型 canonical 值：失败时给结构化说明，成功时给摘要 + JSON。 */
function renderResult(summary: string | undefined) {
  return (_args: unknown, value: unknown) => {
    if (isEaselFailure(value)) return [{ type: 'text' as const, text: failureText(value) }]
    const body = stringify((value as { data?: unknown })?.data ?? value)
    return [{ type: 'text' as const, text: summary ? `${summary}\n\n${body}` : body }]
  }
}

/**
 * 脚本工具工厂：统一的失败兜底与渲染。
 * @param spec.script - 根相对脚本路径；函数形式支持按参数动态取路径。
 * @param spec.subcommand - argparse 子命令，作为第一个位置参数传入。
 */
function scriptTool(
  deps: ToolDeps,
  spec: {
    name: string
    description: string
    parameters: Record<string, Prop>
    script: string | ((args: Record<string, unknown>) => string)
    subcommand?: (args: Record<string, unknown>) => string | undefined
    /** 从参数里挑出要透传给脚本的键；不设则全量透传。 */
    passthrough?: string[]
    summary?: (value: unknown, args: Record<string, unknown>) => string
  }
) {
  return defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters as never,
    output: {
      schema: { type: 'json' } as never,
      render: (args: unknown, value: unknown) => {
        if (isEaselFailure(value)) return [{ type: 'text' as const, text: failureText(value) }]
        let summary: string | undefined
        try {
          summary = spec.summary?.(value, (args ?? {}) as Record<string, unknown>) || undefined
        } catch {
          summary = undefined
        }
        return renderResult(summary)(args, value)
      },
    },
    async execute(args: unknown, exec: { signal: AbortSignal }) {
      const all = (args ?? {}) as Record<string, unknown>
      const keys = spec.passthrough ?? Object.keys(all).filter((k) => k !== 'script' && k !== 'subcommand')
      const forwarded: Record<string, unknown> = {}
      for (const key of keys) {
        if (all[key] !== undefined) forwarded[key] = all[key]
      }
      const scriptPath = typeof spec.script === 'function' ? spec.script(all) : spec.script
      const sub = spec.subcommand?.(all)
      return runEaselScript(
        deps.config,
        scriptPath,
        stripUndefined(forwarded),
        exec?.signal,
        sub ? [sub] : undefined
      )
    },
  })
}

// ---------------------------------------------------------------------------
// 工具集
// ---------------------------------------------------------------------------

/**
 * 构建全部工具。
 * @param deps - 运行期依赖。
 * @returns 可注册的工具定义数组。
 */
export function createTools(deps: ToolDeps) {
  return [
    // -----------------------------------------------------------------------
    // 1. 技能读取：Easel 的技能正文与 references 都从磁盘取，不在插件里复制
    // -----------------------------------------------------------------------
    defineTool({
      name: 'easel_skill',
      description:
        '读取 Easel 仓库里的技能。action=list 列出全部技能（名称、所属层、简介）；' +
        'action=read 取某个 SKILL.md 正文（执行流程）；action=files 列出该技能的 references/；' +
        'action=file 读某个 reference 文件。任务开始时先 list 找精确匹配的技能，再 read 照着执行——' +
        '不要凭记忆复述 Easel 的技能内容。',
      parameters: {
        action: e(['list', 'read', 'files', 'file'], '操作类型', true),
        name: s('技能名，如 skill-trending-topics（read / files / file 时必填）'),
        layer: s('list 时按层过滤：discover / plan / produce / publish / attribute 等'),
        file: s('action=file 时的相对路径，如 references/hook-library.md'),
      },
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [
          { type: 'text' as const, text: stringify(value) },
        ],
      },
      async execute(args: unknown) {
        const a = (args ?? {}) as Record<string, unknown>
        const action = String(a.action ?? 'list')
        if (!deps.repo.available) {
          return notConfigured('读取 Easel 技能')
        }
        if (action === 'list') {
          const layer = a.layer ? String(a.layer) : undefined
          const skills = await deps.repo.listSkills()
          const filtered = layer ? skills.filter((sk) => sk.layer === layer) : skills
          return {
            ok: true,
            total: filtered.length,
            layers: [...new Set(skills.map((sk) => sk.layer ?? 'unknown'))].sort(),
            skills: filtered.map((sk) => ({
              name: sk.name,
              layer: sk.layer ?? null,
              description: sk.whenToUse,
            })),
          }
        }
        const name = String(a.name ?? '').trim()
        if (!name) return { ok: false, error: '该操作需要 name' }
        if (action === 'read') {
          const detail = await deps.repo.readSkill(name)
          if (!detail) return { ok: false, error: `未找到技能：${name}`, hint: '先用 action=list 查看可用技能。' }
          return {
            ok: true,
            name: detail.name,
            layer: detail.layer ?? null,
            description: detail.description,
            references: detail.references,
            body: detail.body,
          }
        }
        if (action === 'files') {
          const detail = await deps.repo.readSkill(name)
          if (!detail) return { ok: false, error: `未找到技能：${name}` }
          return { ok: true, name: detail.name, references: detail.references }
        }
        const file = String(a.file ?? '').trim()
        if (!file) return { ok: false, error: 'action=file 需要 file' }
        const found = await deps.repo.readSkillFile(name, file)
        if (!found) return { ok: false, error: `读不到 ${name}/${file}` }
        return { ok: true, name, path: found.path, content: found.content }
      },
    }),

    // -----------------------------------------------------------------------
    // 2. 脚本执行
    // -----------------------------------------------------------------------
    defineTool({
      name: 'easel_run',
      description:
        '执行 Easel 仓库里的任意脚本（确定性 IO 的通用出口）。传根相对路径，例如 ' +
        'skills/shared/scripts/manifest.py。参数走 args（键值对，透传为 --key value）；' +
        'argparse 子命令用 subcommand。参数名以脚本 --help 为准，不要臆造。' +
        '想先看有哪些脚本用 easel_scripts。',
      parameters: {
        script: sr('根相对脚本路径，如 skills/shared/scripts/output_paths.py'),
        subcommand: s('argparse 子命令，如 record / meta / read / latest'),
        args: j('透传给脚本的参数对象，如 {"topic":"春季通勤穿搭","layer":"produce"}'),
      },
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: stringify(value) }],
      },
      async execute(args: unknown, exec: { signal: AbortSignal }) {
        const a = (args ?? {}) as Record<string, unknown>
        const script = String(a.script ?? '').trim()
        if (!script) return { ok: false, error: 'script 为必填' }
        const forwarded = (a.args && typeof a.args === 'object' ? a.args : {}) as Record<string, unknown>
        const sub = a.subcommand ? [String(a.subcommand)] : undefined
        return runEaselScript(deps.config, script, stripUndefined(forwarded), exec?.signal, sub)
      },
    }),

    defineTool({
      name: 'easel_scripts',
      description:
        '列出 Easel 仓库里可执行的脚本：action=shared 列出 skills/shared/scripts 下的通用脚本；' +
        'action=skills 列出各技能自带的 scripts/。要执行其中任何一个用 easel_run。',
      parameters: {
        action: e(['shared', 'skills'], '列出范围', true),
      },
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: stringify(value) }],
      },
      async execute(args: unknown) {
        const action = String(((args ?? {}) as Record<string, unknown>).action ?? 'shared')
        if (!deps.repo.available) return notConfigured('列出 Easel 脚本')
        if (action === 'shared') {
          const scripts = await deps.repo.listSharedScripts()
          return { ok: true, scope: 'skills/shared/scripts', count: scripts.length, scripts }
        }
        const skills = await deps.repo.listSkills()
        const withScripts: Array<{ skill: string; scripts: string[] }> = []
        for (const skill of skills) {
          const scripts = await deps.repo.listSkillScripts(skill.name)
          if (scripts.length) withScripts.push({ skill: skill.name, scripts })
        }
        return { ok: true, scope: 'skills/openclaw', count: withScripts.length, skills: withScripts }
      },
    }),

    // -----------------------------------------------------------------------
    // 3. 专用脚本工具：参数取自源码 argparse 或 AGENTS.md 的命令示例
    // -----------------------------------------------------------------------
    scriptTool(deps, {
      name: 'easel_manifest',
      description:
        '编排产物登记（AGENTS.md 规定的跨层传递契约）：把"产物路径 + 一句结论"写进 manifest，' +
        '下游先 read/latest 读上游，不重新推导。跨两层以上任务必用。',
      parameters: {
        action: e(['record', 'meta', 'read', 'latest'], '子命令', true),
        topic: s('主题名，决定落盘目录 outputs/<主题>/'),
        layer: s('record 时必填：技能所属层'),
        skill: s('record 时必填：执行的 SKILL 名'),
        status: s('record 状态，默认 done'),
        outputs: arr('产物文件名，多个用数组'),
        upstream: arr('消费的上游产物，多个用数组'),
        summary: s('一句话关键结论'),
        profile: s('画像名'),
        title: s('meta：人类可读标题'),
        platform: s('meta：目标平台'),
        kind: s('meta：产物体裁'),
        tags: arr('meta：标签'),
        cover: s('meta：封面文件名'),
        deliverables: arr('meta：最终成品文件名'),
      },
      script: 'skills/shared/scripts/manifest.py',
      subcommand: (a) => String(a.action ?? 'read'),
      passthrough: [
        'topic', 'layer', 'skill', 'status', 'outputs', 'upstream', 'summary', 'profile',
        'title', 'platform', 'kind', 'tags', 'cover', 'deliverables',
      ],
      summary: (_v, a) => `manifest ${String(a.action)} 完成（主题：${String(a.topic ?? '-')}）。`,
    }),

    scriptTool(deps, {
      name: 'easel_output_paths',
      description:
        '校验并规整产物路径（AGENTS.md 要求写入前先校验）：禁止泛化主题名、禁止产物散落在 outputs/ 根目录。' +
        '返回规范化后的绝对路径，越界或命名不合规会被拒绝。',
      parameters: {
        path: sr('待校验的产物路径，如 outputs/春季通勤穿搭/cover.png'),
        system: b('允许写入已注册的系统路径（_analytics / _scratch 等）'),
      },
      script: 'skills/shared/scripts/output_paths.py',
      summary: () => '路径校验通过。',
    }),

    scriptTool(deps, {
      name: 'easel_model_registry',
      description:
        '脱敏查询已配置的媒体模型 provider（AGENTS.md 规定：调用视频/音乐/云 TTS 前必须先查）。' +
        '只返回"必填凭证齐全"的 provider，不暴露 Key。',
      parameters: {
        group: sr('模型分组，如 video / music / tts'),
        'env-file': s('显式指定 .env 路径；默认项目根 .env'),
      },
      script: 'skills/shared/scripts/model_registry.py',
      subcommand: () => 'configured',
      passthrough: ['group', 'env-file'],
      summary: () => '已返回可用的 provider 列表。',
    }),

    scriptTool(deps, {
      name: 'easel_persona_gate',
      description:
        '人设一致性门禁（AGENTS.md 规定发布前必做）：action=check 用评分判定 pass/warn；' +
        'action=record 记录留痕。注意：只提醒、不阻断发布，内容安全硬门禁独立生效。',
      parameters: {
        action: e(['check', 'record'], '子命令', true),
        score: n('check：人设评分（0-100，80 及以上为 pass）'),
        topic: s('record：主题'),
        profile: s('record：画像名'),
        verdict: s('record：结论'),
        deviations: s('record：偏离点'),
      },
      script: 'skills/shared/scripts/persona_gate.py',
      subcommand: (a) => String(a.action ?? 'check'),
      passthrough: ['score', 'topic', 'profile', 'verdict', 'deviations'],
      summary: () => '人设一致性检查完成。',
    }),

    scriptTool(deps, {
      name: 'easel_content_guard',
      description:
        '发布前敏感信息扫描（AGENTS.md 规定的硬门禁）：扫描文案中的 API Key、内部 URL、代理、' +
        '内部绝对路径等。命中会以退出码 7 结束，属于预期的拦截而非脚本故障。',
      parameters: {
        action: e(['scan', 'dry-run', 'list'], '子命令', true),
        text: s('待扫描文本（也可用 file 指定文件）'),
        file: s('待扫描文件路径'),
      },
      script: 'skills/shared/scripts/content_guard.py',
      subcommand: (a) => String(a.action ?? 'scan'),
      passthrough: ['text', 'file'],
      summary: () => '敏感信息扫描完成。',
    }),

    scriptTool(deps, {
      name: 'easel_publish_log',
      description: '发布留痕（AGENTS.md 规定的发布后动作）：记录平台、标题、画像与人设检查结论。',
      parameters: {
        platform: sr('平台'),
        title: s('标题'),
        profile: s('画像名'),
        'persona-score': n('人设评分'),
        'persona-verdict': s('人设结论'),
      },
      script: 'skills/openclaw/skill-publish-log/scripts/log.py',
      subcommand: () => 'record',
      passthrough: ['platform', 'title', 'profile', 'persona-score', 'persona-verdict'],
      summary: () => '发布记录已写入。',
    }),

    scriptTool(deps, {
      name: 'easel_news',
      description:
        '行业资讯聚合（skill-news-intelligence 的脚本）：action=fetch 抓取资讯源；' +
        'action=briefing 生成日报。注意与热点技能 skill-trending-topics 的区别——' +
        '后者是分钟级热搜、纯流程技能（用 easel_skill 读取后按流程执行）。',
      parameters: {
        action: e(['fetch', 'briefing'], '子命令', true),
        source: s('资讯源或关键词'),
        days: n('回看天数'),
      },
      script: (a) =>
        String(a.action) === 'briefing'
          ? 'skills/openclaw/skill-news-intelligence/scripts/daily_briefing.py'
          : 'skills/openclaw/skill-news-intelligence/scripts/fetch_news.py',
      passthrough: ['source', 'days'],
      summary: () => '资讯任务完成。',
    }),

    scriptTool(deps, {
      name: 'easel_card_audit',
      description: '卡片渲染后的自检（card-design 规定的第五步）：检查渲染结果是否达标。',
      parameters: {
        path: sr('待审计的卡片文件或目录路径'),
        style: s('使用的风格名'),
      },
      script: 'skills/openclaw/card-design/scripts/card_audit.py',
      passthrough: ['path', 'style'],
      summary: () => '卡片审计完成。',
    }),

    scriptTool(deps, {
      name: 'easel_novel_ops',
      description:
        '小说连载的确定性 IO（novel-writer 的技能规定"文件即真相"）：立项搭骨架、进度管理、AI 味检查等。' +
        '创意写作本身由你按 SKILL.md 完成，不走脚本。',
      parameters: {
        action: sr('子命令，取值以脚本 --help 为准（如 init / status / check）'),
        title: s('书名'),
        topic: s('主题名'),
        chapter: n('章节号'),
      },
      script: 'skills/openclaw/novel-writer/scripts/novel_ops.py',
      subcommand: (a) => String(a.action ?? ''),
      passthrough: ['title', 'topic', 'chapter'],
      summary: () => '小说工程操作完成。',
    }),

    scriptTool(deps, {
      name: 'easel_paper_ingest',
      description:
        '论文抓取与解析（paper-explainer）：拉取原文、解析 PDF、产出可复用的 asset library。' +
        '解析只做一次，视频与图文两条产线共用。',
      parameters: {
        source: sr('arXiv 链接、DOI 或本地 PDF 路径'),
        topic: s('主题名'),
        action: s('子命令，取值以脚本 --help 为准'),
      },
      script: 'skills/openclaw/paper-explainer/scripts/paper_ingest.py',
      subcommand: (a) => (a.action ? String(a.action) : undefined),
      passthrough: ['source', 'topic'],
      summary: () => '论文解析完成。',
    }),

    scriptTool(deps, {
      name: 'easel_data_report',
      description: '把数据文件生成可视化报告页（data-report）。',
      parameters: {
        input: sr('数据文件路径（CSV / Excel / JSON）'),
        topic: s('主题名'),
        title: s('报告标题'),
      },
      script: 'skills/openclaw/data-report/scripts/report.py',
      passthrough: ['input', 'topic', 'title'],
      summary: () => '报告页已生成。',
    }),

    scriptTool(deps, {
      name: 'easel_assemble_video',
      description:
        '短视频合成合流点（auto-short-video 的技能规定合成前硬拦截只有 frame 没有 clip 的镜头）。',
      parameters: {
        topic: sr('主题名'),
        action: s('子命令，取值以脚本 --help 为准'),
        storyboard: s('分镜文件路径'),
      },
      script: 'skills/openclaw/auto-short-video/scripts/assemble.py',
      subcommand: (a) => (a.action ? String(a.action) : undefined),
      passthrough: ['topic', 'storyboard'],
      summary: () => '视频合成任务完成。',
    }),

    scriptTool(deps, {
      name: 'easel_drama_ops',
      description: '短剧资产 / 分镜 / 进度管理（short-drama）。',
      parameters: {
        action: sr('子命令，取值以脚本 --help 为准'),
        topic: s('主题名'),
        episode: n('集号'),
      },
      script: 'skills/openclaw/short-drama/scripts/drama_ops.py',
      subcommand: (a) => String(a.action ?? ''),
      passthrough: ['topic', 'episode'],
      summary: () => '短剧工程操作完成。',
    }),

    scriptTool(deps, {
      name: 'easel_dubbing',
      description: '短剧多角色配音（short-drama 规定配音必须用云 provider，edge 兜底会被硬拦截）。',
      parameters: {
        topic: sr('主题名'),
        episode: n('集号'),
        dialogue: s('对白文件路径'),
      },
      script: 'skills/openclaw/short-drama/scripts/dubbing.py',
      passthrough: ['topic', 'episode', 'dialogue'],
      summary: () => '多角色配音完成。',
    }),

    scriptTool(deps, {
      name: 'easel_performance_review',
      description: '发布后复盘（skill-social-performance-review）。',
      parameters: {
        topic: s('主题名'),
        platform: s('平台'),
        window: s('统计窗口'),
      },
      script: 'skills/openclaw/skill-social-performance-review/scripts/review.py',
      passthrough: ['topic', 'platform', 'window'],
      summary: () => '复盘完成。',
    }),

    scriptTool(deps, {
      name: 'easel_publish_analytics',
      description: '发布数据分析与粉丝记录（skill-publish-analytics）。',
      parameters: {
        platform: s('平台'),
        window: s('统计窗口'),
      },
      script: 'skills/openclaw/skill-publish-analytics/scripts/analyze.py',
      passthrough: ['platform', 'window'],
      summary: () => '数据分析完成。',
    }),

    scriptTool(deps, {
      name: 'easel_assets',
      description: '素材库管理（asset-manager）：登记与检索 assets/ 下的用户素材。',
      parameters: {
        action: sr('子命令，取值以脚本 --help 为准'),
        topic: s('主题名'),
        path: s('素材路径'),
      },
      script: 'skills/openclaw/asset-manager/scripts/assets.py',
      subcommand: (a) => String(a.action ?? ''),
      passthrough: ['topic', 'path'],
      summary: () => '素材库操作完成。',
    }),

    // -----------------------------------------------------------------------
    // 4. 仓库状态：画像与产物
    // -----------------------------------------------------------------------
    defineTool({
      name: 'easel_profile',
      description:
        '读写账号画像（Easel 的 profiles/<画像>/，六维各一个 md：identity / style / audience / ' +
        'platforms / preferences / memory）。action=list 列出全部画像；action=read 读一个画像的全部维度；' +
        'action=write 增量写一个维度。按 AGENTS.md：做内容前先读画像，不要凭对话猜账号定位。',
      parameters: {
        action: e(['list', 'read', 'write'], '操作类型', true),
        name: s('画像名（read / write 时必填）'),
        file: e(
          ['identity', 'style', 'audience', 'platforms', 'preferences', 'memory'],
          'write 时必填：要写的维度'
        ),
        content: s('write 时的正文内容'),
      },
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: stringify(value) }],
      },
      async execute(args: unknown) {
        const a = (args ?? {}) as Record<string, unknown>
        const action = String(a.action ?? 'list')
        if (!deps.config.easelRoot) return notConfigured('读写画像')
        const dir = `${deps.config.easelRoot}/profiles`
        if (action === 'list') {
          const names = await listDirs(dir)
          return { ok: true, root: dir, profiles: names.filter((n) => !n.startsWith('_')) }
        }
        const name = String(a.name ?? '').trim()
        if (!name) return { ok: false, error: '该操作需要 name' }
        if (action === 'read') {
          const dims = ['identity', 'style', 'audience', 'platforms', 'preferences', 'memory']
          const files: Record<string, string> = {}
          for (const dim of dims) {
            const content = await readTextIfExists(`${dir}/${name}/${dim}.md`)
            if (content !== undefined) files[dim] = content
          }
          if (Object.keys(files).length === 0) {
            return {
              ok: false,
              error: `画像不存在或为空：${name}`,
              hint: `Easel 的画像模板在 profiles/_template/，可先参照它创建。`,
            }
          }
          return { ok: true, name, dir: `${dir}/${name}`, dimensions: files }
        }
        const file = String(a.file ?? '').trim()
        const content = String(a.content ?? '')
        if (!file) return { ok: false, error: 'write 需要 file（维度名）' }
        if (!content.trim()) return { ok: false, error: 'write 需要 content' }
        const written = await writeText(`${dir}/${name}/${file}.md`, content)
        if (!written) {
          return {
            ok: false,
            error: '写入失败',
            hint: '画像应位于 Easel 仓库的 profiles/ 下；请确认该目录可写。',
          }
        }
        return { ok: true, name, file, path: `${dir}/${name}/${file}.md` }
      },
    }),

    defineTool({
      name: 'easel_artifact',
      description:
        '查看产物状态：action=list 列出 outputs/ 下全部项目；action=read 读某项目的 manifest 与产物目录树。' +
        'manifest 由 easel_manifest 写入，是跨技能传递的真相来源。',
      parameters: {
        action: e(['list', 'read'], '操作类型', true),
        topic: s('主题名（read 时必填）'),
      },
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: stringify(value) }],
      },
      async execute(args: unknown) {
        const a = (args ?? {}) as Record<string, unknown>
        const action = String(a.action ?? 'list')
        if (!deps.config.easelRoot) return notConfigured('查看产物')
        const outputs = `${deps.config.easelRoot}/outputs`
        if (action === 'list') {
          const names = await listDirs(outputs)
          return { ok: true, root: outputs, projects: names }
        }
        const topic = String(a.topic ?? '').trim()
        if (!topic) return { ok: false, error: 'read 需要 topic' }
        const manifestRaw = await readTextIfExists(`${outputs}/${topic}/manifest.json`)
        let manifest: unknown = null
        if (manifestRaw) {
          try {
            manifest = JSON.parse(manifestRaw)
          } catch {
            manifest = { parseError: true, raw: manifestRaw.slice(0, 2000) }
          }
        }
        return {
          ok: true,
          topic,
          dir: `${outputs}/${topic}`,
          manifest,
          entries: await listEntries(`${outputs}/${topic}`),
        }
      },
    }),

    // -----------------------------------------------------------------------
    // 5. 环境体检
    // -----------------------------------------------------------------------
    defineTool({
      name: 'easel_doctor',
      description:
        '插件与环境体检：检查 Easel 根目录、SOUL.md / AGENTS.md、技能目录、Python 解释器、.env 与共享脚本，' +
        '并给出逐项修复指引。调用其它 easel_* 工具前不确定环境是否就绪时先跑这个。',
      parameters: {},
      output: {
        schema: { type: 'json' } as never,
        render: (_args: unknown, value: unknown) => [
          { type: 'text' as const, text: doctorText(value as Record<string, unknown>) },
        ],
      },
      async execute() {
        return deps.doctor()
      },
    }),
  ]
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function notConfigured(what: string): Record<string, unknown> {
  return {
    ok: false,
    kind: 'not-configured',
    error: `未配置 Easel 根目录，无法${what}。`,
    hint:
      '在 dsh 配置中为 dsh-easel-orchestrator 设置 config.easelRoot，指向本地 Easel 仓库绝对路径；' +
      '配置后运行 easel_doctor 确认。',
  }
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((x) => x.isDirectory()).map((x) => x.name).sort()
  } catch {
    return []
  }
}

async function listEntries(path: string): Promise<Array<{ name: string; isDir: boolean }>> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .map((x) => ({ name: x.name, isDir: x.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  } catch {
    return []
  }
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function writeText(path: string, content: string): Promise<boolean> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
    return true
  } catch {
    return false
  }
}

function doctorText(value: Record<string, unknown>): string {
  const lines: string[] = []
  lines.push(value?.healthy === true ? '环境就绪，可以调用脚本类工具。' : '环境尚未就绪。')
  const checks = Array.isArray(value?.checks) ? (value.checks as Array<Record<string, unknown>>) : []
  for (const check of checks) {
    lines.push(`- ${check.ok === true ? 'OK' : 'NG'} ${String(check.name)}${check.detail ? `：${String(check.detail)}` : ''}`)
  }
  if (typeof value?.hint === 'string' && value.hint) lines.push('', value.hint)
  return lines.join('\n')
}
