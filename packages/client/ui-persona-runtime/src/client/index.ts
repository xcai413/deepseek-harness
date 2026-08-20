/** Browser half of the Persona runtime UI plugin. */

import type { Context } from '@deepseek-ai/cordis'
import './JarvisSidebar.module.css'
import './JarvisFooter.module.css'
import './JarvisSettings.module.css'
import { PersonaSelector } from './PersonaSelector.tsx'
import { JarvisSystemPanel } from './JarvisSystemPanel.tsx'
import type { PersonaSelectorInjected } from './PersonaSelector.tsx'
import type { PersonaRpc } from './store.ts'

export { PersonaSelectorInjected, PersonaSelectorProps } from './PersonaSelector.tsx'
export { PersonaRpc, PersonaSessionState, PersonaUiState } from './store.ts'
export { JarvisSystemPanel } from './JarvisSystemPanel.tsx'

export const inject = ['slots', 'connection']

interface PersonaSlots {
  inject(name: string, install: () => unknown): unknown
  register(config: {
    name: string
    id: string
    order: number
    inject: () => PersonaSelectorInjected
  }, component: unknown): () => void
}

interface ClientSurface {
  get(name: string): unknown
  slots: PersonaSlots
}

export function apply(ctx: Context): void {
  const surface = ctx as unknown as ClientSurface
  const connection = surface.get('connection') as { rpc: PersonaRpc }
  const controller = new PersonaUiController(connection.rpc)

  const injected = (): PersonaSelectorInjected => ({
    store: controller.store,
    loadCatalog: () => controller.loadCatalog(),
    loadSession: sessionId => controller.loadSession(sessionId),
    activate: (sessionId, target) => controller.activate(sessionId, target),
  })

  surface.slots.inject('conversation.session.header.utilities', () => surface.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'persona-runtime',
    order: 10,
    inject: injected,
  }, PersonaSelector))
}
