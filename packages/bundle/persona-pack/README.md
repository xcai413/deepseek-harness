# @deepseek-ai/dsh-persona-pack

English | [中文](README.zh.md)

Standalone bundle for the M1 DeepSeek Harness Persona runtime.

The package does not replace DeepSeek Harness core or the Web bundle. Its `cordis.patch.yml` adds exactly two rows to whichever compatible profile installs it:

- `@deepseek-ai/dsh-persona-runtime` — Host-owned per-session identity state, maintenance-bound prompt switching, and durable sidecar selection.
- `@deepseek-ai/dsh-client-ui-persona-runtime` — Web RPC adapter, session-header selector, and conversation-scoped appearance projection.

This packaging is intentional: Persona is an additive Harness capability and should be installable/removable as one community bundle rather than maintained as a fork-only edit to `dsh-web-app`.

## Local monorepo development

After `pnpm install` and `pnpm run build` from the DeepSeek Harness repository root, do not boot with `dsh web --patch packages/bundle/persona-pack/cordis.patch.yml`. The Web Profile resolves package names from `$DSH_HOME/profiles/web`, so a raw patch overlay does not automatically resolve these workspace packages from the current monorepo.

Link the three workspace packages into the Web Profile instead:

```bash
pnpm dsh plugin --profile web add link:./packages/preset/persona-runtime link:./packages/client/ui-persona-runtime link:./packages/bundle/persona-pack
pnpm dsh web
```

`dsh plugin` anchors relative path specs to the invoking directory. The Persona bundle then joins the profile bundle stack automatically. The first two packages are plain dependencies rather than bundles, so an informational plain-dependency warning for them is expected.

Remove the development links after testing with:

```bash
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-persona-pack @deepseek-ai/dsh-client-ui-persona-runtime @deepseek-ai/dsh-persona-runtime
```

M1 currently ships two built-in reference Personas (JARVIS and Sherlock). Persona Pack discovery/import/export is the next runtime milestone after the dynamic switch and UI path are stable.
