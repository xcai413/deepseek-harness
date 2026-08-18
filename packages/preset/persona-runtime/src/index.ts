import { Service, type Context } from '@deepseek-ai/cordis'
import { PERSONA_ORDER, PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PersonaRef, PersonaSnapshot } from './types.ts'

export { personaRuntimeDomainSpec } from './spec.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'persona-runtime'
/** Services required by the runtime. */
export const inject = ['storageDomain', 'agents']

/** Runtime configuration. */
export interface Config {}

/** Runtime service for dynamic per-agent persona selection. */
export class PersonaRuntimeService extends Service {
  static inject = inject

  private readonly agents = new Map<string, { dispose?: () => void; active: PersonaRef | null }>()

  constructor(ctx: Context) {
    super(ctx, 'personaRuntime')
  }

  protected async [Service.init](): Promise<void> {
    // First implementation stage: lifecycle wiring only.
    // Storage opening and activation transactions are added in the next commit.
    this.ctx.on('agent/created', ({ agent }) => {
      this.bindAgent(agent)
    })
  }

  /** Return current runtime state for one agent. */
  snapshot(agent: Agent): PersonaSnapshot {
    return {
      sessionId: agent.id,
      active: this.agents.get(agent.id)?.active ?? null,
      appearance: null,
      revision: 0,
    }
  }

  /** Placeholder activation entry point for the M1 transaction implementation. */
  async activate(_agent: Agent, _persona: PersonaRef | null): Promise<void> {
    await Promise.resolve()
  }

  private bindAgent(agent: Agent): void {
    if (this.agents.has(agent.id)) return
    this.agents.set(agent.id, { active: null })
    // Reserved for the scoped deployment:persona override disposer.
    void PERSONA_SECTION
    void PERSONA_ORDER
  }
}

export default PersonaRuntimeService
