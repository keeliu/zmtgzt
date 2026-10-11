/**
 * 冒烟测试：验证注册契约与**内置快照**路径（不依赖外部 Easel 仓库）。
 *
 * 检查项：
 *   1. 模块导出 name / inject / apply（apply 为异步）
 *   2. 插件确实自带 vendor/easel 快照（装完即用的前提）
 *   3. 工具数量与名称规范
 *   4. 未配置 easelRoot 时：自动释放内置快照，契约与技能都能拿到
 *   5. 释放时生成 .env、web 路由与服务注册
 *
 * 用法：node scripts/smoke.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const EXPECTED_TOOLS = 23
const WORKSPACE = '/tmp/zmtgzt-smoke-workspace'

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

const mod = await import(join(root, 'lib/index.js')).catch((error) => {
  console.error('FAIL: 无法加载 lib/index.js —— 先跑 npm run build')
  console.error(String(error))
  process.exit(1)
})

console.log('\n[1] 模块导出')
check('export name', mod.name === 'dsh-zmtgzt', mod.name)
check('export inject', Array.isArray(mod.inject) && mod.inject.includes('tools'), JSON.stringify(mod.inject))
check('export apply', typeof mod.apply === 'function')

console.log('\n[2] 插件自带 Easel 快照')
const vendorRoot = join(root, 'vendor/easel')
check('vendor/easel 存在', existsSync(vendorRoot))
check('含契约 SOUL.md', existsSync(join(vendorRoot, 'openclaw/workspace/SOUL.md')))
check('含契约 AGENTS.md', existsSync(join(vendorRoot, 'openclaw/workspace/AGENTS.md')))
check('含技能目录', existsSync(join(vendorRoot, 'skills/openclaw')))
check('含共享脚本', existsSync(join(vendorRoot, 'skills/shared/scripts')))
check('含 Apache-2.0 LICENSE', existsSync(join(vendorRoot, 'LICENSE')))
const syncInfo = JSON.parse(readFileSync(join(vendorRoot, 'SYNC-INFO.json'), 'utf8'))
check('SYNC-INFO 记录了上游 commit', typeof syncInfo.commit === 'string' && syncInfo.commit.length === 40, syncInfo.commit.slice(0, 10))

console.log('\n[3] 工具注册')
const registered = new Map()
const provided = new Map()
const skills = []
const routes = []

const ctx = {
  tools: { register: (tool) => registered.set(tool.name, tool) },
  provide: (key, value) => provided.set(key, value),
  inject: (deps, callback) => {
    if (deps.includes('skills')) callback({ skills: { register: (skill) => { skills.push(skill); return () => {} } } })
    if (deps.includes('webServer')) callback({ webServer: { register: (route) => routes.push(route) } })
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}

// 不配置 easelRoot：验证内置快照的自动释放路径
rmSync(WORKSPACE, { recursive: true, force: true })
await mod.apply(ctx, { workspaceDir: WORKSPACE, registerEaselSkills: false })

check('工具数量', registered.size === EXPECTED_TOOLS, `${registered.size} / ${EXPECTED_TOOLS}`)
check('工具名均为 zmtgzt_ 前缀', [...registered.keys()].every((n) => n.startsWith('zmtgzt_')))
const malformed = [...registered.values()].filter(
  (t) => typeof t.name !== 'string' || typeof t.description !== 'string' ||
    typeof t.execute !== 'function' || !t.output?.schema || typeof t.output.render !== 'function'
)
check('工具定义结构完整', malformed.length === 0, malformed.map((t) => t.name).join(', ') || 'all valid')

console.log('\n[4] 内置快照释放')
const workspace = provided.get('zmtgztWorkspace')
check('提供了生效根信息', Boolean(workspace))
check('来源为内置快照', workspace?.source === 'embedded', workspace?.source)
check('根目录指向 workspaceDir', workspace?.root === WORKSPACE, workspace?.root)
check('已完成释放', workspace?.release?.updated === true, workspace?.release?.reason)
check('释放后契约就位', existsSync(join(WORKSPACE, 'openclaw/workspace/AGENTS.md')))
check('释放后技能就位', existsSync(join(WORKSPACE, 'skills/openclaw')))
check('自动生成了 .env', existsSync(join(WORKSPACE, '.env')))

console.log('\n[5] 契约与技能来自内置快照')
const contract = skills.find((s) => s.name === 'zmtgzt')
check('契约技能已注册', Boolean(contract))
const realSoul = readFileSync(join(vendorRoot, 'openclaw/workspace/SOUL.md'), 'utf8').trim()
check('契约逐字包含真实 SOUL.md', String(contract?.content).includes(realSoul))
check('契约含 dsh 接入说明', String(contract?.content).includes('本插件的接入方式'))

const signal = new AbortController().signal
const listResult = await registered.get('zmtgzt_skill').execute({ action: 'list' }, { signal })
check('zmtgzt_skill 可列出技能', listResult.ok === true && listResult.total > 100, `total=${listResult.total}`)
check('技能层取值来自真实 frontmatter', Array.isArray(listResult.layers) && listResult.layers.length > 0, JSON.stringify(listResult.layers))

console.log('\n[6] 路由与服务')
check('ctx.provide zmtgztRepo', Boolean(provided.get('zmtgztRepo')))
check('注册 /api/zmtgzt 路由', routes.length >= 6, `${routes.length} 条`)
check('健康检查路由存在', routes.some((r) => r.path === '/api/zmtgzt/health'))

console.log('\n[7] 体检')
const diagnosis = await registered.get('zmtgzt_doctor').execute({}, { signal })
check('统计到技能数', Number(diagnosis.skillCount) > 100, String(diagnosis.skillCount))
check('报告根来源为内置快照', diagnosis.rootSource === 'embedded', String(diagnosis.rootSource))
check('.env 已生成故不报缺配置', diagnosis.checks.some((c) => c.name.startsWith('.env') && c.ok === true))

rmSync(WORKSPACE, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
  console.error(`SMOKE FAILED: ${failures.length} 项未通过 — ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`SMOKE PASSED: ${registered.size} 个工具、内置快照释放正常、契约与 ${listResult.total} 个技能可用。`)
