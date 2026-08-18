import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { assembleContextFor } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as PersonaUiNode from '../../../client/ui-persona-runtime/src/index.ts'
import PersonaRuntimeService from '../../../preset/persona-runtime/src/index.ts'

let root: string | undefined
const contexts: Context[] = []

type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult>

const handlers = new Map<string, RpcHandler>()

const ConnectionStub = {
  name: 'persona-pack-test-connection',
  apply(ctx: Context): void {
    ctx.provide('connection', {
      rpc: {
        handle(channel: string, handler: RpcHandler): () => void {
          handlers.set(channel, handler)
          return () => { handlers.delete(channel) }
        },
      },
    } as never)
  },
}

afterEach(async () => {
  handlers.clear()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function moduleNamesFromBundlePatch(text: string): string[] {
  return [...text.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1] as string)
}

async function loadComposition(configPath: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-persona-runtime', PersonaRuntimeService],
    ['@deepseek-ai/dsh-client-ui-persona-runtime', PersonaUiNode],
    ['persona-pack-test-connection', ConnectionStub],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

describe('standalone Persona Pack bundle composition', () => {
  it('loads the bundle-declared runtime and UI adapter and switches Persona through RPC', async () => {
    const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const bundleRows = moduleNamesFromBundlePatch(patchText)
    expect(bundleRows).toEqual([
      '@deepseek-ai/dsh-persona-runtime',
      '@deepseek-ai/dsh-client-ui-persona-runtime',
    ])

    root = await mkdtemp(join(tmpdir(), 'dsh-persona-pack-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-storage'",
      "- name: '@deepseek-ai/dsh-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'storage'))}`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      '    backend: json',
      "- name: '@deepseek-ai/dsh-llm'",
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      '  config:',
      '    persona: BASE PERSONA',
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-agent'",
      "- name: '@deepseek-ai/dsh-agent-loop'",
      '  config:',
      '    agents: []',
      "- name: 'persona-pack-test-connection'",
      ...bundleRows.map(name => `- name: '${name}'`),
      '',
    ].join('\n'))

    const ctx = await loadComposition(configPath)
    const rpc = handlers.get('/persona-runtime')
    expect(rpc).toBeDefined()

    const listResult = await rpc?.('list', {}, new AbortController().signal)
    expect(listResult).toMatchObject({ ok: true })
    if (listResult?.ok !== true || !Array.isArray(listResult.value)) {
      throw new Error('Persona list RPC did not return the expected catalog')
    }
    expect(listResult.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'JARVIS' }),
      expect.objectContaining({ name: 'Sherlock' }),
    ]))

    const sessionId = SessionId('bundle-persona-rpc')
    const handle = await ctx.agents.create({ sessionId })
    const before = renderPrompt(await handle.agent.ctx.systemPrompt.assemble(
      assembleContextFor(handle.agent, new AbortController().signal),
    ))
    expect(before).toContain('BASE PERSONA')

    const activation = await rpc?.('activate', {
      sessionId,
      target: { kind: 'persona', id: 'persona-pack/jarvis' },
    }, new AbortController().signal)
    expect(activation).toMatchObject({ ok: true })

    const after = renderPrompt(await handle.agent.ctx.systemPrompt.assemble(
      assembleContextFor(handle.agent, new AbortController().signal),
    ))
    expect(after).toContain('You are JARVIS')
    expect(after).not.toContain('BASE PERSONA')
  })
})
