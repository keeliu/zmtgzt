/**
 * 冒烟测试：验证注册契约（不依赖真实 Easel 仓库）。
 *
 * 检查项：
 *   1. 模块导出 name / inject / apply（apply 为异步）
 *   2. 工具数量与名称规范
 *   3. 未配置 easelRoot 时：契约降级为"未加载"，工具返回结构化未配置错误
 *   4. 共享插件不打包 Easel 内容（skills/ 目录不应存在于插件内）
 *   5. Web 路由注册
 *
 * 用法：node scripts/smoke.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const EXPECTED_TOOLS = 23

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
check('export name', mod.name === 'dsh-easel-orchestrator', mod.name)
check('export inject', Array.isArray(mod.inject) && mod.inject.includes('tools'), JSON.stringify(mod.inject))
check('export apply', typeof mod.apply === 'function')

console.log('\n[2] 工具注册')
const registered = new Map()
const provided = new Map()
const skills = []
const routes = []

const ctx = {
  tools: { register: (tool) => registered.set(tool.name, tool) },
  provide: (key, value) => provided.set(key, value),
  inject: (deps, callback) => {
    if (deps.includes('skills')) {
      callback({ skills: { register: (skill) => { skills.push(skill); return () => {} } } })
    }
    if (deps.includes('webServer')) {
      callback({ webServer: { register: (route) => routes.push(route) } })
    }
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}

await mod.apply(ctx, { easelRoot: '/tmp/definitely-not-a-real-easel-root' })

check('工具数量', registered.size === EXPECTED_TOOLS, `${registered.size} / ${EXPECTED_TOOLS}`)
check('工具名均为 easel_ 前缀', [...registered.keys()].every((n) => n.startsWith('easel_')))
const malformed = [...registered.values()].filter(
  (t) => typeof t.name !== 'string' || typeof t.description !== 'string' ||
    typeof t.execute !== 'function' || !t.output?.schema || typeof t.output.render !== 'function'
)
check('工具定义结构完整', malformed.length === 0, malformed.map((t) => t.name).join(', ') || 'all valid')

console.log('\n[3] 契约为空时的降级（路径不存在）')
check('注册了契约技能', skills.length === 1, `${skills.length} 个：${skills.map((s) => s.name).join(', ')}`)
const contract = skills[0]
check('契约技能名为 easel-orchestrator', contract?.name === 'easel-orchestrator', contract?.name)
check('契约正文声明未加载', String(contract?.content).includes('未加载'), '含"未加载"')
check('契约给出配置指引', String(contract?.content).includes('easelRoot'))
check('契约未编造 Easel 内容', !String(contract?.content).includes('五层分工'))

console.log('\n[4] 插件不打包 Easel 内容')
check('插件内无 skills/ 目录', !existsSync(join(root, 'skills')))

console.log('\n[5] 共享服务与路由')
check('ctx.provide easelRepo', Boolean(provided.get('easelRepo')))
check('注册 /api/easel 路由', routes.length >= 6, `${routes.length} 条`)
check('健康检查路由存在', routes.some((r) => r.path === '/api/easel/health'))

console.log('\n[6] 未配置时的工具行为')
const doctor = registered.get('easel_doctor')
const diagnosis = await doctor.execute({}, { signal: new AbortController().signal })
check('easel_doctor 不抛异常', diagnosis?.healthy === false)
check('doctor 指引含官方仓库地址', String(diagnosis.hint).includes('ZJU-REAL/Easel'))

const skillTool = registered.get('easel_skill')
const listed = await skillTool.execute({ action: 'list' }, { signal: new AbortController().signal })
check('easel_skill 返回未配置错误', listed.ok === false, listed.kind)
check('错误带 hint', typeof listed.hint === 'string' && listed.hint.includes('easelRoot'))

const run = registered.get('easel_run')
const ran = await run.execute({ script: 'skills/shared/scripts/manifest.py', args: {} }, { signal: new AbortController().signal })
check('easel_run 返回结构化失败面', ran.ok === false, ran.kind)

console.log('')
if (failures.length > 0) {
  console.error(`SMOKE FAILED: ${failures.length} 项未通过 — ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`SMOKE PASSED: ${registered.size} 个工具、${routes.length} 条路由、契约降级行为正确。`)
