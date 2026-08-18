import type { EffectivePersona, PersonaDescriptor } from './types.ts'

/** Immutable catalog and resolver for currently installed personas. */
export class PersonaRegistry {
  private readonly personas = new Map<string, EffectivePersona>()

  /**
   * Create one registry from already validated persona definitions.
   * @param personas - personas available to this runtime instance.
   */
  constructor(personas: readonly EffectivePersona[]) {
    for (const persona of personas) {
      if (this.personas.has(persona.ref.id)) {
        throw new Error(`persona "${persona.ref.id}" is registered more than once`)
      }
      this.personas.set(persona.ref.id, persona)
    }
  }

  /**
   * Resolve one persona id.
   * @param id - stable persona id.
   * @returns the persona, or `undefined` when unavailable.
   */
  get(id: string): EffectivePersona | undefined {
    return this.personas.get(id)
  }

  /**
   * Return current selectable persona metadata.
   * @returns a fresh immutable descriptor list in registration order.
   */
  list(): readonly PersonaDescriptor[] {
    return Object.freeze([...this.personas.values()].map(persona => Object.freeze({
      ref: persona.ref,
      name: persona.name,
      appearance: persona.appearance,
    })))
  }
}
