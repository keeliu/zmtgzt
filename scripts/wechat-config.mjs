/**
 * 公众号「官方 API」凭证测试。
 *
 * 重点验证两件容易出错的事：
 *   1. **YAML 行级补丁**必须保留其它账号、其它顶层键与注释 —— 上游 config.py 还会读
 *      `image_generation`、`integrations` 等键，整体重写会把这些悄悄抹掉。
 *   2. **错误码分类**：`40164` 是「凭证正确但 IP 未白名单」，绝不能归为凭证错误，
 *      否则用户会反复核对 AppID/Secret 而找不到原因。
 *
 * 用法：node scripts/wechat-config.mjs
 */
import { build } from 'esbuild'
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

// src/wechat-config.ts 是纯函数模块，未挂到服务上；这里单独转译后导入
const WORK = '/tmp/zmtgzt-wechat-test'
const BUNDLE = join(WORK, 'wechat-config.mjs')
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

await build({
  entryPoints: [join(root, 'src/wechat-config.ts')],
  outfile: BUNDLE,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})

const mod = await import(BUNDLE)

const SAMPLE = `# 公众号发布配置（用户手工维护的注释）
default: main
accounts:
  main:
    app_id: wx1234567890abcd
    app_secret: secret-value
    author: 老王
  backup:
    app_id: wx0000backup
    app_secret: s2
image_generation:
  generator: doubao
integrations:
  wechatsync: false
`

// ---------------------------------------------------------------------------
console.log('\n[A] 解析')
// ---------------------------------------------------------------------------

const parsed = mod.parseWechatConfig(SAMPLE)
check('解析出 default', parsed.defaultKey === 'main', parsed.defaultKey)
check('解析出 2 个账号', parsed.accounts.length === 2, String(parsed.accounts.length))
check('读到 app_id', parsed.accounts[0].appId === 'wx1234567890abcd', parsed.accounts[0].appId)
check('hasSecret 为真', parsed.accounts[0].hasSecret === true)
check('读到 author', parsed.accounts[0].author === '老王', parsed.accounts[0].author)
check(
  '解析结果不含密钥明文',
  JSON.stringify(parsed).indexOf('secret-value') === -1 && JSON.stringify(parsed).indexOf('s2') === -1
)

// ---------------------------------------------------------------------------
console.log('\n[B] 行级补丁：更新已有账号')
// ---------------------------------------------------------------------------

const updated = mod.patchWechatConfig(SAMPLE, {
  key: 'main',
  appId: 'wxUPDATED',
  appSecret: 'newsecret',
  author: '新作者',
})
check('app_id 已更新', /app_id: wxUPDATED/.test(updated))
check('app_secret 已更新', /app_secret: newsecret/.test(updated))
// 中文值会被加引号（YAML 安全做法），因此以解析往返为准而不是字面匹配
check('author 已更新', /author:\s*"?新作者"?/.test(updated))
const updatedParsed = mod.parseWechatConfig(updated)
check('author 往返正确', updatedParsed.accounts.find((a) => a.key === 'main')?.author === '新作者')
check('旧 app_id 已消失', !updated.includes('wx1234567890abcd'))
check('★ 保留用户注释', updated.includes('# 公众号发布配置（用户手工维护的注释）'))
check('★ 保留其它顶层键 image_generation', updated.includes('image_generation:'))
check('★ 保留 generator 值', updated.includes('generator: doubao'))
check('★ 保留其它顶层键 integrations', updated.includes('integrations:'))
check('★ 保留其它账号 backup', updated.includes('backup:') && updated.includes('app_id: wx0000backup'))
check('default 仍指向 main', /^default: main$/m.test(updated))

// ---------------------------------------------------------------------------
console.log('\n[C] 行级补丁：新增账号与首次创建')
// ---------------------------------------------------------------------------

const added = mod.patchWechatConfig(SAMPLE, { key: 'third', appId: 'wxTHIRD', appSecret: 's3' })
check('新账号已追加', added.includes('third:'))
check('新账号字段就位', /app_id: wxTHIRD/.test(added))
check('原有账号未被破坏', added.includes('wx1234567890abcd') && added.includes('wx0000backup'))
check('新增后用 default 指向新账号', /^default: third$/m.test(added))

const created = mod.patchWechatConfig('', { key: 'only', appId: 'wx1', appSecret: 's1' })
check('空文件创建 default', /^default: only$/m.test(created))
check('空文件创建 accounts 段', /^accounts:$/m.test(created))
check('空文件写入字段', /app_id: wx1/.test(created))

const reparsed = mod.parseWechatConfig(created)
check('新建内容可被再次解析', reparsed.defaultKey === 'only' && reparsed.accounts.length === 1)

// 需要引号的值
const quoted = mod.patchWechatConfig('', { key: 'k', appId: 'wx1', appSecret: 'a b#c:d', author: '带 空格' })
const quotedParsed = mod.parseWechatConfig(quoted)
check('含特殊字符的值可往返', quotedParsed.accounts[0].hasSecret === true)

// ---------------------------------------------------------------------------
console.log('\n[D] 写盘与备份')
// ---------------------------------------------------------------------------

const file = join(WORK, mod.WECHAT_CONFIG_REL)
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, SAMPLE, 'utf8')

const written = mod.writeWechatAccount(WORK, { key: 'main', appId: 'wxONDISK', appSecret: 'sOnDisk' })
check('写入成功', written.ok === true)
check('生成了 .bak 备份', existsSync(`${file}.bak`))
check('备份内容等于原文', readFileSync(`${file}.bak`, 'utf8') === SAMPLE)

const onDisk = mod.readWechatConfig(WORK)
check('可从磁盘读回', onDisk.exists === true && onDisk.accounts.length === 2)
check('磁盘读到更新后的 app_id', onDisk.accounts.some((a) => a.appId === 'wxONDISK'))
check('磁盘读取不含密钥明文', JSON.stringify(onDisk).indexOf('sOnDisk') === -1)

// ---------------------------------------------------------------------------
console.log('\n[E] 移除账号')
// ---------------------------------------------------------------------------

const removed = mod.removeWechatAccount(WORK, 'main')
check('移除成功', removed.ok === true)
const afterRemove = mod.readWechatConfig(WORK)
check('目标账号已移除', !afterRemove.accounts.some((a) => a.key === 'main'))
check('其它账号保留', afterRemove.accounts.some((a) => a.key === 'backup'))
check('移除时也留备份', existsSync(`${file}.bak`))

// ---------------------------------------------------------------------------
console.log('\n[F] 凭证校验的错误分类')
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch

globalThis.fetch = async () => ({ status: 200, json: async () => ({ access_token: 'tok', expires_in: 7200 }) })
const okCheck = await mod.verifyWechatCredentials('a', 'b')
check('有效凭证判定为 ok', okCheck.ok === true && okCheck.kind === 'ok')

globalThis.fetch = async () => ({
  status: 200,
  json: async () => ({ errcode: 40001, errmsg: 'invalid credential' }),
})
const badCheck = await mod.verifyWechatCredentials('a', 'b')
check('40001 归为凭证错误', badCheck.kind === 'invalid-credentials', badCheck.kind)
check('40001 提示核对 AppID/Secret', /AppID/.test(badCheck.hint ?? ''))

globalThis.fetch = async () => ({
  status: 200,
  json: async () => ({ errcode: 40002, errmsg: 'invalid appsecret' }),
})
const bad2 = await mod.verifyWechatCredentials('a', 'b')
check('40002 归为凭证错误', bad2.kind === 'invalid-credentials')

// 最关键的一条：40164 不能归为凭证错误
globalThis.fetch = async () => ({
  status: 200,
  json: async () => ({ errcode: 40164, errmsg: 'invalid ip 1.2.3.4, not in whitelist' }),
})
const ipCheck = await mod.verifyWechatCredentials('a', 'b')
check('★ 40164 归为白名单问题', ipCheck.kind === 'ip-not-whitelisted', ipCheck.kind)
check('★ 40164 不归为凭证错误', ipCheck.kind !== 'invalid-credentials')
check('★ 40164 提示明确说是白名单而非凭证', /白名单/.test(ipCheck.message) && /凭证本身有效/.test(ipCheck.message))
check('40164 提示给出后台路径', /IP 白名单/.test(ipCheck.hint ?? ''))

globalThis.fetch = async () => {
  throw new Error('ECONNREFUSED')
}
const netCheck = await mod.verifyWechatCredentials('a', 'b')
check('网络错误单独归类', netCheck.kind === 'network', netCheck.kind)
check('网络错误不误判为凭证错误', netCheck.kind !== 'invalid-credentials')
check('网络错误提示检查网络/代理', /网络|代理/.test(netCheck.hint ?? ''))

globalThis.fetch = realFetch

// ---------------------------------------------------------------------------
console.log('\n[G] AppID 脱敏')
// ---------------------------------------------------------------------------

check('长 AppID 脱敏', mod.maskAppId('wx1234567890abcdef').includes('…'), mod.maskAppId('wx1234567890abcdef'))
check('短 AppID 也脱敏', mod.maskAppId('wx123').includes('*'), mod.maskAppId('wx123'))
check('空值返回空串', mod.maskAppId('') === '')

// ---------------------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`wechat-config: ${failures.length} 项失败`)
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
console.log('wechat-config: 全部通过')
