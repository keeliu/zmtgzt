/**
 * Easel 仓库访问层：插件所有"可复用内容"的唯一来源。
 *
 * 设计原则（对应 prompt-stack.md 的四层划分）：
 *   - Layer 1/2 契约（SOUL.md + AGENTS.md）从 `openclaw/workspace/` 读取，插件不重写
 *   - Layer 4 技能（`skills/openclaw/<name>/SKILL.md`）扫描后注册为 dsh runtime skill，
 *     技能体与 references 均按需从磁盘读取，不在插件里复制一份
 *   - 脚本一律按 `skills/...` 根相对路径交给 runner 执行
 *
 * 这样 Easel 升级后插件自动跟上，不会出现"插件里的旧契约"与
 * "仓库里的新契约"各说一套。
 * @module dsh-zmtgzt/easel-repo
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, resolve, sep, basename } from 'node:path'

/** Easel 仓库内技能的根目录。 */
export const EASEL_SKILLS_DIR = 'skills/openclaw'
/** Easel 仓库内共享脚本目录。 */
export const EASEL_SHARED_DIR = 'skills/shared/scripts'
/** Easel 的 OpenClaw workspace（承载 SOUL.md / AGENTS.md）。 */
export const EASEL_WORKSPACE_DIR = 'openclaw/workspace'

/** 一个 Easel 技能的元数据（解析自 SKILL.md frontmatter）。 */
export interface EaselSkillMeta {
  /** frontmatter.name，kebab-case。 */
  name: string
  /** frontmatter.description，含"何时使用"语义。 */
  description: string
  /** 路由用的简短描述（去掉"何时使用"长尾，避免 skill 目录过长）。 */
  whenToUse: string
  /** frontmatter.layer：discover / plan / produce / publish / attribute 等。 */
  layer?: string
  /** 技能目录绝对路径。 */
  dir: string
  /** SKILL.md 绝对路径。 */
  skillPath: string
}

/** 读取到的技能全文。 */
export interface EaselSkillDetail extends EaselSkillMeta {
  /** SKILL.md 去掉 frontmatter 后的正文。 */
  body: string
  /** references/ 下的文件（相对技能目录的路径）。 */
  references: string[]
}

/** 契约来源：Easel 的常驻层。 */
export interface EaselContract {
  /** Layer 1：人格。 */
  soul?: string
  /** Layer 2：编排逻辑。 */
  agents?: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * 解析 SKILL.md 的 frontmatter。
 * 只处理 Easel 实际用到的形态：标量、引号、`>-` / `|` 折叠块——
 * 不引入 YAML 依赖，避免为读几个字段拖进一个解析器。
 */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(text)
  if (!match) return { data: {}, body: text }
  const data: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) {
      i += 1
      continue
    }
    const key = kv[1]
    const raw = kv[2]
    if (raw === '>-' || raw === '>' || raw === '|' || raw === '|-') {
      const parts: string[] = []
      i += 1
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        parts.push(lines[i].trim())
        i += 1
      }
      data[key] = raw.startsWith('|') ? parts.join('\n') : parts.join(' ')
      continue
    }
    data[key] = raw.replace(/^["']|["']$/g, '')
    i += 1
  }
  return { data, body: text.slice(match[0].length) }
}

/** 从长 description 里裁出一句用于路由的简短描述。 */
export function shortenDescription(description: string, limit = 180): string {
  const flat = description.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit).trimEnd()}…`
}

export class EaselRepo {
  private skills?: EaselSkillMeta[]
  private contract?: EaselContract
  private contractPaths?: { soul?: string; agents?: string }

  constructor(private readonly root: string | undefined) {}

  /** 仓库根是否可用。 */
  get rootDir(): string | undefined {
    return this.root
  }

  get available(): boolean {
    return Boolean(this.root && existsSync(this.root))
  }

  /** 清空缓存，让下次读取回到磁盘（Easel 更新后无需重启插件）。 */
  invalidate(): void {
    this.skills = undefined
    this.contract = undefined
    this.contractPaths = undefined
  }

  private abs(rel: string): string {
    return join(this.root as string, rel)
  }

  /**
   * 读取常驻层契约：SOUL.md（人格）+ AGENTS.md（编排逻辑）。
   *
   * 读取顺序为**工作目录根优先**——用户可能直接编辑根目录的版本，
   * 那份应当胜出；缺失时才回退到 `openclaw/workspace/` 下的快照副本。
   */
  async readContract(): Promise<EaselContract> {
    if (this.contract) return this.contract
    if (!this.available) return {}
    const [soul, agents] = await Promise.all([
      this.readContractFile('SOUL.md'),
      this.readContractFile('AGENTS.md'),
    ])
    this.contract = {
      ...(soul ? { soul: soul.content } : {}),
      ...(agents ? { agents: agents.content } : {}),
    }
    this.contractPaths = {
      ...(soul ? { soul: soul.path } : {}),
      ...(agents ? { agents: agents.path } : {}),
    }
    return this.contract
  }

  /** 契约文件的**实际来源路径**，供自检展示（未读到时为空）。 */
  contractSourcePaths(): { soul?: string; agents?: string } {
    return { ...(this.contractPaths ?? {}) }
  }

  /** 单个契约文件的读取：根目录优先，`openclaw/workspace/` 回退。 */
  private async readContractFile(
    name: string
  ): Promise<{ content: string; path: string } | undefined> {
    const rootPath = this.abs(name)
    const rootContent = await readOptional(rootPath)
    if (rootContent !== undefined) return { content: rootContent, path: rootPath }

    const fallbackPath = this.abs(`${EASEL_WORKSPACE_DIR}/${name}`)
    const fallbackContent = await readOptional(fallbackPath)
    if (fallbackContent !== undefined) return { content: fallbackContent, path: fallbackPath }

    return undefined
  }

  /**
   * 扫描 Easel 技能目录，解析每个 SKILL.md 的 frontmatter。
   * @returns 按 layer 再按名称排序的技能元数据；仓库不可用时为空数组。
   */
  async listSkills(): Promise<EaselSkillMeta[]> {
    if (this.skills) return this.skills
    if (!this.available) return []
    const base = this.abs(EASEL_SKILLS_DIR)
    let entries: string[]
    try {
      entries = await readdir(base)
    } catch {
      return []
    }
    const metas: EaselSkillMeta[] = []
    for (const entry of entries) {
      const dir = join(base, entry)
      const skillPath = join(dir, 'SKILL.md')
      if (!existsSync(skillPath)) continue
      try {
        const text = await readFile(skillPath, 'utf8')
        const { data } = parseFrontmatter(text)
        const name = (data.name || entry).trim()
        const description = (data.description || '').trim()
        metas.push({
          name,
          description,
          whenToUse: shortenDescription(description),
          ...(data.layer ? { layer: data.layer } : {}),
          dir,
          skillPath,
        })
      } catch {
        continue
      }
    }
    metas.sort((a, b) => {
      const layer = (a.layer ?? '~').localeCompare(b.layer ?? '~')
      return layer !== 0 ? layer : a.name.localeCompare(b.name)
    })
    this.skills = metas
    return metas
  }

  /** 按名称取一个技能的详情（含正文与 references 清单）。 */
  async readSkill(name: string): Promise<EaselSkillDetail | undefined> {
    const metas = await this.listSkills()
    const meta = metas.find((m) => m.name === name || m.dir.endsWith(`${sep}${name}`))
    if (!meta) return undefined
    const text = await readFile(meta.skillPath, 'utf8')
    const { body } = parseFrontmatter(text)
    return { ...meta, body: body.trim(), references: await this.listReferences(meta.dir) }
  }

  /** 列出技能目录下 references/ 的文件。 */
  private async listReferences(dir: string): Promise<string[]> {
    const refDir = join(dir, 'references')
    try {
      const entries = await readdir(refDir, { withFileTypes: true })
      return entries.filter((e) => e.isFile()).map((e) => `references/${e.name}`).sort()
    } catch {
      return []
    }
  }

  /**
   * 读取技能目录内的任意文件（references、example.md 等）。
   * 路径被限制在该技能目录内，阻断穿越。
   */
  async readSkillFile(
    name: string,
    relPath: string
  ): Promise<{ path: string; content: string } | undefined> {
    const metas = await this.listSkills()
    const meta = metas.find((m) => m.name === name)
    if (!meta) return undefined
    const target = resolve(meta.dir, relPath)
    if (target !== meta.dir && !target.startsWith(meta.dir + sep)) return undefined
    const content = await readOptional(target)
    if (content === undefined) return undefined
    return { path: relative(meta.dir, target), content }
  }

  /** 列出共享脚本目录下的全部 .py 文件（根相对路径）。 */
  async listSharedScripts(): Promise<string[]> {
    if (!this.available) return []
    const dir = this.abs(EASEL_SHARED_DIR)
    try {
      const entries = await readdir(dir)
      return entries
        .filter((e) => e.endsWith('.py'))
        .map((e) => `${EASEL_SHARED_DIR}/${e}`)
        .sort()
    } catch {
      return []
    }
  }

  /** 列出某个技能自带脚本（根相对路径）；无 scripts/ 目录时返回空数组。 */
  async listSkillScripts(name: string): Promise<string[]> {
    const metas = await this.listSkills()
    const meta = metas.find((m) => m.name === name)
    if (!meta) return []
    const scriptsDir = join(meta.dir, 'scripts')
    try {
      const entries = await readdir(scriptsDir)
      const base = `${EASEL_SKILLS_DIR}/${basename(meta.dir)}/scripts`
      return entries
        .filter((e) => e.endsWith('.py'))
        .map((e) => `${base}/${e}`)
        .sort()
    } catch {
      return []
    }
  }

  /** 判断仓库内某个相对路径是否存在（供 doctor 体检）。 */
  async has(relPath: string): Promise<boolean> {
    if (!this.available) return false
    try {
      await stat(this.abs(relPath))
      return true
    } catch {
      return false
    }
  }
}

/** 读文件；不存在或不可读时返回 undefined，不抛异常。 */
async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}
