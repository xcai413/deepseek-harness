import type { Agent } from '@deepseek-ai/dsh-agent'
import { PERSONA_ORDER, PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type { EffectivePersona } from './types.ts'

interface PersonaHolder {
  current: EffectivePersona
}

interface PersonaBindingState {
  readonly persona: EffectivePersona | null
  readonly exitGuard: boolean
}

const EXIT_GUARD_SECTION = 'persona-runtime-exit-guard'
const EXIT_GUARD_ORDER = PERSONA_ORDER + 1
const EXIT_GUARD_PROMPT = [
  'Dynamic Persona mode is OFF for this session.',
  'Use the inherited/base Harness persona as the current identity and behavior contract.',
  'Earlier assistant messages that self-identified as JARVIS, Sherlock, or any other dynamic persona are historical outputs only.',
  'Do not continue, imitate, or claim a previous dynamic persona identity unless the inherited/base persona explicitly requires it.',
  'If asked who you are, answer only from the inherited/base Harness persona that is active now.',
].join('\n')

/** Agent-scoped prompt binding for one live session. */
export class PersonaBinding {
  private holder: PersonaHolder | undefined
  private disposePrompt: (() => void) | undefined
  private disposeExitGuard: (() => void) | undefined

  /**
   * @param agent - live agent whose nearest prompt scope owns the override.
   */
  constructor(private readonly agent: Agent) {}

  /** Current effective persona, or `null` when the agent inherits its preset/deployment persona. */
  get active(): EffectivePersona | null {
    return this.holder?.current ?? null
  }

  /** Capture the exact prompt binding state for transaction rollback. */
  capture(): PersonaBindingState {
    return Object.freeze({
      persona: this.active,
      exitGuard: this.disposeExitGuard !== undefined,
    })
  }

  /**
   * Apply one dynamic persona. The first persona installs one scoped section;
   * later switches update the holder read at prompt assembly time.
   * @param persona - resolved effective persona.
   */
  apply(persona: EffectivePersona): void {
    this.clearExitGuard()
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

  /** Remove all runtime-owned prompt sections. Used only for teardown and exact rollback. */
  clear(): void {
    this.clearPersona()
    this.clearExitGuard()
  }

  /**
   * Restore a previously captured binding state after a failed activation transaction.
   * @param state - exact previous runtime-owned prompt state.
   */
  restoreCaptured(state: PersonaBindingState): void {
    this.clear()
    if (state.persona !== null) {
      this.apply(state.persona)
      return
    }
    if (state.exitGuard) this.installExitGuard()
  }

  /**
   * Restore a persona or transition back to inherited default behavior.
   * Returning to default keeps an exit guard after removing the dynamic persona
   * so recent assistant history cannot silently preserve the old identity.
   * @param persona - target persona, or `null` for inherited default behavior.
   */
  restore(persona: EffectivePersona | null): void {
    if (persona !== null) {
      this.apply(persona)
      return
    }

    const leavingDynamicPersona = this.holder !== undefined
    this.clearPersona()
    if (leavingDynamicPersona) this.installExitGuard()
  }

  private clearPersona(): void {
    const disposePrompt = this.disposePrompt
    this.holder = undefined
    this.disposePrompt = undefined
    disposePrompt?.()
  }

  private installExitGuard(): void {
    if (this.disposeExitGuard !== undefined) return
    this.disposeExitGuard = this.agent.ctx.systemPrompt.section({
      name: EXIT_GUARD_SECTION,
      order: EXIT_GUARD_ORDER,
      text: EXIT_GUARD_PROMPT,
    })
  }

  private clearExitGuard(): void {
    const disposeExitGuard = this.disposeExitGuard
    this.disposeExitGuard = undefined
    disposeExitGuard?.()
  }
}
