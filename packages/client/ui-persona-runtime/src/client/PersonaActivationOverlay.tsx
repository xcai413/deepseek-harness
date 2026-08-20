/** Persona activation transition layer.
 *
 * This is intentionally isolated from the selector so Persona switching can
 * evolve into richer visual transitions without coupling runtime selection.
 */

import type { ReactNode } from 'react'

export interface PersonaActivationOverlayProps {
  active: boolean
  personaName?: string
  children?: ReactNode
}

export function PersonaActivationOverlay({
  active,
  personaName,
  children,
}: PersonaActivationOverlayProps) {
  if (!active) return <>{children}</>

  return (
    <div data-persona-transition="active" aria-label={personaName ? `${personaName} online` : 'Persona online'}>
      {children}
    </div>
  )
}
