/** Browser-safe wire shapes for the Persona runtime UI bridge. */

/** Stable Persona identity on the wire. */
export interface PersonaRef {
  id: string
  version: string
}

/** Conversation-scoped visual hints committed with one Persona selection. */
export interface PersonaAppearance {
  background?: string
  animatedBackground?: string
  avatar?: string
  accent?: string
}

/** Selectable Persona metadata. */
export interface PersonaDescriptor {
  ref: PersonaRef
  name: string
  appearance?: PersonaAppearance
}

/** Runtime warning attached to an authoritative snapshot. */
export interface PersonaWarning {
  type: string
  message?: string
}

/** Host-authoritative per-session Persona snapshot. */
export interface PersonaSnapshot {
  sessionId: string
  active: PersonaRef | null
  appearance: PersonaAppearance | null
  revision: number
  warnings: readonly PersonaWarning[]
}

/** Requested runtime target. */
export type PersonaTarget =
  | { kind: 'default' }
  | { kind: 'persona'; id: string }

/** RPC endpoints exposed by the Node half of this package. */
export type PersonaRpcEndpoint = 'list' | 'snapshot' | 'activate'
