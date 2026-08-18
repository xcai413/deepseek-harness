import { describe, expect, it } from 'vitest'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { PersonaUiController } from '../src/client/store.ts'

function success(value: unknown) {
  return { ok: true as const, value }
}

describe('PersonaUiController', () => {
  it('publishes only the Host-committed Persona after activation settles', async () => {
    let finish: ((value: ReturnType<typeof success>) => void) | undefined
    const activation = new Promise<ReturnType<typeof success>>(resolve => { finish = resolve })
    const rpc: ClientConnectionRpc = {
      async call(_channel, endpoint) {
        if (endpoint === 'list') {
          return success([{ ref: { id: 'persona-pack/jarvis', version: '1.0.0' }, name: 'JARVIS' }])
        }
        if (endpoint === 'snapshot') {
          return success({ sessionId: 's1', active: null, appearance: null, revision: 0, warnings: [] })
        }
        if (endpoint === 'activate') return activation
        throw new Error(`unexpected endpoint ${endpoint}`)
      },
    }
    const controller = new PersonaUiController(rpc)
    await controller.loadCatalog()
    await controller.loadSession('s1')

    const pending = controller.activate('s1', { kind: 'persona', id: 'persona-pack/jarvis' })
    expect(controller.store.getSnapshot().sessions.s1?.snapshot?.active).toBeNull()
    expect(controller.store.getSnapshot().sessions.s1?.status).toBe('saving')

    finish?.(success({
      sessionId: 's1',
      active: { id: 'persona-pack/jarvis', version: '1.0.0' },
      appearance: { accent: '#4FD1FF' },
      revision: 1,
      warnings: [],
    }))
    await pending

    expect(controller.store.getSnapshot().sessions.s1?.snapshot?.active?.id).toBe('persona-pack/jarvis')
    expect(controller.store.getSnapshot().sessions.s1?.snapshot?.revision).toBe(1)
  })

  it('keeps the prior authoritative snapshot when activation fails', async () => {
    const rpc: ClientConnectionRpc = {
      async call(_channel, endpoint) {
        if (endpoint === 'snapshot') {
          return success({
            sessionId: 's1',
            active: { id: 'persona-pack/sherlock', version: '1.0.0' },
            appearance: { accent: '#7A3E48' },
            revision: 3,
            warnings: [],
          })
        }
        if (endpoint === 'activate') throw new Error('offline')
        if (endpoint === 'list') return success([])
        throw new Error(`unexpected endpoint ${endpoint}`)
      },
    }
    const controller = new PersonaUiController(rpc)
    await controller.loadSession('s1')
    await controller.activate('s1', { kind: 'default' })

    const session = controller.store.getSnapshot().sessions.s1
    expect(session?.status).toBe('error')
    expect(session?.snapshot?.active?.id).toBe('persona-pack/sherlock')
    expect(session?.error).toBe('offline')
  })
})
