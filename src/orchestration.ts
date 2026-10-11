/**
 * 编排契约：**内容全部来自 Easel 官方仓库**，本模块只负责组装与降级。
 *
 * 对应 prompt-stack.md 的四层：
 *   Layer 1 SOUL.md   → 常驻层（人格）
 *   Layer 2 AGENTS.md → 常驻层（编排逻辑，最重要的一份）
 *   Layer 3 CONTEXT.md→ 由插件 config.easelRoot 替代
 *   Layer 4 SKILL     → 由 EaselRepo.listSkills() 扫描后注册为 dsh 技能
 *
 * 约定：SOUL.md / AGENTS.md 原文照搬，插件不改写、不复述、不简化——
 * 一旦插件里存了副本，就会和仓库里的版本漂移。
 * 本文件里唯一由插件自己写的文字是 `BRIDGE_NOTE`，它只说明"本插件如何接入"，
 * 不涉及业务编排规则。
 * @module dsh-zmtgzt/orchestration
 */
import type { EaselRepo } from './repo.ts'

/**
 * 插件接入说明——本插件自己的话，明确与 Easel 契约区分。
 * 只讲机制（工具怎么调、路径怎么走），不讲业务编排（那属于 AGENTS.md）。
 */
export const BRIDGE_NOTE = `## 本插件的接入方式（dsh）

以上两节是 Easel 仓库中 \`openclaw/workspace/SOUL.md\` 与 \`AGENTS.md\` 的原文，
随 Easel 更新自动同步，本插件不保存副本。

差异点：Easel 原本运行在 OpenClaw 上，本插件把它接入 dsh，机制对应关系是——

- **技能**：Easel 仓库 \`skills/openclaw/<技能名>/SKILL.md\` 已注册为 dsh 技能，按需加载。
  需要正文或 \`references/\` 时，用 \`zmtgzt_skill\`（action=read / files）读取，
  不要凭记忆复述技能内容。
- **脚本**：确定性脚本用 \`zmtgzt_run\` 执行，路径为 \`skills/...\` 根相对路径
  （如 \`skills/shared/scripts/manifest.py\`）。常用脚本另有专用工具，
  参数以脚本自身的 \`--help\` 为准，不要臆造参数名。
- **项目根**：AGENTS.md 里说的"运行时项目根"就是插件配置的 \`config.easelRoot\`，
  脚本执行器已固定 cwd 到该目录，无需再 cd。
- **画像与产物**：Easel 的 \`profiles/<画像>/\` 与 \`outputs/<主题>/\` 是磁盘事实，
  直接按 AGENTS.md 的规则读写；插件的 \`zmtgzt_profile\` / \`zmtgzt_artifact\`
  提供结构化读写入口，产物清单可直接读 \`manifest.py\` 生成的 manifest。
- **环境自检**：不确定环境是否就绪时先跑 \`zmtgzt_doctor\`。`

/** 组装结果。 */
export interface ComposedContract {
  /** 可直接作为技能体的完整文本。 */
  content: string
  /** 是否成功读到 SOUL.md。 */
  hasSoul: boolean
  /** 是否成功读到 AGENTS.md。 */
  hasAgents: boolean
}

/**
 * 从 Easel 仓库组装常驻契约。
 *
 * 读不到文件时不编造内容：只返回接入说明，并附上配置指引，
 * 让模型明确知道"契约缺失"而不是拿到一份看似完整的假契约。
 *
 * @param repo - Easel 仓库访问层。
 * @returns 组装好的契约文本与来源标记。
 */
export async function composeContract(repo: EaselRepo): Promise<ComposedContract> {
  if (!repo.available) {
    return {
      content: [
        '# Easel 编排契约（未加载）',
        '',
        '插件未找到 Easel 仓库，因此 **SOUL.md 与 AGENTS.md 均未注入**。',
        '本插件不内置这两份契约的副本——它们必须来自 Easel 官方仓库，避免与上游漂移。',
        '',
        '修复方式：在 dsh 配置中为 `dsh-zmtgzt` 设置 `config.easelRoot`，',
        '指向本地 Easel 仓库的绝对路径（该目录下应含 `openclaw/workspace/AGENTS.md`）。',
        '配置后运行 `zmtgzt_doctor` 确认，再重新加载插件即可注入。',
        '',
        BRIDGE_NOTE,
      ].join('\n'),
      hasSoul: false,
      hasAgents: false,
    }
  }

  const { soul, agents } = await repo.readContract()
  const parts: string[] = []

  if (soul) {
    parts.push('<!-- 以下来自 Easel 仓库 openclaw/workspace/SOUL.md -->', soul.trim())
  }
  if (agents) {
    parts.push('<!-- 以下来自 Easel 仓库 openclaw/workspace/AGENTS.md -->', agents.trim())
  }
  if (!soul || !agents) {
    const missing = [!soul && 'SOUL.md', !agents && 'AGENTS.md'].filter(Boolean).join('、')
    parts.push(
      `> 注意：未能从 Easel 仓库读到 ${missing}，该层契约缺失。` +
        '请确认 Easel 版本包含 `openclaw/workspace/` 目录，或运行 `zmtgzt_doctor` 排查。'
    )
  }
  parts.push(BRIDGE_NOTE)

  return {
    content: parts.join('\n\n'),
    hasSoul: Boolean(soul),
    hasAgents: Boolean(agents),
  }
}

/** 技能在 dsh 技能目录里的统一描述前缀，便于识别来源。 */
export const SKILL_DESCRIPTION_SUFFIX = ''

/**
 * 生成注册为 dsh 技能时用的元数据。
 * 直接沿用 SKILL.md 的 frontmatter——description 里已含"何时使用"，
 * 不再由插件另行概括（概括会丢信息）。
 */
export function skillRegistrationOf(meta: {
  name: string
  description: string
  layer?: string
}): { name: string; description: string; whenToUse: string } {
  return {
    name: meta.name,
    description: meta.description || `${meta.name}（Easel 技能）`,
    whenToUse: meta.description || meta.name,
  }
}
