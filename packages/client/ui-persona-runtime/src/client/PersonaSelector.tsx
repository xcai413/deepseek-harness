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
import type { PersonaTarget } from '../wire.ts'
import type { PersonaStore } from './store.ts'
import css from './PersonaSelector.module.css'

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

function backgroundFor(id: string | undefined): string | undefined {
  if (id === 'persona-pack/jarvis') {
    return 'radial-gradient(circle at 82% 12%, rgba(79, 209, 255, 0.22), transparent 38%), linear-gradient(135deg, rgba(6, 22, 35, 0.10), rgba(17, 92, 119, 0.08))'
  }
  if (id === 'persona-pack/sherlock') {
    return 'radial-gradient(circle at 18% 14%, rgba(122, 62, 72, 0.20), transparent 42%), linear-gradient(135deg, rgba(77, 45, 38, 0.10), rgba(116, 87, 57, 0.08))'
  }
  return undefined
}

/** Apply only the committed Persona appearance to the current conversation root. */
function usePersonaAppearance(
  anchor: RefObject<HTMLSpanElement>,
  activeId: string | undefined,
  accent: string | undefined,
): void {
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-phase]')
    if (root === undefined || root === null) return
    const backgroundImage = backgroundFor(activeId)
    if (backgroundImage === undefined && accent === undefined) return

    const previous = {
      backgroundImage: root.style.backgroundImage,
      backgroundSize: root.style.backgroundSize,
      backgroundPosition: root.style.backgroundPosition,
      backgroundRepeat: root.style.backgroundRepeat,
      accent: root.style.getPropertyValue('--dsw-alias-state-business-primary'),
      accentPriority: root.style.getPropertyPriority('--dsw-alias-state-business-primary'),
    }

    if (backgroundImage !== undefined) {
      root.style.backgroundImage = backgroundImage
      root.style.backgroundSize = 'cover'
      root.style.backgroundPosition = 'center'
      root.style.backgroundRepeat = 'no-repeat'
    }
    if (accent !== undefined) root.style.setProperty('--dsw-alias-state-business-primary', accent)

    return () => {
      root.style.backgroundImage = previous.backgroundImage
      root.style.backgroundSize = previous.backgroundSize
      root.style.backgroundPosition = previous.backgroundPosition
      root.style.backgroundRepeat = previous.backgroundRepeat
      if (previous.accent.length === 0) root.style.removeProperty('--dsw-alias-state-business-primary')
      else root.style.setProperty('--dsw-alias-state-business-primary', previous.accent, previous.accentPriority)
    }
  }, [accent, activeId, anchor])
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

  usePersonaAppearance(anchorRef, activeId, snapshot?.appearance?.accent)

  const busy = session?.status === 'saving' || session?.status === 'loading'
  const selectedId = activeId ?? 'default'
  const error = session?.error ?? state.catalogError
  const warning = snapshot?.warnings.map(entry => entry.message ?? entry.type).join(' · ')

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
              aria-hidden="true"
            >
              {label.slice(0, 1).toUpperCase()}
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
