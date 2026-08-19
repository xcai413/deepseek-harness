import type { CSSProperties, ReactNode } from 'react'
import type { PersonaAppearance } from '../wire.ts'

export interface PersonaAppearanceProps {
  appearance: PersonaAppearance | null
  children?: ReactNode
}

/**
 * Minimal appearance projection layer.
 *
 * Keeps visual identity separate from chat UI so future versions can add
 * upload, animation and transition effects without changing persona runtime.
 */
export function PersonaAppearance({ appearance, children }: PersonaAppearanceProps) {
  const style = {
    '--persona-accent': appearance?.accent ?? undefined,
    '--persona-background': appearance?.background
      ? `url(${appearance.background})`
      : undefined,
  } as CSSProperties

  return (
    <div className="personaAppearance" style={style}>
      {children}
    </div>
  )
}
