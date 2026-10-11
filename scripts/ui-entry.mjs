/**
 * UI 入口注册测试：验证「自媒体工作台」入口落在官方契约规定的槽位上。
 *
 * 为什么单独有这个测试：此前入口注册**没有任何测试覆盖**，导致一个真实 bug
 * 长期存在 —— 入口被注册到 `sidebar.header.action`（stock dsh 并不声明该槽位），
 * 而 `slots.inject` 对未声明槽位既不触发也不抛错，于是旧的「候选槽位逐个
 * try/catch」永远停在第一个候选，降级分支从未执行，入口在界面上消失。
 *
 * 覆盖：
 *   [A] 现代路径：sidebar.panellist（list）+ main（keyed），且 id 与 key 一致
 *   [B] 降级路径：未声明 panellist 时落到 sidebar.footer.action
 *   [C] 契约一致性：注册到未声明槽位必须抛错（mock 与真实行为对齐）
 *   [D] 回归：源码不得再引用废弃槽位（header.action / shell.overlay / conversation.view）
 *
 * 用法：node scripts/ui-entry.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

// ---------------------------------------------------------------------------
// 宿主替身：react 与模块加载器
// ---------------------------------------------------------------------------

/** react 替身：Component 必须是可被 extends 的构造函数。 */
const reactStub = {
  __esModule: true,
  Component: class Component {
    constructor(props) {
      this.props = props ?? {}
    }
    setState(next) {
      this.state = { ...(this.state ?? {}), ...next }
    }
  },
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  createElement: () => null,
}

const requireStub = (name) => {
  if (name === 'react' || name === 'react/jsx-runtime' || name === 'react/jsx-dev-runtime') {
    return reactStub
  }
  // 其余 @deepseek-ai/* 在顶层不会被调用，给一个惰性替身即可
  return new Proxy(
    { __esModule: true },
    { get: (target, prop) => (prop in target ? target[prop] : () => undefined) }
  )
}

const clientSource = readFileSync(join(root, 'lib/client.js'), 'utf8')

/**
 * 加载一个全新的客户端模块实例。
 * 之所以每次重建：插件用模块级变量记录「降级入口是否已被撤销」，
 * 场景 A/B 必须互不污染。
 */
function loadClientInstance() {
  let captured = null
  const win = {
    __ModuleLoader__: {
      load(spec) {
        captured = spec
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'require', clientSource)(win, requireStub)
  if (!captured) throw new Error('客户端未调用 window.__ModuleLoader__.load')
  return { id: captured.id, exports: captured.factory(requireStub) }
}

/** 宿主槽位注册表替身，语义对齐官方 slots 服务。 */
function createSlots() {
  const declared = new Set()
  const pending = []
  const entries = []
  return {
    entries,
    /** 模拟宿主声明一个槽位（声明后对应 inject 回调触发）。 */
    declare(name) {
      declared.add(name)
      for (const item of [...pending]) {
        if (item.name !== name) continue
        pending.splice(pending.indexOf(item), 1)
        item.cb()
      }
    },
    inject(name, cb) {
      pending.push({ name, cb })
    },
    register(options, component) {
      // 官方行为：注册到未声明槽位会抛错（misconfiguration fails loud）
      if (!declared.has(options.name)) {
        throw new Error(`slot "${options.name}" is not declared`)
      }
      const record = { options, component }
      entries.push(record)
      return () => {
        const index = entries.indexOf(record)
        if (index >= 0) entries.splice(index, 1)
      }
    },
  }
}

function createCtx(slots) {
  const selected = []
  return {
    ctx: {
      slots,
      get: (name) => (name === 'layout' ? { selectPanel: (id) => selected.push(id) } : undefined),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    },
    selected,
  }
}

const PANEL_ID = 'zmtgzt-workbench'
const find = (entries, name) => entries.find((e) => e.options.name === name)

// ---------------------------------------------------------------------------
// [A] 现代路径：sidebar.panellist + main
// ---------------------------------------------------------------------------

console.log('\n[A] 现代路径（sidebar.panellist + main）')

{
  const client = loadClientInstance()
  check('模块导出 apply', typeof client.exports?.apply === 'function')
  check('模块 id 为 dsh-zmtgzt', client.id === 'dsh-zmtgzt', String(client.id))

  const slots = createSlots()
  const { ctx } = createCtx(slots)
  client.exports.apply(ctx)

  // 宿主启动时声明这两个槽位
  slots.declare('main')
  slots.declare('sidebar.panellist')

  const main = find(slots.entries, 'main')
  const panel = find(slots.entries, 'sidebar.panellist')

  check('注册了 main 面板', Boolean(main))
  check('main 为 keyed 且 key 正确', main?.options.key === PANEL_ID, String(main?.options.key))
  check('注册了 sidebar.panellist 条目', Boolean(panel))
  check('panellist 条目 id 与 main 的 key 一致', panel?.options.id === main?.options.key)
  check(
    'panellist 条目携带 label',
    typeof panel?.options.label === 'function'
      ? panel.options.label() === '自媒体工作台'
      : panel?.options.label === '自媒体工作台',
    String(typeof panel?.options.label === 'function' ? panel.options.label() : panel?.options.label)
  )
  check('panellist 条目有 order', typeof panel?.options.order === 'number', String(panel?.options.order))

  // panellist 生效后应撤销降级入口，避免出现两个入口
  check('footer 降级入口未注册（未重复）', !find(slots.entries, 'sidebar.footer.action'))
  check('共注册 2 个条目', slots.entries.length === 2, String(slots.entries.length))
}

// ---------------------------------------------------------------------------
// [B] 降级路径：宿主未声明 panellist
// ---------------------------------------------------------------------------

console.log('\n[B] 降级路径（无 panellist → sidebar.footer.action）')

{
  const client = loadClientInstance()
  const slots = createSlots()
  const { ctx } = createCtx(slots)
  client.exports.apply(ctx)

  // 老版本宿主：只有 main 与 footer.action
  slots.declare('main')
  slots.declare('sidebar.footer.action')

  const main = find(slots.entries, 'main')
  const footer = find(slots.entries, 'sidebar.footer.action')

  check('main 仍已注册', Boolean(main) && main.options.key === PANEL_ID)
  check('降级入口落到 sidebar.footer.action', Boolean(footer))
  check('降级入口 id 与 main 的 key 一致', footer?.options.id === main?.options.key)
  check('未误注册 panellist', !find(slots.entries, 'sidebar.panellist'))

  // 若 panellist 随后才声明（加载顺序颠倒），应撤销 footer 并改用它
  slots.declare('sidebar.panellist')
  check('panellist 后到时改用它', Boolean(find(slots.entries, 'sidebar.panellist')))
  check('后到时撤销 footer 入口', !find(slots.entries, 'sidebar.footer.action'))
}

// ---------------------------------------------------------------------------
// [C] 契约一致性：未声明槽位必须抛错
// ---------------------------------------------------------------------------

console.log('\n[C] 契约一致性（未声明槽位抛错）')

{
  const slots = createSlots()
  let threw = false
  try {
    slots.register({ name: 'sidebar.header.action', id: 'x' }, () => null)
  } catch {
    threw = true
  }
  check('注册到未声明槽位抛错（与官方一致）', threw)

  // 这正是旧 bug 的成因：inject 不抛错 → 旧代码的 try/catch 永远选第一个候选
  const slots2 = createSlots()
  let injectThrew = false
  try {
    slots2.inject('sidebar.header.action', () => {})
  } catch {
    injectThrew = true
  }
  check('inject 到未声明槽位不抛错（旧 bug 成因）', !injectThrew)
}

// ---------------------------------------------------------------------------
// [D] 回归：不得再引用废弃槽位
// ---------------------------------------------------------------------------

console.log('\n[D] 回归（废弃槽位不得出现）')

for (const legacy of ['sidebar.header.action', 'shell.overlay', 'conversation.view']) {
  check(`源码不再引用 ${legacy}`, !clientSource.includes(legacy))
}

// ---------------------------------------------------------------------------
console.log('\n[E] 内联表单（不依赖原生对话框）')
// ---------------------------------------------------------------------------

// Electron 不支持 window.prompt（返回 null 且不弹窗），
// 旧实现因此表现为「点新建没反应」；产物里不允许再出现这些调用。
for (const legacy of ['window.prompt', 'window.confirm', 'window.alert']) {
  check(`产物中不含 ${legacy}`, !clientSource.includes(legacy))
}
check('存在内联表单实现', clientSource.includes('InlineForm'))
check('新建走内联表单（含校验提示）', clientSource.includes('名称不能为空'))
check('删除走界面内二次确认', clientSource.includes('确认删除'))

// ---------------------------------------------------------------------------
console.log('\n[F] 发布页')
// ---------------------------------------------------------------------------

check('存在独立于发布的预检按钮', clientSource.includes('预检（不发布）'))
check('发布需要二次确认', clientSource.includes('不可撤销'))
check('公众号草稿语义在界面呈现', clientSource.includes('手动群发'))
check('小红书风控风险提示在界面呈现', clientSource.includes('平台风控'))
check('发布页会展示实际命令（供核对参数）', clientSource.includes('实际命令'))
// 门禁由上游脚本执行，界面不该有放行入口
check('★ 界面不提供 allow-unsafe 入口', !clientSource.includes('allow-unsafe'))
check('★ 界面不提供 skip-ai-score 入口', !clientSource.includes('skip-ai-score'))

// ---------------------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`ui-entry: ${failures.length} 项失败`)
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
console.log('ui-entry: 全部通过')
