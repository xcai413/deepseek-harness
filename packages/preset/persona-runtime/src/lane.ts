import type { PersonaSnapshot, PersonaTarget } from './types.ts'

interface Waiter {
  readonly resolve: (snapshot: PersonaSnapshot) => void
  readonly reject: (error: unknown) => void
}

interface PendingBatch {
  target: PersonaTarget
  readonly waiters: Waiter[]
}

/** Per-session activation lane that serializes commits and coalesces pending targets. */
export class PersonaActivationLane {
  private pending?: PendingBatch
  private draining = false

  /**
   * @param run - one complete activation transaction for the owning session.
   */
  constructor(private readonly run: (target: PersonaTarget) => Promise<PersonaSnapshot>) {}

  /**
   * Request one target. Requests arriving while another commit runs replace the
   * pending target; all superseded callers settle with the latest pending result.
   * @param target - desired default or persona target.
   * @returns the snapshot after the surviving target commits.
   */
  request(target: PersonaTarget): Promise<PersonaSnapshot> {
    const result = Promise.withResolvers<PersonaSnapshot>()
    const waiter: Waiter = { resolve: result.resolve, reject: result.reject }
    if (this.pending === undefined) {
      this.pending = { target, waiters: [waiter] }
    } else {
      this.pending.target = target
      this.pending.waiters.push(waiter)
    }
    if (!this.draining) void this.drain()
    return result.promise
  }

  private async drain(): Promise<void> {
    this.draining = true
    try {
      while (this.pending !== undefined) {
        const batch = this.pending
        this.pending = undefined
        try {
          const snapshot = await this.run(batch.target)
          for (const waiter of batch.waiters) waiter.resolve(snapshot)
        } catch (error: unknown) {
          for (const waiter of batch.waiters) waiter.reject(error)
        }
      }
    } finally {
      this.draining = false
      if (this.pending !== undefined) void this.drain()
    }
  }
}
