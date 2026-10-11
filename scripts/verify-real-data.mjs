/**
 * 真实数据验证：用从 ZJU-REAL/Easel 官方仓库下载的**真实文件**组装环境，
 * 验证插件对真实 Easel 内容的解析与注入是否正确。
 *
 * 与 e2e.mjs 的区别：e2e 用的是人造桩（结构正确、内容简单），
 * 本脚本用的是官方原文（真实的折叠块 description、长正文、真实 layer 取值）。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const SRC = '/root/.codebuddy/artifact/easel-official'
const WORK = '/tmp/easel-real'

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

if (!existsSync(SRC)) {
  console.error(`SKIP: 未找到官方文件目录 ${SRC}`)
  process.exit(0)
}

// --- 按 Easel 真实目录结构组装 ---
rmSync(WORK, { recursive: true, force: true })
const easelRoot = join(WORK, 'Easel')
mkdirSync(join(easelRoot, 'openclaw/workspace'), { recursive: true })
mkdirSync(join(easelRoot, 'skills/shared/scripts'), { recursive: true })
mkdirSync(join(easelRoot, 'profiles/_template'), { recursive: true })
mkdirSync(join(easelRoot, 'outputs'), { recursive: true })

cpSync(join(SRC, 'openclaw_workspace_SOUL.md'), join(easelRoot, 'openclaw/workspace/SOUL.md'))
cpSync(join(SRC, 'openclaw_workspace_AGENTS.md'), join(easelRoot, 'openclaw/workspace/AGENTS.md'))
writeFileSync(join(easelRoot, '.env'), '# placeholder\n', 'utf8')
writeFileSync(join(easelRoot, 'skills/shared/scripts/output_paths.py'), 'print("{}")\n', 'utf8')

const realSkills = []
for (const entry of readdirSync(SRC)) {
  const match = /^skills__openclaw__(.+)__SKILL\.md$/.exec(entry)
  if (!match) continue
  const name = match[1]
  mkdirSync(join(easelRoot, 'skills/openclaw', name), { recursive: true })
  cpSync(join(SRC, entry), join(easelRoot, 'skills/openclaw', name, 'SKILL.md'))
  realSkills.push(name)
}

console.log(`\n组装完成：${realSkills.length} 个真实技能 → ${realSkills.join(', ')}`)

// --- 启动插件 ---
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

await mod.apply(ctx, { easelRoot })
const signal = new AbortController().signal
const call = (name, args = {}) => registered.get(name).execute(args, { signal })

console.log('\n[1] 真实契约注入')
const contract = skills.find((s) => s.name === 'zmtgzt')
const realSoul = readFileSync(join(SRC, 'openclaw_workspace_SOUL.md'), 'utf8').trim()
const realAgents = readFileSync(join(SRC, 'openclaw_workspace_AGENTS.md'), 'utf8').trim()
check('SOUL.md 原文逐字一致', String(contract?.content).includes(realSoul))
check('AGENTS.md 原文逐字一致', String(contract?.content).includes(realAgents))
check('真实 AGENTS.md 的"核心执行规则"在契约中', String(contract?.content).includes('先路由 SKILL'))
check('真实 AGENTS.md 的发布安全门禁在契约中', String(contract?.content).includes('对外发布安全'))
check('真实 SOUL.md 的沟通风格在契约中', String(contract?.content).includes('沟通风格'))
check('契约含 dsh 接入说明', String(contract?.content).includes('本插件的接入方式'))

console.log('\n[2] 真实技能扫描')
const scanned = skills.filter((s) => s.name !== 'zmtgzt')
check('全部真实技能被注册', scanned.length === realSkills.length, `${scanned.length} / ${realSkills.length}`)
check('每个技能都有 description', scanned.every((s) => typeof s.description === 'string' && s.description.length > 10))

const listed = await call('zmtgzt_skill', { action: 'list' })
check('zmtgzt_skill list 返回真实技能', listed.total === realSkills.length, `total=${listed.total}`)
check('层取值来自真实 frontmatter', listed.layers?.length > 0, JSON.stringify(listed.layers))

const trending = listed.skills?.find((s) => s.name === 'skill-trending-topics')
check('skill-trending-topics 在列', Boolean(trending), trending?.layer)
check('真实折叠块 description 被正确合并', String(trending?.description).includes('抓取微博、抖音、知乎、头条、B站实时热搜'))
check('层为 discover', trending?.layer === 'discover', String(trending?.layer))

const quality = listed.skills?.find((s) => s.name === 'skill-quality-gate')
check('skill-quality-gate 层取值正确', quality?.layer === 'publish' || quality?.layer === 'produce', String(quality?.layer))

console.log('\n[3] 真实技能正文读取')
const detail = await call('zmtgzt_skill', { action: 'read', name: 'skill-trending-topics' })
check('读到真实正文', String(detail.body).includes('## 执行步骤'))
check('正文含真实 API 端点', String(detail.body).includes('60s.viki.moe'))
check('frontmatter 已剥离', !String(detail.body).includes('layer: discover'))
check('description 保留在元数据里', String(detail.description).includes('热搜'))

const big = await call('zmtgzt_skill', { action: 'read', name: 'short-drama' })
const bigRaw = readFileSync(join(SRC, 'skills__openclaw__short-drama__SKILL.md'), 'utf8')
const bigExpected = bigRaw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
check(
  '超长技能正文与原文件逐字一致',
  String(big.body) === bigExpected,
  `${String(big.body).length} 字符（原文件 ${bigRaw.length} 字节 / ${bigExpected.length} 字符正文）`
)
// 本桩只复制了 SKILL.md，未含 references/ 文件，故只校验字段结构；
// references 的列举与读取由 e2e.mjs 完整覆盖。
check('references 字段结构正确', Array.isArray(big.references), `${big.references?.length ?? 0} 个（桩未含 references 文件）`)

console.log('\n[4] 环境体检（真实仓库）')
const diagnosis = await call('zmtgzt_doctor')
check('判定就绪', diagnosis.healthy === true, JSON.stringify(diagnosis.checks?.filter((c) => !c.ok)))
check('技能计数正确', diagnosis.skillCount === realSkills.length, String(diagnosis.skillCount))
check('层信息出现在体检里', String(JSON.stringify(diagnosis.checks)).includes('discover'))

rmSync(WORK, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
  console.error(`REAL-DATA FAILED: ${failures.length} 项未通过 — ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`REAL-DATA PASSED: ${realSkills.length} 个官方技能全部解析正确，契约与官方原文逐字一致。`)
