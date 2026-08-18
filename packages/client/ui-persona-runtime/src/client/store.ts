/** Browser projection of the Host-authoritative Persona runtime. */

import type {
  PersonaAppearance,
  PersonaDescriptor,
  PersonaRef,
  PersonaSnapshot,
  PersonaTarget,
  PersonaWarning,
} from '../wire.ts'

/** Minimal generic RPC contract consumed by this external UI bundle. */
export interface PersonaRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: unknown }
    | { ok: false; error: { message: string } }
  >
}

/** UI state for one Session. */
export interface PersonaSessionState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error'
  snapshot: PersonaSnapshot | null
  error: string | null
}

/** Whole plugin projection. */
export interface PersonaUiState {
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  catalog: readonly PersonaDescriptor[]
  catalogError: string | null
  sessions: Readonly<Record<string, PersonaSessionState>>
}

const INITIAL: PersonaUiState = Object.freeze({
  catalogStatus: 'idle',
  catalog: Object.freeze([]),
  catalogError: null,
  sessions: Object.freeze({}),
})

const CHANNEL = '/persona-runtime'

/** Tiny external-store contract; no dependency on Harness client object/runtime layers. */
export class PersonaStore {
  private snapshot: PersonaUiState = INITIAL
  private readonly listeners = new Set<() => void>()

  readonly getSnapshot = (): PersonaUiState => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(next: PersonaUiState): void {
    if (Object.is(this.snapshot, next)) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function readRef(value: unknown): PersonaRef {
  const candidate = object(value)
  if (typeof candidate?.id !== 'string' || typeof candidate.version !== 'string') {
    throw new Error('persona runtime returned an invalid persona reference')
  }
  return { id: candidate.id, version: candidate.version }
}

function readAppearance(value: unknown): PersonaAppearance | undefined {
  if (value === undefined) return undefined
  const candidate = object(value)
  if (candidate === undefined) throw new Error('persona runtime returned invalid appearance metadata')
  const appearance: PersonaAppearance = {}
  for (const key of ['background', 'animatedBackground', 'avatar', 'accent'] as const) {
    const entry = candidate[key]
    if (entry === undefined) continue
    if (typeof entry !== 'string') throw new Error(`persona runtime returned invalid appearance.${key}`)
    appearance[key] = entry
  }
  return appearance
}

function readDescriptor(value: unknown): PersonaDescriptor {
  const candidate = object(value)
  if (candidate === undefined || typeof candidate.name !== 'string') {
    throw new Error('persona runtime returned an invalid catalog row')
  }
  const appearance = readAppearance(candidate.appearance)
  return {
    ref: readRef(candidate.ref),
    name: candidate.name,
    ...(appearance === undefined ? {} : { appearance }),
  }
}

function readWarning(value: unknown): PersonaWarning {
  const candidate = object(value)
  if (candidate === undefined || typeof candidate.type !== 'string') {
    throw new Error('persona runtime returned an invalid warning')
  }
  return {
    type: candidate.type,
    ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
  }
}

function readSnapshot(value: unknown): PersonaSnapshot {
  const candidate = object(value)
  if (candidate === undefined
    || typeof candidate.sessionId !== 'string'
    || typeof candidate.revision !== 'number'
    || !Array.isArray(candidate.warnings)) {
    throw new Error('persona runtime returned an invalid snapshot')
  }
  const active = candidate.active === null ? null : readRef(candidate.active)
  const appearance = candidate.appearance === null ? null : readAppearance(candidate.appearance) ?? null
  return Object.freeze({
    sessionId: candidate.sessionId,
    active,
    appearance,
    revision: candidate.revision,
    warnings: Object.freeze(candidate.warnings.map(readWarning)),
  })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Browser controller. It never predicts a Persona commit; Host replies replace the snapshot. */
export class PersonaUiController {
  readonly store = new PersonaStore()
  private readonly loadedSessions = new Set<string>()

  constructor(private readonly rpc: PersonaRpc) {}

  /** Load the Persona roster once, retrying after errors. */
  async loadCatalog(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.catalogStatus === 'loading' || before.catalogStatus === 'ready') return
    this.publish({ ...before, catalogStatus: 'loading', catalogError: null })
    try {
      const result = await this.rpc.call(CHANNEL, 'list', {})
      if (!result.ok) throw new Error(result.error.message)
      if (!Array.isArray(result.value)) throw new Error('persona runtime returned an invalid catalog')
      this.publish({
        ...this.store.getSnapshot(),
        catalogStatus: 'ready',
        catalog: Object.freeze(result.value.map(readDescriptor)),
        catalogError: null,
      })
    } catch (error) {
      this.publish({ ...this.store.getSnapshot(), catalogStatus: 'error', catalogError: message(error) })
    }
  }

  /** Read one Session's authoritative selection. */
  async loadSession(sessionId: string): Promise<void> {
    const current = this.session(sessionId)
    if (current.status === 'loading' || current.status === 'saving') return
    this.loadedSessions.add(sessionId)
    this.setSession(sessionId, { ...current, status: 'loading', error: null })
    try {
      const result = await this.rpc.call(CHANNEL, 'snapshot', { sessionId })
      if (!result.ok) throw new Error(result.error.message)
      this.setSession(sessionId, { status: 'ready', snapshot: readSnapshot(result.value), error: null })
    } catch (error) {
      this.setSession(sessionId, { ...this.session(sessionId), status: 'error', error: message(error) })
    }
  }

  /** Request a Persona switch and publish only the committed Host snapshot. */
  async activate(sessionId: string, target: PersonaTarget): Promise<void> {
    const before = this.session(sessionId)
    if (before.status === 'saving') return
    this.loadedSessions.add(sessionId)
    this.setSession(sessionId, { ...before, status: 'saving', error: null })
    try {
      const result = await this.rpc.call(CHANNEL, 'activate', { sessionId, target })
      if (!result.ok) throw new Error(result.error.message)
      this.setSession(sessionId, { status: 'ready', snapshot: readSnapshot(result.value), error: null })
    } catch (error) {
      this.setSession(sessionId, { ...before, status: 'error', error: message(error) })
    }
  }

  /** Re-read only surfaces that have already been used after reconnect. */
  resyncLoaded(): void {
    const before = this.store.getSnapshot()
    if (before.catalogStatus !== 'idle') {
      this.publish({ ...before, catalogStatus: 'idle' })
      void this.loadCatalog()
    }
    for (const sessionId of this.loadedSessions) void this.loadSession(sessionId)
  }

  private session(sessionId: string): PersonaSessionState {
    return this.store.getSnapshot().sessions[sessionId] ?? { status: 'idle', snapshot: null, error: null }
  }

  private setSession(sessionId: string, next: PersonaSessionState): void {
    const before = this.store.getSnapshot()
    this.publish({
      ...before,
      sessions: Object.freeze({ ...before.sessions, [sessionId]: Object.freeze(next) }),
    })
  }

  private publish(next: PersonaUiState): void {
    this.store.set(Object.freeze(next))
  }
}
