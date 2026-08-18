# @deepseek-ai/dsh-persona-pack

English | [中文](README.zh.md)

Standalone bundle for the M1 DeepSeek Harness Persona runtime.

The package does not replace DeepSeek Harness core or the Web bundle. Its `cordis.patch.yml` adds exactly two rows to whichever compatible profile installs it:

- `@deepseek-ai/dsh-persona-runtime` — Host-owned per-session identity state, maintenance-bound prompt switching, and durable sidecar selection.
- `@deepseek-ai/dsh-client-ui-persona-runtime` — Web RPC adapter, session-header selector, and conversation-scoped appearance projection.

This packaging is intentional: Persona is an additive Harness capability and should be installable/removable as one community bundle rather than maintained as a fork-only edit to `dsh-web-app`.

M1 currently ships two built-in reference Personas (JARVIS and Sherlock). Persona Pack discovery/import/export is the next runtime milestone after the dynamic switch and UI path are stable.
