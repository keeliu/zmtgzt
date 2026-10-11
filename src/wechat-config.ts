/**
 * 微信公众号「官方 API」凭证的读写与校验。
 *
 * 上游 `skill-wechat-publisher` 提供两条发布路径，本模块服务于第二条：
 *
 *   1. **后台会话**（默认）——扫码登录公众号后台，免 AppID/AppSecret、免 IP 白名单。
 *      由 `AccountService` 走 `weixin_mp_stats.py login`，不在本模块。
 *   2. **官方 HTTP API**（`publish.py --official-api`）——需要 `app_id`/`app_secret`，
 *      且需把出口 IP 加进公众号 IP 白名单。本模块负责这两个凭证的落地与校验。
 *
 * 配置文件位置由上游固定，不可自定义：
 * `skills/openclaw/skill-wechat-publisher/scripts/config.py::_config_path()` 返回
 * `Path(__file__).parent.parent / "wechat-publisher.yaml"`，即 **skill 根目录**。
 * 该文件同时被读取的顶层键还有 `image_generation`、`integrations` 等，
 * 因此写入采用**行级补丁**而非整体重写，以免丢掉这些内容与用户注释。
 * @module dsh-zmtgzt/wechat-config
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 相对生效根的配置文件路径（与上游 `_config_path()` 一致）。 */
export const WECHAT_CONFIG_REL = 'skills/openclaw/skill-wechat-publisher/wechat-publisher.yaml'

const INDENT_ACCOUNT = '  '
const INDENT_FIELD = '    '

/** 一个账号的解析结果（不含密钥明文）。 */
export interface WechatAccountView {
  key: string
  appId: string
  /** 是否已设置 app_secret（不回传明文）。 */
  hasSecret: boolean
  author: string
  theme: string
}

/** 配置解析结果。 */
export interface WechatConfigView {
  path: string
  exists: boolean
  defaultKey: string
  accounts: WechatAccountView[]
}

/** 写入账号的入参。 */
export interface WechatAccountInput {
  key: string
  appId: string
  appSecret: string
  author?: string
  theme?: string
}

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function isBlank(line: string): boolean {
  return line.trim() === ''
}

/** 去掉一层引号并反转义（宽松处理，够用于本文件的标量）。 */
function unquote(value: string): string {
  const v = value.trim()
  const quoted =
    v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  if (!quoted) return v
  return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/** 按 YAML 标量规则加引号（仅在必要时）。 */
function quote(value: string): string {
  if (value === '') return '""'
  // 无需引号的安全字符集
  if (/^[A-Za-z0-9_\-./@+]+$/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** 配置文件绝对路径。 */
export function wechatConfigPath(root: string): string {
  return join(root, WECHAT_CONFIG_REL)
}

/**
 * 解析配置。只关心 `default` 与 `accounts.<key>.{app_id,app_secret,author,theme}`，
 * 其余内容一概不解析（写入时靠行级补丁原样保留）。
 */
export function parseWechatConfig(text: string): { defaultKey: string; accounts: WechatAccountView[] } {
  const lines = text.split(/\r?\n/)
  const accounts: WechatAccountView[] = []
  let defaultKey = ''
  let current: WechatAccountView | null = null
  let inAccounts = false

  for (const line of lines) {
    if (isBlank(line) || /^\s*#/.test(line)) continue
    const indent = indentOf(line)
    const body = line.trim()

    if (indent === 0) {
      inAccounts = /^accounts\s*:/.test(body)
      const dm = /^default\s*:\s*(.*)$/.exec(body)
      if (dm) defaultKey = unquote(dm[1])
      current = null
      continue
    }
    if (!inAccounts) {
      current = null
      continue
    }

    // 账号键：缩进 2
    if (indent <= 2) {
      const keyText = body.replace(/:\s*.*$/, '').trim()
      if (!keyText) continue
      current = { key: unquote(keyText), appId: '', hasSecret: false, author: '', theme: '' }
      accounts.push(current)
      continue
    }

    // 字段：缩进 4
    if (current) {
      const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(body)
      if (!m) continue
      const field = m[1]
      const value = unquote(m[2])
      if (field === 'app_id') current.appId = value
      else if (field === 'app_secret') current.hasSecret = value.length > 0
      else if (field === 'author') current.author = value
      else if (field === 'theme') current.theme = value
    }
  }

  return { defaultKey, accounts }
}

/** 读取配置（文件不存在时返回 exists:false 的空视图）。 */
export function readWechatConfig(root: string): WechatConfigView {
  const path = wechatConfigPath(root)
  if (!existsSync(path)) {
    return { path, exists: false, defaultKey: '', accounts: [] }
  }
  try {
    const parsed = parseWechatConfig(readFileSync(path, 'utf8'))
    return { path, exists: true, ...parsed }
  } catch {
    return { path, exists: true, defaultKey: '', accounts: [] }
  }
}

// ---------------------------------------------------------------------------
// 行级补丁写入
// ---------------------------------------------------------------------------

/**
 * 对一个账号做字段级补丁。
 *
 * 算法（对应 design.md 的 D5）：
 *   1. 定位 `accounts:` 行；缺失则在文件末尾补一个
 *   2. 在 accounts 块内定位目标账号键（缩进 2）
 *   3. 账号已存在 → 块内已存在的字段行**就地替换**，缺失的**在块末插入**
 *   4. 账号不存在 → 在 accounts 块末**追加**完整账号块
 *   5. `default:` 已存在则更新，否则在文件头部插入
 *   6. **其余行完全不动**（注释、`image_generation`、`integrations` 等原样保留）
 *
 * 空字符串表示「本次不改动该字段」，因此 author / theme 可以不传。
 */
export function patchWechatConfig(text: string, target: WechatAccountInput): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length ? text.split(/\r?\n/) : []
  while (lines.length && isBlank(lines[lines.length - 1])) lines.pop()

  // 1. accounts: 行
  let accountsAt = lines.findIndex((l) => indentOf(l) === 0 && /^accounts\s*:/.test(l.trim()))
  if (accountsAt === -1) {
    if (lines.length) lines.push('')
    lines.push('accounts:')
    accountsAt = lines.length - 1
  }

  // 2. accounts 块范围（到下一个顶层键为止）
  let blockEnd = lines.length
  for (let i = accountsAt + 1; i < lines.length; i += 1) {
    if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
      blockEnd = i
      break
    }
  }

  // 3. 目标账号行
  let accountAt = -1
  for (let i = accountsAt + 1; i < blockEnd; i += 1) {
    if (isBlank(lines[i]) || indentOf(lines[i]) !== 2) continue
    const key = unquote(lines[i].trim().replace(/:\s*.*$/, '').trim())
    if (key === target.key) {
      accountAt = i
      break
    }
  }

  const fields: Array<[string, string | undefined]> = [
    ['app_id', target.appId || undefined],
    ['app_secret', target.appSecret || undefined],
    ['author', target.author || undefined],
    ['theme', target.theme || undefined],
  ]

  if (accountAt === -1) {
    // 4. 追加新账号块
    const block: string[] = []
    if (blockEnd > accountsAt + 1) block.push('')
    block.push(`${INDENT_ACCOUNT}${target.key}:`)
    for (const [field, value] of fields) {
      if (value === undefined) continue
      block.push(`${INDENT_FIELD}${field}: ${quote(value)}`)
    }
    lines.splice(blockEnd, 0, ...block)
  } else {
    // 账号块范围（到下一个缩进 <= 2 的非空行为止）
    let acctEnd = blockEnd
    for (let i = accountAt + 1; i < blockEnd; i += 1) {
      if (!isBlank(lines[i]) && indentOf(lines[i]) <= 2) {
        acctEnd = i
        break
      }
    }
    for (const [field, value] of fields) {
      if (value === undefined) continue
      let fieldAt = -1
      for (let i = accountAt + 1; i < acctEnd; i += 1) {
        if (new RegExp(`^\\s*${field}\\s*:`).test(lines[i])) {
          fieldAt = i
          break
        }
      }
      if (fieldAt >= 0) {
        lines[fieldAt] = `${INDENT_FIELD}${field}: ${quote(value)}`
      } else {
        lines.splice(acctEnd, 0, `${INDENT_FIELD}${field}: ${quote(value)}`)
        acctEnd += 1
      }
    }
  }

  // 5. default:
  const defaultAt = lines.findIndex((l) => indentOf(l) === 0 && /^default\s*:/.test(l.trim()))
  if (defaultAt >= 0) lines[defaultAt] = `default: ${quote(target.key)}`
  else lines.unshift(`default: ${quote(target.key)}`)

  return lines.join(eol) + eol
}

/** 写入结果。 */
export interface WechatWriteResult {
  ok: boolean
  path: string
  backup?: string
  error?: string
}

/**
 * 写入 / 更新一个账号的凭证。
 *
 * 写入前会把原文件复制为 `<file>.bak`：行级补丁虽然保守，
 * 但仍应给用户留一条回到原状的路径。
 */
export function writeWechatAccount(root: string, target: WechatAccountInput): WechatWriteResult {
  const path = wechatConfigPath(root)
  let backup: string | undefined
  try {
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (existing) {
      backup = `${path}.bak`
      copyFileSync(path, backup)
    }
    const next = patchWechatConfig(existing, target)
    writeFileSync(path, next, 'utf8')
    return { ok: true, path, ...(backup ? { backup } : {}) }
  } catch (error) {
    return { ok: false, path, ...(backup ? { backup } : {}), error: String(error) }
  }
}

/** 移除一个账号条目（连同其凭证）。 */
export function removeWechatAccount(root: string, key: string): WechatWriteResult {
  const path = wechatConfigPath(root)
  if (!existsSync(path)) return { ok: true, path }
  try {
    const text = readFileSync(path, 'utf8')
    const backup = `${path}.bak`
    copyFileSync(path, backup)

    const lines = text.split(/\r?\n/)
    const accountsAt = lines.findIndex((l) => indentOf(l) === 0 && /^accounts\s*:/.test(l.trim()))
    if (accountsAt >= 0) {
      let blockEnd = lines.length
      for (let i = accountsAt + 1; i < lines.length; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
          blockEnd = i
          break
        }
      }
      let accountAt = -1
      for (let i = accountsAt + 1; i < blockEnd; i += 1) {
        if (isBlank(lines[i]) || indentOf(lines[i]) !== 2) continue
        if (unquote(lines[i].trim().replace(/:\s*.*$/, '').trim()) === key) {
          accountAt = i
          break
        }
      }
      if (accountAt >= 0) {
        let acctEnd = blockEnd
        for (let i = accountAt + 1; i < blockEnd; i += 1) {
          if (!isBlank(lines[i]) && indentOf(lines[i]) <= 2) {
            acctEnd = i
            break
          }
        }
        // 连同上方的空行一并删掉，避免留下连续空行
        let start = accountAt
        if (start > accountsAt + 1 && isBlank(lines[start - 1])) start -= 1
        lines.splice(start, acctEnd - start)
      }
    }

    // default 指向被删账号时一并清掉
    const defaultAt = lines.findIndex((l) => indentOf(l) === 0 && /^default\s*:/.test(l.trim()))
    if (defaultAt >= 0 && unquote(lines[defaultAt].trim().replace(/^default\s*:\s*/, '')) === key) {
      lines.splice(defaultAt, 1)
    }

    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop()
    writeFileSync(path, lines.join(text.includes('\r\n') ? '\r\n' : '\n') + '\n', 'utf8')
    return { ok: true, path, backup }
  } catch (error) {
    return { ok: false, path, error: String(error) }
  }
}

// ---------------------------------------------------------------------------
// 凭证校验
// ---------------------------------------------------------------------------

export type CredentialCheckKind =
  | 'ok'
  | 'invalid-credentials'
  | 'ip-not-whitelisted'
  | 'network'
  | 'unknown'

/** 凭证校验结果。 */
export interface CredentialCheck {
  ok: boolean
  kind: CredentialCheckKind
  message: string
  hint?: string
  errcode?: number
}

/**
 * 调用微信官方接口校验 AppID / AppSecret。
 *
 * 关键点：`40164` 表示**凭证正确但出口 IP 未登记白名单**。
 * 若把它归为「凭证错误」，用户会反复核对 AppID/Secret 而找不到原因，
 * 因此这里必须单独成类并明确说明。
 * 错误码语义见上游 `skill-wechat-publisher/references/errors.md`。
 */
export async function verifyWechatCredentials(
  appId: string,
  appSecret: string,
  timeoutMs = 15_000
): Promise<CredentialCheck> {
  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`

  let response: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (error) {
    return {
      ok: false,
      kind: 'network',
      message: `无法连接微信接口：${error instanceof Error ? error.message : String(error)}`,
      hint: '检查网络或代理设置；官方 API 需要能访问 api.weixin.qq.com。凭证未被判定为错误。',
    }
  } finally {
    clearTimeout(timer)
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch (error) {
    return {
      ok: false,
      kind: 'unknown',
      message: `微信接口返回了无法解析的内容（HTTP ${response.status}）。`,
      hint: String(error),
    }
  }

  if (typeof data.access_token === 'string' && data.access_token) {
    return { ok: true, kind: 'ok', message: '凭证有效，可用于官方 API 发布草稿。' }
  }

  const errcode = Number(data.errcode)
  const errmsg = typeof data.errmsg === 'string' ? data.errmsg : ''

  if (errcode === 40001 || errcode === 40002) {
    return {
      ok: false,
      kind: 'invalid-credentials',
      errcode,
      message: `AppID 或 AppSecret 不正确（errcode ${errcode}${errmsg ? `：${errmsg}` : ''}）`,
      hint: '请在公众号后台「设置与开发 → 基本配置」核对 AppID 与 AppSecret。注意 AppSecret 只在重置时显示一次。',
    }
  }

  if (errcode === 40164) {
    return {
      ok: false,
      kind: 'ip-not-whitelisted',
      errcode,
      message: `凭证本身有效，但当前出口 IP 未加入公众号 IP 白名单（errcode 40164${errmsg ? `：${errmsg}` : ''}）`,
      hint: '在公众号后台「设置与开发 → 基本配置 → IP 白名单」中加入本机出口 IP 后重试。这不是凭证错误。',
    }
  }

  return {
    ok: false,
    kind: 'unknown',
    errcode: Number.isFinite(errcode) ? errcode : undefined,
    message: `校验未通过${Number.isFinite(errcode) ? `（errcode ${errcode}${errmsg ? `：${errmsg}` : ''}）` : ''}`,
  }
}

/** AppID 脱敏：保留前 6 位与后 4 位。 */
export function maskAppId(appId: string): string {
  if (!appId) return ''
  if (appId.length <= 12) return `${appId.slice(0, 3)}***`
  return `${appId.slice(0, 6)}…${appId.slice(-4)}`
}
