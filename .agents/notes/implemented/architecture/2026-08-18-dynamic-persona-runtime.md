# Agent Note: Dynamic per-session Persona runtime

Status: implemented

## Problem

The existing `@deepseek-ai/dsh-persona` package is a composition-authored Preset row: it contributes one fixed `deployment:persona` section before an Agent is published. It correctly supports static per-Agent identity, but it cannot represent a user switching a live Session from one Persona to another without rebuilding the Agent composition. A Persona product also needs durable per-Session selection, isolation between simultaneous Sessions, and a transaction boundary that never changes identity halfway through a model turn.

## Decision

Dynamic Persona selection lives in the separate `@deepseek-ai/dsh-persona-runtime` package. The existing `dsh-persona` row remains static and unchanged.

A live dynamic Persona is an Agent-scope override. `PersonaBinding` registers the existing `PERSONA_SECTION`/`PERSONA_ORDER` through `agent.ctx.systemPrompt.section()`. The first activation installs that nearest-scope section, Persona-to-Persona switches replace the binding holder's current resolved Persona, and Default disposes the section so the parent Preset or Deployment Persona becomes visible again.

Persona changes are serialized per Session and commit only inside `Agent.runMaintenance()`. The runtime first waits for whole-Agent idle, claims the maintenance phase, changes the scoped binding, then durably writes or deletes the Session's sidecar record. A failed durable write restores the previous binding before maintenance releases the Agent. Once the storage write has succeeded, cancellation no longer rolls the committed Persona back.

The current selection is stored in the `persona_runtime` Storage Domain rather than a new Session Event. Each row is keyed by `SessionId` and carries the Session header `createdAt` to fence reused ids to one Session lifecycle. Absence means Default. The Agent Loop continues to log the exact rendered system prompt in its existing `request/header`; a Persona change therefore remains reconstructable as model-visible request state without extending the durable Session Event vocabulary.

The M1 registry contains two in-code reference Personas only. Persona Pack filesystem discovery, import/export, overrides, capability requirements, transport, and client appearance rendering are separate later layers over the runtime.

## Alternatives considered

**Turn Persona Pack into another Agent Preset.** Rejected because Preset composition is intentionally stable for an existing Session, and rebuilding a live Session's tool/prompt composition would violate the current lifecycle model.

**Modify `@deepseek-ai/dsh-persona` to become dynamic.** Rejected because that package has a narrow, useful responsibility as a static composable row. Runtime state, persistence, request serialization, and client-facing selection would couple unrelated lifecycle concerns into the Preset row.

**Append a custom `persona/selected` Session Event.** Rejected for M1 because downstream plugins do not yet have a safe durable event-registration surface for readers that do not know the event type. Persona selection is sidecar state; the model-visible effect is still logged through the standard `request/header` snapshot.

**Change the global System Prompt or global UI Theme.** Rejected because simultaneous Sessions may use different Personas. The model identity belongs to `agent.ctx`, and later appearance presentation must be Session scoped rather than a browser-global preference mutation.

**Call an LLM directly from the Persona plugin.** Rejected because it would create a parallel conversation runtime like an application-specific roleplay panel instead of changing the actual Harness Agent identity, tools, transcript, and request logging path.

## Consequences

The implementation does not change Agent Loop, Session Core, System Prompt Core, or the static Persona row. Default is structurally represented by absence of an Agent-scope override, so parent composition automatically returns when a dynamic Persona is cleared.

`runMaintenance()` gives Persona activation a model-request exclusion window: waking input can queue but cannot start a Turn until the Persona transaction settles. Storage Domain durability and prompt rollback keep the live binding and persisted selection aligned at the commit boundary.

The sidecar is intentionally not the audit source for model input. Replay and diagnostics continue to use `request/header`, while the sidecar answers only which Persona should be restored for the current Session lifecycle.

M1 gives up automatic fork inheritance and third-party Persona discovery. A fork has a new Session id and therefore starts at Default until a later consumer explicitly selects or copies a Persona. The built-in registry exists only to prove `Default → Persona A → Persona B → Default` before the packaging and client layers are added.
