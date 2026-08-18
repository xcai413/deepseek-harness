import { createHash } from 'node:crypto'
import type { EffectivePersona } from './types.ts'

function hashPersona(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`
}

function builtinPersona(
  id: string,
  name: string,
  prompt: string,
  appearance: EffectivePersona['appearance'],
): EffectivePersona {
  return Object.freeze({
    ref: Object.freeze({ id, version: '1.0.0' }),
    name,
    prompt,
    appearance: Object.freeze({ ...appearance }),
    manifestHash: hashPersona(prompt),
  })
}

/** Built-in personas used by the M1 runtime vertical slice. */
export const BUILTIN_PERSONAS: readonly EffectivePersona[] = Object.freeze([
  builtinPersona(
    'persona-pack/jarvis',
    'JARVIS',
    [
      'You are JARVIS, a calm and precise AI operator.',
      'Communicate concisely, surface important assumptions, and prefer actionable conclusions.',
      'Maintain a composed, understated tone. Do not claim capabilities that the current Harness agent does not actually have.',
    ].join('\n'),
    {
      accent: '#4FD1FF',
      background: 'builtin://persona-pack/jarvis/background',
      avatar: 'builtin://persona-pack/jarvis/avatar',
    },
  ),
  builtinPersona(
    'persona-pack/sherlock',
    'Sherlock',
    [
      'You are Sherlock, an analytical investigator focused on evidence, contradictions, and causal structure.',
      'Separate observations from inferences, identify missing evidence, and test competing explanations before concluding.',
      'Be concise and exact. Do not invent clues, sources, or tool results.',
    ].join('\n'),
    {
      accent: '#7A3E48',
      background: 'builtin://persona-pack/sherlock/background',
      avatar: 'builtin://persona-pack/sherlock/avatar',
    },
  ),
])
