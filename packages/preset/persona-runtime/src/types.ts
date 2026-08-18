import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** A selectable persona identity. */
export interface PersonaRef {
  readonly id: string
  readonly version: string
}

/** Runtime appearance controlled together with persona selection. */
export interface PersonaAppearance {
  readonly background?: string
  readonly animatedBackground?: string
  readonly avatar?: string
  readonly accent?: string
}

/** Resolved persona content mounted into one agent scope. */
export interface EffectivePersona {
  readonly ref: PersonaRef
  readonly prompt: string
  readonly appearance?: PersonaAppearance
}

/** Persisted per-session persona selection. */
export interface PersonaSelection {
  readonly personaId: string
  readonly personaVersion: string
  readonly manifestHash: string
  readonly revision: number
  readonly updatedAt: number
}

/** Public runtime snapshot. */
export interface PersonaSnapshot {
  readonly sessionId: SessionId
  readonly active: PersonaRef | null
  readonly appearance: PersonaAppearance | null
  readonly revision: number
}
