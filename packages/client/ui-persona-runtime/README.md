# @deepseek-ai/dsh-client-ui-persona-runtime

English | [中文](README.zh.md)

Web surface for the dynamic per-session Persona runtime.

The Node half exposes a narrow `/persona-runtime` Connection RPC bridge over the Host-owned `personaRuntime` service. The browser half contributes a live selector to `conversation.session.header.utilities`. Every selection is Host-authoritative: the browser keeps the previous snapshot while a mutation is in flight and only changes the active Persona after `personaRuntime.activate()` commits.

M1 also projects the committed Persona appearance onto the owning Conversation root. This overlay is deliberately local: it changes only inline background/brand values on the current `[data-phase]` conversation root and restores the exact previous values on Persona change or unmount. It never modifies `document.body`, the global Theme preference, or a Session other than the one rendering the selector.

The two M1 built-ins use generated gradients as a proof of the appearance lane. Pack assets, image/video loading, transitions, Creator, Store, and share/remix are deferred until the runtime and selector contract are stable.

## Model Experience

The UI never constructs model input. Persona behavior is owned by `@deepseek-ai/dsh-persona-runtime`, which commits an agent-scoped `deployment:persona` section inside the Agent maintenance boundary. The Session's normal `request/header` therefore records what the model actually received.

## Known limitations

- No cross-tab live push or dedicated reconnect invalidation yet; mounting or refreshing a Conversation re-reads that Session's Host-authoritative snapshot.
- M1 built-in backgrounds are generated gradients rather than Persona Pack assets.
- The selector exposes Default, JARVIS, and Sherlock only because the runtime registry is still the M1 built-in registry.
- Appearance is a client projection of the committed Host snapshot and carries no independent persistence.
