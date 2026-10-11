/**
 * 登录链路测试：二维码呈现、失败可诊断、子进程异常处理。
 *
 * 覆盖三个此前**完全没有测试**、因而在真实使用中暴露的缺陷：
 *   1. 预检必须拦截注定失败的登录（上游脚本在写状态前就因缺依赖退出，
 *      状态文件从不创建、前端只看到 `unknown`）
 *   2. 脚本退出却没写状态时，必须归因到「未写状态即退出」并指向日志（而不是停在 unknown）
 *   3. 二维码图片必须经 HTTP 端点可取（旧实现前端根本没渲染图片）
 *
 * 用法：node scripts/login-flow.mjs
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const WORK = '/tmp/zmtgzt-login-test'
const WORKSPACE = join(WORK, 'easel')
const FAKE_PYTHON = join(WORK, 'fake-python')

// 宿主替身：lib/index.js 顶层 import 了 defineTool
function ensureHostStub() {
  const dir = join(root, 'node_modules/@deepseek-ai/dsh-tools')
  if (existsSync(join(dir, 'index.js'))) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      { name: '@deepseek-ai/dsh-tools', version: '0.0.0-local-stub', type: 'module', main: 'index.js', exports: { '.': './index.js' } },
      null,
      2
    )
  )
  writeFileSync(
    join(dir, 'index.js'),
    'export const defineTool = (o) => o\nexport const TOOL_RUNTIME_SCHEDULER = Symbol("s")\n'
  )
}

ensureHostStub()

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

/**
 * 假 Python：让预检通过，但跑登录脚本时立刻退出且**不写状态文件** ——
 * 以此复现「脚本未写状态即退出」这一真实故障形态。
 */
writeFileSync(
  FAKE_PYTHON,
  [
    '#!/bin/sh',
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    *sys.version*) echo "3.11.0"; exit 0 ;;',
    '    *json.dumps*) echo \'{"playwright":true,"opencv-python":true,"Pillow":true}\'; exit 0 ;;',
    '  esac',
    'done',
    'echo "[fake-python] login stub: exits without writing status"',
    'exit 0',
    '',
  ].join('\n'),
  'utf8'
)
chmodSync(FAKE_PYTHON, 0o755)

const mod = await import(join(root, 'lib/index.js'))

/** 造一个 ctx，注册的东西都收进 store。 */
function makeCtx(store) {
  return {
    tools: { register: () => {} },
    provide: (key, value) => store.set(key, value),
    inject: (deps, cb) => {
      if (deps.includes('skills')) cb({ skills: { register: () => () => {} } })
      if (deps.includes('webServer')) {
        cb({ webServer: { register: (route) => store.set(`route:${route.path}`, route) } })
      }
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
}

function mockRes() {
  const captured = { status: 0, headers: {}, body: null }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      Object.assign(captured.headers, headers ?? {})
    },
    end(body) {
      captured.body = body
    },
  }
}

/** 等状态文件出现且不再是 starting。 */
async function waitForState(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data?.state && data.state !== 'starting') return data
    } catch {
      /* 还没写 */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

// ---------------------------------------------------------------------------
console.log('\n[A] 预检拦截：解释器不可用时不启动进程')
// ---------------------------------------------------------------------------

const dataA = join(WORK, 'dataA')
const storeA = new Map()
await mod.apply(makeCtx(storeA), {
  workspaceDir: WORKSPACE,
  dataDir: dataA,
  pythonPath: '/nonexistent/python-should-not-exist',
  registerEaselSkills: false,
})

const accountA = storeA.get('zmtgztAccount')
check('账号服务已提供', Boolean(accountA))

const failA = await accountA.startLogin('xiaohongshu')
check('返回失败而不是假装成功', 'error' in failA)
check('附带预检探测明细', Array.isArray(failA.preflight?.probes) && failA.preflight.probes.length > 0)
check('探测明细标出了不通过项', (failA.preflight?.probes ?? []).some((p) => !p.ok))
check('不通过项带修复指引', (failA.preflight?.probes ?? []).some((p) => !p.ok && p.fix))
check('hint 说明未启动进程', /未启动登录进程/.test(failA.hint ?? ''))
check(
  '★ 未创建状态文件（不会让前端停在 unknown）',
  !existsSync(join(dataA, 'login', 'xiaohongshu.json'))
)
check('★ 未产生日志（证明进程没被拉起）', !existsSync(join(dataA, 'login', 'xiaohongshu.log')))

// ---------------------------------------------------------------------------
console.log('\n[B] 预检通过：启动进程、日志落盘、退出归因')
// ---------------------------------------------------------------------------

const dataB = join(WORK, 'dataB')
const storeB = new Map()
await mod.apply(makeCtx(storeB), {
  workspaceDir: WORKSPACE,
  dataDir: dataB,
  pythonPath: FAKE_PYTHON,
  registerEaselSkills: false,
})

const accountB = storeB.get('zmtgztAccount')
const sessionB = await accountB.startLogin('xiaohongshu')

check('返回登录会话', !('error' in sessionB), 'error' in sessionB ? String(sessionB.error) : '')
check('mode 默认 qr', sessionB.mode === 'qr', sessionB.mode)
check('会话带 logPath', typeof sessionB.logPath === 'string' && sessionB.logPath.includes('.log'))
check('会话带 statusFile', typeof sessionB.statusFile === 'string')
check(
  '启动日志已落盘且含启动信息',
  existsSync(sessionB.logPath) && readFileSync(sessionB.logPath, 'utf8').includes('启动')
)

const exitState = await waitForState(sessionB.statusFile, 8000)
check('★ 脚本未写状态即退出 → 归因为 error 而非停在 unknown', exitState?.state === 'error', JSON.stringify(exitState))
check('★ 错误信息说明脚本已退出', /已退出/.test(exitState?.message ?? ''))
check('★ 错误信息指向日志文件', /日志/.test(exitState?.message ?? ''))

// 窗口模式：mode 要能正确传递
const sessionWindow = await accountB.startLogin('xiaohongshu', { mode: 'window' })
check('窗口模式 mode 正确', sessionWindow.mode === 'window', sessionWindow.mode)
await waitForState(sessionWindow.statusFile, 8000)

// 不支持登录的渠道
const unsupported = await accountB.startLogin('toutiao')
check('不支持登录的渠道被拒绝', 'error' in unsupported && /不支持/.test(unsupported.error))

// 未知渠道
const unknown = await accountB.startLogin('no-such-channel')
check('未知渠道被拒绝', 'error' in unknown && /未知渠道/.test(unknown.error))

// ---------------------------------------------------------------------------
console.log('\n[C] 登录状态解析')
// ---------------------------------------------------------------------------

const statusFile = join(dataB, 'login', 'xiaohongshu.json')
writeFileSync(
  statusFile,
  JSON.stringify({ state: 'qr_ready', message: '二维码已就绪，请扫码', qr: '/tmp/x.png', ts: 1 }),
  'utf8'
)
const st = accountB.loginStatus('xiaohongshu')
check('解析 qr_ready', st.state === 'qr_ready')
check('解析 message', /二维码已就绪/.test(st.message))
check('解析 qr 路径', st.qr === '/tmp/x.png')

// 带 BOM 的文件也要能读（Windows 上常见）
writeFileSync(statusFile, '\uFEFF' + JSON.stringify({ state: 'success', message: '登录成功', qr: '' }), 'utf8')
check('可读带 BOM 的状态文件（Windows）', accountB.loginStatus('xiaohongshu').state === 'success')

rmSync(statusFile, { force: true })
check('状态文件缺失时返回 unknown', accountB.loginStatus('xiaohongshu').state === 'unknown')

// ---------------------------------------------------------------------------
console.log('\n[D] 二维码端点')
// ---------------------------------------------------------------------------

const qrFile = accountB.qrPath('xiaohongshu')
mkdirSync(dirname(qrFile), { recursive: true })
writeFileSync(qrFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

const qrRoute = storeB.get('route:/api/zmtgzt/account/login/qr')
check('二维码路由已注册', Boolean(qrRoute))

const resQr = mockRes()
qrRoute.handler({ url: '/api/zmtgzt/account/login/qr?channelId=xiaohongshu', method: 'GET' }, resQr)
check('二维码返回 200', resQr.captured.status === 200, String(resQr.captured.status))
check('content-type 为 image/png', /image\/png/.test(resQr.captured.headers['content-type'] ?? ''))
check('返回二进制内容', Buffer.isBuffer(resQr.captured.body))
check('二进制内容非空', Buffer.isBuffer(resQr.captured.body) && resQr.captured.body.length === 8)

const resQrMiss = mockRes()
qrRoute.handler({ url: '/api/zmtgzt/account/login/qr?channelId=wechat-mp', method: 'GET' }, resQrMiss)
check('★ 无二维码时返回 404（前端据此不渲染破图）', resQrMiss.captured.status === 404, String(resQrMiss.captured.status))

const resQrNoId = mockRes()
qrRoute.handler({ url: '/api/zmtgzt/account/login/qr', method: 'GET' }, resQrNoId)
check('缺 channelId 时返回 404', resQrNoId.captured.status === 404)

// ---------------------------------------------------------------------------
console.log('\n[E] 登录日志端点')
// ---------------------------------------------------------------------------

const logRoute = storeB.get('route:/api/zmtgzt/account/login/log')
check('日志路由已注册', Boolean(logRoute))

const resLog = mockRes()
logRoute.handler({ url: '/api/zmtgzt/account/login/log?channelId=xiaohongshu', method: 'GET' }, resLog)
const logBody = JSON.parse(resLog.captured.body)
check('日志端点 ok', logBody.ok === true)
check('日志 exists 为真', logBody.exists === true)
check('日志有内容', typeof logBody.content === 'string' && logBody.content.length > 0)
check('日志内容含启动行', /启动/.test(logBody.content))

const resLogMiss = mockRes()
logRoute.handler({ url: '/api/zmtgzt/account/login/log?channelId=wechat-mp', method: 'GET' }, resLogMiss)
const logMissBody = JSON.parse(resLogMiss.captured.body)
check('无日志时 exists 为假（而非报错）', logMissBody.exists === false && logMissBody.ok === true)

// ---------------------------------------------------------------------------
console.log('\n[F] 公众号凭证端点（脱敏）')
// ---------------------------------------------------------------------------

const wechatRoute = storeB.get('route:/api/zmtgzt/account/wechat')
check('公众号凭证路由已注册', Boolean(wechatRoute))

const resWechat = mockRes()
await wechatRoute.handler({ url: '/api/zmtgzt/account/wechat', method: 'GET' }, resWechat)
const wechatBody = JSON.parse(resWechat.captured.body)
check('GET 返回 ok', wechatBody.ok === true, JSON.stringify(wechatBody).slice(0, 160))
check('返回 config 结构', Boolean(wechatBody.config) && typeof wechatBody.config?.path === 'string')
check(
  '配置路径指向上游约定的 skill 目录',
  /skill-wechat-publisher[\\/]wechat-publisher\.yaml$/.test(wechatBody.config?.path ?? ''),
  wechatBody.config?.path ?? ''
)
check('★ 响应中不含 app_secret 字段', !/app_secret/i.test(resWechat.captured.body))

const resWechatBad = mockRes()
await wechatRoute.handler(
  { url: '/api/zmtgzt/account/wechat', method: 'POST', [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ appId: '', appSecret: '' })) } },
  resWechatBad
)
const badBody = JSON.parse(resWechatBad.captured.body)
check('缺字段时拒绝并说明', badBody.ok === false && /必填/.test(badBody.error))

const removeRoute = storeB.get('route:/api/zmtgzt/account/wechat/remove')
check('凭证清除路由已注册', Boolean(removeRoute))

// ---------------------------------------------------------------------------
console.log('\n[G] 新增路由齐全')
// ---------------------------------------------------------------------------

const routes = [...storeB.keys()].filter((k) => k.startsWith('route:')).map((k) => k.slice('route:'.length))
for (const path of [
  '/api/zmtgzt/account',
  '/api/zmtgzt/account/login',
  '/api/zmtgzt/account/login/qr',
  '/api/zmtgzt/account/login/log',
  '/api/zmtgzt/account/login/status',
  '/api/zmtgzt/account/logout',
  '/api/zmtgzt/account/wechat',
  '/api/zmtgzt/account/wechat/remove',
]) {
  check(`已注册 ${path}`, routes.includes(path))
}

// ---------------------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`login-flow: ${failures.length} 项失败`)
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
console.log('login-flow: 全部通过')
