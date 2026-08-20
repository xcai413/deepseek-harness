/** Session-header Persona selector plus conversation-scoped appearance projection. */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import {
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PersonaAppearance, PersonaTarget } from '../wire.ts'
import jarvisAvatarUrl from './assets/jarvis/jarvis-avatar.png?dataurl'
import jarvisBackgroundUrl from './assets/jarvis/jarvis-background.png?dataurl'
import { PersonaAvatar } from './PersonaAvatar.tsx'
import type { PersonaStore } from './store.ts'
import css from './PersonaSelector.module.css'

const JARVIS_ID = 'persona-pack/jarvis'
const SHERLOCK_ID = 'persona-pack/sherlock'
const JARVIS_SURFACE_CLASS = css.jarvisSurface!
const ACTIVATION_CLASS = css.activation!

interface BackgroundProjection {
  image: string
  size: string
  position: string
  repeat: string
  blendMode?: string
}

/** Registration-side business face for the header selector. */
export interface PersonaSelectorInjected {
  store: PersonaStore
  loadCatalog: () => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  activate: (sessionId: string, target: PersonaTarget) => Promise<void>
}

/** Minimal owner props supplied by the conversation header slot. */
export interface PersonaSelectorProps extends PersonaSelectorInjected {
  sessionId: string
}

function resolvableImageUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.startsWith('builtin://')) return undefined
  if (
    value.startsWith('data:image/')
    || value.startsWith('blob:')
    || value.startsWith('https://')
    || value.startsWith('http://')
  ) return value
  return undefined
}

function avatarFor(activeId: string | undefined, configured: string | undefined): string | undefined {
  if (activeId === JARVIS_ID) return jarvisAvatarUrl
  return resolvableImageUrl(configured)
}

function appearanceWithResolvedAvatar(
  activeId: string | undefined,
  appearance: PersonaAppearance | null | undefined,
): PersonaAppearance | null {
  if (appearance === undefined || appearance === null) return null
  const avatar = avatarFor(activeId, appearance.avatar)
  if (avatar !== undefined) return { ...appearance, avatar }
  const { avatar: _ignoredAvatar, ...withoutAvatar } = appearance
  return withoutAvatar
}

function backgroundFor(
  activeId: string | undefined,
  configured: string | undefined,
): BackgroundProjection | undefined {
  if (activeId === JARVIS_ID) {
    return {
      // Preserve the cinematic background as the dominant visual. Only the
      // central reading corridor gets a translucent veil; the peripheral
      // command-room details stay crisp and saturated.
      image: [
        'linear-gradient(90deg, rgba(236, 248, 254, 0.16) 0%, rgba(244, 250, 253, 0.28) 15%, rgba(250, 253, 255, 0.60) 29%, rgba(250, 253, 255, 0.64) 68%, rgba(244, 250, 253, 0.32) 86%, rgba(236, 248, 254, 0.14) 100%)',
        `url("${jarvisBackgroundUrl}")`,
      ].join(', '),
      size: '100% 100%, cover',
      position: 'center, center center',
      repeat: 'no-repeat, no-repeat',
      blendMode: 'normal, normal',
    }
  }
  if (activeId === SHERLOCK_ID) {
    return {
      image: 'radial-gradient(circle at 18% 14%, rgba(122, 62, 72, 0.20), transparent 42%), linear-gradient(135deg, rgba(77, 45, 38, 0.10), rgba(116, 87, 57, 0.08))',
      size: 'cover, cover',
      position: 'center, center',
      repeat: 'no-repeat, no-repeat',
    }
  }

  const url = resolvableImageUrl(configured)
  if (url !== undefined) {
    return {
      image: `url("${url}")`,
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
    }
  }
  if (configured?.includes('gradient(') === true) {
    return {
      image: configured,
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
    }
  }
  return undefined
}

/** Apply only the committed Persona appearance to the current conversation root. */
function usePersonaAppearance(
  anchor: RefObject<HTMLSpanElement>,
  activeId: string | undefined,
  appearance: PersonaAppearance | null | undefined,
): void {
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-phase]')
    if (root === undefined || root === null) return
    const background = backgroundFor(activeId, appearance?.background)
    const accent = appearance?.accent
    if (background === undefined && accent === undefined) return

    const previous = {
      backgroundImage: root.style.backgroundImage,
      backgroundSize: root.style.backgroundSize,
      backgroundPosition: root.style.backgroundPosition,
      backgroundRepeat: root.style.backgroundRepeat,
      backgroundBlendMode: root.style.backgroundBlendMode,
      accent: root.style.getPropertyValue('--dsw-alias-state-business-primary'),
      accentPriority: root.style.getPropertyPriority('--dsw-alias-state-business-primary'),
    }

    if (background !== undefined) {
      root.style.backgroundImage = background.image
      root.style.backgroundSize = background.size
      root.style.backgroundPosition = background.position
      root.style.backgroundRepeat = background.repeat
      root.style.backgroundBlendMode = background.blendMode ?? ''
    }
    if (accent !== undefined) root.style.setProperty('--dsw-alias-state-business-primary', accent)
    if (activeId === JARVIS_ID) root.classList.add(JARVIS_SURFACE_CLASS)

    return () => {
      root.style.backgroundImage = previous.backgroundImage
      root.style.backgroundSize = previous.backgroundSize
      root.style.backgroundPosition = previous.backgroundPosition
      root.style.backgroundRepeat = previous.backgroundRepeat
      root.style.backgroundBlendMode = previous.backgroundBlendMode
      root.classList.remove(JARVIS_SURFACE_CLASS)
      if (previous.accent.length === 0) root.style.removeProperty('--dsw-alias-state-business-primary')
      else root.style.setProperty('--dsw-alias-state-business-primary', previous.accent, previous.accentPriority)
    }
  }, [activeId, anchor, appearance?.accent, appearance?.background])
}

/** Run the boot pulse only after a Host-committed revision changes to JARVIS. */
function usePersonaActivation(
  anchor: RefObject<HTMLSpanElement>,
  activeId: string | undefined,
  revision: number | undefined,
): void {
  const previousRevision = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (revision === undefined) return
    if (previousRevision.current === undefined) {
      previousRevision.current = revision
      return
    }
    if (previousRevision.current === revision) return
    previousRevision.current = revision
    if (activeId !== JARVIS_ID) return

    const root = anchor.current?.closest<HTMLElement>('[data-phase]')
    if (root === undefined || root === null) return
    root.classList.remove(ACTIVATION_CLASS)
    void root.offsetWidth
    root.classList.add(ACTIVATION_CLASS)
    const timer = window.setTimeout(() => {
      root.classList.remove(ACTIVATION_CLASS)
    }, 1300)
    return () => {
      window.clearTimeout(timer)
      root.classList.remove(ACTIVATION_CLASS)
    }
  }, [activeId, anchor, revision])
}

/** Render the active Persona as a live Session control. */
export function PersonaSelector({
  sessionId,
  store,
  loadCatalog,
  loadSession,
  activate,
}: PersonaSelectorProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const session = state.sessions[sessionId]
  const snapshot = session?.snapshot ?? null
  const activeId = snapshot?.active?.id
  const active = state.catalog.find(entry => entry.ref.id === activeId)
  const label = active?.name ?? (activeId === undefined ? '默认人格' : activeId)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    void loadCatalog()
    void loadSession(sessionId)
  }, [loadCatalog, loadSession, sessionId])

  usePersonaAppearance(anchorRef, activeId, snapshot?.appearance)
  usePersonaActivation(anchorRef, activeId, snapshot?.revision)

  const busy = session?.status === 'saving' || session?.status === 'loading'
  const selectedId = activeId ?? 'default'
  const error = session?.error ?? state.catalogError
  const warning = snapshot?.warnings.map(entry => entry.message ?? entry.type).join(' · ')
  const avatarAppearance = appearanceWithResolvedAvatar(activeId, snapshot?.appearance)

  const items = [
    { id: 'default', label: '默认人格' },
    ...state.catalog.map(persona => ({
      id: persona.ref.id,
      label: (
        <span className={css.item}>
          <span className={css.itemName}>{persona.name}</span>
          <span className={css.itemMeta}>{persona.ref.id}</span>
        </span>
      ),
    })),
  ]

  return (
    <span ref={anchorRef} className={css.root}>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={items}
        selectedId={selectedId}
        onSelect={(id) => {
          setOpen(false)
          const target: PersonaTarget = id === 'default'
            ? { kind: 'default' }
            : { kind: 'persona', id }
          void activate(sessionId, target)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.trigger}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy || state.catalogStatus === 'loading'}
            title={error ?? warning ?? '切换当前会话人格'}
            onClick={() => { setOpen(value => !value) }}
          >
            <span
              className={css.avatar}
              style={snapshot?.appearance?.accent === undefined
                ? undefined
                : { backgroundColor: snapshot.appearance.accent }}
            >
              <PersonaAvatar appearance={avatarAppearance} label={label} />
            </span>
            <span className={css.label}>{label}</span>
            <IconAgentPresetOutline16 size={14} className={css.personaIcon} />
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
      {error !== null && error !== undefined && <span className={css.error} role="status">!</span>}
    </span>
  )
}
