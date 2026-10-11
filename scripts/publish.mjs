/**
 * 发布能力测试。
 *
 * 重点验证这条链路上最容易错、且错了就完全不可用的地方：
 *   1. **flag 参数序列化** —— `--exec` 必须是裸 flag。传成 `--exec true` 时 argparse
 *      会报 `unrecognized arguments` 直接失败（实测），而小红书发布必须 `--exec`
 *      才不是 dry-run，所以这是「能不能发布」的分水岭。
 *   2. **默认不发布** —— 未确认时命令里不能出现 `--exec`。
 *   3. **平台语义** —— 公众号产物是草稿，不是群发。
 *   4. **不暴露放行开关** —— 工具参数与界面产物里都不该出现绕过门禁的入口。
 *
 * 用法：node scripts/publish.mjs
 */
import { build } from 'esbuild'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const WORK = '/tmp/zmtgzt-publish-test'
const WORKSPACE = join(WORK, 'easel')
const DATA = join(WORK, 'data')
const FAKE_PYTHON = join(WORK, 'fake-python')

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

// ---------------------------------------------------------------------------
// 假解释器：把收到的参数原样回显成 JSON，便于断言「到底传了什么」
// ---------------------------------------------------------------------------
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
    // 把全部参数塞进 JSON 返回，供断言检查
    'printf \'{"success":true,"media_id":"mid_123","url":"https://mp.weixin.qq.com/draft/1","received":"%s"}\\n\' "$*"',
    'exit 0',
    '',
  ].join('\n'),
  'utf8'
)
chmodSync(FAKE_PYTHON, 0o755)

// 媒体文件（真实存在，因为前置校验会检查）
const IMG = join(WORK, 'card-1.jpg')
const IMG2 = join(WORK, 'card-2.jpg')
const VID = join(WORK, 'clip.mp4')
const COVER = join(WORK, 'cover.jpg')
for (const f of [IMG, IMG2, VID, COVER]) writeFileSync(f, 'x')
const HTML = join(WORK, 'article.html')
writeFileSync(HTML, '<p>hi</p>')

// 生效根内放置假脚本（runEaselScript 按根相对路径拼）
for (const rel of [
  'skills/shared/scripts/xhs_publish.py',
  'skills/openclaw/skill-wechat-publisher/scripts/publish.py',
]) {
  const p = join(WORKSPACE, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, '# stub\n')
}

// ---------------------------------------------------------------------------
// 转译被测模块
// ---------------------------------------------------------------------------
const BUNDLE_RUNNER = join(WORK, 'runner.mjs')
const BUNDLE_PUBLISH = join(WORK, 'publish.mjs')
for (const [entry, out] of [
  ['src/runner.ts', BUNDLE_RUNNER],
  ['src/publish.ts', BUNDLE_PUBLISH],
]) {
  await build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['@deepseek-ai/*'],
    logLevel: 'silent',
  })
}

const runner = await import(BUNDLE_RUNNER)
const pub = await import(BUNDLE_PUBLISH)

const config = {
  easelRoot: WORKSPACE,
  workspaceDir: WORKSPACE,
  embeddedRoot: WORKSPACE,
  pythonPath: FAKE_PYTHON,
  scriptTimeoutMs: 30_000,
  registerEaselSkills: false,
  skillLayers: [],
  injectOrchestration: false,
  releaseEmbedded: false,
  dataDir: DATA,
  extraChannels: [],
}

// ---------------------------------------------------------------------------
console.log('\n[A] flag 参数序列化（本次关键修复）')
// ---------------------------------------------------------------------------

check('true → 只输出裸 flag', JSON.stringify(runner.toCliArgs({ exec: true })) === '["--exec"]')
check('false → 完全跳过', JSON.stringify(runner.toCliArgs({ headed: false, title: 'T' })) === '["--title","T"]')
check(
  '带值参数不受影响',
  JSON.stringify(runner.toCliArgs({ title: 'A', content: 'B' })) === '["--title","A","--content","B"]'
)
check('数字参数带值', JSON.stringify(runner.toCliArgs({ count: 20 })) === '["--count","20"]')
check('undefined / null 跳过', JSON.stringify(runner.toCliArgs({ a: undefined, b: null, c: 1 })) === '["--c","1"]')
check('连字符 key 保留', runner.toCliArgs({ 'official-api': true }).join(' ') === '--official-api')
check(
  '★ 不产生 "--exec true"（旧实现会，导致 argparse 报错）',
  !runner.toCliArgs({ exec: true }).includes('true')
)

// ---------------------------------------------------------------------------
console.log('\n[B] 标题长度算法与上游一致')
// ---------------------------------------------------------------------------

// 上游 calc_title_length：UTF-16 码元，非 ASCII 计 2、ASCII 计 1，再 (n+1)//2
check('10 个 ASCII → 5', pub.calcTitleLength('abcdefghij') === 5, String(pub.calcTitleLength('abcdefghij')))
check('2 个中文 → 2', pub.calcTitleLength('中文') === 2, String(pub.calcTitleLength('中文')))
const twenty = '一二三四五六七八九十一二三四五六七八九十'
check('20 个中文 → 20', pub.calcTitleLength(twenty) === 20, String(pub.calcTitleLength(twenty)))
check('21 个中文 → 21', pub.calcTitleLength(twenty + '一') === 21, String(pub.calcTitleLength(twenty + '一')))
check('空串 → 0', pub.calcTitleLength('') === 0)

// ---------------------------------------------------------------------------
console.log('\n[C] 预检：小红书')
// ---------------------------------------------------------------------------

const tooLong = pub.planPublish(config, {
  platform: 'xiaohongshu',
  mode: 'image',
  title: twenty + '一',
  images: [IMG],
})
check('超长标题 → 预检不通过', tooLong.ok === false)
check('超长项被标出', tooLong.checks.some((c) => !c.ok && /长度/.test(c.name)))
check('超长给出修复建议', tooLong.checks.some((c) => !c.ok && c.fix))

const missingImg = pub.planPublish(config, { platform: 'xiaohongshu', title: '春天穿搭', images: ['/nope/missing.jpg'] })
check('图片不存在 → 不通过', missingImg.ok === false)
check('指明缺失的具体路径', JSON.stringify(missingImg.checks).includes('/nope/missing.jpg'))

const noImg = pub.planPublish(config, { platform: 'xiaohongshu', title: '春天穿搭' })
check('未给图片 → 不通过', noImg.ok === false)

const good = pub.planPublish(config, {
  platform: 'xiaohongshu',
  mode: 'image',
  title: '春天通勤穿搭',
  content: '正文',
  images: [IMG, IMG2],
  tags: ['穿搭', '通勤'],
})
check('正常输入 → 通过', good.ok === true)
check('脚本映射到 xhs_publish.py', good.script.endsWith('xhs_publish.py'), good.script)
check('子命令为 publish', good.subcommand === 'publish', String(good.subcommand))
check('标题入参正确', good.args.title === '春天通勤穿搭')
check('多图以逗号连接', good.args.images === `${IMG},${IMG2}`)
check('话题以逗号连接', good.args.tags === '穿搭,通勤')
check('★ 未确认时不含 --exec', !good.cli.includes('--exec'))
check('风险提示可见', good.warnings.some((w) => /风控|封号/.test(w)))

const confirmed = pub.planPublish(config, {
  platform: 'xiaohongshu',
  mode: 'image',
  title: '春天通勤穿搭',
  images: [IMG],
  confirm: true,
})
check('★ 确认后含 --exec', confirmed.cli.includes('--exec'))
check('★ --exec 之后不跟 true', confirmed.cli[confirmed.cli.indexOf('--exec') + 1] !== 'true')

const video = pub.planPublish(config, { platform: 'xiaohongshu', mode: 'video', title: 'v', video: VID })
check('视频模式 → 子命令 publish-video', video.subcommand === 'publish-video', String(video.subcommand))
check('视频路径入参正确', video.args.video === VID)

// ---------------------------------------------------------------------------
console.log('\n[D] 预检：微信公众号（草稿语义）')
// ---------------------------------------------------------------------------

const wxNoCover = pub.planPublish(config, { platform: 'wechat-mp', title: '标题', content: '正文' })
check('缺封面 → 不通过', wxNoCover.ok === false)
check('缺封面提示必填', wxNoCover.checks.some((c) => !c.ok && /封面/.test(c.name)))

const wxNoBody = pub.planPublish(config, { platform: 'wechat-mp', title: '标题', cover: COVER })
check('缺正文 → 不通过', wxNoBody.ok === false)

const wx = pub.planPublish(config, {
  platform: 'wechat-mp',
  title: '标题',
  cover: COVER,
  content: '正文内容',
})
check('公众号正常输入 → 通过', wx.ok === true)
check('脚本映射到 skill-wechat-publisher', wx.script.includes('skill-wechat-publisher'), wx.script)
check('Markdown 正文写成临时文件', typeof wx.args.input === 'string' && wx.args.input.endsWith('.md'))
check('★ 后续步骤说明需手动群发', wx.followUp.some((f) => /群发/.test(f)), JSON.stringify(wx.followUp))
check('★ 未确认时不带 --exec', !wx.cli.includes('--exec'))
check('默认走后台会话（不带 --official-api）', !wx.cli.includes('--official-api'))

const wxApi = pub.planPublish(config, {
  platform: 'wechat-mp',
  title: '标题',
  cover: COVER,
  html: HTML,
  officialApi: true,
})
check('显式指定才走官方 API', wxApi.cli.includes('--official-api'))
check('HTML 输入走 --html', wxApi.args.html === HTML)
check('官方 API 有白名单提示', wxApi.warnings.some((w) => /白名单/.test(w)))

// ---------------------------------------------------------------------------
console.log('\n[E] 执行：dry-run 无副作用，确认后才真发')
// ---------------------------------------------------------------------------

const dry = await pub.executePublish(config, {
  platform: 'xiaohongshu',
  mode: 'image',
  title: '春天通勤穿搭',
  images: [IMG],
})
check('dry-run 未标记 executed', dry.executed === false)
check('dry-run 返回预检计划', Boolean(dry.plan))
// 先确认真的取到了命令行 —— 否则下面的「不含 --exec」会因取空而假通过
const dryCmd = String(dry.raw?.data?.received ?? '')
check('dry-run 取到了实际命令行', dryCmd.length > 0, dryCmd.slice(0, 90))
check('★ dry-run 实际命令里没有 --exec', !dryCmd.includes('--exec'), dryCmd.slice(0, 90))

const real = await pub.executePublish(config, {
  platform: 'xiaohongshu',
  mode: 'image',
  title: '春天通勤穿搭',
  images: [IMG],
  confirm: true,
})
check('确认后标记 executed', real.executed === true)
const realCmd = String(real.raw?.data?.received ?? '')
check('确认后取到了实际命令行', realCmd.length > 0, realCmd.slice(0, 90))
check('★ 确认后命令里确有 --exec', realCmd.includes('--exec'), realCmd.slice(0, 140))
check('★ --exec 未被写成 --exec true（修复生效）', !/--exec\s+true/.test(realCmd))
check('小红书非草稿语义', real.draftOnly === false)

const wxReal = await pub.executePublish(config, {
  platform: 'wechat-mp',
  title: '标题',
  cover: COVER,
  content: '正文',
  confirm: true,
})
check('★ 公众号结果标记为草稿（draftOnly）', wxReal.draftOnly === true)
check('★ 公众号后续步骤含手动群发', wxReal.followUp.some((f) => /群发/.test(f)))
const wxCmd = String(wxReal.raw?.data?.received ?? '')
check('公众号确认后命令含 --exec', wxCmd.includes('--exec'), wxCmd.slice(0, 140))

// ---------------------------------------------------------------------------
console.log('\n[F] 失败归因')
// ---------------------------------------------------------------------------

const bad = await pub.executePublish(config, { platform: 'xiaohongshu', title: 'x', images: ['/nope/a.jpg'] })
check('媒体缺失直接失败', bad.ok === false)
check('未进脚本（executed 为 false）', bad.executed === false)
check('指明缺失路径', /nope\/a\.jpg/.test((bad.error ?? '') + (bad.hint ?? '')))

const unknownPlatform = await pub.executePublish(config, { platform: 'douyin', title: 'x' })
check('未知平台被拒绝', unknownPlatform.ok === false)
check('未知平台列出可选项', /xiaohongshu|wechat-mp/.test(unknownPlatform.hint ?? ''))

const noTitle = await pub.executePublish(config, { platform: 'xiaohongshu', title: '' })
check('缺标题被拒绝', noTitle.ok === false)

// ---------------------------------------------------------------------------
console.log('\n[G] 工具层：不暴露绕过门禁的开关')
// ---------------------------------------------------------------------------

const mod = await import(join(root, 'lib/index.js'))
const tools = []
const ctx = {
  tools: { register: (t) => tools.push(t) },
  provide: () => {},
  inject: () => {},
  logger: { info() {}, warn() {}, error() {} },
}
await mod.apply(ctx, {
  workspaceDir: join(WORK, 'toolcheck/easel'),
  dataDir: join(WORK, 'toolcheck/data'),
  registerEaselSkills: false,
})

const publishTool = tools.find((t) => t.name === 'zmtgzt_publish')
check('zmtgzt_publish 已注册', Boolean(publishTool))
const paramNames = Object.keys(publishTool?.parameters ?? {})
check('工具参数含 platform', paramNames.includes('platform'))
check('工具参数含 confirm', paramNames.includes('confirm'))
check('★ 不含 unsafe 类放行参数', !paramNames.some((n) => /unsafe/i.test(n)), paramNames.join(','))
check('★ 不含 skip-ai-score 类放行参数', !paramNames.some((n) => /skip/i.test(n)), paramNames.join(','))
check(
  '工具描述写明默认不发布',
  /默认只做预检/.test(String(publishTool?.description ?? ''))
)
check(
  '工具描述写明公众号只创建草稿',
  /草稿/.test(String(publishTool?.description ?? ''))
)

// 界面产物里也不该出现放行入口
const clientSource = readFileSync(join(root, 'lib/client.js'), 'utf8')
check('★ 界面产物不含 allow-unsafe', !clientSource.includes('allow-unsafe'))
check('★ 界面产物不含 skip-ai-score', !clientSource.includes('skip-ai-score'))

// ---------------------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`publish: ${failures.length} 项失败`)
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
console.log('publish: 全部通过')
