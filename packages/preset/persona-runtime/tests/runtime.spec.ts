import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import PersonaRuntimeService from '../src/index.ts'

const contexts: Context[] = []
let root: string | undefined

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function createRuntime(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-persona-runtime-'))
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await mountAgentLoopTestDependencies(ctx, {
    systemPrompt: { persona: 'BASE PERSONA' },
  })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(PersonaRuntimeService)
  return ctx
}

async function renderedPrompt(ctx: Context, sessionId: SessionId): Promise<string> {
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error(`missing test agent ${sessionId}`)
  const assembly = await agent.ctx.systemPrompt.assemble(
    assembleContextFor(agent, new AbortController().signal),
  )
  return renderPrompt(assembly)
}

describe('persona runtime', () => {
  it('switches a live agent from inherited default to JARVIS to Sherlock and back', async () => {
    const ctx = await createRuntime()
    const sessionId = SessionId('persona-runtime-switch')
    await ctx.agents.create({ sessionId })

    await expect(renderedPrompt(ctx, sessionId)).resolves.toContain('BASE PERSONA')

    const jarvis = await ctx.personaRuntime.activate(sessionId, {
      kind: 'persona',
      id: 'persona-pack/jarvis',
    })
    expect(jarvis.active?.id).toBe('persona-pack/jarvis')
    expect(await renderedPrompt(ctx, sessionId)).toContain('You are JARVIS')
    expect(await renderedPrompt(ctx, sessionId)).not.toContain('BASE PERSONA')

    const sherlock = await ctx.personaRuntime.activate(sessionId, {
      kind: 'persona',
      id: 'persona-pack/sherlock',
    })
    expect(sherlock.active?.id).toBe('persona-pack/sherlock')
    expect(await renderedPrompt(ctx, sessionId)).toContain('You are Sherlock')
    expect(await renderedPrompt(ctx, sessionId)).not.toContain('You are JARVIS')

    const restored = await ctx.personaRuntime.activate(sessionId, { kind: 'default' })
    expect(restored.active).toBeNull()
    expect(await renderedPrompt(ctx, sessionId)).toContain('BASE PERSONA')
  })

  it('isolates persona state between sessions', async () => {
    const ctx = await createRuntime()
    const first = SessionId('persona-runtime-a')
    const second = SessionId('persona-runtime-b')
    await ctx.agents.create({ sessionId: first })
    await ctx.agents.create({ sessionId: second })

    await ctx.personaRuntime.activate(first, { kind: 'persona', id: 'persona-pack/jarvis' })
    await ctx.personaRuntime.activate(second, { kind: 'persona', id: 'persona-pack/sherlock' })

    expect(await renderedPrompt(ctx, first)).toContain('You are JARVIS')
    expect(await renderedPrompt(ctx, first)).not.toContain('You are Sherlock')
    expect(await renderedPrompt(ctx, second)).toContain('You are Sherlock')
    expect(await renderedPrompt(ctx, second)).not.toContain('You are JARVIS')
  })

  it('rejects an unavailable persona without changing the committed persona', async () => {
    const ctx = await createRuntime()
    const sessionId = SessionId('persona-runtime-missing')
    await ctx.agents.create({ sessionId })
    await ctx.personaRuntime.activate(sessionId, { kind: 'persona', id: 'persona-pack/jarvis' })

    await expect(ctx.personaRuntime.activate(sessionId, {
      kind: 'persona',
      id: 'persona-pack/missing',
    })).rejects.toThrow('persona "persona-pack/missing" is not available')

    expect(ctx.personaRuntime.snapshot(sessionId).active?.id).toBe('persona-pack/jarvis')
    expect(await renderedPrompt(ctx, sessionId)).toContain('You are JARVIS')
  })
})
