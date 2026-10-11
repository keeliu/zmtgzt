/**
 * 运行环境预检：在发起登录之前确认 Python 侧依赖齐备。
 *
 * 为什么需要它（这是在真实使用中定位到的问题）：上游 `xhs_publish.py` 的
 * `cmd_login` 在**写第一个登录状态之前**就先 `from playwright.sync_api import sync_playwright`，
 * 失败即 `_die("需要 playwright：...")` 退出：
 *
 * ```python
 * def cmd_login(a) -> int:
 *     try:
 *         from playwright.sync_api import sync_playwright
 *     except Exception as e:
 *         _die(f"需要 playwright：{e}", 3)          # ← 在此退出
 *     ...
 *     login_state.write_status(sf, "starting", "正在启动…")   # ← 从未执行
 * ```
 *
 * 状态文件因此从不被创建，前端只读到 `unknown`，用户无从判断原因。
 * 这里把同样的检查提前到进程启动之前，并给出确切的缺失项与安装命令。
 *
 * 另注：headless 抠二维码依赖 `skills/shared/scripts/login_qr.py` 的 `save_qr`，
 * 它直接 `import cv2` 与 `PIL`，因此这两个也必须一并检查。
 * @module dsh-zmtgzt/preflight
 */
import { execFile } from 'node:child_process'
import type { ResolvedConfig } from './config.ts'

/** 单项探测结果。 */
export interface ProbeResult {
  name: string
  ok: boolean
  detail?: string
  /** 失败时的修复指引。 */
  fix?: string
}

/** 预检总报告。 */
export interface PreflightReport {
  ok: boolean
  pythonPath: string
  probes: ProbeResult[]
  hint?: string
}

/**
 * 在解释器内逐个 import 目标模块并回报结果。
 * 用一段内联脚本一次问完，比逐项起进程快得多。
 */
const PROBE_SCRIPT = [
  'import json',
  'targets = [("playwright", "playwright"), ("cv2", "opencv-python"), ("PIL", "Pillow")]',
  'result = {}',
  'for module, package in targets:',
  '    try:',
  '        __import__(module)',
  '        result[package] = True',
  '    except Exception:',
  '        result[package] = False',
  'print(json.dumps(result))',
].join('\n')

/** 各依赖缺失时的修复命令。 */
const FIX_HINTS: Record<string, string> = {
  playwright: 'pip install playwright 然后 playwright install chromium',
  'opencv-python': 'pip install "opencv-python>=4.8,<5"',
  Pillow: 'pip install "Pillow>=10,<13"',
}

interface RunOutcome {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

/** 跑一次 Python，捕获输出；不抛异常。 */
function runPython(
  config: ResolvedConfig,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal
): Promise<RunOutcome> {
  return new Promise((resolvePromise) => {
    let settled = false
    const done = (value: RunOutcome) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolvePromise(value)
    }
    const onAbort = () => {
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      done({ ok: false, stdout: '', stderr: '', error: '已取消' })
    }

    let child: ReturnType<typeof execFile>
    try {
      child = execFile(
        config.pythonPath,
        args,
        { cwd: config.easelRoot, timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code
            done({
              ok: false,
              stdout: String(stdout ?? ''),
              stderr: String(stderr ?? ''),
              error:
                code === 'ENOENT'
                  ? `找不到解释器：${config.pythonPath}`
                  : String(stderr || error.message),
            })
            return
          }
          done({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
        }
      )
    } catch (error) {
      done({ ok: false, stdout: '', stderr: '', error: String(error) })
      return
    }

    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * 探测登录所需环境。
 *
 * 结果**不做长期缓存**：用户装完依赖后应立刻生效，因此每次发起登录前重新探测。
 *
 * @param requireQrDeps - 是否要求二维码识别依赖（`opencv-python` / `Pillow`）。
 *   有头（窗口）登录不抠二维码，因此不需要这两项——只要求解释器与 playwright。
 */
export async function preflightLogin(
  config: ResolvedConfig,
  requireQrDeps = true,
  signal?: AbortSignal
): Promise<PreflightReport> {
  const probes: ProbeResult[] = []

  // 1. 解释器本身可用（顺带拿到版本，便于用户核对是否装到了预期环境）
  const interpreter = await runPython(config, ['-c', 'import sys; print(sys.version.split()[0])'], 30_000, signal)
  if (!interpreter.ok) {
    probes.push({
      name: `Python 解释器（${config.pythonPath}）`,
      ok: false,
      detail: interpreter.error ?? '无法执行',
      fix:
        '检查插件配置 config.pythonPath —— Windows 上常见需要写成 py 或解释器的绝对路径；' +
        '确认该解释器已安装 playwright 与二维码识别依赖。',
    })
    return {
      ok: false,
      pythonPath: config.pythonPath,
      probes,
      hint:
        '登录脚本依赖 Python 运行时，当前解释器不可用，因此**未启动登录进程**（避免产生一个注定失败的后台任务）。' +
        '请先修复上面的项，再重新点击登录。',
    }
  }
  probes.push({
    name: `Python 解释器（${config.pythonPath}）`,
    ok: true,
    detail: `Python ${interpreter.stdout.trim()}`,
  })

  // 2. 逐个探测模块
  const modules = await runPython(config, ['-c', PROBE_SCRIPT], 60_000, signal)
  if (!modules.ok) {
    probes.push({
      name: '依赖探测',
      ok: false,
      detail: modules.error ?? '探测失败',
      fix: '确认解释器可正常执行内联脚本（未被安全策略拦截）。',
    })
  } else {
    let parsed: Record<string, boolean> = {}
    try {
      parsed = JSON.parse(modules.stdout.trim()) as Record<string, boolean>
    } catch {
      parsed = {}
    }
    for (const [pkg, fix] of Object.entries(FIX_HINTS)) {
      // 窗口登录不抠二维码，cv2 / PIL 不是必要条件
      const needed = requireQrDeps || pkg === 'playwright'
      const ok = parsed[pkg] === true
      probes.push({
        name: pkg,
        ok: ok || !needed,
        detail: ok ? '已安装' : needed ? '未安装或不可导入' : '未安装（当前方式不需要）',
        ...(ok || !needed ? {} : { fix }),
      })
    }
  }

  const failed = probes.filter((p) => !p.ok)
  return {
    ok: failed.length === 0,
    pythonPath: config.pythonPath,
    probes,
    ...(failed.length
      ? {
          hint:
            `以下依赖缺失，**未启动登录进程**（避免产生注定失败的后台任务）：` +
            failed.map((f) => f.name).join('、') +
            '。按各项后的命令安装后重试。' +
            (requireQrDeps
              ? '注意 headless 扫码需要 opencv-python 与 Pillow 把二维码抠成图片；' +
                '若不想装这两个，可改用「窗口登录」方式（需要本机有桌面环境）。'
              : ''),
        }
      : {}),
  }
}
