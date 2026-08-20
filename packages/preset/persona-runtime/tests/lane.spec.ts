import { describe, expect, it } from 'vitest'
import type { PersonaSnapshot, PersonaTarget } from '../src/types.ts'
import { PersonaActivationLane } from '../src/lane.ts'

function snapshot(id: string | null, revision: number): PersonaSnapshot {
  return {
    sessionId: 'lane-test' as PersonaSnapshot['sessionId'],
    active: id === null ? null : { id, version: '1.0.0' },
    appearance: null,
    revision,
    warnings: [],
  }
}

describe('PersonaActivationLane', () => {
  it('serializes one running commit and coalesces later pending targets', async () => {
    const starts: PersonaTarget[] = []
    const gates: Array<ReturnType<typeof Promise.withResolvers<void>>> = []
    let revision = 0
    const lane = new PersonaActivationLane(async (target) => {
      starts.push(target)
      const gate = Promise.withResolvers<void>()
      gates.push(gate)
      await gate.promise
      revision += 1
      return snapshot(target.kind === 'default' ? null : target.id, revision)
    })

    const first = lane.request({ kind: 'persona', id: 'persona-pack/jarvis' })
    await Promise.resolve()
    const second = lane.request({ kind: 'persona', id: 'persona-pack/sherlock' })
    const third = lane.request({ kind: 'default' })

    expect(starts).toEqual([{ kind: 'persona', id: 'persona-pack/jarvis' }])
    gates[0]?.resolve()
    await first
    await Promise.resolve()

    expect(starts).toEqual([
      { kind: 'persona', id: 'persona-pack/jarvis' },
      { kind: 'default' },
    ])
    gates[1]?.resolve()

    await expect(second).resolves.toMatchObject({ active: null, revision: 2 })
    await expect(third).resolves.toMatchObject({ active: null, revision: 2 })
  })
})
