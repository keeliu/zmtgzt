/**
 * 发布编排：把「平台 + 内容」映射到上游的发布脚本。
 *
 * 三条设计原则（对应 openspec 的 publish-tooling 能力）：
 *
 *   1. **默认不发布** —— 只有显式 `confirm` 才真正调用发布；否则只做预检。
 *      发布是对外不可逆动作，默认必须安全。
 *   2. **门禁不绕过** —— 上游脚本内置发布前检查（小红书 `content_guard` 硬拦、
 *      公众号 AI 味检测）。本模块 **不转发** `--allow-unsafe` / `--skip-ai-score`
 *      这类放行开关，因此不存在「顺手跳过安全检查」的路径。
 *   3. **平台语义如实** —— 微信公众号的两条路径都只**创建草稿**，不群发
 *      （`weixin_mp_stats.py` 注释与 `publish.py --exec` 的帮助文本均写明「创建微信草稿」）。
 *      结果里必须明确区分，避免让用户以为内容已对外可见。
 *
 * 参数名一律取自各脚本的 argparse 定义，不臆造。
 * @module dsh-zmtgzt/publish
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedConfig } from './config.ts'
import { runEaselScript, toCliArgs, type EaselResult } from './runner.ts'

export type PublishPlatform = 'xiaohongshu' | 'wechat-mp'
/** 小红书：image / video；公众号：draft。 */
export type PublishMode = 'image' | 'video' | 'draft'

export interface PublishRequest {
  platform: PublishPlatform
  /** 默认：小红书 image，公众号 draft。 */
  mode?: PublishMode
  title: string
  /** 小红书正文；公众号 Markdown 正文（会写成临时文件传给 --input）。 */
  content?: string
  /** 小红书图文：至少一张，路径必须真实存在。 */
  images?: string[]
  /** 小红书视频。 */
  video?: string
  tags?: string[]
  /** 公众号封面（必填）。 */
  cover?: string
  digest?: string
  author?: string
  /** 公众号：已排版 HTML 的路径（与 content 二选一）。 */
  html?: string
  /** 公众号：走官方 API（需 AppID/AppSecret + IP 白名单）而非后台会话。 */
  officialApi?: boolean
  /** 真实发布开关。缺省即 dry-run。 */
  confirm?: boolean
}

export interface PublishCheck {
  name: string
  ok: boolean
  detail?: string
  fix?: string
}

export interface PublishPlan {
  ok: boolean
  platform: PublishPlatform
  platformName: string
  mode: PublishMode
  script: string
  subcommand?: string
  args: Record<string, unknown>
  /** 将要执行的命令（已转成 CLI 形式，供人核对）。 */
  cli: string[]
  checks: PublishCheck[]
  warnings: string[]
  /** 用户可见的步骤预览。 */
  steps: string[]
  /** 发布后仍需用户自己完成的动作。 */
  followUp: string[]
}

export interface PublishResult {
  ok: boolean
  platform: PublishPlatform
  platformName: string
  /** 是否为真实发布（false 表示 dry-run）。 */
  executed: boolean
  /** 公众号专用：产物是草稿而非已发布。 */
  draftOnly: boolean
  plan: PublishPlan
  /** 脚本返回的原始结果（或失败面）。 */
  raw?: unknown
  error?: string
  hint?: string
  followUp: string[]
}

/** 平台定义。 */
interface PlatformSpec {
  name: string
  script: string
  modes: PublishMode[]
}

const PLATFORMS: Record<PublishPlatform, PlatformSpec> = {
  xiaohongshu: {
    name: '小红书',
    script: 'skills/shared/scripts/xhs_publish.py',
    modes: ['image', 'video'],
  },
  'wechat-mp': {
    name: '微信公众号',
    script: 'skills/openclaw/skill-wechat-publisher/scripts/publish.py',
    modes: ['draft'],
  },
}

export function isPublishPlatform(value: string): value is PublishPlatform {
  return value === 'xiaohongshu' || value === 'wechat-mp'
}

export function platformName(platform: PublishPlatform): string {
  return PLATFORMS[platform].name
}

/**
 * 小红书标题长度，算法与 `xhs_publish.py::calc_title_length` 完全一致：
 * 按 UTF-16 码元，非 ASCII 计 2、ASCII 计 1，再 `(n+1)//2` 上取整。
 *
 * 之所以在插件侧复算一遍：让界面能在提交前提示超长，而不是等脚本报错。
 * 算法必须一致，否则会出现「界面说没问题、脚本说超长」的矛盾。
 */
export function calcTitleLength(input: string): number {
  let bytes = 0
  for (let i = 0; i < input.length; i += 1) {
    bytes += input.charCodeAt(i) > 127 ? 2 : 1
  }
  return Math.floor((bytes + 1) / 2)
}

/** 小红书标题上限（与上游 TITLE_MAX 一致）。 */
export const TITLE_MAX = 20

// ---------------------------------------------------------------------------
// 预检（不产生任何副作用）
// ---------------------------------------------------------------------------

function normalizeMode(platform: PublishPlatform, mode?: PublishMode): PublishMode {
  const spec = PLATFORMS[platform]
  if (mode && spec.modes.includes(mode)) return mode
  return platform === 'wechat-mp' ? 'draft' : 'image'
}

/** 公众号正文写成临时 Markdown，交给上游 `--input`（它自己会排版）。 */
function writeDraftMarkdown(config: ResolvedConfig, content: string, title: string): string {
  const dir = join(config.dataDir, 'publish')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'wechat-draft.md')
  writeFileSync(path, `# ${title}\n\n${content}\n`, 'utf8')
  return path
}

export function planPublish(config: ResolvedConfig, request: PublishRequest): PublishPlan {
  const platform = request.platform
  const spec = PLATFORMS[platform]
  const mode = normalizeMode(platform, request.mode)
  const checks: PublishCheck[] = []
  const warnings: string[] = []
  const steps: string[] = []

  if (!spec) {
    return {
      ok: false,
      platform,
      platformName: String(platform),
      mode,
      script: '',
      args: {},
      cli: [],
      checks: [{ name: '平台支持', ok: false, detail: `未知平台：${platform}`, fix: '可选：xiaohongshu / wechat-mp' }],
      warnings,
      steps,
      followUp: [],
    }
  }

  // ---- 标题 ----
  const title = (request.title ?? '').trim()
  checks.push({
    name: '标题已填写',
    ok: Boolean(title),
    ...(title ? {} : { fix: '标题为必填项。' }),
  })
  if (title && platform === 'xiaohongshu') {
    const length = calcTitleLength(title)
    checks.push({
      name: `标题长度 ≤ ${TITLE_MAX}（小红书全角计法）`,
      ok: length <= TITLE_MAX,
      detail: `当前 ${length}`,
      ...(length <= TITLE_MAX ? {} : { fix: `请精简到 ${TITLE_MAX} 以内。` }),
    })
  }

  // ---- 平台专属 ----
  let args: Record<string, unknown> = {}
  let subcommand: string | undefined

  if (platform === 'xiaohongshu') {
    subcommand = mode === 'video' ? 'publish-video' : 'publish'

    if (mode === 'video') {
      const video = (request.video ?? '').trim()
      checks.push({
        name: '视频文件存在',
        ok: Boolean(video) && existsSync(video),
        detail: video || '（未提供）',
        ...(video && existsSync(video) ? {} : { fix: '给出仓库内真实存在的视频路径。' }),
      })
      if (video) args.video = video
    } else {
      const images = (request.images ?? []).map((p) => p.trim()).filter(Boolean)
      const missing = images.filter((p) => !existsSync(p))
      checks.push({
        name: '图片已提供且存在',
        ok: images.length > 0 && missing.length === 0,
        detail: images.length ? `${images.length} 张${missing.length ? `，缺失 ${missing.length} 张` : ''}` : '（未提供）',
        ...(missing.length ? { fix: `以下路径不存在：${missing.join('、')}` } : {}),
        ...(images.length ? {} : { fix: '至少提供一张图片。' }),
      })
      if (images.length) args.images = images.join(',')
    }

    args.title = title
    if (request.content) args.content = request.content
    if (request.tags?.length) args.tags = request.tags.join(',')
    if (request.confirm) args.exec = true

    steps.push(
      '检查登录态（未登录会提示先扫码）',
      mode === 'video' ? '上传视频并等待转码完成' : `上传 ${request.images?.length ?? 0} 张图片`,
      '填写标题、正文与话题',
      '提交并校验发布成功（URL 离开发布页才算成功）'
    )
    warnings.push(
      '小红书自动化发布存在平台风控、限流与封号风险。建议先用测试号、小流量运行，最终内容人工复核。'
    )
    if (request.tags?.length) {
      steps.push('绑定话题（脚本会走联想选择，避免凭空输入被忽略）')
    }
  } else {
    // 公众号
    const cover = (request.cover ?? '').trim()
    checks.push({
      name: '封面图存在',
      ok: Boolean(cover) && existsSync(cover),
      detail: cover || '（未提供）',
      ...(cover && existsSync(cover) ? {} : { fix: '公众号草稿需要封面图，给出真实路径。' }),
    })

    const html = (request.html ?? '').trim()
    const hasHtml = Boolean(html) && existsSync(html)
    const hasContent = Boolean((request.content ?? '').trim())
    checks.push({
      name: '正文输入（HTML 或 Markdown）',
      ok: hasHtml || hasContent,
      detail: hasHtml ? `HTML：${html}` : hasContent ? 'Markdown 正文' : '（未提供）',
      ...(hasHtml || hasContent ? {} : { fix: '提供已排版 HTML 的路径，或直接给 Markdown 正文。' }),
    })
    if (html && !existsSync(html)) {
      checks.push({ name: 'HTML 文件存在', ok: false, detail: html, fix: '该 HTML 路径不存在。' })
    }

    args.title = title
    if (cover) args.cover = cover
    if (request.digest) args.digest = request.digest
    if (request.author) args.author = request.author
    if (hasHtml) args.html = html
    else if (hasContent) args.input = writeDraftMarkdown(config, request.content as string, title)
    // 默认走后台会话；显式指定才用官方 API（需凭证 + IP 白名单）
    if (request.officialApi) args['official-api'] = true
    if (request.confirm) args.exec = true

    steps.push(
      request.officialApi ? '使用官方 API（AppID/AppSecret + IP 白名单）' : '使用已扫码的公众号后台会话',
      '上传封面与正文图片',
      '按主题排版并做 AI 味检测',
      '创建草稿'
    )
    if (request.officialApi) {
      warnings.push('官方 API 路径需要 AppID/AppSecret，且出口 IP 必须在公众号后台白名单中。')
    }
  }

  const failed = checks.filter((c) => !c.ok)
  const script = spec.script

  return {
    ok: failed.length === 0,
    platform,
    platformName: spec.name,
    mode,
    script,
    ...(subcommand ? { subcommand } : {}),
    args,
    cli: toCliArgs(args),
    checks,
    warnings,
    steps,
    followUp:
      platform === 'wechat-mp'
        ? ['草稿已创建后，仍需你到公众号后台手动群发（这一步脚本不做）']
        : [],
  }
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

/**
 * 执行发布。
 *
 * - `confirm` 未设置时：只跑脚本的 dry-run（小红书不带 `--exec`；公众号不带 `--exec`），
 *   返回预检结果，**不产生任何对外副作用**。
 * - `confirm` 为真时：真正调用发布。此时上游脚本会自行执行发布前门禁；
 *   命中硬门禁会直接失败，本模块如实返回其错误。
 */
export async function executePublish(
  config: ResolvedConfig,
  request: PublishRequest,
  signal?: AbortSignal
): Promise<PublishResult> {
  const plan = planPublish(config, request)
  const base = {
    platform: plan.platform,
    platformName: plan.platformName,
    draftOnly: plan.platform === 'wechat-mp',
    plan,
    followUp: plan.followUp,
  }

  if (!plan.ok) {
    const first = plan.checks.find((c) => !c.ok)
    return {
      ...base,
      ok: false,
      executed: false,
      error: first ? `${first.name}：${first.detail ?? '未通过'}` : '预检未通过',
      ...(first?.fix ? { hint: first.fix } : {}),
    }
  }

  const subcommand = plan.subcommand ? [plan.subcommand] : []
  const result: EaselResult = await runEaselScript(
    config,
    plan.script,
    plan.args,
    signal,
    subcommand
  )

  if (result.ok === false) {
    return {
      ...base,
      ok: false,
      executed: request.confirm === true,
      raw: result,
      error: typeof result.error === 'string' ? result.error : '发布脚本返回失败',
      ...(typeof result.hint === 'string' ? { hint: result.hint } : {}),
    }
  }

  return {
    ...base,
    ok: true,
    executed: request.confirm === true,
    raw: result,
  }
}
