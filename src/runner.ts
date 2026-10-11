/**
 * Easel 脚本执行器：所有 `zmtgzt_*` 工具的唯一确定性 IO 出口。
 *
 * 约定（对齐 Easel 项目自身的约束）：
 *   - 脚本必须 cd 到 Easel 项目根再执行，Python 侧不支持 --cwd 参数
 *   - .env 必须存在于 Easel 项目根目录，由脚本自行读取
 *   - 脚本以 JSON 写到 stdout，插件解析后作为工具的 canonical 返回值
 *
 * Easel 根目录未配置或不存在时不抛裸异常，而是返回结构化的 `EaselUnavailable`
 * 结果——工具层据此给出可操作指引，会话不中断。
 * @module dsh-zmtgzt/runner
 */
import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { ResolvedConfig } from './config.ts'

/** 脚本执行失败的结构化原因。 */
export type EaselFailureKind =
  | 'not-configured'
  | 'root-missing'
  | 'script-missing'
  | 'python-missing'
  | 'timeout'
  | 'aborted'
  | 'nonzero-exit'
  | 'bad-json'

/** 脚本执行的失败面：工具层直接把它作为 canonical 值返回，而不是抛异常。 */
export interface EaselFailure {
  ok: false
  kind: EaselFailureKind
  error: string
  /** 给模型/用户的下一步指引。 */
  hint: string
  /** 相关路径，便于排障（未配置时可能缺失）。 */
  path?: string
  /** 脚本 stderr 尾部，最多 4000 字符。 */
  stderr?: string
}

/** 脚本执行的成功面。 */
export interface EaselSuccess {
  ok: true
  script: string
  /** 脚本 stdout 解析出的 JSON；非对象时包成 { value }。 */
  data: unknown
  /** 执行耗时（毫秒）。 */
  elapsedMs: number
}

export type EaselResult = EaselSuccess | EaselFailure

/** 工具调用参数：扁平标量直传，复合值序列化为 JSON。 */
export type ScriptArgs = Record<string, unknown>

const MAX_STDERR = 4000

/** 校验 Easel 根目录可用性；不可用时返回失败面，可用时返回 undefined。 */
async function probeRoot(config: ResolvedConfig): Promise<EaselFailure | undefined> {
  if (!config.easelRoot) {
    return {
      ok: false,
      kind: 'not-configured',
      error: 'Easel 根目录未配置（config.easelRoot 为空）。',
      hint:
        '在 dsh 配置里为 dsh-zmtgzt 设置 config.easelRoot 指向本地 Easel 仓库的绝对路径' +
        '（该目录下应有 skills/ 与 .env）。可运行 zmtgzt_doctor 做一次体检。',
    }
  }
  try {
    await access(config.easelRoot, constants.R_OK)
  } catch {
    return {
      ok: false,
      kind: 'root-missing',
      error: `Easel 根目录不存在或不可读：${config.easelRoot}`,
      hint: '确认路径拼写，并确保该目录下存在 skills/ 子目录与 .env 文件。',
      path: config.easelRoot,
    }
  }
  return undefined
}

/** 解析脚本绝对路径，并阻断目录穿越。 */
function scriptPathOf(root: string, scriptRelPath: string): string | undefined {
  const abs = isAbsolute(scriptRelPath) ? resolve(scriptRelPath) : resolve(join(root, scriptRelPath))
  if (abs !== root && !abs.startsWith(root + sep)) return undefined
  return abs
}

/**
 * 执行一个 Easel Python 脚本。
 * @param config - 解析后的插件配置。
 * @param scriptRelPath - 相对 Easel 根的脚本路径。
 * @param args - 工具入参，转成 `--key value` 形式。
 * @param signal - 调用方可选取消信号（来自工具执行上下文）。
 * @param positional - 位置参数（通常是 argparse 子命令），排在 flags 之前。
 * @returns 成功面或结构化失败面；本函数不抛异常。
 */
export async function runEaselScript(
  config: ResolvedConfig,
  scriptRelPath: string,
  args: ScriptArgs = {},
  signal?: AbortSignal,
  positional: string[] = []
): Promise<EaselResult> {
  const rootFailure = await probeRoot(config)
  if (rootFailure) return rootFailure
  const root = config.easelRoot as string

  const scriptPath = scriptPathOf(root, scriptRelPath)
  if (!scriptPath) {
    return {
      ok: false,
      kind: 'script-missing',
      error: `脚本路径越出 Easel 根目录：${scriptRelPath}`,
      hint: '脚本路径必须是相对 Easel 根目录的相对路径。',
      path: scriptRelPath,
    }
  }
  try {
    await access(scriptPath, constants.R_OK)
  } catch {
    return {
      ok: false,
      kind: 'script-missing',
      error: `脚本不存在：${scriptPath}`,
      hint:
        '确认 Easel 仓库完整（含 skills/openclaw 与 skills/shared），' +
        '或该能力在当前 Easel 版本中尚未提供。',
      path: scriptPath,
    }
  }

  const cliArgs = toCliArgs(args)
  const startedAt = Date.now()

  try {
    const { stdout, stderr } = await execPython(config, scriptPath, cliArgs, root, signal, positional)
    const elapsedMs = Date.now() - startedAt
    const parsed = parseJsonLoose(stdout)
    if (parsed === undefined) {
      return {
        ok: false,
        kind: 'bad-json',
        error: '脚本 stdout 不是合法 JSON。',
        hint: '确认该脚本以 JSON 形式输出结果（Easel 脚本约定：单行 JSON 到 stdout）。',
        path: scriptPath,
        stderr: tail(stderr || stdout),
      }
    }
    return { ok: true, script: scriptRelPath, data: parsed, elapsedMs }
  } catch (error) {
    const failure = classifyError(error, scriptPath, config)
    return failure
  }
}

/** 起一个 python 进程；cwd 固定为 Easel 根，保证脚本能读到 .env 与相对资源。 */
function execPython(
  config: ResolvedConfig,
  scriptPath: string,
  cliArgs: string[],
  cwd: string,
  signal?: AbortSignal,
  positional: string[] = []
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      config.pythonPath,
      [scriptPath, ...positional, ...cliArgs],
      {
        cwd,
        timeout: config.scriptTimeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          ;(error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }).stderr = stderr
          ;(error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }).stdout = stdout
          reject(error)
          return
        }
        resolvePromise({ stdout, stderr })
      }
    )
    child.on('error', reject)
  })
}

/** 把工具入参压成 CLI 参数：undefined/null 跳过，复合值 JSON 序列化。 */
export function toCliArgs(args: ScriptArgs): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    out.push(`--${key}`)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out.push(String(value))
    } else {
      out.push(JSON.stringify(value))
    }
  }
  return out
}

/** 宽松解析脚本输出：容忍前置日志行与 BOM，取最后一个可解析的 JSON 片段。 */
function parseJsonLoose(raw: string): unknown | undefined {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    // 脚本可能把进度日志写到 stdout；从后往前找第一个能解析的 JSON 行。
    const lines = text.split(/\r?\n/)
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line || (line[0] !== '{' && line[0] !== '[')) continue
      try {
        return JSON.parse(line)
      } catch {
        continue
      }
    }
    return undefined
  }
}

/** 把底层错误翻译成结构化失败面。 */
function classifyError(
  error: unknown,
  scriptPath: string,
  config: ResolvedConfig
): EaselFailure {
  const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string }
  const stderr = tail(err?.stderr ?? '')

  if (err?.code === 'ENOENT') {
    return {
      ok: false,
      kind: 'python-missing',
      error: `找不到 Python 解释器：${config.pythonPath}`,
      hint: '把 config.pythonPath 指向可用的 python（Windows 常见为 py 或完整路径）。',
      path: config.pythonPath,
    }
  }
  if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
    return {
      ok: false,
      kind: 'aborted',
      error: '脚本执行被取消。',
      hint: '调用方已中止本次执行；如需继续请重新发起。',
      path: scriptPath,
    }
  }
  if (err?.killed || err?.signal === 'SIGTERM') {
    return {
      ok: false,
      kind: 'timeout',
      error: `脚本超过 ${config.scriptTimeoutMs} ms 未结束，已被终止。`,
      hint: '可提高 config.scriptTimeoutMs，或把任务拆小后重试。',
      path: scriptPath,
      stderr,
    }
  }
  return {
    ok: false,
    kind: 'nonzero-exit',
    error: err?.message || '脚本执行失败。',
    hint: '检查 stderr 尾部信息；多数情况是缺少 API key 或输入文件不存在。',
    path: scriptPath,
    stderr,
  }
}

function tail(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= MAX_STDERR ? trimmed : trimmed.slice(-MAX_STDERR)
}

/** 便于工具层统一判断。 */
export function isEaselFailure(value: unknown): value is EaselFailure {
  return typeof value === 'object' && value !== null && (value as EaselFailure).ok === false
}

/** 失败面转成给模型看的紧凑文本。 */
export function failureText(failure: EaselFailure): string {
  return `[${failure.kind}] ${failure.error}\n指引：${failure.hint}` +
    (failure.stderr ? `\nstderr: ${failure.stderr}` : '')
}
