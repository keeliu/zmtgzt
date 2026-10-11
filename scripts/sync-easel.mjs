#!/usr/bin/env node
/**
 * 从 Easel 官方仓库同步 vendored 内容到 vendor/easel/。
 *
 * 为什么需要它：插件采用「内置副本」模式，安装后无需先 clone Easel 即可使用
 * 契约与全部技能；本脚本负责把上游内容拉进仓库，并记录来源以便追溯。
 *
 * 用法：
 *   node scripts/sync-easel.mjs                          # 从 main 同步到 vendor/easel
 *   node scripts/sync-easel.mjs --ref v1.2.0             # 指定分支/标签
 *   node scripts/sync-easel.mjs --repo <git-url>         # 换上游（如自己的 fork）
 *   node scripts/sync-easel.mjs --dry-run                # 只打印将要同步的内容
 *
 * 只同步"运行所需"的部分：契约、文档、技能（含脚本）、依赖声明与许可证。
 * 不同步 assets/（241 MB）、web/（207 MB）、tests/、outputs/ 等。
 *
 * 依赖：本机 git（用 partial clone 只拉取需要的目录，避免下整个 324 MB 仓库）。
 * @module dsh-zmtgzt/scripts/sync-easel
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** 默认上游。 */
const DEFAULT_REPO = 'https://github.com/ZJU-REAL/Easel.git'
/** 默认分支。 */
const DEFAULT_REF = 'main'
/** 同步到仓库内的位置。 */
const DEFAULT_OUT = 'vendor/easel'
/** 需要同步的顶层条目（目录或文件）。 */
const SYNC_ENTRIES = ['openclaw', 'docs', 'skills', 'pyproject.toml', 'LICENSE', '.env.example']

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { repo: DEFAULT_REPO, ref: DEFAULT_REF, out: DEFAULT_OUT, dryRun: false, keepTemp: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--repo') out.repo = argv[++i]
    else if (arg === '--ref') out.ref = argv[++i]
    else if (arg === '--out') out.out = argv[++i]
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--keep-temp') out.keepTemp = true
    else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '从 Easel 官方仓库同步 vendored 内容。',
          '',
          '用法: node scripts/sync-easel.mjs [选项]',
          '',
          '  --repo <url>    上游仓库（默认 ' + DEFAULT_REPO + '）',
          '  --ref <ref>     分支或标签（默认 ' + DEFAULT_REF + '）',
          '  --out <dir>     输出目录（默认 ' + DEFAULT_OUT + '）',
          '  --dry-run       只打印计划，不落盘',
          '  --keep-temp     保留临时克隆目录（排障用）',
        ].join('\n')
      )
      process.exit(0)
    } else {
      console.error(`未知参数：${arg}（用 --help 查看用法）`)
      process.exit(2)
    }
  }
  return out
}

const opts = parseArgs(process.argv.slice(2))
const OUT_DIR = resolve(ROOT, opts.out)
const TMP_DIR = resolve(ROOT, '.easel-sync-tmp')

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function log(step, message) {
  console.log(`[sync-easel] ${step.padEnd(10)} ${message}`)
}

/** 执行 git 并返回 stdout；失败时抛出带 stderr 的错误。 */
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

function dirSize(dir) {
  let total = 0
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) total += statSync(full).size
    }
  }
  if (existsSync(dir)) walk(dir)
  return total
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  log('上游', `${opts.repo} @ ${opts.ref}`)
  log('目标', OUT_DIR)

  if (opts.dryRun) {
    log('dry-run', `将同步：${SYNC_ENTRIES.join(', ')}`)
    log('dry-run', '未做任何改动。')
    return
  }

  // 1. 部分克隆：--filter=blob:none 让 blob 按需拉取，--sparse 只检出需要的目录
  rmSync(TMP_DIR, { recursive: true, force: true })
  log('clone', '开始部分克隆（只拉取所需目录，跳过 assets/ 与 web/）')
  try {
    git([
      'clone', '--filter=blob:none', '--sparse', '--depth', '1',
      '--branch', opts.ref, opts.repo, TMP_DIR,
    ], ROOT)
  } catch (error) {
    console.error('\n克隆失败。可能原因：')
    console.error('  - 本机没有 git，或 git 版本过低（需要 2.25+ 支持 partial clone）')
    console.error('  - 网络无法访问 ' + opts.repo)
    console.error('  - 指定的 --ref 不存在\n')
    console.error(String(error.stderr || error.message))
    process.exit(1)
  }

  log('sparse', `检出路径：${SYNC_ENTRIES.filter((e) => e !== 'pyproject.toml' && e !== 'LICENSE' && e !== '.env.example').join(', ')}`)
  git(['sparse-checkout', 'set', 'openclaw', 'docs', 'skills'], TMP_DIR)

  const commit = git(['rev-parse', 'HEAD'], TMP_DIR)
  const commitDate = git(['log', '-1', '--format=%cI'], TMP_DIR)
  log('上游版本', `${commit.slice(0, 10)}（${commitDate}）`)

  // 2. 复制到 vendor/easel
  mkdirSync(OUT_DIR, { recursive: true })
  const copied = []
  const missing = []
  for (const entry of SYNC_ENTRIES) {
    const src = join(TMP_DIR, entry)
    if (!existsSync(src)) {
      missing.push(entry)
      continue
    }
    const dest = join(OUT_DIR, entry)
    rmSync(dest, { recursive: true, force: true })
    cpSync(src, dest, { recursive: true })
    copied.push(entry)
  }
  log('复制', `${copied.length} 项：${copied.join(', ')}`)
  if (missing.length) log('跳过', `${missing.length} 项不存在于上游：${missing.join(', ')}`)

  // 3. 记录来源，便于追溯与后续增量同步
  const info = {
    source: opts.repo,
    ref: opts.ref,
    commit,
    commitDate,
    syncedAt: new Date().toISOString(),
    entries: copied,
    note:
      '此目录由 scripts/sync-easel.mjs 从 Easel 官方仓库同步而来，请勿手工修改。' +
      '上游项目 Easel 采用 Apache-2.0 许可，见同目录 LICENSE。',
  }
  writeFileSync(join(OUT_DIR, 'SYNC-INFO.json'), JSON.stringify(info, null, 2) + '\n', 'utf8')
  log('记录', 'SYNC-INFO.json 已写入')

  // 4. 清理
  if (opts.keepTemp) log('临时目录', `保留：${TMP_DIR}`)
  else rmSync(TMP_DIR, { recursive: true, force: true })

  log('完成', `vendor 体积约 ${human(dirSize(OUT_DIR))}`)

  // 5. 提示插件版本
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    log('下一步', `如内容有变，提交 vendor/ 并考虑提升 package.json 版本（当前 ${pkg.version}）`)
  } catch {
    /* 忽略 */
  }
}

main()
