/**
 * 客户端半：左侧导航「自媒体工作台」入口 + 主区域工作台面板。
 *
 * 入口走**官方两段式注册**（与内置「插件」条目同一机制，见
 * `@deepseek-ai/dsh-client-ui-sidebar` 的 slot 契约）：
 *
 *   1. `sidebar.panellist`（kind: list, scope: root）注册一个**图标条目**，
 *      `id` 即主面板 key。宿主渲染行与按钮、从条目 metadata 解析 label、
 *      点击时调 `ctx.layout.selectPanel(id)` —— 宿主拥有按钮，这里只画图标。
 *   2. `main`（kind: keyed, scope: root）用**同一个 id** 注册面板主体。
 *      宿主在条目被选中时以该 id 为 key 渲染 main。
 *
 * 关于降级：`slots.inject` 只在目标槽位**被声明后**触发回调；未被声明的槽位
 * 既不触发也不抛错。因此两路可并存——谁被声明谁生效。老版本若没有
 * `sidebar.panellist`，则落到 `sidebar.footer.action`（侧边栏底部，Settings 旁）。
 *
 * 注意（上一版的真实 bug）：`sidebar.header.action` 在 stock dsh 中**不被声明**，
 * 而 `inject` 不抛错，所以旧代码的「候选槽位逐个 try/catch」永远选中第一个，
 * 降级分支从未执行 —— 入口因此消失。
 *
 * @module dsh-zmtgzt/client
 */
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export const name = 'dsh-zmtgzt-client'
/** 与宿主模块系统注入的服务保持一致。 */
export const inject = ['slots', 'connection', 'locale']

const API = '/api/zmtgzt'
const TITLE_ZH = '自媒体工作台'

/** 入口条目 id，同时也是 `main` keyed 槽位的 key —— 两处必须一致。 */
const PANEL_ID = 'zmtgzt-workbench'
/** 条目排序：与内置条目并列，数值越小越靠上。 */
const PANEL_ORDER = 30

/**
 * 通过注入的服务选择主面板（降级入口点击时用；panellist 路径由宿主代劳）。
 * layout 服务可能不存在，因此这里不做硬依赖、失败即静默。
 */
let selectPanel: ((id: string) => void) | null = null

const TABS = ['总览', '账号', '画像', '主题', '环境自检'] as const
type Tab = (typeof TABS)[number]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx: any) {
  const slots = ctx?.slots
  if (!slots?.inject || !slots?.register) return

  // layout 服务供「降级入口」点击时切面板；panellist 路径由宿主处理点击。
  // 不写进 inject 数组：layout 缺失不应阻断整个界面加载。
  try {
    const layout = ctx.get?.('layout')
    if (typeof layout?.selectPanel === 'function') {
      selectPanel = (id: string) => layout.selectPanel(id)
    }
  } catch {
    /* 忽略：没有 layout 时降级入口仅提示，不影响 panellist 主路径 */
  }

  const label = () => TITLE_ZH
  let panellistLive = false
  let footerDispose: (() => void) | null = null

  // 1. 主面板（keyed）：key 必须与下面入口条目的 id 相同
  slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, WorkbenchPanel))

  // 2. 首选入口：侧边栏全局图标条 —— 与内置「插件」条目同一位置
  slots.inject('sidebar.panellist', () => {
    panellistLive = true
    // panellist 可用则撤掉降级入口，避免出现两个入口
    if (footerDispose) {
      try {
        footerDispose()
      } catch {
        /* 已失效 */
      }
      footerDispose = null
    }
    return slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: PANEL_ORDER, label },
      WorkbenchIcon
    )
  })

  // 3. 降级入口：老版本未声明 panellist 时，落到侧边栏底部动作区
  slots.inject('sidebar.footer.action', () => {
    if (panellistLive) return
    footerDispose = slots.register(
      { name: 'sidebar.footer.action', id: PANEL_ID, order: PANEL_ORDER, label },
      WorkbenchFooterEntry
    )
    return footerDispose
  })

  try {
    ctx.logger?.info?.(
      '[dsh-zmtgzt] 工作台入口：首选 sidebar.panellist（左侧导航「插件」同位），' +
        '降级 sidebar.footer.action'
    )
  } catch {
    /* 忽略 */
  }
}

/**
 * 侧边栏入口图标。宿主提供按钮外壳与 label，这里只画图标。
 * owner props：`{ size: number; active: boolean }`（见 sidebar 包的 slot 契约）。
 */
function WorkbenchIcon({ size = 16, active }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', opacity: active ? 1 : 0.72 }}
    >
      <rect x="1.4" y="1.9" width="13.2" height="12.2" rx="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.4 6.1h13.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.2 6.1v8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/**
 * 降级入口（`sidebar.footer.action`）。owner props：`{ wide: boolean }`。
 * 这条路径的点击由本插件处理 —— 通过 layout 服务选中主面板。
 */
function WorkbenchFooterEntry({ wide = true }: { wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => selectPanel?.(PANEL_ID)}
      title={TITLE_ZH}
      aria-label={TITLE_ZH}
      style={{ ...S.entryBtn, justifyContent: wide ? 'flex-start' : 'center' }}
    >
      <WorkbenchIcon size={16} />
      {wide && <span style={S.entryLabel}>{TITLE_ZH}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// 工作台面板
// ---------------------------------------------------------------------------

function WorkbenchPanel() {
  const [tab, setTab] = useState<Tab>('总览')

  return (
    <section style={S.panel} aria-label={TITLE_ZH}>
      <header style={S.header}>
        <strong style={{ fontSize: 14 }}>{TITLE_ZH}</strong>
        <span style={S.version}>dsh-zmtgzt</span>
        <span style={{ flex: 1 }} />
        <button style={S.ghostBtn} onClick={() => selectPanel?.('conversation')}>
          返回对话
        </button>
      </header>
      <nav style={S.tabs}>
        {TABS.map((label) => (
          <button
            key={label}
            onClick={() => setTab(label)}
            style={{ ...S.tab, ...(tab === label ? S.tabActive : null) }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div style={S.body}>
        <PaneBoundary key={tab}>
          {tab === '总览' && <OverviewPane onNavigate={setTab} />}
          {tab === '账号' && <AccountPane />}
          {tab === '画像' && <ProfilePane />}
          {tab === '主题' && <TopicPane />}
          {tab === '环境自检' && <DoctorPane />}
        </PaneBoundary>
      </div>
    </section>
  )
}

/** 子页面错误边界：把异常限制在页面内，不让主区域空白。 */
class PaneBoundary extends Component<{ children?: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={S.errorBox}>
          <strong>此页面渲染出错</strong>
          <p style={S.muted}>{String(this.state.error.message ?? this.state.error)}</p>
          <p style={S.muted}>其它子页面仍可正常使用。</p>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// 总览
// ---------------------------------------------------------------------------

function OverviewPane({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [doctor, setDoctor] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    void api<Record<string, any>>('/doctor')
      .then(setDoctor)
      .catch(() => undefined)
  }, [])

  const healthy = doctor?.healthy === true

  return (
    <div style={S.stack}>
      <div style={S.row}>
        <span style={{ ...S.badge, ...(healthy ? S.badgeOk : S.badgeBad) }}>
          {healthy ? '环境就绪' : '环境待修复'}
        </span>
        {typeof doctor?.skillCount === 'number' && (
          <span style={S.muted}>{doctor.skillCount} 个技能可用</span>
        )}
        {doctor?.embeddedCommit && (
          <span style={S.muted}>快照 {String(doctor.embeddedCommit).slice(0, 10)}</span>
        )}
      </div>

      <div style={S.card}>
        <strong>从哪开始</strong>
        <p style={S.muted}>
          工作台负责维护「账号」「画像」「主题」三件事；内容生成仍在对话里完成——
          绑定主题后，会话会按当前生效的 SOUL.md / AGENTS.md 与技能产出，产物落到该主题目录。
        </p>
        <div style={S.row}>
          <button style={S.primaryBtn} onClick={() => onNavigate('账号')}>
            去维护账号
          </button>
          <button style={S.ghostBtn} onClick={() => onNavigate('主题')}>
            去管理主题
          </button>
          <button style={S.ghostBtn} onClick={() => onNavigate('环境自检')}>
            查看自检
          </button>
        </div>
      </div>

      {doctor?.easelRoot && (
        <div style={S.card}>
          <strong>生效根</strong>
          <p style={S.mono}>{String(doctor.easelRoot)}</p>
          <p style={S.muted}>
            来源：{doctor.rootSource === 'configured' ? '自备仓库' : '内置快照'}
            {doctor.workspaceDir ? ` · 工作目录 ${String(doctor.workspaceDir)}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 账号
// ---------------------------------------------------------------------------

interface ChannelRow {
  id: string
  name: string
  supportsLogin: boolean
  supportsPublish: boolean
  profilePresent: boolean
  reason?: string
  profileDir: string
}

function AccountPane() {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [status, setStatus] = useState('')
  const [login, setLogin] = useState<{ channelId: string; state: string; message: string } | null>(null)
  const pollRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await api<{ channels: ChannelRow[] }>('/account')
      setChannels(data.channels ?? [])
      setStatus('')
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void load()
    return stopPolling
  }, [load, stopPolling])

  const startLogin = async (id: string) => {
    try {
      const res = await api<{ ok: boolean; error?: string; hint?: string }>('/account/login', {
        method: 'POST',
        body: JSON.stringify({ channelId: id }),
      })
      if (!res.ok) {
        setStatus(res.error ?? '发起登录失败')
        return
      }
      setLogin({ channelId: id, state: 'starting', message: '已启动扫码流程…' })
      stopPolling()
      pollRef.current = window.setInterval(async () => {
        const st = await api<{ state: string; message: string }>(
          `/account/login/status?channelId=${encodeURIComponent(id)}`
        )
        setLogin({ channelId: id, state: st.state, message: st.message })
        if (st.state === 'success') {
          stopPolling()
          setLogin(null)
          await load()
        } else if (st.state === 'expired' || st.state === 'error') {
          stopPolling()
        }
      }, 2000)
    } catch (error) {
      setStatus(`发起登录失败：${String(error)}`)
    }
  }

  const logout = async (id: string) => {
    try {
      await api('/account/logout', { method: 'POST', body: JSON.stringify({ channelId: id }) })
      await load()
    } catch (error) {
      setStatus(`登出失败：${String(error)}`)
    }
  }

  return (
    <div style={S.stack}>
      <div style={S.row}>
        <button style={S.primaryBtn} onClick={() => void load()}>
          刷新
        </button>
        <span style={S.muted}>登录态存放在 ~/.easel-browser-profiles/，与 Easel 脚本共用</span>
      </div>

      {channels.map((channel) => (
        <div key={channel.id} style={S.card}>
          <div style={S.row}>
            <strong>{channel.name}</strong>
            <span
              style={{
                ...S.badge,
                ...(!channel.supportsLogin
                  ? S.badgeMuted
                  : channel.profilePresent
                    ? S.badgeOk
                    : S.badgeWarn),
              }}
            >
              {!channel.supportsLogin ? '暂不支持' : channel.profilePresent ? '已登录' : '未登录'}
            </span>
            {channel.supportsLogin && channel.supportsPublish && (
              <span style={{ ...S.badge, ...S.badgeMuted }}>可发布</span>
            )}
          </div>

          {channel.reason && <p style={S.muted}>{channel.reason}</p>}

          {channel.supportsLogin && (
            <>
              <div style={S.row}>
                <button style={S.ghostBtn} onClick={() => void startLogin(channel.id)}>
                  扫码登录
                </button>
                {channel.profilePresent && (
                  <button style={S.dangerBtn} onClick={() => void logout(channel.id)}>
                    登出
                  </button>
                )}
              </div>
              <span style={S.mono}>{channel.profileDir}</span>
            </>
          )}
        </div>
      ))}

      {login && (
        <div style={S.card}>
          <strong>扫码登录中（{login.channelId}）</strong>
          <p style={S.muted}>
            状态：{login.state}
            {login.message ? ` · ${login.message}` : ''}
          </p>
          <p style={S.muted}>
            二维码由登录脚本生成在插件数据目录。长时间无进展请检查 Python 与 Playwright 是否就绪。
          </p>
        </div>
      )}

      {status && <p style={S.muted}>{status}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 画像
// ---------------------------------------------------------------------------

const DIMENSIONS = ['identity', 'style', 'audience', 'platforms', 'preferences', 'memory'] as const
type Dimension = (typeof DIMENSIONS)[number]
const DIM_LABELS: Record<Dimension, string> = {
  identity: '身份定位',
  style: '内容风格',
  audience: '目标受众',
  platforms: '活跃平台',
  preferences: '偏好边界',
  memory: '长期记忆',
}

function ProfilePane() {
  const [profiles, setProfiles] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [dims, setDims] = useState<Partial<Record<Dimension, string>>>({})
  const [dirty, setDirty] = useState<Dimension | null>(null)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<{ profiles: string[] }>('/profile')
      setProfiles(data.profiles ?? [])
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = async (name: string) => {
    setActive(name)
    setDirty(null)
    try {
      const data = await api<{ dimensions: Record<string, string> }>(
        `/profile-read?name=${encodeURIComponent(name)}`
      )
      setDims((data.dimensions ?? {}) as Partial<Record<Dimension, string>>)
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }

  const save = async (dim: Dimension) => {
    try {
      await api('/profile', {
        method: 'POST',
        body: JSON.stringify({ name: active, file: dim, content: dims[dim] ?? '' }),
      })
      setDirty(null)
      setStatus('已保存')
    } catch (error) {
      setStatus(`保存失败：${String(error)}`)
    }
  }

  const createProfile = async () => {
    const name = window.prompt('新画像名称（如「职场干货」）')
    if (!name || !name.trim()) return
    try {
      await api('/profile', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), file: 'identity', content: '' }),
      })
      await load()
      await open(name.trim())
    } catch (error) {
      setStatus(`创建失败：${String(error)}`)
    }
  }

  return (
    <div style={S.split}>
      <div style={S.listCol}>
        <div style={S.colHead}>
          <span>画像（{profiles.length}）</span>
          <button style={S.linkBtn} onClick={() => void createProfile()}>
            新建
          </button>
        </div>
        {profiles.length === 0 && <p style={S.muted}>还没有画像。新建一个，内容创作会读它。</p>}
        {profiles.map((item) => (
          <button
            key={item}
            style={{ ...S.listItem, ...(active === item ? S.listItemActive : null) }}
            onClick={() => void open(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div style={S.detailCol}>
        {!active && <p style={S.muted}>选择左侧画像查看六维内容。</p>}
        {active &&
          DIMENSIONS.map((dim) => (
            <div key={dim} style={S.field}>
              <div style={S.colHead}>
                <label style={S.label}>
                  {DIM_LABELS[dim]} <span style={S.muted}>{dim}.md</span>
                </label>
                <button style={S.linkBtn} onClick={() => void save(dim)}>
                  {dirty === dim ? '保存*' : '保存'}
                </button>
              </div>
              <textarea
                style={{ ...S.input, minHeight: 64, resize: 'vertical' }}
                value={dims[dim] ?? ''}
                placeholder="（空）"
                onChange={(event) => {
                  setDims((prev) => ({ ...prev, [dim]: event.target.value }))
                  setDirty(dim)
                }}
              />
            </div>
          ))}
        {status && <p style={S.muted}>{status}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 主题
// ---------------------------------------------------------------------------

interface TopicRow {
  name: string
  dir: string
  steps: number
  updatedAt?: string
  hasContent: boolean
}

function TopicPane() {
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [active, setActive] = useState('')
  const [entries, setEntries] = useState<Array<{ name: string; isDir: boolean; size: number }>>([])
  const [steps, setSteps] = useState<Array<Record<string, unknown>>>([])
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<{ topics: TopicRow[] }>('/topic')
      setTopics(data.topics ?? [])
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openTopic = async (name: string) => {
    setActive(name)
    try {
      const data = await api<{
        entries: Array<{ name: string; isDir: boolean; size: number }>
        manifest: { steps?: Array<Record<string, unknown>> } | null
      }>(`/topic?name=${encodeURIComponent(name)}`)
      setEntries(data.entries ?? [])
      setSteps(data.manifest?.steps ?? [])
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }

  const createTopic = async () => {
    const name = window.prompt('新主题名称（人类可读的具体名称，如「春季通勤穿搭」）')
    if (!name || !name.trim()) return
    const res = await api<{ ok: boolean; reason?: string }>('/topic', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', name: name.trim() }),
    })
    if (!res.ok) {
      setStatus(res.reason ?? '创建失败')
      return
    }
    setStatus('')
    await load()
    await openTopic(name.trim())
  }

  const removeTopic = async (name: string) => {
    if (!window.confirm(`确认删除主题「${name}」及其全部产物？`)) return
    await api('/topic', { method: 'POST', body: JSON.stringify({ action: 'remove', name }) })
    if (active === name) {
      setActive('')
      setEntries([])
      setSteps([])
    }
    await load()
  }

  const bindToSession = async (name: string) => {
    const sessionId = readSessionId()
    if (!sessionId) {
      setStatus('未能取得当前会话 id，无法绑定。请在会话内打开工作台后重试。')
      return
    }
    const res = await api<{ ok: boolean; error?: string }>('/binding', {
      method: 'POST',
      body: JSON.stringify({ sessionId, topic: name }),
    })
    setStatus(res.ok ? `已绑定到当前会话：${name}` : (res.error ?? '绑定失败'))
  }

  const unbind = async () => {
    const sessionId = readSessionId()
    if (!sessionId) return
    await api('/binding', { method: 'POST', body: JSON.stringify({ sessionId, action: 'unbind' }) })
    setStatus('已解除绑定')
  }

  return (
    <div style={S.split}>
      <div style={S.listCol}>
        <div style={S.colHead}>
          <span>主题（{topics.length}）</span>
          <button style={S.linkBtn} onClick={() => void createTopic()}>
            新建
          </button>
        </div>
        {topics.length === 0 && (
          <p style={S.muted}>
            还没有主题。主题对应 outputs/&lt;主题名&gt;/，绑定会话后产物会落到该目录。
          </p>
        )}
        {topics.map((item) => (
          <button
            key={item.name}
            style={{ ...S.listItem, ...(active === item.name ? S.listItemActive : null) }}
            onClick={() => void openTopic(item.name)}
          >
            <span>{item.name}</span>
            <span style={S.muted}>
              {item.steps} 步{item.updatedAt ? ` · ${item.updatedAt.slice(0, 10)}` : ''}
            </span>
          </button>
        ))}
      </div>

      <div style={S.detailCol}>
        {!active && <p style={S.muted}>选择左侧主题查看产物与执行记录。</p>}
        {active && (
          <>
            <div style={S.row}>
              <strong>{active}</strong>
            </div>
            <div style={S.row}>
              <button style={S.primaryBtn} onClick={() => void bindToSession(active)}>
                绑定到当前会话
              </button>
              <button style={S.ghostBtn} onClick={() => void unbind()}>
                解除绑定
              </button>
              <button style={S.dangerBtn} onClick={() => void removeTopic(active)}>
                删除主题
              </button>
            </div>

            <h4 style={S.sectionTitle}>执行记录</h4>
            {steps.length === 0 && <p style={S.muted}>尚无步骤记录（由 manifest.py 写入）。</p>}
            {steps.map((step, index) => (
              <div key={index} style={S.step}>
                <span style={S.stepName}>
                  {String(step.skill ?? step.step ?? '—')}
                  {step.layer ? ` · ${String(step.layer)}` : ''}
                </span>
                {Boolean(step.summary ?? step.conclusion) && (
                  <p style={S.stepText}>{String(step.summary ?? step.conclusion)}</p>
                )}
              </div>
            ))}

            <h4 style={S.sectionTitle}>产物文件</h4>
            {entries.length === 0 && <p style={S.muted}>目录为空。</p>}
            {entries.map((entry) => (
              <div key={entry.name} style={S.fileRow}>
                <span>{entry.isDir ? '📁' : '📄'}</span>
                <span style={S.fileName}>{entry.name}</span>
                <span style={S.muted}>{entry.isDir ? '' : formatSize(entry.size)}</span>
              </div>
            ))}
          </>
        )}
        {status && <p style={S.muted}>{status}</p>}
      </div>
    </div>
  )
}

/** 从 URL 读取当前会话 id（DSH Web 会话 id 出现在地址栏）。 */
function readSessionId(): string | null {
  try {
    const url = new URL(window.location.href)
    for (const key of ['sessionId', 'session', 'id']) {
      const value = url.searchParams.get(key)
      if (value) return value
    }
    const match = /\/sessions?\/([^/?#]+)/.exec(url.pathname)
    if (match) return match[1]
  } catch {
    /* 忽略 */
  }
  return null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// 环境自检
// ---------------------------------------------------------------------------

function DoctorPane() {
  const [report, setReport] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await api<Record<string, any>>('/doctor'))
    } catch (error) {
      setReport({ healthy: false, hint: String(error) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = Array.isArray(report?.checks)
    ? report.checks
    : []

  return (
    <div style={S.stack}>
      <div style={S.row}>
        <button style={S.primaryBtn} onClick={() => void run()} disabled={loading}>
          {loading ? '体检中…' : '重新体检'}
        </button>
        <span style={{ ...S.badge, ...(report?.healthy ? S.badgeOk : S.badgeBad) }}>
          {report?.healthy ? '环境就绪' : '尚未就绪'}
        </span>
      </div>

      {report?.easelRoot && (
        <div style={S.card}>
          <strong>生效根</strong>
          <p style={S.mono}>{String(report.easelRoot)}</p>
          <p style={S.muted}>
            来源：{report.rootSource === 'configured' ? '自备仓库' : '内置快照'}
            {report.embeddedCommit ? ` · 快照 ${String(report.embeddedCommit).slice(0, 10)}` : ''}
          </p>
        </div>
      )}

      {checks.map((check) => (
        <div key={check.name} style={S.checkRow}>
          <span style={{ ...S.dot, background: check.ok ? '#2da44e' : '#cf222e' }} />
          <span style={{ minWidth: 190 }}>{check.name}</span>
          <span style={S.muted}>{check.detail ?? ''}</span>
        </div>
      ))}

      {Array.isArray(report?.warnings) &&
        report.warnings.map((warning: string, index: number) => (
          <p key={index} style={S.muted}>
            ⚠ {warning}
          </p>
        ))}

      {report?.hint && <p style={S.hint}>{String(report.hint)}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 样式：全部走主题令牌，不写死底色
// ---------------------------------------------------------------------------

const border = 'color-mix(in oklab, currentColor 18%, transparent)'
const subtle = 'color-mix(in oklab, currentColor 8%, transparent)'
const activeBg = 'color-mix(in oklab, currentColor 14%, transparent)'

const S: Record<string, React.CSSProperties> = {
  entryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
  },
  entryLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // 主区域面板：填满宿主给 main 面板的容器，不再自带浮层与宽度
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '10px 14px',
    borderBottom: `1px solid ${border}`,
  },
  version: { fontSize: 11, opacity: 0.55 },
  tabs: { display: 'flex', gap: 4, padding: '8px 12px 0', flexWrap: 'wrap' },
  tab: {
    background: 'transparent',
    border: `1px solid ${border}`,
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    color: 'inherit',
    fontSize: 12,
  },
  tabActive: { background: activeBg, fontWeight: 600 },
  body: { flex: 1, overflow: 'auto', padding: 14 },

  stack: { display: 'flex', flexDirection: 'column', gap: 10 },
  split: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  listCol: { width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  detailCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  colHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    opacity: 0.75,
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${border}`,
  },
  listItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 13,
  },
  listItemActive: { background: activeBg },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, opacity: 0.75 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: 'transparent',
    color: 'inherit',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  primaryBtn: {
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#2da44e',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
  },
  ghostBtn: {
    padding: '5px 12px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
  dangerBtn: {
    padding: '5px 12px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: 'transparent',
    color: '#cf222e',
    cursor: 'pointer',
    fontSize: 12,
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    opacity: 0.75,
    cursor: 'pointer',
    fontSize: 12,
    textDecoration: 'underline',
  },
  muted: { fontSize: 11, opacity: 0.6, margin: 0 },
  mono: { fontSize: 11, opacity: 0.6, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' },
  sectionTitle: { margin: '8px 0 4px', fontSize: 12, opacity: 0.75 },
  step: {
    padding: '6px 8px',
    borderLeft: `2px solid ${border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  stepName: { fontWeight: 600, fontSize: 12 },
  stepText: { margin: 0, fontSize: 12, opacity: 0.85 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' },
  fileName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  badge: { padding: '2px 8px', borderRadius: 999, fontSize: 11 },
  badgeOk: { background: 'rgba(45,164,78,.16)', color: '#2da44e' },
  badgeWarn: { background: 'rgba(191,135,0,.16)', color: '#bf8700' },
  badgeBad: { background: 'rgba(207,34,46,.16)', color: '#cf222e' },
  badgeMuted: { background: subtle, opacity: 0.8 },
  hint: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    background: subtle,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: subtle,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
}
