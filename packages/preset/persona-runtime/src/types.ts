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

/** Selectable metadata exposed without the persona's model-facing prompt. */
export interface PersonaDescriptor {
  readonly ref: PersonaRef
  readonly name: string
  readonly appearance?: PersonaAppearance
}

/** Resolved persona content mounted into one agent scope. */
export interface EffectivePersona {
  readonly ref: PersonaRef
  readonly name: string
  readonly prompt: string
  readonly appearance?: PersonaAppearance
  readonly manifestHash: string
}

/** Desired runtime target. `default` means no dynamic agent-scoped override. */
export type PersonaTarget =
  | { readonly kind: 'default' }
  | { readonly kind: 'persona'; readonly id: string }

/** Persisted per-session persona selection fenced to one Session lifecycle. */
export interface PersonaSelection {
  readonly sessionCreatedAt: number
  readonly personaId: string
  readonly personaVersion: string
  readonly manifestHash: string
  readonly revision: number
  readonly updatedAt: number
}

/** Non-fatal runtime condition reported with a committed snapshot. */
export interface PersonaWarning {
  readonly code: 'persona-unavailable' | 'source-drift'
  readonly message: string
}

/** Public runtime snapshot. */
export interface PersonaSnapshot {
  readonly sessionId: SessionId
  readonly active: PersonaRef | null
  readonly appearance: PersonaAppearance | null
  readonly revision: number
  readonly warnings: readonly PersonaWarning[]
}
