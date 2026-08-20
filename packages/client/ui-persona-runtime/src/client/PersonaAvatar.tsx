import type { PersonaAppearance } from '../wire.ts'

export interface PersonaAvatarProps {
  appearance: PersonaAppearance | null
  label: string
}

/**
 * Renders Persona identity separately from the selector control.
 *
 * The first version intentionally supports static assets only. Future layers
 * can add animated avatars, transitions and generated assets without changing
 * Persona runtime contracts.
 */
export function PersonaAvatar({ appearance, label }: PersonaAvatarProps) {
  if (appearance?.avatar !== undefined) {
    return (
      <img
        src={appearance.avatar}
        alt={label}
        width={32}
        height={32}
        loading="lazy"
      />
    )
  }

  return <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
}
