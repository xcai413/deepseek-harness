/** Package-owned invariant companion for `@deepseek-ai/dsh-persona-runtime`. @module @deepseek-ai/dsh-persona-runtime/invariant */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { personaSelectionSchema } from './spec.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-persona-runtime'

/** Cordis companion plugin name. */
export const name = 'persona-runtime-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Install durable sidecar ↔ live agent binding agreement checks. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('domain/changed', (change: DomainChanged) => {
    if (change.domain !== 'persona_runtime' || change.table !== 'sessions') return
    const sessionId = SessionId(change.key)
    if (ctx.agents.get(sessionId) === undefined) return
    const snapshot = ctx.personaRuntime.snapshot(sessionId)

    switch (change.operation) {
      case 'deleted':
        if (snapshot.active !== null) {
          return fail(`persona sidecar for "${sessionId}" was deleted while live persona "${snapshot.active.id}" remained bound`)
        }
        return
      case 'put': {
        const parsed = personaSelectionSchema.safeParse(change.value)
        if (!parsed.success) {
          return fail(`persona sidecar for "${sessionId}" emitted a value outside the persona selection schema`)
        }
        if (snapshot.active?.id !== parsed.data.personaId) {
          return fail(
            `persona sidecar for "${sessionId}" committed "${parsed.data.personaId}" while live binding is `
            + `${snapshot.active?.id ?? 'default'}`,
          )
        }
        return
      }
      default:
        change satisfies never
    }
  }, { global: true })
}, { inject: ['agents', 'personaRuntime'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
