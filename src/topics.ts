/**
 * 主题管理。
 *
 * 主题即 Easel 的 `outputs/<主题名>/` 项目目录。命名与路径约束**照搬**
 * `skills/shared/scripts/output_paths.py` 中的规则（泛化名、系统目录、层级深度），
 * 以便在不启动 Python 的前提下给出与官方脚本一致的判定；需要更严格的场景仍可经
 * `zmtgzt_run` 调用该脚本复核。
 * @module dsh-zmtgzt/topics
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * 过于泛化的项目名——直接取自 Easel `output_paths.py` 的 GENERIC_PROJECT_NAMES，
 * 保持与官方脚本一致的拒绝范围。
 */
const GENERIC_PROJECT_NAMES = new Set([
  'output', 'outputs', 'result', 'results', 'temp', 'tmp', 'test', 'demo',
  'xhs', 'douyin', 'video', 'audio', 'image', 'images', 'project', 'untitled',
  '主题', '主题名', '项目', '测试', '临时',
])

/** 系统目录前缀（`outputs/_xxx/`），内容产物不得写入。 */
const SYSTEM_PREFIX = '_'

/** 主题名校验结果。 */
export interface TopicNameCheck {
  ok: boolean
  /** 规范化后的主题名（去除首尾空白与非法字符）。 */
  normalized: string
  /** 不通过时的原因。 */
  reason?: string
}

/** 一个主题的概要。 */
export interface TopicSummary {
  name: string
  dir: string
  /** manifest 中的步骤数；无 manifest 时为 0。 */
  steps: number
  updatedAt?: string
  /** 是否已有内容文件（除 manifest 外）。 */
  hasContent: boolean
}

/** manifest 中的一条步骤记录。 */
export interface ManifestStep {
  step?: string
  skill?: string
  layer?: string
  status?: string
  outputs?: string[]
  summary?: string
  conclusion?: string
  at?: string
}

export class TopicStore {
  constructor(private readonly outputsRoot: string) {}

  /** 产物根目录。 */
  get root(): string {
    return this.outputsRoot
  }

  /**
   * 校验并规范化主题名。
   * 规则与 Easel `output_paths.py` 对齐：非空、非泛化名、非以 `_` 开头、不含路径分隔符。
   */
  static checkName(raw: string): TopicNameCheck {
    const trimmed = raw.trim()
    if (!trimmed) return { ok: false, normalized: '', reason: '主题名不能为空' }

    const normalized = trimmed
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')

    if (!normalized) return { ok: false, normalized: '', reason: '主题名全是非法字符' }
    if (normalized.startsWith(SYSTEM_PREFIX)) {
      return { ok: false, normalized, reason: '主题名不能以 "_" 开头（该前缀保留给系统目录）' }
    }
    if (GENERIC_PROJECT_NAMES.has(normalized.toLowerCase()) || GENERIC_PROJECT_NAMES.has(normalized)) {
      return {
        ok: false,
        normalized,
        reason: `"${normalized}" 属于泛化名，请使用人类可读的具体主题名（如「春季通勤穿搭」）`,
      }
    }
    if (normalized.length > 120) {
      return { ok: false, normalized, reason: '主题名过长（上限 120 字符）' }
    }
    return { ok: true, normalized }
  }

  /** 主题目录的绝对路径；主题名非法时返回 undefined。 */
  dirOf(name: string): string | undefined {
    const check = TopicStore.checkName(name)
    if (!check.ok) return undefined
    const dir = resolve(join(this.outputsRoot, check.normalized))
    const root = resolve(this.outputsRoot)
    if (dir !== root && !dir.startsWith(root + sep)) return undefined
    return dir
  }

  /** 列出全部主题。 */
  async list(): Promise<TopicSummary[]> {
    let entries: string[]
    try {
      const dirents = await readdir(this.outputsRoot, { withFileTypes: true })
      entries = dirents
        .filter((d) => d.isDirectory() && !d.name.startsWith(SYSTEM_PREFIX))
        .map((d) => d.name)
    } catch {
      return []
    }

    const rows: TopicSummary[] = []
    for (const name of entries) {
      const dir = join(this.outputsRoot, name)
      const manifest = await this.readManifest(dir)
      const files = await readdir(dir).catch(() => [] as string[])
      rows.push({
        name,
        dir,
        steps: manifest?.steps?.length ?? 0,
        ...(manifest?.updatedAt ? { updatedAt: manifest.updatedAt } : {}),
        hasContent: files.some((f) => f !== 'manifest.json'),
      })
    }
    return rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  /**
   * 创建主题。
   * @param rawName - 用户输入的主题名。
   * @param baseDir - 可选：在此目录下创建（用于「在当前目录创建新规划」）；
   *                  省略时创建在产物根下。
   */
  async create(
    rawName: string,
    baseDir?: string
  ): Promise<{ ok: true; topic: TopicSummary } | { ok: false; reason: string }> {
    const check = TopicStore.checkName(rawName)
    if (!check.ok) return { ok: false, reason: check.reason ?? '主题名非法' }

    const dir = baseDir ? resolve(join(baseDir, check.normalized)) : this.dirOf(check.normalized)
    if (!dir) return { ok: false, reason: '主题名非法' }

    try {
      await mkdir(dir, { recursive: true })
    } catch (error) {
      return { ok: false, reason: `无法创建目录：${String(error)}` }
    }

    const manifestPath = join(dir, 'manifest.json')
    const exists = await stat(manifestPath).then(
      () => true,
      () => false
    )
    if (!exists) {
      const now = new Date().toISOString()
      const manifest = { topic: check.normalized, dir, createdAt: now, updatedAt: now, steps: [] }
      try {
        const tmp = `${manifestPath}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8')
        await rename(tmp, manifestPath)
      } catch (error) {
        return { ok: false, reason: `无法写入 manifest：${String(error)}` }
      }
    }

    return {
      ok: true,
      topic: { name: check.normalized, dir, steps: 0, updatedAt: new Date().toISOString(), hasContent: false },
    }
  }

  /** 重命名主题（含其目录与 manifest 中的 topic 字段）。 */
  async rename(
    rawName: string,
    nextRawName: string
  ): Promise<{ ok: true; topic: TopicSummary } | { ok: false; reason: string }> {
    const from = this.dirOf(rawName)
    if (!from) return { ok: false, reason: '原名非法' }
    const check = TopicStore.checkName(nextRawName)
    if (!check.ok) return { ok: false, reason: check.reason ?? '新名非法' }
    const to = this.dirOf(check.normalized)
    if (!to) return { ok: false, reason: '新名非法' }
    try {
      await rename(from, to)
    } catch (error) {
      return { ok: false, reason: `重命名失败：${String(error)}` }
    }
    const manifestPath = join(to, 'manifest.json')
    const manifest = await this.readManifest(to)
    if (manifest) {
      manifest.topic = check.normalized
      manifest.dir = to
      manifest.updatedAt = new Date().toISOString()
      try {
        const tmp = `${manifestPath}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8')
        await rename(tmp, manifestPath)
      } catch {
        /* manifest 更新失败不影响重命名结果 */
      }
    }
    return {
      ok: true,
      topic: {
        name: check.normalized,
        dir: to,
        steps: manifest?.steps?.length ?? 0,
        updatedAt: new Date().toISOString(),
        hasContent: (await readdir(to).catch(() => [] as string[])).some((f) => f !== 'manifest.json'),
      },
    }
  }

  /** 删除主题目录。 */
  async remove(rawName: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const dir = this.dirOf(rawName)
    if (!dir) return { ok: false, reason: '主题名非法' }
    try {
      await rm(dir, { recursive: true, force: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: `删除失败：${String(error)}` }
    }
  }

  /** 读取某主题的 manifest。 */
  async readManifest(dir: string): Promise<{ topic?: string; dir?: string; updatedAt?: string; steps?: ManifestStep[] } | undefined> {
    try {
      const raw = await readFile(join(dir, 'manifest.json'), 'utf8')
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as {
        topic?: string
        dir?: string
        updatedAt?: string
        steps?: ManifestStep[]
      }
      return parsed
    } catch {
      return undefined
    }
  }

  /** 列出主题目录的条目（目录优先）。 */
  async entries(rawName: string): Promise<Array<{ name: string; isDir: boolean; size: number }>> {
    const dir = this.dirOf(rawName)
    if (!dir) return []
    try {
      const dirents = await readdir(dir, { withFileTypes: true })
      const rows = await Promise.all(
        dirents.map(async (d) => {
          const info = await stat(join(dir, d.name)).catch(() => undefined)
          return { name: d.name, isDir: d.isDirectory(), size: info?.size ?? 0 }
        })
      )
      return rows.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    } catch {
      return []
    }
  }
}
