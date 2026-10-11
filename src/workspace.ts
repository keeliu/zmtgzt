/**
 * 生效根解析与内置快照释放。
 *
 * 插件随包自带一份 Easel 快照（`vendor/easel/`），但 npm 安装目录是只读的、
 * 且重装会被覆盖——所以脚本运行所需的产物目录与 `.env` 不能放在那里。
 * 本模块负责把快照释放到用户可写目录（默认 `~/.dsh/zmtgzt/easel/`），
 * 并把「用户数据」与「快照内容」严格分开：
 *
 *   - 快照内容（openclaw / docs / skills / LICENSE / SYNC-INFO.json）→ 每次更新时覆盖
 *   - 用户数据（.env / outputs / profiles / assets）→ 永不触碰
 *
 * 若用户配置了 `easelRoot`，则完全跳过释放，直接用其仓库。
 * @module dsh-zmtgzt/workspace
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedConfig } from './config.ts'

/** 生效根的来源。 */
export type RootSource = 'configured' | 'embedded'

/** 生效根信息。 */
export interface WorkspaceInfo {
  /** 生效的 Easel 根目录（脚本的 cwd 与所有相对路径基准）。 */
  root: string
  source: RootSource
  /** 内置快照记录的上游 commit。 */
  commit?: string
  /** 释放结果（仅在 source=embedded 时有意义）。 */
  release?: { updated: boolean; reason: string }
  /** 是否在本次释放中创建了 .env（从 .env.example 复制）。 */
  createdEnv: boolean
  /** 非致命问题，供 doctor 展示。 */
  warnings: string[]
}

/** 随快照一起释放的条目。 */
const RELEASE_ENTRIES = [
  'openclaw',
  'docs',
  'skills',
  'LICENSE',
  '.env.example',
  'pyproject.toml',
  'SYNC-INFO.json',
]

/** 释放时必须保留的用户数据（即使快照里同名也不覆盖）。 */
const USER_DATA = new Set(['.env', 'outputs', 'profiles', 'assets'])

/**
 * 解析生效根，必要时释放内置快照。
 * @param config - 解析后的插件配置。
 * @returns 生效根信息；任何异常都降级为警告，不抛出。
 */
export function ensureWorkspace(config: ResolvedConfig): WorkspaceInfo {
  const warnings: string[] = []

  // 1. 用户自备仓库优先
  if (config.easelRoot) {
    if (existsSync(join(config.easelRoot, 'openclaw', 'workspace', 'AGENTS.md'))) {
      return { root: config.easelRoot, source: 'configured', createdEnv: false, warnings }
    }
    warnings.push(
      `config.easelRoot 指向的目录缺少 openclaw/workspace/AGENTS.md：${config.easelRoot}，` +
        '已回退到内置快照。'
    )
  }

  const embedded = config.embeddedRoot
  const workspace = config.workspaceDir

  // 2. 内置快照不存在（例如源码树里 vendor/ 被清理）→ 只能返回它，让上层报错
  if (!existsSync(embedded)) {
    warnings.push(
      `内置 Easel 快照缺失：${embedded}。请重新安装插件，或运行 node scripts/sync-easel.mjs 生成。`
    )
    return { root: workspace, source: 'embedded', createdEnv: false, warnings }
  }

  const embeddedInfo = readSyncInfo(embedded)
  const commit = embeddedInfo?.commit

  // 3. 关闭释放时，直接以只读快照为根
  if (!config.releaseEmbedded) {
    warnings.push('releaseEmbedded 为 false：直接使用只读的内置快照，产物与 .env 将无处存放。')
    return { root: embedded, source: 'embedded', commit, createdEnv: false, warnings }
  }

  // 4. 释放/更新到用户可写目录
  try {
    const result = releaseSnapshot(embedded, workspace)
    const createdEnv = ensureEnvFile(workspace)
    return { root: workspace, source: 'embedded', commit, release: result, createdEnv, warnings }
  } catch (error) {
    warnings.push(`释放内置快照失败（${String(error)}），本次直接使用只读快照。`)
    return { root: embedded, source: 'embedded', commit, createdEnv: false, warnings }
  }
}

/** 比较快照版本，必要时把内容复制到工作目录（保留用户数据）。 */
function releaseSnapshot(embedded: string, workspace: string): { updated: boolean; reason: string } {
  mkdirSync(workspace, { recursive: true })

  const embeddedInfo = readSyncInfo(embedded)
  const workspaceInfo = readSyncInfo(workspace)
  const embeddedCommit = embeddedInfo?.commit
  const workspaceCommit = workspaceInfo?.commit

  const missingCore = !existsSync(join(workspace, 'openclaw', 'workspace', 'AGENTS.md'))
  if (!missingCore && embeddedCommit && embeddedCommit === workspaceCommit) {
    return { updated: false, reason: `已是最新（${embeddedCommit.slice(0, 10)}）` }
  }

  const reason = missingCore
    ? '首次释放'
    : embeddedCommit !== workspaceCommit
      ? `更新 ${String(workspaceCommit).slice(0, 10)} → ${String(embeddedCommit).slice(0, 10)}`
      : '补齐缺失内容'

  for (const entry of RELEASE_ENTRIES) {
    if (USER_DATA.has(entry)) continue
    const src = join(embedded, entry)
    if (!existsSync(src)) continue
    const dest = join(workspace, entry)
    rmSync(dest, { recursive: true, force: true })
    cpSync(src, dest, { recursive: true })
  }

  return { updated: true, reason }
}

/** 首次释放时从 .env.example 复制一份 .env，让用户知道要填什么。 */
function ensureEnvFile(workspace: string): boolean {
  const envPath = join(workspace, '.env')
  const examplePath = join(workspace, '.env.example')
  if (existsSync(envPath) || !existsSync(examplePath)) return false
  try {
    cpSync(examplePath, envPath)
    return true
  } catch {
    return false
  }
}

/** 读取 SYNC-INFO.json（可能不存在）。 */
function readSyncInfo(dir: string): { commit?: string; ref?: string; syncedAt?: string } | undefined {
  try {
    const raw = readFileSync(join(dir, 'SYNC-INFO.json'), 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as { commit?: string; ref?: string; syncedAt?: string }
    return parsed
  } catch {
    return undefined
  }
}

/** 统计目录体积（doctor 用）。 */
export function directorySize(dir: string): number {
  let total = 0
  const walk = (p: string): void => {
    let entries
    try {
      entries = readdirSync(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(p, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        try {
          total += statSync(full).size
        } catch {
          /* 忽略单个文件的读取失败 */
        }
      }
    }
  }
  if (existsSync(dir)) walk(dir)
  return total
}

/** 写入一个标记文件（预留给未来的释放版本校验）。 */
export function writeReleaseMarker(workspace: string, payload: Record<string, unknown>): void {
  try {
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, '.zmtgzt-release.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8')
  } catch {
    /* 非致命 */
  }
}
