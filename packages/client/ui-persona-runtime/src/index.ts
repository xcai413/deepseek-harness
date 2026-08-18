/** Node half of the Persona runtime UI plugin: a narrow browser RPC adapter. */

import type { Context } from '@deepseek-ai/cordis'
import type { PersonaRuntimeService } from '@deepseek-ai/dsh-persona-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PersonaTarget } from './wire.ts'

/** Stable Cordis plugin name. */
export const name = 'client-ui-persona-runtime'
/** Runtime and transport required by the Node adapter. */
export const inject = ['connection', 'personaRuntime']

type HostRpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

type HostRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<HostRpcResult>

interface HostConnectionShape {
  rpc: {
    handle(
      channel: string,
      handler: HostRpcHandler,
      options: { authority: 'trusted-host' },
    ): () => void
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function readSessionId(payload: unknown): string {
  const value = record(payload)?.sessionId
  if (typeof value !== 'string' || value.length === 0) throw new Error('persona runtime requires a non-empty sessionId')
  return value
}

function readTarget(payload: unknown): PersonaTarget {
  const target = record(record(payload)?.target)
  if (target?.kind === 'default') return { kind: 'default' }
  if (target?.kind === 'persona' && typeof target.id === 'string' && target.id.length > 0) {
    return { kind: 'persona', id: target.id }
  }
  throw new Error('persona runtime target must be default or a persona id')
}

/** Register the private RPC channel consumed by this package's browser half. */
export function apply(ctx: Context): void {
  const runtime = ctx.get('personaRuntime') as PersonaRuntimeService
  const connection = ctx.get('connection') as HostConnectionShape
  const handler: HostRpcHandler = async (endpoint, payload, signal) => {
    if (signal.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'persona request cancelled', details: {} } }
    }
    try {
      switch (endpoint) {
        case 'list':
          return { ok: true, value: runtime.list() }
        case 'snapshot': {
          const sessionId = SessionId(readSessionId(payload))
          return { ok: true, value: runtime.snapshot(sessionId) }
        }
        case 'activate': {
          const sessionId = SessionId(readSessionId(payload))
          const target = readTarget(payload)
          return { ok: true, value: await runtime.activate(sessionId, target) }
        }
        default:
          return {
            ok: false,
            error: { code: 'internal', message: `unknown persona runtime endpoint: ${endpoint}`, details: {} },
          }
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: error instanceof Error ? error.message : String(error),
          details: {},
        },
      }
    }
  }

  ctx.effect(
    () => connection.rpc.handle('/persona-runtime', handler, { authority: 'trusted-host' }),
    'ui-persona-runtime: RPC bridge',
  )
}
