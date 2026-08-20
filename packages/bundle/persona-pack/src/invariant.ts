/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-persona-pack`.
 * @module @deepseek-ai/dsh-persona-pack/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-persona-pack'

/** Cordis companion plugin name. */
export const name = 'persona-pack-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * The bundle itself owns no mutable runtime state: its two rows delegate state
 * ownership to persona-runtime and ui-persona-runtime, which carry their own
 * invariant companions.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
