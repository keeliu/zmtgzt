/**
 * 渠道账号服务：登录态探测、扫码登录编排、登出与创作数据读取。
 *
 * 两条硬约束（来自实测，不是推测）：
 *   1. **登录态真相源**是 Easel 既有的 Playwright 持久化目录 `~/.easel-browser-profiles/`，
 *      插件只读它、不另建存储，也不改其结构。
 *   2. **只对上游已实现的能力暴露操作**。`web_publisher.py` 与 `account_stats.py` 的
 *      `PLATFORMS` 字典中都没有 `toutiao`，因此今日头条被标注为「暂不支持」且不渲染任何按钮——
 *      而不是给一个注定失败的按钮。
 *
 * 各渠道的 CLI 均取自对应脚本的 argparse 定义：
 *   - 小红书：`xhs_publish.py` 的 `check` / `login` / `whoami` / `publish`
 *   - 公众号：`weixin_mp_stats.py` 的 `login` / `whoami` / `stats` / `publish`
 *   - 账号数据：`account_stats.py` 的 `fetch --platform`
 * @module dsh-zmtgzt/account
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedConfig } from './config.ts'
import { preflightLogin, type PreflightReport } from './preflight.ts'
import { runEaselScript, type EaselResult } from './runner.ts'

/** 一个渠道的静态定义。 */
export interface ChannelSpec {
  id: string
  /** 显示名。 */
  name: string
  /** Playwright 持久化目录名（相对 `~/.easel-browser-profiles/`）。 */
  profile: string
  /** 上游是否实现了登录。 */
  supportsLogin: boolean
  /** 上游是否实现了发布。 */
  supportsPublish: boolean
  /** 登录脚本（根相对路径）。 */
  loginScript?: string
  /** whoami 脚本（根相对路径）。 */
  whoamiScript?: string
  /** 发布脚本（根相对路径）。 */
  publishScript?: string
  /** 不支持时的原因说明。 */
  reason?: string
}

/**
 * 内置渠道表。
 * 支持状态逐项对照脚本实测结果；新增渠道请走配置扩展点（见 `extraChannels`）。
 */
export const BUILTIN_CHANNELS: ChannelSpec[] = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    profile: 'XiaohongshuProfile',
    supportsLogin: true,
    supportsPublish: true,
    loginScript: 'skills/shared/scripts/xhs_publish.py',
    whoamiScript: 'skills/shared/scripts/xhs_publish.py',
    publishScript: 'skills/shared/scripts/xhs_publish.py',
  },
  {
    id: 'wechat-mp',
    name: '微信公众号',
    profile: 'WechatMpProfile',
    supportsLogin: true,
    supportsPublish: true,
    loginScript: 'skills/shared/scripts/weixin_mp_stats.py',
    whoamiScript: 'skills/shared/scripts/weixin_mp_stats.py',
    publishScript: 'skills/shared/scripts/weixin_mp_stats.py',
  },
  {
    id: 'toutiao',
    name: '今日头条',
    profile: 'ToutiaoProfile',
    supportsLogin: false,
    supportsPublish: false,
    reason:
      'Easel 上游未提供今日头条的登录与发布实现：web_publisher.py 与 account_stats.py 的 ' +
      'PLATFORMS 中均无 toutiao，唯一提及它的 multi_publish.py 依赖 Wechatsync 扩展且标注为不可用。',
  },
]

/** 某渠道的当前状态。 */
export interface ChannelStatus {
  id: string
  name: string
  supportsLogin: boolean
  supportsPublish: boolean
  /** 本地是否已存在登录态目录（快速判定，不启动浏览器）。 */
  profilePresent: boolean
  /** 精确昵称等信息，仅在显式执行 whoami 后填充。 */
  nickname?: string
  /** 不支持时的原因。 */
  reason?: string
  /** 该渠道的 profile 目录绝对路径。 */
  profileDir: string
}

/** 扫码登录会话。 */
export interface LoginSession {
  channelId: string
  /** 登录方式：qr = headless 抠二维码；window = 弹出浏览器窗口登录。 */
  mode: 'qr' | 'window'
  /** 二维码图片路径（由脚本写入）。 */
  qrOut: string
  /** 登录状态 JSON 路径（由脚本原子写，供轮询）。 */
  statusFile: string
  /** 脚本 stdout/stderr 落盘路径（排障用）。 */
  logPath: string
  startedAt: string
}

/** 发起登录失败。`preflight` 存在时表示环境未就绪、进程未启动。 */
export interface LoginFailure {
  error: string
  hint?: string
  preflight?: PreflightReport
}

/** 发起登录的可选项。 */
export interface StartLoginOptions {
  /** 登录方式，默认 qr（headless 抠二维码）。 */
  mode?: 'qr' | 'window'
}

/** 登录状态的可选取值（与 login_state.py 的状态机一致）。 */
export type LoginState =
  | 'starting'
  | 'qr_ready'
  | 'window_login'
  | 'scanned'
  | 'sms_required'
  | 'verifying'
  | 'success'
  | 'expired'
  | 'error'
  | 'unknown'

export class AccountService {
  constructor(private readonly config: ResolvedConfig) {}

  /** Playwright 持久化目录根。 */
  get profileBase(): string {
    return join(homedir(), '.easel-browser-profiles')
  }

  /** 渠道表（内置 + 配置扩展）。 */
  channels(): ChannelSpec[] {
    const extra = (this.config.extraChannels ?? []).map((c) => ({ ...c }))
    return [...BUILTIN_CHANNELS, ...extra]
  }

  /** 按 id 取渠道定义。 */
  channel(id: string): ChannelSpec | undefined {
    return this.channels().find((c) => c.id === id)
  }

  /** 列出各渠道状态（不启动浏览器，仅看本地登录态目录）。 */
  async list(): Promise<ChannelStatus[]> {
    return this.channels().map((spec) => {
      const profileDir = join(this.profileBase, spec.profile)
      return {
        id: spec.id,
        name: spec.name,
        supportsLogin: spec.supportsLogin,
        supportsPublish: spec.supportsPublish,
        profilePresent: existsSync(profileDir),
        ...(spec.reason ? { reason: spec.reason } : {}),
        profileDir,
      }
    })
  }

  /** 精确查询某渠道的身份（启动浏览器跑 whoami，较慢）。 */
  async whoami(id: string, signal?: AbortSignal): Promise<EaselResult> {
    const spec = this.channel(id)
    if (!spec) return { ok: false, kind: 'not-configured', error: `未知渠道：${id}`, hint: '检查渠道 id。' }
    if (!spec.supportsLogin || !spec.whoamiScript) {
      return {
        ok: false,
        kind: 'not-configured',
        error: `${spec.name} 不支持登录态查询。`,
        hint: spec.reason ?? '上游未实现该渠道。',
      }
    }
    return runEaselScript(this.config, spec.whoamiScript, {}, signal, ['whoami'])
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
  async startLogin(
    id: string,
    options: StartLoginOptions = {},
    signal?: AbortSignal
  ): Promise<LoginSession | LoginFailure> {
    const spec = this.channel(id)
    if (!spec) return { error: `未知渠道：${id}` }
    if (!spec.supportsLogin || !spec.loginScript) {
      return { error: `${spec.name} 不支持登录。`, hint: spec.reason ?? '上游未实现该渠道。' }
    }
    const root = this.config.easelRoot
    if (!root) return { error: '生效根不可用', hint: '请先运行 zmtgzt_doctor 排查。' }

    const scriptPath = join(root, spec.loginScript)
    if (!existsSync(scriptPath)) {
      return {
        error: `登录脚本不存在：${scriptPath}`,
        hint: '内置快照可能不完整，请重装插件或重跑 sync-easel。',
      }
    }

    const mode: 'qr' | 'window' = options.mode === 'window' ? 'window' : 'qr'

    // 窗口登录不抠二维码，因此不要求 opencv-python / Pillow
    const report = await preflightLogin(this.config, mode === 'qr', signal)
    if (!report.ok) {
      return {
        error: '运行环境未就绪，未启动登录进程。',
        ...(report.hint ? { hint: report.hint } : {}),
        preflight: report,
      }
    }

    const sessionDir = join(this.config.dataDir, 'login')
    mkdirSync(sessionDir, { recursive: true })
    const qrOut = join(sessionDir, `${id}.png`)
    const statusFile = join(sessionDir, `${id}.json`)
    const logPath = join(sessionDir, `${id}.log`)
    // 清掉上一轮残留，避免前端读到过期状态或过期二维码
    rmSync(qrOut, { force: true })
    rmSync(statusFile, { force: true })
    writeFileSync(
      logPath,
      `[dsh-zmtgzt] ${new Date().toISOString()} 启动 ${spec.name} 登录（方式：${mode}）\n` +
        `解释器：${this.config.pythonPath}\n脚本：${scriptPath}\n\n`,
      'utf8'
    )

    const args = [scriptPath, 'login', '--qr-out', qrOut, '--status-file', statusFile, '--timeout', '240']
    if (mode === 'window') args.push('--headed')

    let child: ReturnType<typeof spawn>
    try {
      const fd = openSync(logPath, 'a')
      child = spawn(this.config.pythonPath, args, {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', fd, fd],
      })
      // spawn 已把 fd 复制给子进程，父进程这份可立即释放
      closeSync(fd)
    } catch (error) {
      const message = `无法启动登录脚本：${String(error)}`
      this.writeFailureStatus(statusFile, message)
      return { error: message, hint: '检查配置中的 pythonPath 与文件执行权限。' }
    }

    // 解释器不存在等启动失败：写成状态，前端便能显示原因而不是 unknown
    child.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      const message =
        code === 'ENOENT'
          ? `找不到 Python 解释器：${this.config.pythonPath}。请在插件配置里修正 pythonPath。`
          : `无法启动登录脚本：${error.message}`
      this.writeFailureStatus(statusFile, message)
    })

    // 脚本退出却没写终态：归因到「脚本未写状态即退出」并指向日志
    child.on('exit', (code, signalName) => {
      const current = this.loginStatus(id)
      if (current.state === 'unknown' || current.state === 'starting') {
        this.writeFailureStatus(
          statusFile,
          `登录脚本已退出（${code ?? signalName ?? '未知原因'}），且未写入状态。` +
            `常见原因是缺少 Python 依赖，请查看登录日志：${logPath}`
        )
      }
    })

    child.unref()

    return {
      channelId: id,
      mode,
      qrOut,
      statusFile,
      logPath,
      startedAt: new Date().toISOString(),
    }
  }

  /** 由插件侧写入失败状态，格式与上游 login_state.py 的协议一致。 */
  private writeFailureStatus(statusFile: string, message: string): void {
    try {
      writeFileSync(
        statusFile,
        JSON.stringify({ state: 'error', message, qr: '', ts: Math.floor(Date.now() / 1000) }),
        'utf8'
      )
    } catch {
      /* 写不进去时前端会停在 unknown，属可接受降级 */
    }
  }

  /** 二维码 PNG 路径（供 HTTP 端点读取）。 */
  qrPath(id: string): string {
    return join(this.config.dataDir, 'login', `${id}.png`)
  }

  /** 读取某渠道最近一次登录的脚本日志（排障用）。 */
  readLoginLog(id: string): { path: string; content: string; exists: boolean; truncated: boolean } {
    const path = join(this.config.dataDir, 'login', `${id}.log`)
    try {
      const raw = readFileSync(path, 'utf8')
      const limit = 20_000
      const truncated = raw.length > limit
      return {
        path,
        content: truncated ? `…（仅显示最后 ${limit} 字符）\n${raw.slice(-limit)}` : raw,
        exists: true,
        truncated,
      }
    } catch {
      return { path, content: '', exists: false, truncated: false }
    }
  }

  /** 读取扫码登录的当前状态（前端轮询）。 */
  loginStatus(id: string): { state: LoginState; message: string; qr: string; qrOut: string } {
    const sessionDir = join(this.config.dataDir, 'login')
    const qrOut = join(sessionDir, `${id}.png`)
    const statusFile = join(sessionDir, `${id}.json`)
    try {
      const raw = readFileSync(statusFile, 'utf8')
      const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as { state?: string; message?: string; qr?: string }
      const state = (data.state ?? 'unknown') as LoginState
      return { state, message: data.message ?? '', qr: data.qr ?? '', qrOut }
    } catch {
      return { state: 'unknown', message: '', qr: '', qrOut }
    }
  }

  /**
   * 登出：删除该渠道的持久化目录。
   * 只删 `~/.easel-browser-profiles/<profile>`，不动其它渠道与用户其它数据。
   */
  async logout(id: string): Promise<{ ok: boolean; removed?: string; error?: string }> {
    const spec = this.channel(id)
    if (!spec) return { ok: false, error: `未知渠道：${id}` }
    const profileDir = join(this.profileBase, spec.profile)
    try {
      rmSync(profileDir, { recursive: true, force: true })
      // 一并清掉本轮登录会话残留（状态、二维码、日志）
      rmSync(join(this.config.dataDir, 'login', `${id}.json`), { force: true })
      rmSync(join(this.config.dataDir, 'login', `${id}.png`), { force: true })
      rmSync(join(this.config.dataDir, 'login', `${id}.log`), { force: true })
      return { ok: true, removed: profileDir }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  /** 读取创作数据（粉丝 / 获赞 / 作品列表）。 */
  async stats(id: string, signal?: AbortSignal): Promise<EaselResult> {
    const spec = this.channel(id)
    if (!spec) return { ok: false, kind: 'not-configured', error: `未知渠道：${id}`, hint: '检查渠道 id。' }
    if (!spec.supportsLogin) {
      return {
        ok: false,
        kind: 'not-configured',
        error: `${spec.name} 不支持创作数据查询。`,
        hint: spec.reason ?? '上游未实现该渠道。',
      }
    }
    return runEaselScript(
      this.config,
      'skills/shared/scripts/account_stats.py',
      { platform: id === 'wechat-mp' ? 'weixin-mp' : id },
      signal,
      ['fetch']
    )
  }

  /** 探测 Playwright 运行时是否可用（`check` 子命令）。 */
  async checkRuntime(signal?: AbortSignal): Promise<EaselResult> {
    const spec = this.channels().find((c) => c.supportsLogin)
    if (!spec?.loginScript) {
      return { ok: false, kind: 'not-configured', error: '没有可用的渠道脚本', hint: '内置快照可能不完整。' }
    }
    return runEaselScript(this.config, spec.loginScript, {}, signal, ['check'])
  }
}
