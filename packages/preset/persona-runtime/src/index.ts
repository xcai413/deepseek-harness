/**
 * Dynamic per-session persona runtime over agent-scoped prompt overrides.
 * @module @deepseek-ai/dsh-persona-runtime
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { BUILTIN_PERSONAS } from './builtin.ts'
import { PersonaBinding } from './binding.ts'
import { PersonaActivationLane } from './lane.ts'
import { PersonaRegistry } from './registry.ts'
import { personaRuntimeDomainSpec } from './spec.ts'
import type {
  EffectivePersona,
  PersonaDescriptor,
  PersonaSelection,
  PersonaSnapshot,
  PersonaTarget,
  PersonaWarning,
} from './types.ts'

export { personaRuntimeDomainSpec, personaSelectionSchema } from './spec.ts'
export { PersonaRegistry } from './registry.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'persona-runtime'
/** Services required by the runtime. */
export const inject = ['storageDomain', 'agents']

declare module '@deepseek-ai/cordis' {
  interface Context {
    personaRuntime: PersonaRuntimeService
  }
}

interface AgentRuntimeState {
  readonly agent: Agent
  readonly binding: PersonaBinding
  readonly lane: PersonaActivationLane
  revision: number
  warnings: readonly PersonaWarning[]
}

/** Runtime service for dynamic per-session persona selection. */
export class PersonaRuntimeService extends Service {
  static inject = inject

  private readonly registry = new PersonaRegistry(BUILTIN_PERSONAS)
  private readonly states = new Map<SessionId, AgentRuntimeState>()
  private readonly inflight = new Set<Promise<unknown>>()
  private table?: KvTable<SessionId, PersonaSelection>
  private mutationAdmissionOpen = true

  /** @param ctx - host context carrying live agents and storage-domain. */
  constructor(ctx: Context) {
    super(ctx, 'personaRuntime')
  }

  /** Open sidecar storage, restore live agents, and own teardown. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(personaRuntimeDomainSpec)
    this.table = domain.table('sessions')

    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.allSettled([...this.inflight])
      for (const state of this.states.values()) state.binding.clear()
      this.states.clear()
      await domain.close()
    }, 'persona-runtime.domainClose')

    for (const agent of this.ctx.agents.list()) this.bindAgentSafely(agent)
    this.ctx.on('agent/created', ({ agent }) => { this.bindAgentSafely(agent) })
    this.ctx.on('agent/disposed', ({ agent }) => { this.states.delete(agent.id) })
  }

  /**
   * List selectable personas without exposing their model-facing prompt text.
   * @returns immutable descriptors in registry order.
   */
  list(): readonly PersonaDescriptor[] {
    return this.registry.list()
  }

  /**
   * Return current committed runtime state for one live session.
   * @param sessionId - live agent/session identity.
   * @returns immutable snapshot.
   * @throws when no live agent is registered for the id.
   */
  snapshot(sessionId: SessionId): PersonaSnapshot {
    const state = this.requireState(sessionId)
    return this.snapshotOf(state)
  }

  /**
   * Activate a persona or restore inherited default behavior for one live session.
   * Concurrent requests serialize per session; pending requests coalesce to the
   * latest target while an earlier commit is already running.
   * @param sessionId - live agent/session identity.
   * @param target - desired default or persona id.
   * @returns the committed snapshot.
   */
  activate(sessionId: SessionId, target: PersonaTarget): Promise<PersonaSnapshot> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('persona runtime is shutting down'))
    }
    const state = this.requireState(sessionId)
    const operation = state.lane.request(target)
    this.inflight.add(operation)
    void operation.finally(() => { this.inflight.delete(operation) }).catch(() => {})
    return operation
  }

  private bindAgentSafely(agent: Agent): void {
    try {
      this.bindAgent(agent)
    } catch (error: unknown) {
      this.ctx.logger.warn(`persona-runtime: failed to restore agent "${agent.id}": ${String(error)}`)
    }
  }

  private bindAgent(agent: Agent): void {
    if (this.states.has(agent.id)) return
    const binding = new PersonaBinding(agent)
    let state: AgentRuntimeState
    const lane = new PersonaActivationLane(target => this.commit(state, target))
    state = {
      agent,
      binding,
      lane,
      revision: 0,
      warnings: Object.freeze([]),
    }
    this.states.set(agent.id, state)
    this.restoreSelection(state)
  }

  private restoreSelection(state: AgentRuntimeState): void {
    const selection = this.requireTable().get(state.agent.id)
    if (selection === undefined || selection.sessionCreatedAt !== state.agent.session.header.createdAt) return

    state.revision = selection.revision
    const persona = this.registry.get(selection.personaId)
    if (persona === undefined) {
      state.warnings = Object.freeze([{
        code: 'persona-unavailable',
        message: `Persona ${selection.personaId} is not available; using inherited default persona.`,
      }])
      return
    }

    state.binding.apply(persona)
    state.warnings = this.sourceWarnings(selection, persona)
  }

  private async commit(state: AgentRuntimeState, target: PersonaTarget): Promise<PersonaSnapshot> {
    if (!this.mutationAdmissionOpen) throw new Error('persona runtime is shutting down')
    const persona = target.kind === 'default' ? null : this.requirePersona(target.id)

    for (;;) {
      await state.agent.whenIdle()
      try {
        return await state.agent.runMaintenance(async (signal) => {
          signal.throwIfAborted()
          if (!this.mutationAdmissionOpen) throw new Error('persona runtime is shutting down')

          const previous = state.binding.active
          const previousWarnings = state.warnings
          const previousRevision = state.revision
          const revision = previousRevision + 1
          if (!Number.isSafeInteger(revision)) throw new Error('persona revision exhausted safe integer range')

          state.binding.restore(persona)
          try {
            signal.throwIfAborted()
            if (persona === null) {
              await this.requireTable().delete(state.agent.id)
            } else {
              await this.requireTable().put(state.agent.id, this.selectionOf(state.agent, persona, revision))
            }
          } catch (error: unknown) {
            state.binding.restore(previous)
            state.warnings = previousWarnings
            state.revision = previousRevision
            throw error
          }

          state.revision = revision
          state.warnings = Object.freeze([])
          return this.snapshotOf(state)
        })
      } catch (error: unknown) {
        if (this.isMaintenanceRace(state.agent, error)) continue
        throw error
      }
    }
  }

  private selectionOf(agent: Agent, persona: EffectivePersona, revision: number): PersonaSelection {
    return Object.freeze({
      sessionCreatedAt: agent.session.header.createdAt,
      personaId: persona.ref.id,
      personaVersion: persona.ref.version,
      manifestHash: persona.manifestHash,
      revision,
      updatedAt: Date.now(),
    })
  }

  private sourceWarnings(selection: PersonaSelection, persona: EffectivePersona): readonly PersonaWarning[] {
    if (selection.personaVersion === persona.ref.version && selection.manifestHash === persona.manifestHash) {
      return Object.freeze([])
    }
    return Object.freeze([{
      code: 'source-drift',
      message: `Persona ${persona.ref.id} changed from the version recorded for this session; the installed definition is active.`,
    }])
  }

  private snapshotOf(state: AgentRuntimeState): PersonaSnapshot {
    const active = state.binding.active
    return Object.freeze({
      sessionId: state.agent.id,
      active: active?.ref ?? null,
      appearance: active?.appearance ?? null,
      revision: state.revision,
      warnings: state.warnings,
    })
  }

  private requireState(sessionId: SessionId): AgentRuntimeState {
    const state = this.states.get(sessionId)
    if (state === undefined) throw new Error(`persona runtime has no live agent "${sessionId}"`)
    return state
  }

  private requirePersona(id: string): EffectivePersona {
    const persona = this.registry.get(id)
    if (persona === undefined) throw new Error(`persona "${id}" is not available`)
    return persona
  }

  private requireTable(): KvTable<SessionId, PersonaSelection> {
    if (this.table === undefined) throw new Error('persona runtime storage is not initialized')
    return this.table
  }

  private isMaintenanceRace(agent: Agent, error: unknown): boolean {
    return error instanceof Error && error.message === `agent "${agent.id}" already has active work`
  }
}

export default PersonaRuntimeService
