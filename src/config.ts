/**
 * 插件配置与路径解析。
 *
 * 生效根目录的解析顺序（首次命中即生效）：
 *   1. `config.easelRoot` —— 用户自备的 Easel 仓库（想跟上游实时同步时用）
 *   2. `config.workspaceDir` 中已释放的内置快照
 *   3. 插件自带的 `vendor/easel/` 快照 —— 首次运行由 workspace.ts 释放到 workspaceDir
 *
 * 内置快照让"装完即用"成立：不需要先 clone Easel 就能拿到契约与全部技能。
 * 画像与产物始终写在生效根的 `profiles/` 与 `outputs/` 下，插件不另存副本。
 * @module dsh-zmtgzt/config
 */
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件标识，同时用作 dsh 数据目录名。 */
export const PLUGIN_ID = 'dsh-zmtgzt'

declare const __EASEL_VERSION__: string
export const PLUGIN_VERSION = typeof __EASEL_VERSION__ === 'undefined' ? 'dev' : __EASEL_VERSION__

/** dsh home。 */
export function dshHome(): string {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}

/**
 * 插件内置的 Easel 快照路径。
 * 源码位于 `src/config.ts`、产物位于 `lib/index.js`，两者都只需向上一级即到插件根，
 * 因此开发态与安装态的解析结果一致。
 */
export function embeddedEaselRoot(): string {
  return fileURLToPath(new URL('../vendor/easel/', import.meta.url))
}

/** 用户声明的额外渠道（自行补齐脚本后接入，无需改插件代码）。 */
export interface ExtraChannelConfig {
  id: string
  name: string
  /** Playwright 持久化目录名。 */
  profile: string
  supportsLogin?: boolean
  supportsPublish?: boolean
  /** 根相对脚本路径。 */
  loginScript?: string
  whoamiScript?: string
  publishScript?: string
}

/** 插件运行期配置。 */
export interface EaselConfig {
  /** 用户自备的 Easel 仓库绝对路径。设置后覆盖内置快照。 */
  easelRoot?: string
  /** 内置快照的释放位置（可写，放 .env 与产物）。默认 `~/.dsh/zmtgzt/easel`。 */
  workspaceDir?: string
  /** Python 解释器。默认 python。 */
  pythonPath?: string
  /** 单次脚本超时（毫秒）。默认 300000，与 Easel 侧约定一致。 */
  scriptTimeoutMs?: number
  /** 是否把 Easel 技能注册为 dsh 技能。默认 true。 */
  registerEaselSkills?: boolean
  /** 只注册这些层（discover / plan / produce / publish / attribute）；空数组表示全部。 */
  skillLayers?: string[]
  /** 是否注入编排契约（SOUL.md + AGENTS.md）。默认 true。 */
  injectOrchestration?: boolean
  /** 是否在启动时把内置快照释放/更新到 workspaceDir。默认 true。 */
  releaseEmbedded?: boolean
  /** 插件自有状态目录（登录会话、绑定表等）。默认 `~/.dsh/zmtgzt`。 */
  dataDir?: string
  /** 额外渠道声明。 */
  extraChannels?: ExtraChannelConfig[]
}

/** 解析后的配置。 */
export interface ResolvedConfig {
  /** 用户自备仓库；未配置则 undefined，此时使用内置快照。 */
  easelRoot: string | undefined
  /** 内置快照释放位置（可写）。 */
  workspaceDir: string
  /** 插件自带的快照路径。 */
  embeddedRoot: string
  pythonPath: string
  scriptTimeoutMs: number
  registerEaselSkills: boolean
  skillLayers: string[]
  injectOrchestration: boolean
  releaseEmbedded: boolean
  /** 归一化后的额外渠道。 */
  extraChannels: ExtraChannelConfig[]
  /** 插件自有状态目录（工具自用，不承载画像/产物）。 */
  dataDir: string
}

export function resolveConfig(input: EaselConfig | undefined): ResolvedConfig {
  const home = dshHome()
  return {
    easelRoot: absolutize(input?.easelRoot),
    workspaceDir: absolutize(input?.workspaceDir) ?? join(home, PLUGIN_ID, 'easel'),
    embeddedRoot: embeddedEaselRoot(),
    pythonPath: input?.pythonPath?.trim() || process.env.EASEL_PYTHON?.trim() || 'python',
    scriptTimeoutMs: normalizeTimeout(input?.scriptTimeoutMs),
    registerEaselSkills: input?.registerEaselSkills !== false,
    skillLayers: Array.isArray(input?.skillLayers)
      ? input.skillLayers.map((x) => String(x).trim()).filter(Boolean)
      : [],
    injectOrchestration: input?.injectOrchestration !== false,
    releaseEmbedded: input?.releaseEmbedded !== false,
    extraChannels: normalizeExtraChannels(input?.extraChannels),
    dataDir: absolutize(input?.dataDir) ?? join(home, PLUGIN_ID),
  }
}

/** 归一化额外渠道声明；缺 id/name/profile 的项直接丢弃。 */
function normalizeExtraChannels(input: unknown): ExtraChannelConfig[] {
  if (!Array.isArray(input)) return []
  const out: ExtraChannelConfig[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const profile = typeof item.profile === 'string' ? item.profile.trim() : ''
    if (!id || !name || !profile) continue
    out.push({
      id,
      name,
      profile,
      ...(item.supportsLogin === true ? { supportsLogin: true } : {}),
      ...(item.supportsPublish === true ? { supportsPublish: true } : {}),
      ...(typeof item.loginScript === 'string' ? { loginScript: item.loginScript } : {}),
      ...(typeof item.whoamiScript === 'string' ? { whoamiScript: item.whoamiScript } : {}),
      ...(typeof item.publishScript === 'string' ? { publishScript: item.publishScript } : {}),
    })
  }
  return out
}

function absolutize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? trimmed : resolve(trimmed)
}

function normalizeTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 300_000
  return Math.min(Math.trunc(value), 3_600_000)
}
