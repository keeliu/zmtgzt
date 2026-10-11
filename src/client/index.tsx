/**
 * 客户端半：注册到 `conversation.view` 槽的「Easel 工作台」视图。
 *
 * 四块内容，全部是 Easel 仓库的真实状态（插件不另存）：
 *   - 技能库：Easel 仓库 skills/openclaw 下各技能的 SKILL.md 清单，按层分组
 *   - 账号画像：`profiles/<画像>/` 的六维 md
 *   - 项目产物：`outputs/<主题>/` 与 manifest
 *   - 环境体检：Easel 根目录 / 契约文件 / 技能目录 / Python
 *
 * 数据面复用服务端已注册的 /api/zmtgzt/* 路由。
 * @module dsh-zmtgzt/client
 */
import { useCallback, useEffect, useState } from 'react'

export const name = 'dsh-zmtgzt-client'
export const inject = ['slots', 'connection', 'locale']

const API = '/api/zmtgzt'
const TABS = ['技能库', '账号画像', '项目产物', '环境体检'] as const
type Tab = (typeof TABS)[number]

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

interface SkillRow {
  name: string
  layer: string | null
  description: string
}

interface DoctorCheck {
  name: string
  ok: boolean
  detail?: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  return (await res.json()) as T
}

export function apply(ctx: any) {
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'dsh-zmtgzt',
        order: 30,
        label: () => 'Easel 工作台',
        slug: 'easel',
        inject: (sessionId: unknown) => ({
          connection: ctx.connection,
          sessionId: String(sessionId ?? ''),
        }),
      },
      ZmtgztWorkbench
    )
  )
}

function ZmtgztWorkbench() {
  const [tab, setTab] = useState<Tab>('技能库')
  return (
    <div style={S.root}>
      <header style={S.header}>
        <strong style={{ fontSize: 14 }}>Easel 工作台</strong>
        <span style={S.version}>dsh-zmtgzt</span>
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
        {tab === '技能库' && <SkillsPane />}
        {tab === '账号画像' && <ProfilePane />}
        {tab === '项目产物' && <ProjectsPane />}
        {tab === '环境体检' && <DoctorPane />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 技能库
// ---------------------------------------------------------------------------

function SkillsPane() {
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [layer, setLayer] = useState<string>('')
  const [status, setStatus] = useState('加载中…')

  const load = useCallback(async () => {
    try {
      const data = await api<{ skills: SkillRow[]; count: number }>('/skills')
      setSkills(data.skills ?? [])
      setStatus(`共 ${data.count ?? data.skills?.length ?? 0} 个技能`)
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const layers = [...new Set(skills.map((s) => s.layer ?? '未分层'))].sort()
  const shown = layer ? skills.filter((s) => (s.layer ?? '未分层') === layer) : skills

  return (
    <div style={{ ...S.formCol, width: '100%' }}>
      <div style={S.actions}>
        <button style={S.primaryBtn} onClick={() => void load()}>
          刷新
        </button>
        <button style={{ ...S.tab, ...(layer === '' ? S.tabActive : null) }} onClick={() => setLayer('')}>
          全部
        </button>
        {layers.map((name) => (
          <button
            key={name}
            style={{ ...S.tab, ...(layer === name ? S.tabActive : null) }}
            onClick={() => setLayer(name)}
          >
            {name}
          </button>
        ))}
        <span style={S.muted}>{status}</span>
      </div>
      <p style={S.muted}>
        技能正文与 references 都在 Easel 仓库里，插件不复制副本。要用某个技能，让 agent 调
        zmtgzt_skill（action=read）。
      </p>
      {shown.map((skill) => (
        <div key={skill.name} style={S.skillRow}>
          <div style={S.skillHead}>
            <span style={S.skillName}>{skill.name}</span>
            {skill.layer && <span style={S.layerTag}>{skill.layer}</span>}
          </div>
          <p style={S.skillDesc}>{skill.description}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 账号画像
// ---------------------------------------------------------------------------

function ProfilePane() {
  const [profiles, setProfiles] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [dims, setDims] = useState<Partial<Record<Dimension, string>>>({})
  const [dirty, setDirty] = useState<Dimension | null>(null)
  const [status, setStatus] = useState('')

  const loadList = useCallback(async () => {
    try {
      const data = await api<{ profiles: string[]; error?: string }>('/profile')
      setProfiles(data.profiles ?? [])
      if (data.error) setStatus(data.error)
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

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
    <div style={S.pane}>
      <div style={S.listCol}>
        <div style={S.colHead}>
          <span>画像（{profiles.length}）</span>
          <button style={S.linkBtn} onClick={() => void loadList()}>
            刷新
          </button>
        </div>
        {profiles.length === 0 && (
          <p style={S.muted}>
            还没有画像。Easel 的模板在 profiles/_template/，复制一份改成你的账号名即可。
          </p>
        )}
        {profiles.map((name) => (
          <button
            key={name}
            style={{ ...S.card, ...(active === name ? S.cardActive : null) }}
            onClick={() => void open(name)}
          >
            <strong>{name}</strong>
          </button>
        ))}
      </div>

      <div style={S.formCol}>
        {!active && <p style={S.muted}>选择左侧画像查看六维内容。</p>}
        {active &&
          DIMENSIONS.map((dim) => (
            <div key={dim} style={S.field}>
              <div style={S.colHead}>
                <label style={S.label}>
                  {DIM_LABELS[dim]} <span style={S.muted}>({dim}.md)</span>
                </label>
                <button style={S.linkBtn} onClick={() => void save(dim)}>
                  {dirty === dim ? '保存*' : '保存'}
                </button>
              </div>
              <textarea
                style={{ ...S.input, minHeight: 70, resize: 'vertical' }}
                value={dims[dim] ?? ''}
                placeholder="（空）"
                onChange={(e) => {
                  setDims((prev) => ({ ...prev, [dim]: e.target.value }))
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
// 项目产物
// ---------------------------------------------------------------------------

function ProjectsPane() {
  const [projects, setProjects] = useState<string[]>([])
  const [topic, setTopic] = useState('')
  const [detail, setDetail] = useState<{
    entries: Array<{ name: string; isDir: boolean }>
    manifest: { steps?: Array<{ skill?: string; layer?: string; summary?: string }> } | null
  } | null>(null)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<{ projects: string[] }>('/projects')
      setProjects(data.projects ?? [])
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = async (name: string) => {
    setTopic(name)
    try {
      const data = await api<{
        entries: Array<{ name: string; isDir: boolean }>
        manifest: { steps?: any[] } | null
      }>(`/project?topic=${encodeURIComponent(name)}`)
      setDetail({ entries: data.entries ?? [], manifest: data.manifest })
    } catch (error) {
      setStatus(`读取失败：${String(error)}`)
    }
  }

  const steps = detail?.manifest?.steps ?? []

  return (
    <div style={S.pane}>
      <div style={S.listCol}>
        <div style={S.colHead}>
          <span>项目（{projects.length}）</span>
          <button style={S.linkBtn} onClick={() => void load()}>
            刷新
          </button>
        </div>
        {projects.length === 0 && <p style={S.muted}>outputs/ 下还没有项目。</p>}
        {projects.map((name) => (
          <button
            key={name}
            style={{ ...S.card, ...(topic === name ? S.cardActive : null) }}
            onClick={() => void open(name)}
          >
            <strong>{name}</strong>
          </button>
        ))}
      </div>

      <div style={S.formCol}>
        {!detail && <p style={S.muted}>选择左侧项目查看 manifest 与产物。</p>}
        {detail && (
          <>
            <h4 style={S.sectionTitle}>执行记录（manifest.steps）</h4>
            {steps.length === 0 && <p style={S.muted}>尚无步骤记录。</p>}
            {steps.map((step, index) => (
              <div key={index} style={S.step}>
                <span style={S.stepName}>
                  {step.skill ?? step.step ?? '—'}
                  {step.layer ? ` · ${step.layer}` : ''}
                </span>
                {step.summary && <p style={S.stepConclusion}>{step.summary}</p>}
              </div>
            ))}
            <h4 style={S.sectionTitle}>产物文件</h4>
            {detail.entries.length === 0 && <p style={S.muted}>目录为空。</p>}
            {detail.entries.map((entry) => (
              <div key={entry.name} style={S.fileRow}>
                <span>{entry.isDir ? '📁' : '📄'}</span>
                <span style={S.fileName}>{entry.name}</span>
              </div>
            ))}
          </>
        )}
        {status && <p style={S.muted}>{status}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 环境体检
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

  const checks: DoctorCheck[] = Array.isArray(report?.checks) ? report.checks : []

  return (
    <div style={{ ...S.formCol, width: '100%' }}>
      <div style={S.actions}>
        <button style={S.primaryBtn} onClick={() => void run()} disabled={loading}>
          {loading ? '体检中…' : '重新体检'}
        </button>
        <span style={{ ...S.badge, ...(report?.healthy ? S.badgeOk : S.badgeBad) }}>
          {report?.healthy ? '环境就绪' : '尚未就绪'}
        </span>
        {typeof report?.skillCount === 'number' && (
          <span style={S.muted}>已发现 {report.skillCount} 个 Easel 技能</span>
        )}
      </div>
      {checks.map((check) => (
        <div key={check.name} style={S.checkRow}>
          <span style={{ ...S.dot, background: check.ok ? '#2da44e' : '#cf222e' }} />
          <span style={{ minWidth: 180 }}>{check.name}</span>
          <span style={S.muted}>{check.detail ?? ''}</span>
        </div>
      ))}
      {report?.hint && <p style={S.hint}>{String(report.hint)}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 样式：跟随主题前景色，内容优先
// ---------------------------------------------------------------------------

const border = 'color-mix(in oklab, currentColor 18%, transparent)'
const subtle = 'color-mix(in oklab, currentColor 8%, transparent)'
const activeBg = 'color-mix(in oklab, currentColor 14%, transparent)'

const S: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13, color: 'inherit' },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '10px 14px',
    borderBottom: `1px solid ${border}`,
  },
  version: { fontSize: 11, opacity: 0.55 },
  tabs: { display: 'flex', gap: 4, padding: '8px 12px 0' },
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
  body: { flex: 1, overflow: 'auto', padding: 12 },
  pane: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  listCol: { width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  formCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  colHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    opacity: 0.75,
  },
  card: {
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
  },
  cardActive: { background: activeBg },
  skillRow: {
    padding: '8px 10px',
    border: `1px solid ${border}`,
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  skillHead: { display: 'flex', alignItems: 'center', gap: 8 },
  skillName: { fontWeight: 600, fontSize: 12, fontFamily: 'ui-monospace, monospace' },
  layerTag: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 999,
    background: subtle,
    opacity: 0.8,
  },
  skillDesc: { margin: 0, fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
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
  actions: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  primaryBtn: {
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#2da44e',
    color: '#fff',
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
  sectionTitle: { margin: '8px 0 4px', fontSize: 12, opacity: 0.75 },
  step: {
    padding: '6px 8px',
    borderLeft: `2px solid ${border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  stepName: { fontWeight: 600, fontSize: 12 },
  stepConclusion: { margin: 0, fontSize: 12, opacity: 0.85 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' },
  fileName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  badge: { padding: '2px 8px', borderRadius: 999, fontSize: 11 },
  badgeOk: { background: 'rgba(45,164,78,.15)', color: '#2da44e' },
  badgeBad: { background: 'rgba(207,34,46,.15)', color: '#cf222e' },
  hint: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    background: subtle,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
  },
}
