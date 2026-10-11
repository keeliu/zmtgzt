/**
 * dsh-zmtgzt：把 Easel 接入 DeepSeek Harness。
 *
 * 内容来源：插件**随包自带一份 Easel 快照**（`vendor/easel/`），首次启动释放到用户可写目录，
 * 因此装完即用、无需先 clone Easel；若配置了 `config.easelRoot`，则改用自备仓库。
 * 插件自己不撰写任何 Easel 内容——契约与技能均来自该快照（由 `scripts/sync-easel.mjs` 同步上游）。
 *
 * 只做三件接入的事：
 *   1. 契约注入：读 `openclaw/workspace/SOUL.md` + `AGENTS.md`，作为运行时技能注入
 *   2. 技能注册：扫描 skills/openclaw 下每个技能的 SKILL.md，注册为 dsh 技能（按需加载）
 *   3. 脚本执行：把 Easel 的 Python 脚本包装成工具，走确定性 IO
 *
 * 画像与产物写在生效根的 `profiles/` 与 `outputs/`，插件不另存一份。
 * @module dsh-zmtgzt
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN_ID, PLUGIN_VERSION, resolveConfig, type ZmtgztConfig } from './config.ts'
import { EASEL_SHARED_DIR, EASEL_SKILLS_DIR, EASEL_WORKSPACE_DIR, EaselRepo } from './repo.ts'
import { composeContract, skillRegistrationOf } from './orchestration.ts'
import { createTools } from './tools.ts'
import { directorySize, ensureWorkspace, type WorkspaceInfo } from './workspace.ts'
import { AccountService } from './account.ts'
import { TopicStore } from './topics.ts'
import { SessionBindingStore } from './session-bindings.ts'
import {
  maskAppId,
  readWechatConfig,
  removeWechatAccount,
  verifyWechatCredentials,
  writeWechatAccount,
} from './wechat-config.ts'

export const name = PLUGIN_ID
/** 工具注册依赖 tools 服务；skills / webServer 走响应式注入，允许晚于本插件启动。 */
export const inject = ['tools']

export const HEALTH_PATH = '/api/zmtgzt/health'
const API_PREFIX = '/api/zmtgzt'
/** 契约技能名——与 Easel 技能名区分开。 */
const CONTRACT_SKILL = 'zmtgzt'

/** 体检要核对的仓库内关键路径（契约文件单独处理，因为它有根目录优先的读取顺序）。 */
const REQUIRED_PATHS: Array<{ path: string; label: string }> = [
  { path: EASEL_SKILLS_DIR, label: '技能目录 skills/openclaw' },
  { path: EASEL_SHARED_DIR, label: '共享脚本 skills/shared/scripts' },
  { path: '.env', label: '.env（API key）' },
]

export async function apply(ctx: Context, rawConfig?: ZmtgztConfig) {
  const config = resolveConfig(rawConfig)
  // 生效根：自备仓库优先，否则释放内置快照到用户可写目录
  const workspace = ensureWorkspace(config)
  const repo = new EaselRepo(workspace.root)
  const doctor = () => runDoctor(config, repo, workspace)

  // 工作台三项服务：账号、主题、会话绑定。都以生效根为工作基准。
  const root = workspace.root
  const account = new AccountService({ ...config, easelRoot: root })
  const topics = new TopicStore(join(root, 'outputs'))
  const bindings = new SessionBindingStore(join(config.dataDir, 'bindings.json'))

  ctx.provide('zmtgztRepo', repo)
  ctx.provide('zmtgztWorkspace', workspace)
  ctx.provide('zmtgztAccount', account)
  ctx.provide('zmtgztTopics', topics)
  ctx.provide('zmtgztBindings', bindings)

  if (workspace.release?.updated) {
    ctx.logger?.info?.(`[${PLUGIN_ID}] 已释放内置 Easel 快照（${workspace.release.reason}）→ ${workspace.root}`)
  }
  if (workspace.createdEnv) {
    ctx.logger?.warn?.(
      `[${PLUGIN_ID}] 已从 .env.example 生成 ${workspace.root}/.env —— 脚本类工具需要你填入 API key 后才能工作。`
    )
  }
  for (const warning of workspace.warnings) {
    ctx.logger?.warn?.(`[${PLUGIN_ID}] ${warning}`)
  }

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
    registerRoutes(webServer, config, root, repo, doctor, account, topics, bindings)
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
  repo: EaselRepo,
  workspace: WorkspaceInfo
): Promise<Record<string, unknown>> {
  const checks: DoctorCheck[] = []

  checks.push({
    name: '生效的 Easel 根目录',
    ok: Boolean(workspace.root),
    detail: `${workspace.root}（${workspace.source === 'configured' ? '自备仓库' : '内置快照'}）`,
  })
  if (workspace.source === 'embedded') {
    checks.push({
      name: '内置快照版本',
      ok: Boolean(workspace.commit),
      detail: workspace.commit
        ? `${workspace.commit.slice(0, 10)}${workspace.release?.reason ? ` · ${workspace.release.reason}` : ''}`
        : '未找到 SYNC-INFO.json（无法确认上游版本）',
    })
  }

  // 契约文件：读一次以填充来源缓存，然后报告**实际**读取路径（根目录优先）
  const contract = await repo.readContract()
  const sources = repo.contractSourcePaths()
  checks.push({
    name: 'SOUL.md（人格层）',
    ok: Boolean(contract.soul),
    detail: sources.soul ?? '未找到（根目录与 openclaw/workspace/ 均缺失）',
  })
  checks.push({
    name: 'AGENTS.md（编排层）',
    ok: Boolean(contract.agents),
    detail: sources.agents ?? '未找到（根目录与 openclaw/workspace/ 均缺失）',
  })

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
  const envMissing = failed.some((c) => c.name.startsWith('.env'))

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
    hint:
      failed.length === 0
        ? '环境就绪。可以先 zmtgzt_skill（action=list）看技能，再按任务 read 对应技能。'
        : [
            '以下项未通过，逐项修复后重跑 zmtgzt_doctor：',
            ...failed.map((c) => `- ${c.name}${c.detail ? `：${c.detail}` : ''}`),
            '',
            workspace.source === 'embedded'
              ? `契约与技能来自内置快照（已释放到 ${config.workspaceDir}），无需 clone Easel。`
              : `当前使用自备仓库：${workspace.root}`,
            envMissing
              ? `脚本类工具需要 API key：编辑 ${workspace.root}/.env 填入后即可。\n` +
                '不填也能用技能与契约（纯文字类工作不受影响）。'
              : '',
            'Python 解释器可用 config.pythonPath 覆盖（Windows 常见为 py 或解释器绝对路径）。',
            '想换成自备仓库或跟进最新上游：设置 config.easelRoot，或运行 node scripts/sync-easel.mjs 更新内置快照。',
          ]
            .filter(Boolean)
            .join('\n'),
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

/** 二进制响应（二维码 PNG 等）。 */
function binary(res: any, status: number, contentType: string, body: Buffer): void {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' })
  res.end(body)
}

/** 公众号官方 API 配置的脱敏状态——不回传 AppSecret 明文。 */
function wechatStatus(root: string): Record<string, unknown> {
  const view = readWechatConfig(root)
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
      configured: Boolean(account.appId && account.hasSecret),
    })),
  }
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
  /**
   * 生效根：自备仓库或已释放的内置快照。
   * 路由一律用它——**不能**用 `config.easelRoot`，后者在内置快照场景下是空的，
   * 会让所有文件类路由误报「未配置」。
   */
  root: string,
  repo: EaselRepo,
  doctor: () => Promise<Record<string, unknown>>,
  account: AccountService,
  topics: TopicStore,
  bindings: SessionBindingStore
): void {

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

  // -------------------------------------------------------------------------
  // 账号：列表 / 扫码登录 / 登录状态 / 登出 / 身份 / 创作数据
  // -------------------------------------------------------------------------

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account`,
    handler: async (_req: any, res: any) => {
      try {
        json(res, 200, { ok: true, channels: await account.list() })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/login`,
    handler: async (req: any, res: any) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        const body = await readJsonBody(req)
        const channelId = String(body.channelId ?? '')
        const mode = body.mode === 'window' ? 'window' : 'qr'
        const session = await account.startLogin(channelId, { mode })
        if ('error' in session) {
          // 预检未通过时附带完整探测结果，前端可逐项展示缺失与修复命令
          json(res, 400, { ok: false, ...session })
          return
        }
        json(res, 200, { ok: true, session })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  // 二维码图片：独立端点而非内嵌 base64 —— 状态轮询是高频的，
  // 图片交给浏览器按需加载与缓存；且「图存在与否」与「状态」解耦，
  // 状态说 qr_ready 而文件尚未落盘时这里返回 404，前端据此不渲染破图。
  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/login/qr`,
    handler: (req: any, res: any) => {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const channelId = url.searchParams.get('channelId') ?? ''
      try {
        const qrPath = account.qrPath(channelId)
        if (!channelId || !existsSync(qrPath)) {
          json(res, 404, { ok: false, error: '二维码尚未生成' })
          return
        }
        binary(res, 200, 'image/png', readFileSync(qrPath))
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  // 登录脚本日志：脚本在写状态之前就退出时，这是唯一的排障线索
  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/login/log`,
    handler: (req: any, res: any) => {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const channelId = url.searchParams.get('channelId') ?? ''
      json(res, 200, { ok: true, ...account.readLoginLog(channelId) })
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/login/status`,
    handler: (req: any, res: any) => {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const channelId = url.searchParams.get('channelId') ?? ''
      json(res, 200, { ok: true, ...account.loginStatus(channelId) })
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/logout`,
    handler: async (req: any, res: any) => {
      try {
        const body = await readJsonBody(req)
        json(res, 200, await account.logout(String(body.channelId ?? '')))
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/whoami`,
    handler: async (req: any, res: any) => {
      try {
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const result = await account.whoami(url.searchParams.get('channelId') ?? '')
        json(res, 200, result)
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/stats`,
    handler: async (req: any, res: any) => {
      try {
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const result = await account.stats(url.searchParams.get('channelId') ?? '')
        json(res, 200, result)
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  // -------------------------------------------------------------------------
  // 公众号「官方 API」凭证：读取状态 / 写入并校验 / 清除
  //   与「扫码登录后台会话」并列，两种方式由用户按条件选择。
  //   配置文件位置由上游 config.py 固定，插件必须写到那里。
  // -------------------------------------------------------------------------

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/wechat`,
    handler: async (req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: '生效根不可用', config: null })
          return
        }
        if (req.method === 'GET') {
          json(res, 200, { ok: true, config: wechatStatus(root) })
          return
        }
        const body = await readJsonBody(req)
        const key = String(body.key ?? 'default').trim() || 'default'
        const appId = String(body.appId ?? '').trim()
        const appSecret = String(body.appSecret ?? '').trim()
        const author = String(body.author ?? '').trim()
        const theme = String(body.theme ?? '').trim()
        if (!appId || !appSecret) {
          json(res, 400, { ok: false, error: 'AppID 与 AppSecret 均为必填。', config: wechatStatus(root) })
          return
        }
        // 先校验再落盘：凭证无效时不写坏配置
        const check = await verifyWechatCredentials(appId, appSecret)
        if (!check.ok) {
          json(res, 400, {
            ok: false,
            error: check.message,
            ...(check.hint ? { hint: check.hint } : {}),
            check,
            config: wechatStatus(root),
          })
          return
        }
        const written = writeWechatAccount(root, { key, appId, appSecret, author, theme })
        if (!written.ok) {
          json(res, 500, { ok: false, error: written.error ?? '写入失败', config: wechatStatus(root) })
          return
        }
        json(res, 200, { ok: true, check, written, config: wechatStatus(root) })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/account/wechat/remove`,
    handler: async (req: any, res: any) => {
      try {
        if (!root) {
          json(res, 200, { ok: false, error: '生效根不可用' })
          return
        }
        const body = await readJsonBody(req)
        const key = String(body.key ?? '').trim()
        if (!key) {
          json(res, 400, { ok: false, error: 'key 必填' })
          return
        }
        const result = removeWechatAccount(root, key)
        json(res, result.ok ? 200 : 500, { ...result, config: wechatStatus(root) })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  // -------------------------------------------------------------------------
  // 主题：列表 / 创建 / 重命名 / 删除 / 产物树
  // -------------------------------------------------------------------------

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/topic`,
    handler: async (req: any, res: any) => {
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const want = url.searchParams.get('name')
          if (want) {
            const dir = topics.dirOf(want)
            if (!dir) {
              json(res, 400, { ok: false, error: '主题名非法' })
              return
            }
            json(res, 200, {
              ok: true,
              name: want,
              dir,
              manifest: (await topics.readManifest(dir)) ?? null,
              entries: await topics.entries(want),
            })
            return
          }
          json(res, 200, { ok: true, root: topics.root, topics: await topics.list() })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const action = String(body.action ?? 'create')
          if (action === 'create') {
            const result = await topics.create(String(body.name ?? ''), body.baseDir ? String(body.baseDir) : undefined)
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'rename') {
            const result = await topics.rename(String(body.name ?? ''), String(body.nextName ?? ''))
            json(res, result.ok ? 200 : 400, result)
            return
          }
          if (action === 'remove') {
            const result = await topics.remove(String(body.name ?? ''))
            json(res, result.ok ? 200 : 400, result)
            return
          }
          json(res, 400, { ok: false, error: `未知操作：${action}` })
          return
        }
        res.writeHead(405)
        res.end()
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })

  // -------------------------------------------------------------------------
  // 会话与主题的绑定
  // -------------------------------------------------------------------------

  webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/binding`,
    handler: async (req: any, res: any) => {
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const sessionId = url.searchParams.get('sessionId')
          if (sessionId) {
            const binding = await bindings.get(sessionId)
            json(res, 200, { ok: true, sessionId, binding: binding ?? null })
            return
          }
          json(res, 200, { ok: true, bindings: await bindings.list() })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const sessionId = String(body.sessionId ?? '').trim()
          if (!sessionId) {
            json(res, 400, { ok: false, error: 'sessionId 为必填' })
            return
          }
          if (body.action === 'unbind') {
            json(res, 200, { ok: true, ...(await bindings.remove(sessionId)) })
            return
          }
          const topicName = String(body.topic ?? '').trim()
          const dir = topics.dirOf(topicName)
          if (!dir) {
            json(res, 400, { ok: false, error: `主题名非法：${topicName}` })
            return
          }
          // 绑定前确保主题目录存在，避免绑定到不存在的主题
          const created = await topics.create(topicName)
          if (!created.ok) {
            json(res, 400, { ok: false, error: created.reason })
            return
          }
          const binding = await bindings.set(sessionId, topicName, dir)
          json(res, 200, { ok: true, sessionId, binding })
          return
        }
        res.writeHead(405)
        res.end()
      } catch (error) {
        json(res, 500, { ok: false, error: String(error) })
      }
    },
  })
}
