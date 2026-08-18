import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-persona-runtime'

export const name = 'persona-runtime-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant yet: M1 storage and activation checks are introduced
 * together with the first complete transaction implementation.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
