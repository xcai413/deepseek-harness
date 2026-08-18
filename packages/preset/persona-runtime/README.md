# `@deepseek-ai/dsh-persona-runtime`

Dynamic per-session persona selection for DeepSeek Harness. The runtime keeps the existing preset/deployment persona as the inherited default, and installs a nearer `deployment:persona` section only while a dynamic persona is active.

M1 ships two built-in reference personas (`persona-pack/jarvis` and `persona-pack/sherlock`) to prove the runtime path before filesystem Persona Pack discovery is added.

## Runtime model

Each live Agent receives one `PersonaBinding`. Default state has no agent-scoped persona section. The first activation registers `deployment:persona` through `agent.ctx.systemPrompt.section()`; later persona-to-persona switches only replace the binding's current resolved persona. Deactivation disposes the agent-scoped section, exposing the preset or deployment persona again.

Persona changes commit only inside `Agent.runMaintenance()`. The service waits for whole-agent idle, claims the maintenance phase, changes the scoped prompt, durably updates the `persona_runtime` storage-domain sidecar, and publishes the resulting snapshot only after the transaction succeeds. A storage failure restores the previous binding before the maintenance phase ends.

Selections are keyed by `SessionId` and fenced by the Session header's `createdAt`, so a reused id cannot inherit another Session lifecycle's Persona accidentally. No stored row means inherited default behavior.

Pending activation requests are serialized per Session. While one commit is running, later pending targets coalesce to the newest target; callers superseded before the next commit settle with that surviving commit's snapshot.

## API

`ctx.personaRuntime.list()` returns selectable metadata without exposing model-facing prompt text.

`ctx.personaRuntime.snapshot(sessionId)` returns the current committed Persona, appearance metadata, revision, and non-fatal warnings for one live Agent.

`ctx.personaRuntime.activate(sessionId, target)` activates `{ kind: 'persona', id }` or restores `{ kind: 'default' }`.

## Persistence and replay

The current Persona selection is sidecar state, not a custom Session event. The Agent Loop still logs the exact rendered system prompt in its normal `request/header` event. When a Persona changes the next request header therefore records `reason: 'change'`, preserving the model-visible request without extending the durable Session event vocabulary.

A saved Persona whose installed version or content hash changed restores the installed definition and reports `source-drift`. A saved Persona that is no longer available leaves the sidecar intact, runs with inherited default Persona, and reports `persona-unavailable`.

## Model Experience

### Dynamic Persona prompt

#### Request context and condition

The contribution is present only when one dynamic Persona is active for the requesting Agent. Default state contributes no section from this package.

#### What the model sees

The selected Persona's resolved `prompt` replaces the nearer `deployment:persona` section for that Agent. The M1 built-ins identify the model as JARVIS or Sherlock and add their communication rules. The Agent Loop records the resulting full system prompt in `request/header` before dispatch.

#### Token effect

Replaces the inherited Persona section with the selected Persona prompt for each request while active. Other system-prompt sections and tool schemas are unchanged.

#### KV Cache effect

Persona activation or switching replaces an earlier system-prompt segment and can invalidate reuse after that point. Repeated requests under an unchanged Persona retain the same Persona text; dynamic runtime context and other providers retain their own cache behavior.

## Known Limitations and Deferred Work

- **Built-in catalog only** — M1 resolves two in-code reference Personas. `persona.yaml`, `.dshpersona`, filesystem discovery, import/export, user overrides, and third-party Persona registration are deferred.
- **No client UI yet** — the Host runtime has no selector, background presenter, or transport API in M1; tests drive `ctx.personaRuntime` directly.
- **Appearance is metadata only** — snapshots expose avatar/background/accent references, but the Web Client does not consume them yet.
- **No fork inheritance** — a newly forked Session has no Persona sidecar row unless a later consumer explicitly selects one.
- **Capability metadata is deferred** — M1 does not mutate or install presets, skills, tools, or MCP providers during Persona activation.
