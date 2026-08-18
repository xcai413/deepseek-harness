import type { Agent } from '@deepseek-ai/dsh-agent'
import { PERSONA_ORDER, PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type { EffectivePersona } from './types.ts'

interface PersonaHolder {
  current: EffectivePersona
}

/** Agent-scoped prompt binding for one live session. */
export class PersonaBinding {
  private holder?: PersonaHolder
  private disposePrompt?: () => void

  /**
   * @param agent - live agent whose nearest prompt scope owns the override.
   */
  constructor(private readonly agent: Agent) {}

  /** Current effective persona, or `null` when the agent inherits its preset/deployment persona. */
  get active(): EffectivePersona | null {
    return this.holder?.current ?? null
  }

  /**
   * Apply one dynamic persona. The first persona installs one scoped section;
   * later switches update the holder read at prompt assembly time.
   * @param persona - resolved effective persona.
   */
  apply(persona: EffectivePersona): void {
    if (this.holder !== undefined) {
      this.holder.current = persona
      return
    }

    const holder: PersonaHolder = { current: persona }
    const disposePrompt = this.agent.ctx.systemPrompt.section({
      name: PERSONA_SECTION,
      order: PERSONA_ORDER,
      text: () => holder.current.prompt,
    })
    this.holder = holder
    this.disposePrompt = disposePrompt
  }

  /** Remove the dynamic override so the parent preset/deployment persona becomes visible again. */
  clear(): void {
    const disposePrompt = this.disposePrompt
    this.holder = undefined
    this.disposePrompt = undefined
    disposePrompt?.()
  }

  /**
   * Restore a previously captured binding state after a failed activation transaction.
   * @param persona - previous persona, or `null` for inherited default behavior.
   */
  restore(persona: EffectivePersona | null): void {
    if (persona === null) {
      this.clear()
      return
    }
    this.apply(persona)
  }
}
