import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { PersonaSelection } from './types.ts'

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Durable persona selection schema. */
export const personaSelectionSchema = z.object({
  sessionCreatedAt: safeInteger,
  personaId: z.string().min(1),
  personaVersion: z.string().min(1),
  manifestHash: z.string().min(1),
  revision: safeInteger,
  updatedAt: safeInteger,
}) satisfies z.ZodType<PersonaSelection>

/** One lifecycle-bound persona selection row per session. */
export const personaRuntimeDomainSpec = defineDomain({
  name: 'persona_runtime',
  version: 0,
  tables: {
    sessions: domainTable<SessionId, PersonaSelection>(personaSelectionSchema),
  },
})
