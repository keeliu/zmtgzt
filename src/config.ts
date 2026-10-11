/**
 * 插件配置与路径解析。
 *
 * 与最初的设想不同：画像与产物**不再由插件另存一份**，直接用 Easel 仓库里的
 * `profiles/<画像>/` 与 `outputs/<主题>/`——那是 AGENTS.md 与各 SKILL 已经约定的磁盘事实，
 * 插件再存一份只会造成两套真相。
 * 插件数据目录只保留自身运行所需的状态。
 * @module dsh-easel-orchestrator/config
 */
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** 插件标识，同时用作 dsh 数据目录名。 */
export const PLUGIN_ID = 'dsh-easel-orchestrator'

declare const __EASEL_VERSION__: string
export const PLUGIN_VERSION = typeof __EASEL_VERSION__ === 'undefined' ? 'dev' : __EASEL_VERSION__

/** dsh home。 */
export function dshHome(): string {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}

/** 插件运行期配置。 */
export interface EaselConfig {
  /** 本地 Easel 仓库根目录（含 openclaw/ 与 skills/）。未配置时工具优雅降级。 */
  easelRoot?: string
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
}

/** 解析后的配置。 */
export interface ResolvedConfig {
  easelRoot: string | undefined
  pythonPath: string
  scriptTimeoutMs: number
  registerEaselSkills: boolean
  skillLayers: string[]
  injectOrchestration: boolean
  /** 插件自有状态目录（仅工具自用，不承载画像/产物）。 */
  dataDir: string
}

export function resolveConfig(input: EaselConfig | undefined): ResolvedConfig {
  return {
    easelRoot: absolutize(input?.easelRoot),
    pythonPath: input?.pythonPath?.trim() || process.env.EASEL_PYTHON?.trim() || 'python',
    scriptTimeoutMs: normalizeTimeout(input?.scriptTimeoutMs),
    registerEaselSkills: input?.registerEaselSkills !== false,
    skillLayers: Array.isArray(input?.skillLayers)
      ? input.skillLayers.map((x) => String(x).trim()).filter(Boolean)
      : [],
    injectOrchestration: input?.injectOrchestration !== false,
    dataDir: join(dshHome(), PLUGIN_ID),
  }
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
