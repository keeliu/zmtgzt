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

const TABS = ['总览', '账号', '画像', '主题', '发布', '环境自检'] as const
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
          {tab === '发布' && <PublishPane />}
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

/**
 * 内联新建表单。
 *
 * 为什么不用 `window.prompt`：DSH Web 可能跑在 Electron 里，而 **Electron 不支持
 * 同步对话框** —— `prompt()` 直接返回 `null` 且不显示窗口，调用处若只做
 * `if (!name) return` 便表现为「点了新建没反应」（这正是用户报告的问题）。
 *
 * 换成受控输入还有额外好处：能就地显示服务端返回的校验错误
 * （例如主题名不合法的原因），原生 `prompt` 做不到。
 */
function InlineForm({
  placeholder,
  submitLabel = '确定',
  onSubmit,
  onCancel,
}: {
  placeholder?: string
  submitLabel?: string
  /** 校验失败请抛错，错误信息会就地展示。 */
  onSubmit: (value: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('名称不能为空')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(trimmed)
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.inlineForm}>
      <input
        autoFocus
        style={S.input}
        placeholder={placeholder}
        value={value}
        disabled={busy}
        onChange={(event) => {
          setValue(event.target.value)
          if (error) setError('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <div style={S.row}>
        <button style={S.primaryBtn} disabled={busy} onClick={() => void submit()}>
          {busy ? '处理中…' : submitLabel}
        </button>
        <button style={S.ghostBtn} disabled={busy} onClick={onCancel}>
          取消
        </button>
      </div>
      {error && <p style={S.errorText}>{error}</p>}
    </div>
  )
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

/** 预检单项（与 src/preflight.ts 的 ProbeResult 对应）。 */
interface ProbeView {
  name: string
  ok: boolean
  detail?: string
  fix?: string
}

/** 一次登录会话的界面状态。 */
interface LoginUiState {
  channelId: string
  mode: 'qr' | 'window'
  state: string
  message: string
  /** 打破二维码 img 缓存的序号（重新发起时递增）。 */
  nonce: number
  /** 预检未通过时的探测明细。 */
  probes?: ProbeView[]
  hint?: string
}

/** 需要渲染二维码的登录状态。 */
const QR_STATES = new Set(['qr_ready', 'window_login'])
/** 终止轮询的登录状态。 */
const TERMINAL_STATES = new Set(['success', 'expired', 'error'])

/** 公众号官方 API 的账号视图（不含密钥明文）。 */
interface WechatAccountView {
  key: string
  appIdMasked: string
  hasSecret: boolean
  author: string
  theme: string
  configured: boolean
}

interface WechatConfigView {
  path: string
  exists: boolean
  defaultKey: string
  accounts: WechatAccountView[]
}

function AccountPane() {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [status, setStatus] = useState('')
  const [login, setLogin] = useState<LoginUiState | null>(null)
  const [log, setLog] = useState<{ channelId: string; content: string; path: string } | null>(null)
  const [wechat, setWechat] = useState<WechatConfigView | null>(null)
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
    // 公众号官方 API 的配置状态（脱敏）；失败不影响渠道列表展示
    try {
      const res = await api<{ ok: boolean; config: WechatConfigView | null }>('/account/wechat')
      setWechat(res.config ?? null)
    } catch {
      setWechat(null)
    }
  }, [])

  useEffect(() => {
    void load()
    return stopPolling
  }, [load, stopPolling])

  const startLogin = async (id: string, mode: 'qr' | 'window' = 'qr') => {
    try {
      const res = await api<{
        ok: boolean
        error?: string
        hint?: string
        preflight?: { probes?: ProbeView[] }
      }>('/account/login', {
        method: 'POST',
        body: JSON.stringify({ channelId: id, mode }),
      })
      if (!res.ok) {
        // 预检未通过：逐项展示缺失依赖与修复命令，而不是笼统报「失败」
        setLogin({
          channelId: id,
          mode,
          state: 'error',
          message: res.error ?? '发起登录失败',
          nonce: Date.now(),
          ...(res.preflight?.probes ? { probes: res.preflight.probes } : {}),
          ...(res.hint ? { hint: res.hint } : {}),
        })
        return
      }
      setLog(null)
      setLogin({ channelId: id, mode, state: 'starting', message: '已启动登录流程…', nonce: Date.now() })
      stopPolling()
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await api<{ state: string; message: string }>(
            `/account/login/status?channelId=${encodeURIComponent(id)}`
          )
          setLogin((prev) => {
            if (!prev) return prev
            const changed = prev.state !== st.state
            return {
              ...prev,
              state: st.state,
              message: st.message,
              // 仅在状态变化时换 nonce，避免每 2 秒重新拉一次二维码图片
              ...(changed ? { nonce: Date.now() } : {}),
            }
          })
          if (st.state === 'success') {
            stopPolling()
            setLogin(null)
            await load()
          } else if (TERMINAL_STATES.has(st.state)) {
            stopPolling()
          }
        } catch {
          /* 单次轮询失败不终止，下一轮继续 */
        }
      }, 2000)
    } catch (error) {
      setStatus(`发起登录失败：${String(error)}`)
    }
  }

  /** 读取登录脚本日志——脚本在写状态前就退出时，这是唯一的线索。 */
  const showLog = async (id: string) => {
    try {
      const res = await api<{ path: string; content: string; exists: boolean }>(
        `/account/login/log?channelId=${encodeURIComponent(id)}`
      )
      setLog({
        channelId: id,
        path: res.path,
        content: res.exists ? res.content || '（日志为空）' : '（尚无日志：本次会话还没发起过登录）',
      })
    } catch (error) {
      setLog({ channelId: id, path: '', content: `读取日志失败：${String(error)}` })
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
                <button style={S.ghostBtn} onClick={() => void startLogin(channel.id, 'qr')}>
                  扫码登录
                </button>
                <button style={S.ghostBtn} onClick={() => void startLogin(channel.id, 'window')}>
                  窗口登录
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

          {/* 公众号额外提供「官方 API 凭证」方式，与扫码后台会话并列 */}
          {channel.id === 'wechat-mp' && (
            <WechatApiSection config={wechat} onRefresh={() => void load()} />
          )}
        </div>
      ))}

      {login && <LoginSessionCard login={login} onShowLog={showLog} />}

      {log && (
        <div style={S.card}>
          <div style={S.row}>
            <strong>登录日志（{log.channelId}）</strong>
            <button style={S.linkBtn} onClick={() => setLog(null)}>
              收起
            </button>
          </div>
          {log.path && <p style={S.mono}>{log.path}</p>}
          <pre style={S.logBox}>{log.content}</pre>
        </div>
      )}

      {status && <p style={S.muted}>{status}</p>}
    </div>
  )
}

/** 登录会话卡片：二维码、状态机进度、预检明细与日志入口。 */
function LoginSessionCard({
  login,
  onShowLog,
}: {
  login: LoginUiState
  onShowLog: (id: string) => void
}) {
  const showQr = QR_STATES.has(login.state)
  return (
    <div style={S.card}>
      <div style={S.row}>
        <strong>
          登录中（{login.channelId} · {login.mode === 'window' ? '窗口登录' : '扫码登录'}）
        </strong>
        <span style={{ ...S.badge, ...(login.state === 'error' ? S.badgeBad : S.badgeMuted) }}>
          {login.state}
        </span>
      </div>

      {login.message && <p style={S.muted}>{login.message}</p>}

      {showQr && (
        <div style={S.qrWrap}>
          <img
            key={login.nonce}
            src={`${API}/account/login/qr?channelId=${encodeURIComponent(login.channelId)}&n=${login.nonce}`}
            alt="登录二维码"
            style={S.qrImg}
            onError={(event) => {
              // 状态说 qr_ready 但文件可能稍后才落盘，此时不显示破图
              event.currentTarget.style.visibility = 'hidden'
            }}
            onLoad={(event) => {
              event.currentTarget.style.visibility = 'visible'
            }}
          />
          <p style={S.muted}>
            用手机扫描上方二维码完成登录。二维码有时效（约几分钟），过期请重新发起。
          </p>
        </div>
      )}

      {login.state === 'window_login' && (
        <p style={S.muted}>
          请在弹出的浏览器窗口中完成登录（扫码或短信验证），不要关闭那个窗口。
        </p>
      )}

      {login.state === 'unknown' && (
        <p style={S.muted}>
          未读到登录状态：脚本可能尚未启动或已提前退出。请查看下方登录日志确认原因。
        </p>
      )}

      {/* 环境预检未通过：逐项列出缺失项与修复命令 */}
      {login.probes && login.probes.length > 0 && (
        <div style={S.subCard}>
          <strong style={{ fontSize: 12 }}>环境预检</strong>
          {login.probes.map((probe) => (
            <div key={probe.name} style={S.probeRow}>
              <span style={{ ...S.dot, background: probe.ok ? '#2da44e' : '#cf222e' }} />
              <span style={S.probeName}>{probe.name}</span>
              <span style={S.muted}>{probe.detail ?? ''}</span>
              {probe.fix && <span style={S.fixText}>→ {probe.fix}</span>}
            </div>
          ))}
        </div>
      )}

      {login.hint && <p style={S.hint}>{login.hint}</p>}

      <div style={S.row}>
        <button style={S.ghostBtn} onClick={() => onShowLog(login.channelId)}>
          查看登录日志
        </button>
      </div>
    </div>
  )
}

/**
 * 公众号「官方 API」凭证区。
 *
 * 与「扫码登录后台会话」并列：两种方式由用户按条件选择。
 * 后台会话免凭证与白名单；官方 API 需要 AppID/AppSecret 且需登记出口 IP。
 */
function WechatApiSection({
  config,
  onRefresh,
}: {
  config: WechatConfigView | null
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('default')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [author, setAuthor] = useState('')
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [done, setDone] = useState('')

  const accounts = config?.accounts ?? []

  const submit = async () => {
    setError('')
    setHint('')
    setDone('')
    if (!appId.trim() || !appSecret.trim()) {
      setError('AppID 与 AppSecret 均为必填。')
      return
    }
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; error?: string; hint?: string }>('/account/wechat', {
        method: 'POST',
        body: JSON.stringify({ key: key.trim() || 'default', appId, appSecret, author, theme }),
      })
      if (!res.ok) {
        setError(res.error ?? '保存失败')
        if (res.hint) setHint(res.hint)
        return
      }
      setAppSecret('')
      setDone('凭证已保存，并已通过微信接口校验。')
      onRefresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (accountKey: string) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await api('/account/wechat/remove', {
        method: 'POST',
        body: JSON.stringify({ key: accountKey }),
      })
      onRefresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.subCard}>
      <div style={S.row}>
        <strong style={{ fontSize: 13 }}>官方 API 凭证（另一种方式）</strong>
        <button style={S.linkBtn} onClick={() => setOpen(!open)}>
          {open ? '收起' : '配置'}
        </button>
      </div>
      <p style={S.muted}>
        上面的「扫码登录」走公众号后台会话，免 AppID/AppSecret、免 IP 白名单。
        也可改用官方 HTTP API：需填写 AppID 与 AppSecret，并把本机出口 IP
        加进公众号后台的 IP 白名单。两种方式任选其一即可。
      </p>

      {accounts.length > 0 && (
        <div style={S.stack}>
          {accounts.map((account) => (
            <div key={account.key} style={S.row}>
              <span style={{ ...S.badge, ...(account.configured ? S.badgeOk : S.badgeWarn) }}>
                {account.configured ? '凭证已配置' : '缺少密钥'}
              </span>
              <span style={S.mono}>
                {account.key}
                {account.appIdMasked ? ` · AppID ${account.appIdMasked}` : ''}
              </span>
              <button style={S.dangerBtn} disabled={busy} onClick={() => void remove(account.key)}>
                清除
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={S.stack}>
          <div style={S.formGrid}>
            <label style={S.label}>
              账号键（对应配置里的 accounts 键名）
              <input
                style={S.input}
                value={key}
                placeholder="default"
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
            <label style={S.label}>
              AppID
              <input
                style={S.input}
                value={appId}
                placeholder="wx 开头的一串字符"
                onChange={(event) => setAppId(event.target.value)}
              />
            </label>
            <label style={S.label}>
              AppSecret
              <input
                style={S.input}
                type="password"
                value={appSecret}
                placeholder="只在重置时显示一次，请从后台复制"
                onChange={(event) => setAppSecret(event.target.value)}
              />
            </label>
            <label style={S.label}>
              作者名（可选）
              <input
                style={S.input}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
              />
            </label>
            <label style={S.label}>
              排版主题（可选）
              <input
                style={S.input}
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
              />
            </label>
          </div>

          <div style={S.row}>
            <button style={S.primaryBtn} disabled={busy} onClick={() => void submit()}>
              {busy ? '校验并保存中…' : '校验并保存'}
            </button>
            <span style={S.muted}>保存前会调用微信接口校验凭证有效性</span>
          </div>
        </div>
      )}

      {error && <p style={S.errorText}>{error}</p>}
      {hint && <p style={S.hint}>{hint}</p>}
      {done && <p style={S.okText}>{done}</p>}
      {config?.path && <span style={S.mono}>配置文件：{config.path}</span>}
      <p style={S.muted}>
        说明：按上游约定，AppSecret 以明文保存在该 YAML 中（微信官方 API 的常规做法）。
      </p>
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
  const [creating, setCreating] = useState(false)

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

  return (
    <div style={S.split}>
      <div style={S.listCol}>
        <div style={S.colHead}>
          <span>画像（{profiles.length}）</span>
          <button style={S.linkBtn} onClick={() => setCreating(!creating)}>
            {creating ? '取消' : '新建'}
          </button>
        </div>
        {creating && (
          <InlineForm
            placeholder="新画像名称（如「职场干货」）"
            submitLabel="创建"
            onCancel={() => setCreating(false)}
            onSubmit={async (value) => {
              await api('/profile', {
                method: 'POST',
                body: JSON.stringify({ name: value, file: 'identity', content: '' }),
              })
              await load()
              await open(value)
            }}
          />
        )}
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
  const [creating, setCreating] = useState(false)
  /** 待二次确认删除的主题名。 */
  const [confirming, setConfirming] = useState<string | null>(null)

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

  const removeTopic = async (name: string) => {
    await api('/topic', { method: 'POST', body: JSON.stringify({ action: 'remove', name }) })
    setConfirming(null)
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
          <button style={S.linkBtn} onClick={() => setCreating(!creating)}>
            {creating ? '取消' : '新建'}
          </button>
        </div>
        {creating && (
          <InlineForm
            placeholder="新主题名称（如「春季通勤穿搭」）"
            submitLabel="创建"
            onCancel={() => setCreating(false)}
            onSubmit={async (value) => {
              const res = await api<{ ok: boolean; reason?: string }>('/topic', {
                method: 'POST',
                body: JSON.stringify({ action: 'create', name: value }),
              })
              if (!res.ok) throw new Error(res.reason ?? '创建失败')
              await load()
              await openTopic(value)
            }}
          />
        )}
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
              {/* 破坏性操作走界面内二次确认，不用 window.confirm（Electron 不可靠） */}
              {confirming === active ? (
                <>
                  <button style={S.dangerBtn} onClick={() => void removeTopic(active)}>
                    确认删除「{active}」（不可恢复）
                  </button>
                  <button style={S.ghostBtn} onClick={() => setConfirming(null)}>
                    取消
                  </button>
                </>
              ) : (
                <button style={S.ghostBtn} onClick={() => setConfirming(active)}>
                  删除主题
                </button>
              )}
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
// 发布
// ---------------------------------------------------------------------------

interface PlanCheckView {
  name: string
  ok: boolean
  detail?: string
  fix?: string
}

interface PublishPlanView {
  ok: boolean
  platformName: string
  mode: string
  script: string
  subcommand?: string
  cli: string[]
  checks: PlanCheckView[]
  warnings: string[]
  steps: string[]
  followUp: string[]
}

interface PublishResultView {
  ok: boolean
  platformName: string
  executed: boolean
  draftOnly: boolean
  error?: string
  hint?: string
  followUp: string[]
  plan: PublishPlanView
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i

/** 平台与内容类型（与 src/publish.ts 的映射保持一致）。 */
const PUBLISH_PLATFORMS = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    modes: [
      { id: 'image', name: '图文' },
      { id: 'video', name: '视频' },
    ],
  },
  { id: 'wechat-mp', name: '微信公众号', modes: [{ id: 'draft', name: '草稿' }] },
]

/**
 * 发布页。
 *
 * 三点刻意的设计：
 *   1. 预检与发布分开按钮 —— 先看预检，才可能点「确认发布」，避免手滑直接对外发。
 *   2. 发布走界面内二次确认，且确认文案写明后果（公开发布 / 创建草稿）。
 *   3. 不提供任何绕过门禁的开关 —— 安全检查由上游脚本执行。
 */
function PublishPane() {
  const [platform, setPlatform] = useState('xiaohongshu')
  const [mode, setMode] = useState('image')
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [topic, setTopic] = useState('')
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<Array<{ name: string; isDir: boolean; size: number }>>([])
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [video, setVideo] = useState('')
  const [cover, setCover] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [officialApi, setOfficialApi] = useState(false)
  const [plan, setPlan] = useState<PublishPlanView | null>(null)
  const [result, setResult] = useState<PublishResultView | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState('')

  const platformSpec = PUBLISH_PLATFORMS.find((p) => p.id === platform) ?? PUBLISH_PLATFORMS[0]

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<{ topics: TopicRow[] }>('/topic')
        setTopics(data.topics ?? [])
      } catch (error) {
        setStatus(`读取主题失败：${String(error)}`)
      }
    })()
  }, [])

  const resetOutput = () => {
    setPlan(null)
    setResult(null)
    setConfirming(false)
  }

  const switchPlatform = (id: string) => {
    setPlatform(id)
    setMode(id === 'wechat-mp' ? 'draft' : 'image')
    setSelectedImages([])
    setVideo('')
    resetOutput()
  }

  const openTopic = async (name: string) => {
    setTopic(name)
    setSelectedImages([])
    setVideo('')
    resetOutput()
    try {
      const data = await api<{
        dir: string
        entries: Array<{ name: string; isDir: boolean; size: number }>
      }>(`/topic?name=${encodeURIComponent(name)}`)
      setDir(data.dir ?? '')
      setEntries((data.entries ?? []).filter((entry) => !entry.isDir))
    } catch (error) {
      setStatus(`读取产物失败：${String(error)}`)
    }
  }

  const mediaFiles = entries.filter((entry) => IMAGE_EXT.test(entry.name) || VIDEO_EXT.test(entry.name))
  const absPath = (name: string) => (dir ? `${dir}/${name}` : name)

  const buildBody = (confirm: boolean) => ({
    platform,
    mode,
    title,
    content,
    images: selectedImages,
    video,
    tags: tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    cover,
    officialApi,
    confirm,
  })

  const runPlan = async () => {
    setBusy(true)
    setStatus('')
    setResult(null)
    setConfirming(false)
    try {
      const res = await api<{ ok: boolean; plan?: PublishPlanView; error?: string; hint?: string }>(
        '/publish/plan',
        { method: 'POST', body: JSON.stringify(buildBody(false)) }
      )
      if (!res.ok || !res.plan) {
        setStatus([res.error, res.hint].filter(Boolean).join(' — ') || '预检失败')
        return
      }
      setPlan(res.plan)
    } catch (error) {
      setStatus(`预检失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const doPublish = async () => {
    setBusy(true)
    setConfirming(false)
    setStatus('')
    try {
      const res = await api<PublishResultView>('/publish', {
        method: 'POST',
        body: JSON.stringify(buildBody(true)),
      })
      setResult(res)
      if (res.plan) setPlan(res.plan)
    } catch (error) {
      setStatus(`发布失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.stack}>
      {/* 1. 平台 */}
      <div style={S.card}>
        <strong>发布到哪个平台</strong>
        <div style={S.row}>
          {PUBLISH_PLATFORMS.map((item) => (
            <button
              key={item.id}
              style={{ ...S.tab, ...(platform === item.id ? S.tabActive : null) }}
              onClick={() => switchPlatform(item.id)}
            >
              {item.name}
            </button>
          ))}
          {platformSpec.modes.length > 1 &&
            platformSpec.modes.map((item) => (
              <button
                key={item.id}
                style={{ ...S.tab, ...(mode === item.id ? S.tabActive : null) }}
                onClick={() => {
                  setMode(item.id)
                  resetOutput()
                }}
              >
                {item.name}
              </button>
            ))}
        </div>
        <p style={S.muted}>
          {platform === 'wechat-mp'
            ? '公众号：脚本创建的是「草稿」，不会自动群发——创建后仍需你到公众号后台手动群发。'
            : '小红书：公开笔记，发布后平台可见，且不可撤销。'}
        </p>
        {platform === 'xiaohongshu' && (
          <p style={S.warnText}>
            ⚠ 小红书自动化发布存在平台风控、限流与封号风险。建议先用测试号、小流量运行，最终内容人工复核。
          </p>
        )}
      </div>

      {/* 2. 主题与产物 */}
      <div style={S.card}>
        <strong>从主题产物里选媒体</strong>
        <p style={S.muted}>
          脚本会校验路径存在性，因此媒体从主题的产物目录里点选，而不是手填路径。
        </p>
        {topics.length === 0 && (
          <p style={S.muted}>还没有主题。先到「主题」页创建并产出素材，再回来发布。</p>
        )}
        <div style={S.row}>
          {topics.map((item) => (
            <button
              key={item.name}
              style={{ ...S.tab, ...(topic === item.name ? S.tabActive : null) }}
              onClick={() => void openTopic(item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>
        {topic && mediaFiles.length === 0 && <p style={S.muted}>该主题下暂无可用的图片或视频产物。</p>}
        {mediaFiles.length > 0 && (
          <div style={S.mediaGrid}>
            {mediaFiles.map((entry) => {
              const path = absPath(entry.name)
              const isImage = IMAGE_EXT.test(entry.name)
              const selected = isImage ? selectedImages.includes(path) : video === path
              return (
                <button
                  key={entry.name}
                  style={{ ...S.mediaItem, ...(selected ? S.mediaItemActive : null) }}
                  title={path}
                  onClick={() => {
                    if (isImage) {
                      setSelectedImages((prev) =>
                        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
                      )
                    } else {
                      setVideo((prev) => (prev === path ? '' : path))
                    }
                    resetOutput()
                  }}
                >
                  <span style={S.mediaName}>{entry.name}</span>
                  <span style={S.muted}>
                    {isImage ? '图片' : '视频'} · {formatSize(entry.size)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {topic && (
          <p style={S.muted}>
            已选：{selectedImages.length} 张图片{video ? ' + 1 个视频' : ''}
          </p>
        )}
        {dir && <span style={S.mono}>{dir}</span>}
      </div>

      {/* 3. 内容 */}
      <div style={S.card}>
        <strong>内容</strong>
        <div style={S.formGrid}>
          <label style={S.label}>
            标题{platform === 'xiaohongshu' ? '（≤20 全角，预检会校验）' : ''}
            <input
              style={S.input}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                resetOutput()
              }}
            />
          </label>
          <label style={S.label}>
            {platform === 'xiaohongshu' ? '正文' : '正文（Markdown，脚本会自行排版）'}
            <textarea
              style={{ ...S.input, minHeight: 96, resize: 'vertical' }}
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                resetOutput()
              }}
            />
          </label>
          {platform === 'xiaohongshu' ? (
            <label style={S.label}>
              话题（逗号分隔）
              <input
                style={S.input}
                value={tags}
                placeholder="穿搭,通勤"
                onChange={(event) => {
                  setTags(event.target.value)
                  resetOutput()
                }}
              />
            </label>
          ) : (
            <>
              <label style={S.label}>
                封面图路径（必填）
                <input
                  style={S.input}
                  value={cover}
                  placeholder="可从上方产物点选后一键填入"
                  onChange={(event) => {
                    setCover(event.target.value)
                    resetOutput()
                  }}
                />
              </label>
              <div style={S.row}>
                <button
                  style={S.linkBtn}
                  onClick={() => {
                    if (selectedImages[0]) setCover(selectedImages[0])
                  }}
                >
                  用第一张已选图片作为封面
                </button>
                <label style={S.checkRow}>
                  <input
                    type="checkbox"
                    checked={officialApi}
                    onChange={(event) => {
                      setOfficialApi(event.target.checked)
                      resetOutput()
                    }}
                  />
                  走官方 API（需 AppID/AppSecret 与 IP 白名单）
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. 操作 */}
      <div style={S.row}>
        <button style={S.primaryBtn} disabled={busy} onClick={() => void runPlan()}>
          {busy ? '处理中…' : '预检（不发布）'}
        </button>
        {plan?.ok && !confirming && (
          <button style={S.ghostBtn} disabled={busy} onClick={() => setConfirming(true)}>
            下一步：确认发布
          </button>
        )}
        {confirming && (
          <>
            <button style={S.dangerBtn} disabled={busy} onClick={() => void doPublish()}>
              确认{platform === 'wechat-mp' ? '创建草稿' : '发布到小红书'}（不可撤销）
            </button>
            <button style={S.ghostBtn} disabled={busy} onClick={() => setConfirming(false)}>
              取消
            </button>
          </>
        )}
      </div>

      {/* 5. 预检 */}
      {plan && (
        <div style={S.card}>
          <div style={S.row}>
            <strong>预检：{plan.platformName}</strong>
            <span style={{ ...S.badge, ...(plan.ok ? S.badgeOk : S.badgeBad) }}>
              {plan.ok ? '可以发布' : '存在问题'}
            </span>
          </div>
          {plan.checks
            .filter((check) => !check.ok)
            .map((check) => (
              <div key={check.name} style={S.probeRow}>
                <span style={{ ...S.dot, background: '#cf222e' }} />
                <span style={S.probeName}>{check.name}</span>
                <span style={S.muted}>{check.detail ?? ''}</span>
                {check.fix && <span style={S.fixText}>→ {check.fix}</span>}
              </div>
            ))}
          <h4 style={S.sectionTitle}>将执行的步骤</h4>
          <ol style={S.stepList}>
            {plan.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <h4 style={S.sectionTitle}>实际命令（供核对参数）</h4>
          <pre style={S.logBox}>
            {`${plan.script.split('/').pop()} ${plan.subcommand ?? ''} ${plan.cli.join(' ')}`}
          </pre>
          {plan.warnings.map((warning, index) => (
            <p key={index} style={S.warnText}>
              ⚠ {warning}
            </p>
          ))}
          {plan.followUp.length > 0 && (
            <>
              <h4 style={S.sectionTitle}>发布后你仍需完成</h4>
              {plan.followUp.map((item, index) => (
                <p key={index} style={S.muted}>
                  · {item}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      {/* 6. 结果 */}
      {result && (
        <div style={S.card}>
          <div style={S.row}>
            <strong>
              {result.ok ? '完成' : '失败'}：{result.platformName}
            </strong>
            <span style={{ ...S.badge, ...(result.ok ? S.badgeOk : S.badgeBad) }}>
              {result.ok
                ? result.executed
                  ? result.draftOnly
                    ? '草稿已创建'
                    : '已发布'
                  : '仅预检'
                : '未成功'}
            </span>
          </div>
          {result.error && <p style={S.errorText}>{result.error}</p>}
          {result.hint && <p style={S.hint}>{result.hint}</p>}
          {result.ok &&
            result.followUp.map((item, index) => (
              <p key={index} style={S.warnText}>
                → {item}
              </p>
            ))}
          {result.ok && !result.draftOnly && (
            <p style={S.muted}>可到小红书查看该笔记；平台可能有审核延迟。</p>
          )}
          {!result.ok && platform === 'xiaohongshu' && /登录/.test(result.error ?? '') && (
            <p style={S.muted}>看起来是登录态问题：请到「账号」页扫码登录后重试。</p>
          )}
        </div>
      )}

      {status && <p style={S.muted}>{status}</p>}
    </div>
  )
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

  // --- 内联表单 ---
  inlineForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: subtle,
  },
  formGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  errorText: { margin: 0, fontSize: 12, color: '#cf222e' },
  okText: { margin: 0, fontSize: 12, color: '#2da44e' },

  // --- 登录会话：二维码、预检、日志 ---
  subCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 10px',
    marginTop: 6,
    borderRadius: 8,
    border: `1px dashed ${border}`,
  },
  qrWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' },
  qrImg: {
    width: 200,
    height: 200,
    objectFit: 'contain',
    borderRadius: 8,
    background: '#ffffff',
    padding: 6,
    border: `1px solid ${border}`,
  },
  logBox: {
    margin: 0,
    maxHeight: 240,
    overflow: 'auto',
    padding: 8,
    borderRadius: 6,
    background: subtle,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  probeRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 },
  probeName: { minWidth: 150 },
  fixText: { fontSize: 11, opacity: 0.8, fontFamily: 'ui-monospace, monospace' },
  warnText: { margin: 0, fontSize: 12, color: '#bf8700' },

  // --- 发布页 ---
  mediaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 8,
  },
  mediaItem: {
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
    fontSize: 12,
  },
  mediaItemActive: { background: activeBg, borderColor: 'currentColor' },
  mediaName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stepList: { margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85, lineHeight: 1.7 },
}
