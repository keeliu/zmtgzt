/**
 * dsh-easel-orchestrator：把 Easel 接入 DeepSeek Harness。
 *
 * 本插件**不复制 Easel 的内容**，只做三件接入的事：
 *   1. 契约注入：读 `openclaw/workspace/SOUL.md` + `AGENTS.md`，作为运行时技能注入
 *   2. 技能注册：扫描 skills/openclaw 下每个技能的 SKILL.md，注册为 dsh 技能（按需加载）
 *   3. 脚本执行：把 Easel 的 Python 脚本包装成工具（skills 下的 scripts 目录），走确定性 IO
 *
 * 画像与产物仍是 Easel 仓库里的 `profiles/` 与 `outputs/`，插件不另存一份。
 * @module dsh-easel-orchestrator
 */
import { execFile } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN_ID, PLUGIN_VERSION, resolveConfig, type EaselConfig } from './config.ts'
import { EASEL_SHARED_DIR, EASEL_SKILLS_DIR, EASEL_WORKSPACE_DIR, EaselRepo } from './easel-repo.ts'
import { composeContract, skillRegistrationOf } from './orchestration.ts'
import { createTools } from './tools.ts'

export const name = PLUGIN_ID
/** 工具注册依赖 tools 服务；skills / webServer 走响应式注入，允许晚于本插件启动。 */
export const inject = ['tools']

export const HEALTH_PATH = '/api/easel/health'
const API_PREFIX = '/api/easel'
/** 契约技能名——与 Easel 技能名区分开。 */
const CONTRACT_SKILL = 'easel-orchestrator'

/** 体检要核对的仓库内关键路径。 */
const REQUIRED_PATHS: Array<{ path: string; label: string }> = [
  { path: `${EASEL_WORKSPACE_DIR}/SOUL.md`, label: 'SOUL.md（人格层）' },
  { path: `${EASEL_WORKSPACE_DIR}/AGENTS.md`, label: 'AGENTS.md（编排层）' },
  { path: EASEL_SKILLS_DIR, label: '技能目录 skills/openclaw' },
  { path: EASEL_SHARED_DIR, label: '共享脚本 skills/shared/scripts' },
  { path: '.env', label: '.env（API key）' },
]

export async function apply(ctx: Context, rawConfig?: EaselConfig) {
  const config = resolveConfig(rawConfig)
  const repo = new EaselRepo(config.easelRoot)
  const doctor = () => runDoctor(config, repo)

  ctx.provide('easelRepo', repo)

  // ---- 工具层 ----
  const tools = createTools({ config, repo, doctor })
  try {
    for (const tool of tools) ctx.tools.register(tool)
    ctx.logger?.info?.(`[${PLUGIN_ID}] 注册 ${tools.length} 个工具（v${PLUGIN_VERSION}）`)
  } catch (error) {
    ctx.logger?.error?.(`[${PLUGIN_ID}] 工具注册失败：${String(error)}`)
    throw error
  }

  // ---- 技能层：契约 + Easel 技能 ----
  if (config.injectOrchestration || config.registerEaselSkills) {
    const [contract, allSkills] = await Promise.all([
      config.injectOrchestration ? composeContract(repo) : Promise.resolve(undefined),
      config.registerEaselSkills ? repo.listSkills() : Promise.resolve([]),
    ])
    const skills = config.skillLayers.length
      ? allSkills.filter((sk) => sk.layer && config.skillLayers.includes(sk.layer))
      : allSkills

    ctx.inject(['skills'], (skillCtx: any) => {
      let registered = 0
      if (contract) {
        try {
          skillCtx.skills.register({
            name: CONTRACT_SKILL,
            description:
              'Easel 编排契约：Easel 仓库中 SOUL.md（人格）与 AGENTS.md（五层分工、Plan Mode、' +
              '纵向编排、发布安全门禁）的原文，外加本插件的接入说明。做任何社媒内容任务前先加载。',
            whenToUse:
              '用户要做社媒内容（找热点、定策略、做图文/视频/小说/短剧/论文解读、发布、复盘）时使用。',
            source: 'runtime',
            provider: PLUGIN_ID,
            content: contract.content,
          })
          registered += 1
          ctx.logger?.info?.(
            `[${PLUGIN_ID}] 已注入编排契约（SOUL=${contract.hasSoul} AGENTS=${contract.hasAgents}）`
          )
        } catch (error) {
          ctx.logger?.warn?.(`[${PLUGIN_ID}] 契约注册失败：${String(error)}`)
        }
      }
      for (const meta of skills) {
        try {
          const reg = skillRegistrationOf(meta)
          skillCtx.skills.register({ ...reg, source: 'runtime', provider: PLUGIN_ID, content: '' })
          registered += 1
        } catch (error) {
          // 与本地同名技能冲突时跳过，不影响其它技能注册
          ctx.logger?.warn?.(`[${PLUGIN_ID}] 技能 ${meta.name} 注册跳过：${String(error)}`)
        }
      }
      ctx.logger?.info?.(`[${PLUGIN_ID}] 注册 ${registered} 个技能（Easel 技能 ${skills.length} 个）`)
    })
  }

  // ---- Web 路由 ----
  ctx.inject(['webServer'], (webCtx: any) => {
    const webServer = webCtx.webServer
    if (!webServer?.register) {
      ctx.logger?.warn?.(`[${PLUGIN_ID}] ctx.webServer 不可用（headless profile？），跳过 HTTP 路由`)
      return
    }
    registerRoutes(webServer, config, repo, doctor)
    ctx.logger?.info?.(`[${PLUGIN_ID}] 路由已注册：${API_PREFIX}/*`)
  })
}

// ---------------------------------------------------------------------------
// 环境体检
// ---------------------------------------------------------------------------

interface DoctorCheck {
  name: string
  ok: boolean
  detail?: string
}

async function runDoctor(
  config: ReturnType<typeof resolveConfig>,
  repo: EaselRepo
): Promise<Record<string, unknown>> {
  const checks: DoctorCheck[] = []

  checks.push({
    name: 'Easel 根目录已配置',
    ok: Boolean(config.easelRoot),
    detail: config.easelRoot ?? 'config.easelRoot 为空',
  })

  if (!config.easelRoot) {
    return {
      healthy: false,
      plugin: PLUGIN_ID,
      version: PLUGIN_VERSION,
      checks,
      hint:
        '在 dsh 配置里为 dsh-easel-orchestrator 设置 config.easelRoot，指向本地 Easel 仓库的绝对路径\n' +
        '（该目录下应有 openclaw/workspace/AGENTS.md 与 skills/）。\n' +
        '推荐直接从官方仓库获取：git clone https://github.com/ZJU-REAL/Easel\n' +
        '配置后重新加载插件，再跑一次 easel_doctor。',
    }
  }

  const root = config.easelRoot
  for (const item of REQUIRED_PATHS) {
    const ok = await repo.has(item.path)
    checks.push({ name: item.label, ok, detail: ok ? undefined : `缺失：${item.path}` })
  }

  const python = await probePython(config.pythonPath)
  checks.push({ name: `Python 可用（${config.pythonPath}）`, ok: python.ok, detail: python.detail })

  const skills = await repo.listSkills()
  checks.push({
    name: 'Easel 技能可扫描',
    ok: skills.length > 0,
    detail: skills.length
      ? `发现 ${skills.length} 个技能，层：${[...new Set(skills.map((s) => s.layer ?? '?'))].sort().join('/')}`
      : `未在 ${EASEL_SKILLS_DIR} 下发现 SKILL.md`,
  })

  const sharedScripts = await repo.listSharedScripts()
  checks.push({
    name: '共享脚本可枚举',
    ok: sharedScripts.length > 0,
    detail: sharedScripts.length ? `${sharedScripts.length} 个脚本` : '未发现 .py 脚本',
  })

  const failed = checks.filter((c) => !c.ok)
  return {
    healthy: failed.length === 0,
    plugin: PLUGIN_ID,
    version: PLUGIN_VERSION,
    easelRoot: root,
    pythonPath: config.pythonPath,
    scriptTimeoutMs: config.scriptTimeoutMs,
    skillCount: skills.length,
    checks,
    hint: failed.length === 0
      ? '环境就绪。可以先 easel_skill（action=list）看技能，再按任务 read 对应技能。'
      : [
          '以下项未通过，逐项修复后重跑 easel_doctor：',
          ...failed.map((c) => `- ${c.name}${c.detail ? `：${c.detail}` : ''}`),
          '',
          `配置位置：dsh 配置中 dsh-easel-orchestrator 的 config.easelRoot（当前：${root}）`,
          'Python 解释器可用 config.pythonPath 覆盖（Windows 常见为 py 或解释器绝对路径）。',
          '若仓库不完整，建议重新 clone 官方仓库：https://github.com/ZJU-REAL/Easel',
        ].join('\n'),
  }
}

function probePython(pythonPath: string): Promise<{ ok: boolean; detail?: string }> {
  return new Promise((resolvePromise) => {
    execFile(pythonPath, ['--version'], { timeout: 15_000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ ok: false, detail: `${error.message}（可用 config.pythonPath 指定解释器）` })
        return
      }
      resolvePromise({ ok: true, detail: (stdout || stderr || '').trim() || 'ok' })
    })
  })
}

// ---------------------------------------------------------------------------
// HTTP 路由（前端视图的数据面）
// ---------------------------------------------------------------------------

function json(res: any, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: any): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

function registerRoutes(
  webServer: any,
  config: ReturnType<typeof resolveConfig>,
  repo: EaselRepo,
  doctor: () => Promise<Record<string, unknown>>
): void {
  const root = config.easelRoot

  webServer.register({
    kind: 'exact',
    path: HEALTH_PATH,
    handler: (_req: any, res: any) => {
      json(res, 200, {
        plugin: PLUGIN_ID,
        version: PLUGIN_VERSION,
        ok: true,
        easelRoot: root ?? null,
      })
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/doctor`,
    handler: async (_req: any, res: any) => {
      try {
        json(res, 200, await doctor())
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/skills`,
    handler: async (_req: any, res: any) => {
      const skills = await repo.listSkills()
      json(res, 200, {
        ok: true,
        count: skills.length,
        skills: skills.map((s) => ({ name: s.name, layer: s.layer ?? null, description: s.whenToUse })),
      })
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/profile`,
    handler: async (req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: 'easelRoot 未配置', profiles: [] })
          return
        }
        const dir = `${root}/profiles`
        if (req.method === 'GET') {
          const { readdir } = await import('node:fs/promises')
          const names = await readdir(dir, { withFileTypes: true })
            .then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort())
            .catch(() => [])
          json(res, 200, { ok: true, root: dir, profiles: names.filter((n) => !n.startsWith('_')) })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const name = String(body.name ?? '').trim()
          const file = String(body.file ?? '').trim()
          const content = String(body.content ?? '')
          if (!name || !file) {
            json(res, 400, { ok: false, error: 'name 与 file 为必填' })
            return
          }
          const { mkdir, writeFile } = await import('node:fs/promises')
          const target = `${dir}/${name}/${file}.md`
          await mkdir(`${dir}/${name}`, { recursive: true })
          await writeFile(target, content, 'utf8')
          json(res, 200, { ok: true, path: target })
          return
        }
        res.writeHead(405)
        res.end()
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/profile-read`,
    handler: async (req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, profiles: {} })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const name = url.searchParams.get('name') ?? ''
        if (!name) {
          json(res, 400, { ok: false, error: 'name 必填' })
          return
        }
        const { readFile } = await import('node:fs/promises')
        const dims = ['identity', 'style', 'audience', 'platforms', 'preferences', 'memory']
        const files: Record<string, string> = {}
        for (const dim of dims) {
          const text = await readFile(`${root}/profiles/${name}/${dim}.md`, 'utf8').catch(() => undefined)
          if (text !== undefined) files[dim] = text
        }
        json(res, 200, { ok: true, name, dimensions: files })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/projects`,
    handler: async (_req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: true, projects: [] })
          return
        }
        const { readdir } = await import('node:fs/promises')
        const names = await readdir(`${root}/outputs`, { withFileTypes: true })
          .then((xs) => xs.filter((x) => x.isDirectory()).map((x) => x.name).sort())
          .catch(() => [])
        json(res, 200, { ok: true, root: `${root}/outputs`, projects: names })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/project`,
    handler: async (req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: 'easelRoot 未配置' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const topic = url.searchParams.get('topic') ?? ''
        if (!topic) {
          json(res, 400, { ok: false, error: 'topic 必填' })
          return
        }
        const { readFile, readdir } = await import('node:fs/promises')
        const dir = `${root}/outputs/${topic}`
        let manifest: unknown = null
        const raw = await readFile(`${dir}/manifest.json`, 'utf8').catch(() => undefined)
        if (raw) {
          try {
            manifest = JSON.parse(raw)
          } catch {
            manifest = { parseError: true }
          }
        }
        const entries = await readdir(dir, { withFileTypes: true })
          .then((xs) => xs.map((x) => ({ name: x.name, isDir: x.isDirectory() })))
          .catch(() => [])
        json(res, 200, { ok: true, topic, dir, manifest, entries })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })
}
