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
import sidebarCss from './JarvisSidebar.module.css'

const JARVIS_ID = 'persona-pack/jarvis'
const SHERLOCK_ID = 'persona-pack/sherlock'
const JARVIS_SURFACE_CLASS = css.jarvisSurface!
const JARVIS_CONSOLE_CLASS = css.jarvisConsole!
const JARVIS_OVERLAY_CLASS = css.jarvisOverlay!
const JARVIS_PORTAL_CLASS = css.jarvisPortal!
const JARVIS_SIDEBAR_CLASS = sidebarCss.jarvisSidebar!
const ACTIVATION_CLASS = css.activation!
const JARVIS_HUD_CLASS = css.jarvisHud!
const JARVIS_HUD_TOP_CLASS = css.jarvisHudTop!
const JARVIS_HUD_NAME_CLASS = css.jarvisHudName!
const JARVIS_HUD_DOT_CLASS = css.jarvisHudDot!
const JARVIS_HUD_STATUS_CLASS = css.jarvisHudStatus!
const JARVIS_HUD_META_CLASS = css.jarvisHudMeta!
const JARVIS_HUD_TRACE_CLASS = css.jarvisHudTrace!

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
      // Keep the command-room image crisp. The title wash stays shallow while
      // a slightly stronger center scrim protects long-form transcript contrast.
      image: [
        'linear-gradient(180deg, rgba(239, 248, 252, 0.46) 0%, rgba(239, 248, 252, 0.18) 44px, rgba(239, 248, 252, 0.00) 86px)',
        'linear-gradient(90deg, rgba(1, 9, 17, 0.14) 0%, rgba(1, 11, 20, 0.48) 24%, rgba(2, 14, 25, 0.64) 50%, rgba(1, 11, 20, 0.48) 76%, rgba(1, 9, 17, 0.14) 100%)',
        `url("${jarvisBackgroundUrl}")`,
      ].join(', '),
      size: '100% 100%, 100% 100%, cover',
      position: 'center top, center, center center',
      repeat: 'no-repeat, no-repeat, no-repeat',
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

function mountJarvisHud(root: HTMLElement): () => void {
  const hud = document.createElement('div')
  hud.className = JARVIS_HUD_CLASS
  hud.dataset.personaHud = 'jarvis'
  hud.setAttribute('aria-hidden', 'true')

  const top = document.createElement('div')
  top.className = JARVIS_HUD_TOP_CLASS

  const name = document.createElement('span')
  name.className = JARVIS_HUD_NAME_CLASS
  name.textContent = 'J.A.R.V.I.S'

  const dot = document.createElement('span')
  dot.className = JARVIS_HUD_DOT_CLASS

  const status = document.createElement('span')
  status.className = JARVIS_HUD_STATUS_CLASS
  status.textContent = 'ONLINE'

  top.append(name, dot, status)

  const meta = document.createElement('div')
  meta.className = JARVIS_HUD_META_CLASS
  meta.textContent = 'SESSION LINKED  //  CORE NOMINAL'

  const trace = document.createElement('div')
  trace.className = JARVIS_HUD_TRACE_CLASS

  hud.append(top, meta, trace)
  root.append(hud)

  return () => { hud.remove() }
}

/** Find the AppFrame without importing layout internals or relying on hashed classes. */
function findAppFrame(root: HTMLElement): HTMLElement | null {
  let candidate = root.parentElement
  while (candidate !== null) {
    const ownsShellOverlay = Array.from(candidate.children).some(child =>
      child instanceof HTMLElement && child.hasAttribute('data-shell-overlay'))
    if (ownsShellOverlay) return candidate
    candidate = candidate.parentElement
  }
  return null
}

/**
 * Project the active session Persona onto the shell's real sidebar column.
 * The sidebar is a sibling of Conversation, so descendant selectors from the
 * conversation root cannot reach it. AppFrame's first child is the sidebar
 * column by contract; cleanup restores the shell as soon as this session stops
 * owning JARVIS.
 */
function mountJarvisSidebar(root: HTMLElement): () => void {
  const frame = findAppFrame(root)
  const first = frame?.firstElementChild
  const sidebar = first instanceof HTMLElement ? first : null
  if (sidebar === null) return () => {}

  sidebar.classList.add(JARVIS_SIDEBAR_CLASS)
  sidebar.dataset.personaSidebar = 'jarvis'

  return () => {
    sidebar.classList.remove(JARVIS_SIDEBAR_CLASS)
    delete sidebar.dataset.personaSidebar
  }
}

/**
 * Theme transient composer-owned overlays without mutating the global Harness
 * theme. In-place listboxes are tagged through the active composer subtree;
 * body-portaled Menu cards are accepted only when their geometry is adjacent
 * to this conversation's composer, so unrelated sidebar/header menus stay
 * untouched. All tags are removed when JARVIS leaves the session.
 */
function mountJarvisOverlays(root: HTMLElement, composerCard: HTMLElement | null): () => void {
  const tagged = new Set<HTMLElement>()
  let firstFrame: number | undefined
  let secondFrame: number | undefined

  const tag = (element: HTMLElement, className: string): void => {
    if (element.classList.contains(className)) return
    element.classList.add(className)
    tagged.add(element)
  }

  const tagComposerOverlays = (): void => {
    if (composerCard === null) return

    for (const listbox of composerCard.querySelectorAll<HTMLElement>('[role="listbox"]')) {
      const card = listbox.parentElement
      if (card instanceof HTMLElement && card !== composerCard) tag(card, JARVIS_OVERLAY_CLASS)
    }

    for (const menu of composerCard.querySelectorAll<HTMLElement>('[role="menu"]')) {
      if (menu !== composerCard) tag(menu, JARVIS_OVERLAY_CLASS)
    }
  }

  const tagNearbyPortals = (): void => {
    if (composerCard === null) return
    const composerRect = composerCard.getBoundingClientRect()

    for (const menu of document.body.querySelectorAll<HTMLElement>(':scope > [role="menu"]')) {
      if (root.contains(menu)) continue
      const menuRect = menu.getBoundingClientRect()
      if (menuRect.width === 0 || menuRect.height === 0) continue

      const overlapsConsoleX = menuRect.right >= composerRect.left - 80
        && menuRect.left <= composerRect.right + 80
      const nearConsoleY = menuRect.bottom >= composerRect.top - 440
        && menuRect.top <= composerRect.bottom + 96
      if (overlapsConsoleX && nearConsoleY) tag(menu, JARVIS_PORTAL_CLASS)
    }
  }

  const scan = (): void => {
    tagComposerOverlays()
    tagNearbyPortals()
  }

  const scheduleScan = (): void => {
    if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame)
    if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame)
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(scan)
    })
  }

  const rootObserver = new MutationObserver(scheduleScan)
  const bodyObserver = new MutationObserver(scheduleScan)
  rootObserver.observe(root, { childList: true, subtree: true })
  bodyObserver.observe(document.body, { childList: true })
  scan()
  scheduleScan()

  return () => {
    rootObserver.disconnect()
    bodyObserver.disconnect()
    if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame)
    if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame)
    for (const element of tagged) {
      element.classList.remove(JARVIS_OVERLAY_CLASS)
      element.classList.remove(JARVIS_PORTAL_CLASS)
    }
  }
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

    let composerCard: HTMLElement | null = null
    if (activeId === JARVIS_ID) {
      root.classList.add(JARVIS_SURFACE_CLASS)
      composerCard = root.querySelector<HTMLElement>('[data-composer-card]')
      composerCard?.classList.add(JARVIS_CONSOLE_CLASS)
    }
    const unmountHud = activeId === JARVIS_ID ? mountJarvisHud(root) : undefined
    const unmountSidebar = activeId === JARVIS_ID ? mountJarvisSidebar(root) : undefined
    const unmountOverlays = activeId === JARVIS_ID
      ? mountJarvisOverlays(root, composerCard)
      : undefined

    return () => {
      unmountOverlays?.()
      unmountSidebar?.()
      unmountHud?.()
      composerCard?.classList.remove(JARVIS_CONSOLE_CLASS)
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
