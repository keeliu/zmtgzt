/**
 * 会话与主题的绑定关系持久化。
 *
 * 存放于插件数据目录（默认 `~/.dsh/zmtgzt/bindings.json`），**不写进 Easel 的 `outputs/`**——
 * 绑定是「DSH 会话 ↔ 主题」的映射，不属于 Easel 的数据模型，写进去会污染产物结构。
 *
 * 写入沿用与其他状态一致的策略：串行队列 + 临时文件 rename，避免并发或中断损坏。
 * @module dsh-zmtgzt/session-bindings
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 一条绑定记录。 */
export interface Binding {
  /** 主题名（对应 `outputs/<主题名>/`）。 */
  topic: string
  /** 该主题产物目录的绝对路径。 */
  dir: string
  /** 绑定时间（ISO 8601）。 */
  boundAt: string
}

interface BindingState {
  version: 1
  bindings: Record<string, Binding>
}

const EMPTY_STATE: BindingState = { version: 1, bindings: {} }

/** 串行化写队列：同一文件的写入排队执行。 */
class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => undefined)
    return next
  }
}

export class SessionBindingStore {
  private readonly queue = new WriteQueue()

  constructor(private readonly file: string) {}

  private async read(): Promise<BindingState> {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as BindingState
      if (!parsed || typeof parsed.bindings !== 'object' || parsed.bindings === null) {
        return { ...EMPTY_STATE, bindings: {} }
      }
      const bindings: Record<string, Binding> = {}
      for (const [key, value] of Object.entries(parsed.bindings)) {
        if (value && typeof value.topic === 'string' && typeof value.dir === 'string') {
          bindings[key] = {
            topic: value.topic,
            dir: value.dir,
            boundAt: typeof value.boundAt === 'string' ? value.boundAt : new Date().toISOString(),
          }
        }
      }
      return { version: 1, bindings }
    } catch {
      return { ...EMPTY_STATE, bindings: {} }
    }
  }

  private async write(state: BindingState): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, this.file)
  }

  /** 读取某会话的绑定。 */
  async get(sessionId: string): Promise<Binding | undefined> {
    const state = await this.read()
    return state.bindings[sessionId]
  }

  /** 绑定（或覆盖）某会话的主题。 */
  set(sessionId: string, topic: string, dir: string): Promise<Binding> {
    return this.queue.run(async () => {
      const state = await this.read()
      const binding: Binding = { topic, dir, boundAt: new Date().toISOString() }
      state.bindings[sessionId] = binding
      await this.write(state)
      return binding
    })
  }

  /** 解除绑定。 */
  remove(sessionId: string): Promise<{ removed: boolean }> {
    return this.queue.run(async () => {
      const state = await this.read()
      if (!state.bindings[sessionId]) return { removed: false }
      delete state.bindings[sessionId]
      await this.write(state)
      return { removed: true }
    })
  }

  /** 列出全部绑定。 */
  async list(): Promise<Record<string, Binding>> {
    const state = await this.read()
    return { ...state.bindings }
  }
}
