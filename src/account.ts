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
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedConfig } from './config.ts'
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
  /** 二维码图片路径（由脚本写入）。 */
  qrOut: string
  /** 登录状态 JSON 路径（由脚本原子写，供轮询）。 */
  statusFile: string
  startedAt: string
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
   * 发起扫码登录。
   *
   * 登录是长流程（起浏览器 → 出二维码 → 等扫码 → 持久化），因此这里**后台起进程并立即返回**，
   * 由前端轮询 `statusFile` 获取进度——与 Easel 原本的 Web 后端做法一致。
   */
  async startLogin(id: string): Promise<LoginSession | { error: string; hint?: string }> {
    const spec = this.channel(id)
    if (!spec) return { error: `未知渠道：${id}` }
    if (!spec.supportsLogin || !spec.loginScript) {
      return { error: `${spec.name} 不支持登录。`, hint: spec.reason ?? '上游未实现该渠道。' }
    }
    const root = this.config.easelRoot
    if (!root) return { error: '生效根不可用', hint: '请先运行 zmtgzt_doctor 排查。' }

    const scriptPath = join(root, spec.loginScript)
    if (!existsSync(scriptPath)) {
      return { error: `登录脚本不存在：${scriptPath}`, hint: '内置快照可能不完整，请重装插件或重跑 sync-easel。' }
    }

    const sessionDir = join(this.config.dataDir, 'login')
    mkdirSync(sessionDir, { recursive: true })
    const qrOut = join(sessionDir, `${id}.png`)
    const statusFile = join(sessionDir, `${id}.json`)
    // 清掉上一轮残留，避免前端读到过期状态
    rmSync(qrOut, { force: true })
    rmSync(statusFile, { force: true })

    const child = spawn(
      this.config.pythonPath,
      [
        scriptPath,
        'login',
        '--qr-out', qrOut,
        '--status-file', statusFile,
        '--timeout', '240',
      ],
      {
        cwd: root,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    )
    child.unref()

    return { channelId: id, qrOut, statusFile, startedAt: new Date().toISOString() }
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
      // 一并清掉本轮登录会话残留
      rmSync(join(this.config.dataDir, 'login', `${id}.json`), { force: true })
      rmSync(join(this.config.dataDir, 'login', `${id}.png`), { force: true })
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
