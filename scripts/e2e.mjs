/**
 * 端到端验证：搭一个符合 Easel 真实目录结构的桩环境，验证插件行为。
 *
 * 与 smoke.mjs 的区别：smoke 只验证注册契约，本脚本验证**行为**——
 *   1. 契约是否**逐字**来自仓库的 SOUL.md / AGENTS.md（证明插件没改写、没编造）
 *   2. 技能是否从 SKILL.md 的 frontmatter 正确解析并注册
 *   3. 脚本执行：cwd、argparse 子命令、flag 透传、stdout JSON 解析
 *   4. easel_skill 是否能取到技能正文与 references
 *   5. 画像读写是否落在 profiles/<名字>/
 *   6. 产物枚举是否读 outputs/
 *
 * 用法：node scripts/e2e.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

function pickPython() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' })
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

const python = pickPython()
if (!python) {
  console.error('SKIP: 环境里没有可用的 python。')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 搭一个符合 Easel 真实结构的桩
// ---------------------------------------------------------------------------
const workspace = '/tmp/easel-e2e'
rmSync(workspace, { recursive: true, force: true })
const easelRoot = join(workspace, 'Easel')

const SOUL_MARKER = '# Easel — 人格\n\n你是 Easel，创作者的社媒内容搭子。\n\n## 你能做的事\n- 找灵感\n- 定策略\n'
const AGENTS_MARKER =
  '# Easel Agent\n\n## 核心执行规则\n\n1. **先路由 SKILL**：每轮任务先找精确匹配的 SKILL。\n2. **先到项目根**：必须先 cd 到项目根。\n\n## 五层职责\n- 发现：热点、爆款、二创机会。\n'

const dirs = [
  'openclaw/workspace',
  'skills/openclaw/skill-alpha',
  'skills/openclaw/skill-alpha/references',
  'skills/openclaw/skill-beta',
  'skills/openclaw/skill-beta/scripts',
  'skills/shared/scripts',
  'profiles/_template',
  'outputs',
]
for (const d of dirs) mkdirSync(join(easelRoot, d), { recursive: true })

writeFileSync(join(easelRoot, '.env'), 'EASEL_E2E_MARKER=1\n', 'utf8')
writeFileSync(join(easelRoot, 'openclaw/workspace/SOUL.md'), SOUL_MARKER, 'utf8')
writeFileSync(join(easelRoot, 'openclaw/workspace/AGENTS.md'), AGENTS_MARKER, 'utf8')

// skill-alpha：折叠块 description + layer
writeFileSync(
  join(easelRoot, 'skills/openclaw/skill-alpha/SKILL.md'),
  [
    '---',
    'name: skill-alpha',
    'description: >-',
    '  第一个演示技能，用于验证 frontmatter 折叠块解析。',
    '  当用户说"演示 A"时使用。',
    'layer: discover',
    '---',
    '',
    '# 演示技能 A',
    '',
    '## 执行步骤',
    '1. 第一步',
    '2. 第二步',
    '',
  ].join('\n'),
  'utf8'
)
writeFileSync(join(easelRoot, 'skills/openclaw/skill-alpha/references/hook.md'), '# Hook 库\n', 'utf8')

// skill-beta：带脚本
writeFileSync(
  join(easelRoot, 'skills/openclaw/skill-beta/SKILL.md'),
  ['---', 'name: skill-beta', 'description: 第二个演示技能，带一个脚本。', 'layer: produce', '---', '', '# 演示技能 B', ''].join('\n'),
  'utf8'
)
// 模拟 Easel 脚本的真实形态：argparse 子命令 + flag
writeFileSync(
  join(easelRoot, 'skills/openclaw/skill-beta/scripts/echo.py'),
  [
    'import argparse, json, os',
    'p = argparse.ArgumentParser()',
    'sub = p.add_subparsers(dest="cmd", required=True)',
    'r = sub.add_parser("record")',
    'r.add_argument("--topic")',
    'r.add_argument("--layer")',
    'r.add_argument("--skill")',
    'rd = sub.add_parser("read")',
    'rd.add_argument("--topic")',
    'a = p.parse_args()',
    'print(json.dumps({',
    '    "cwd": os.getcwd(),',
    '    "cmd": a.cmd,',
    '    "topic": getattr(a, "topic", None),',
    '    "layer": getattr(a, "layer", None),',
    '    "skill": getattr(a, "skill", None),',
    '    "envVisible": os.path.exists(".env"),',
    '}, ensure_ascii=False))',
    '',
  ].join('\n'),
  'utf8'
)

// 共享脚本桩（让 doctor 的"共享脚本可枚举"检查通过）
writeFileSync(join(easelRoot, 'skills/shared/scripts/output_paths.py'), 'print("{}")\n', 'utf8')

// 画像模板 + 一个已有画像
for (const dim of ['identity', 'style', 'audience', 'platforms', 'preferences', 'memory']) {
  writeFileSync(join(easelRoot, `profiles/_template/${dim}.md`), `# ${dim}\n`, 'utf8')
}
mkdirSync(join(easelRoot, 'profiles/测试账号'), { recursive: true })
writeFileSync(join(easelRoot, 'profiles/测试账号/identity.md'), '# 定位\n职场干货博主\n', 'utf8')

// 产物
mkdirSync(join(easelRoot, 'outputs/春季通勤穿搭'), { recursive: true })
writeFileSync(
  join(easelRoot, 'outputs/春季通勤穿搭/manifest.json'),
  JSON.stringify({ steps: [{ skill: 'skill-beta', layer: 'produce', summary: '产出 3 张卡片' }] }, null, 2),
  'utf8'
)

// ---------------------------------------------------------------------------
// 启动插件
// ---------------------------------------------------------------------------
const stubDir = join(root, 'node_modules/@deepseek-ai/dsh-tools')
if (!existsSync(join(stubDir, 'index.js'))) {
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.0.0-local-stub', type: 'module', main: 'index.js', exports: { '.': './index.js' } }, null, 2))
  writeFileSync(join(stubDir, 'index.js'), 'export const defineTool = (o) => o\nexport const TOOL_RUNTIME_SCHEDULER = Symbol("s")\n')
}

const mod = await import(join(root, 'lib/index.js'))
const registered = new Map()
const skills = []
const ctx = {
  tools: { register: (t) => registered.set(t.name, t) },
  provide: () => {},
  inject: (deps, cb) => {
    if (deps.includes('skills')) cb({ skills: { register: (s) => { skills.push(s); return () => {} } } })
    if (deps.includes('webServer')) cb({ webServer: { register: () => {} } })
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}

await mod.apply(ctx, { easelRoot, pythonPath: python })
const signal = new AbortController().signal
const call = (name, args = {}) => registered.get(name).execute(args, { signal })

console.log('\n[A] 契约逐字来自仓库')
const contract = skills.find((s) => s.name === 'easel-orchestrator')
check('契约技能已注册', Boolean(contract))
check('SOUL.md 原文被完整纳入', String(contract?.content).includes(SOUL_MARKER.trim()))
check('AGENTS.md 原文被完整纳入', String(contract?.content).includes(AGENTS_MARKER.trim()))
check('未出现插件自造的"五层分工"表述', !String(contract?.content).includes('## 五层分工'))
check('附带了插件接入说明', String(contract?.content).includes('本插件的接入方式'))

console.log('\n[B] 技能扫描与注册')
const easelSkills = skills.filter((s) => s.name !== 'easel-orchestrator')
check('扫到 2 个 Easel 技能', easelSkills.length === 2, easelSkills.map((s) => s.name).join(', '))
const alpha = easelSkills.find((s) => s.name === 'skill-alpha')
check('折叠块 description 被合并为一行', String(alpha?.description).includes('第一个演示技能') && String(alpha?.description).includes('演示 A'))
check('description 不含折叠标记', !String(alpha?.description).includes('>-'))

const listResult = await call('easel_skill', { action: 'list' })
check('easel_skill list 成功', listResult.ok === true && listResult.total === 2, `total=${listResult.total}`)
check('list 带 layer 信息', listResult.skills?.some((s) => s.layer === 'discover'))

const readResult = await call('easel_skill', { action: 'read', name: 'skill-alpha' })
check('easel_skill read 取到正文', String(readResult.body).includes('# 演示技能 A'))
check('read 列出 references', Array.isArray(readResult.references) && readResult.references.includes('references/hook.md'))
check('frontmatter 未混入正文', !String(readResult.body).includes('name: skill-alpha'))

const fileResult = await call('easel_skill', { action: 'file', name: 'skill-alpha', file: 'references/hook.md' })
check('easel_skill file 读到 reference', String(fileResult.content).includes('Hook 库'))
const escapeAttempt = await call('easel_skill', { action: 'file', name: 'skill-alpha', file: '../../../../etc/passwd' })
check('references 读取阻断路径穿越', escapeAttempt.ok === false)

console.log('\n[C] 脚本执行')
const scripts = await call('easel_scripts', { action: 'skills' })
check('easel_scripts 列出带脚本的技能', scripts.skills?.some((s) => s.skill === 'skill-beta'))
check('脚本路径为根相对', String(scripts.skills?.find((s) => s.skill === 'skill-beta')?.scripts[0]).startsWith('skills/openclaw/skill-beta/scripts/'))

const ran = await call('easel_run', {
  script: 'skills/openclaw/skill-beta/scripts/echo.py',
  subcommand: 'record',
  args: { topic: '春季通勤穿搭', layer: 'produce', skill: 'skill-beta' },
})
check('easel_run 调用成功', ran.ok === true, JSON.stringify(ran).slice(0, 100))
check('cwd 切到 Easel 根', ran.data?.cwd === easelRoot, ran.data?.cwd)
check('能读到 .env', ran.data?.envVisible === true)
check('argparse 子命令正确传递', ran.data?.cmd === 'record', String(ran.data?.cmd))
check('flag 正确传递', ran.data?.topic === '春季通勤穿搭' && ran.data?.layer === 'produce')

const ranRead = await call('easel_run', {
  script: 'skills/openclaw/skill-beta/scripts/echo.py',
  subcommand: 'read',
  args: { topic: '测试' },
})
check('切换子命令正常', ranRead.data?.cmd === 'read', String(ranRead.data?.cmd))

const missing = await call('easel_run', { script: 'skills/shared/scripts/not-there.py', args: {} })
check('脚本缺失返回结构化失败面', missing.ok === false && missing.kind === 'script-missing', missing.kind)

const traversal = await call('easel_run', { script: '../../etc/passwd', args: {} })
check('脚本路径穿越被阻断', traversal.ok === false && traversal.kind === 'script-missing', traversal.kind)

console.log('\n[D] 画像读写（落在 Easel 的 profiles/）')
const profileList = await call('easel_profile', { action: 'list' })
check('列出已有画像', profileList.profiles?.includes('测试账号'), JSON.stringify(profileList.profiles))
check('_template 被过滤', !profileList.profiles?.includes('_template'))

const profileRead = await call('easel_profile', { action: 'read', name: '测试账号' })
check('读到画像维度', String(profileRead.dimensions?.identity).includes('职场干货博主'))

await call('easel_profile', { action: 'write', name: '测试账号', file: 'style', content: '# 风格\n口语化\n' })
const onDisk = readFileSync(join(easelRoot, 'profiles/测试账号/style.md'), 'utf8')
check('写入落在 profiles/<名字>/style.md', onDisk.includes('口语化'))

console.log('\n[E] 产物枚举（读 outputs/）')
const artifacts = await call('easel_artifact', { action: 'list' })
check('列出产物项目', artifacts.projects?.includes('春季通勤穿搭'))
const detail = await call('easel_artifact', { action: 'read', topic: '春季通勤穿搭' })
check('读到 manifest', detail.manifest?.steps?.[0]?.skill === 'skill-beta')
check('列出产物文件', detail.entries?.some((e) => e.name === 'manifest.json'))

console.log('\n[F] 环境体检')
const diagnosis = await call('easel_doctor')
check('判定环境就绪', diagnosis.healthy === true, JSON.stringify(diagnosis.checks?.filter((c) => !c.ok)))
check('统计到技能数', diagnosis.skillCount === 2, String(diagnosis.skillCount))

rmSync(workspace, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
  console.error(`E2E FAILED: ${failures.length} 项未通过 — ${failures.join(', ')}`)
  process.exit(1)
}
console.log('E2E PASSED: 契约逐字来自仓库、技能扫描、脚本执行、画像与产物读写全部验证通过。')
