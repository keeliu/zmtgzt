/**
 * 工作台能力测试：覆盖本次新增的五项能力。
 *
 *   [A] contract-loading：契约释放到根目录、根优先读取、用户编辑不被覆盖
 *   [B] creator-topic：主题 CRUD、泛化名拒绝、产物目录结构
 *   [C] session-bindings：绑定持久化、解绑
 *   [D] creator-account：渠道支持矩阵（头条如实标注不支持）、登录态探测
 *   [E] 路由：新增端点已注册且行为符合预期
 *
 * 用法：node scripts/workbench.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const WORK = '/tmp/zmtgzt-workbench-test'
const WORKSPACE = join(WORK, 'easel')
const DATA = join(WORK, 'data')

function ensureHostStub() {
  const dir = join(root, 'node_modules/@deepseek-ai/dsh-tools')
  if (existsSync(join(dir, 'index.js'))) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.0.0-local-stub', type: 'module', main: 'index.js', exports: { '.': './index.js' } }, null, 2)
  )
  writeFileSync(join(dir, 'index.js'), 'export const defineTool = (o) => o\nexport const TOOL_RUNTIME_SCHEDULER = Symbol("s")\n')
}

ensureHostStub()

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const mod = await import(join(root, 'lib/index.js'))
const registered = new Map()
const provided = new Map()
const routes = new Map()

const ctx = {
  tools: { register: (t) => registered.set(t.name, t) },
  provide: (k, v) => provided.set(k, v),
  inject: (deps, cb) => {
    if (deps.includes('skills')) cb({ skills: { register: () => () => {} } })
    if (deps.includes('webServer')) {
      cb({ webServer: { register: (r) => routes.set(r.path, r) } })
    }
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}

rmSync(WORK, { recursive: true, force: true })
await mod.apply(ctx, { workspaceDir: WORKSPACE, dataDir: DATA, registerEaselSkills: false })

// ---------------------------------------------------------------------------
// [A] 契约文件位置与加载
// ---------------------------------------------------------------------------

console.log('\n[A] 契约文件位置与加载（contract-loading）')
check('根目录释放了 SOUL.md', existsSync(join(WORKSPACE, 'SOUL.md')))
check('根目录释放了 AGENTS.md', existsSync(join(WORKSPACE, 'AGENTS.md')))
check('快照原位置仍在（技能相对引用依赖）', existsSync(join(WORKSPACE, 'openclaw/workspace/AGENTS.md')))

const repo = provided.get('zmtgztRepo')
const contract1 = await repo.readContract()
const sources1 = repo.contractSourcePaths()
check('契约可读到', Boolean(contract1.soul) && Boolean(contract1.agents))
check('来源为工作目录根', sources1.agents === join(WORKSPACE, 'AGENTS.md'), String(sources1.agents))

// 用户编辑根目录版本后，应优先且不被覆盖
const userMark = `\n\n<!-- user-edit-${Date.now()} -->\n`
writeFileSync(join(WORKSPACE, 'AGENTS.md'), readFileSync(join(WORKSPACE, 'AGENTS.md'), 'utf8') + userMark, 'utf8')
repo.invalidate()
const contract2 = await repo.readContract()
check('根目录版本优先', String(contract2.agents).includes('user-edit-'))

// 再次 apply（模拟重启）后，用户编辑仍在
await mod.apply(ctx, { workspaceDir: WORKSPACE, dataDir: DATA, registerEaselSkills: false })
const afterRestart = readFileSync(join(WORKSPACE, 'AGENTS.md'), 'utf8')
check('重启后用户编辑未被快照覆盖', afterRestart.includes('user-edit-'))

// 根目录契约缺失时回退
rmSync(join(WORKSPACE, 'SOUL.md'), { force: true })
const repo2 = provided.get('zmtgztRepo')
repo2.invalidate()
await repo2.readContract()
const sources2 = repo2.contractSourcePaths()
check(
  '根目录缺失时回退到 openclaw/workspace/',
  String(sources2.soul).endsWith(join('openclaw', 'workspace', 'SOUL.md')),
  String(sources2.soul)
)

// ---------------------------------------------------------------------------
// [B] 主题
// ---------------------------------------------------------------------------

console.log('\n[B] 主题管理（creator-topic）')
const topics = provided.get('zmtgztTopics')

const created = await topics.create('春季通勤穿搭')
check('创建主题成功', created.ok === true, created.ok ? created.topic.dir : created.reason)
check('主题目录存在', existsSync(join(WORKSPACE, 'outputs/春季通勤穿搭')))
check('自动写入 manifest', existsSync(join(WORKSPACE, 'outputs/春季通勤穿搭/manifest.json')))

const bad = await topics.create('test')
check('泛化名 test 被拒绝', bad.ok === false, bad.reason)
const bad2 = await topics.create('临时')
check('泛化名「临时」被拒绝', bad2.ok === false)
const bad3 = await topics.create('_scratch')
check('下划线前缀被拒绝', bad3.ok === false)
const bad4 = await topics.create('   ')
check('空名被拒绝', bad4.ok === false)

const list = await topics.list()
check('主题出现在列表中', list.some((t) => t.name === '春季通勤穿搭'))
check('系统目录不出现在列表', !list.some((t) => t.name.startsWith('_')))

const renamed = await topics.rename('春季通勤穿搭', '春季穿搭终极版')
check('重命名成功', renamed.ok === true)
check('旧目录已不存在', !existsSync(join(WORKSPACE, 'outputs/春季通勤穿搭')))
check('新目录存在', existsSync(join(WORKSPACE, 'outputs/春季穿搭终极版')))
const manifestAfter = JSON.parse(readFileSync(join(WORKSPACE, 'outputs/春季穿搭终极版/manifest.json'), 'utf8'))
check('manifest 中的 topic 已同步', manifestAfter.topic === '春季穿搭终极版', manifestAfter.topic)

const removed = await topics.remove('春季穿搭终极版')
check('删除主题成功', removed.ok === true)
check('目录已被移除', !existsSync(join(WORKSPACE, 'outputs/春季穿搭终极版')))

// ---------------------------------------------------------------------------
// [C] 会话绑定
// ---------------------------------------------------------------------------

console.log('\n[C] 会话绑定（session-bindings）')
const bindings = provided.get('zmtgztBindings')
await topics.create('绑定测试主题')

await bindings.set('session-abc', '绑定测试主题', join(WORKSPACE, 'outputs/绑定测试主题'))
const readBack = await bindings.get('session-abc')
check('绑定可读回', readBack?.topic === '绑定测试主题')
check('绑定含产物目录', String(readBack?.dir).endsWith(join('outputs', '绑定测试主题')))
check('绑定落盘到插件数据目录', existsSync(join(DATA, 'bindings.json')), join(DATA, 'bindings.json'))

// 模拟重启：直接读落盘文件确认持久化
const persisted = JSON.parse(readFileSync(join(DATA, 'bindings.json'), 'utf8'))
check('绑定已持久化（重启后仍在）', persisted.bindings['session-abc']?.topic === '绑定测试主题')

const removedBinding = await bindings.remove('session-abc')
check('解绑成功', removedBinding.removed === true)
check('解绑后读不到', (await bindings.get('session-abc')) === undefined)

// ---------------------------------------------------------------------------
// [D] 账号渠道矩阵
// ---------------------------------------------------------------------------

console.log('\n[D] 账号渠道（creator-account）')
const account = provided.get('zmtgztAccount')
const channels = await account.list()
check('渠道列表非空', channels.length >= 3, `${channels.length} 个`)

const xhs = channels.find((c) => c.id === 'xiaohongshu')
check('小红书在列', Boolean(xhs))
check('小红书支持登录与发布', xhs?.supportsLogin === true && xhs?.supportsPublish === true)

const mp = channels.find((c) => c.id === 'wechat-mp')
check('微信公众号在列', Boolean(mp))
check('公众号支持登录与发布', mp?.supportsLogin === true && mp?.supportsPublish === true)

const toutiao = channels.find((c) => c.id === 'toutiao')
check('今日头条在列', Boolean(toutiao))
check('头条标注为不支持登录', toutiao?.supportsLogin === false)
check('头条标注为不支持发布', toutiao?.supportsPublish === false)
check('头条给出了原因说明', typeof toutiao?.reason === 'string' && toutiao.reason.length > 20)

// 对不支持的渠道发起登录应被明确拒绝，而不是产生失败调用
const rejected = await account.startLogin('toutiao')
check('头条发起登录被拒绝', 'error' in rejected, 'error' in rejected ? rejected.error : '')
const unknown = await account.startLogin('not-a-channel')
check('未知渠道被拒绝', 'error' in unknown)

check('登录态真相源指向 Easel 目录', account.profileBase.endsWith('.easel-browser-profiles'), account.profileBase)

// 登录状态文件缺失时返回 unknown 而非抛错
const st = account.loginStatus('xiaohongshu')
check('无登录会话时返回 unknown', st.state === 'unknown', st.state)

// ---------------------------------------------------------------------------
// [E] 路由
// ---------------------------------------------------------------------------

console.log('\n[E] HTTP 路由')
const expected = [
  '/api/zmtgzt/health',
  '/api/zmtgzt/doctor',
  '/api/zmtgzt/skills',
  '/api/zmtgzt/account',
  '/api/zmtgzt/account/login',
  '/api/zmtgzt/account/login/status',
  '/api/zmtgzt/account/logout',
  '/api/zmtgzt/account/whoami',
  '/api/zmtgzt/account/stats',
  '/api/zmtgzt/profile',
  '/api/zmtgzt/profile-read',
  '/api/zmtgzt/topic',
  '/api/zmtgzt/binding',
  '/api/zmtgzt/projects',
  '/api/zmtgzt/project',
]
const missing = expected.filter((p) => !routes.has(p))
check('全部预期路由已注册', missing.length === 0, missing.length ? `缺失：${missing.join(', ')}` : `${expected.length} 条`)

rmSync(WORK, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
  console.error(`WORKBENCH FAILED: ${failures.length} 项未通过 — ${failures.join(', ')}`)
  process.exit(1)
}
console.log('WORKBENCH PASSED: 契约根优先、主题 CRUD、绑定持久化、账号矩阵与路由全部符合规范。')
