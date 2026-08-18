/** Browser half of the Persona runtime UI plugin. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PersonaSelector } from './PersonaSelector.tsx'
import type { PersonaSelectorInjected } from './PersonaSelector.tsx'
import { PersonaUiController, type PersonaRpc } from './store.ts'

export type { PersonaSelectorInjected, PersonaSelectorProps } from './PersonaSelector.tsx'
export type { PersonaRpc, PersonaSessionState, PersonaUiState } from './store.ts'

/** Required browser services. */
export const inject = ['slots', 'connection']

/** Mount one live Persona selector into every conversation header. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as { rpc: PersonaRpc }
  const controller = new PersonaUiController(connection.rpc)

  ctx.on('connection/reset', () => { controller.resyncLoaded() })

  const injected = (): PersonaSelectorInjected => ({
    hooks: { personaUi: controller.store },
    loadCatalog: () => controller.loadCatalog(),
    loadSession: sessionId => controller.loadSession(sessionId),
    activate: (sessionId, target) => controller.activate(sessionId, target),
  })

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'persona-runtime',
    order: 10,
    inject: injected,
  }, PersonaSelector))
}
