# Agent Note: Dynamic per-session Persona runtime

Status: implemented

## Problem

现有 `@deepseek-ai/dsh-persona` 是由 Composition 配置的 Preset Row：它会在 Agent 发布之前贡献一个固定的 `deployment:persona` section。它适合静态的 per-Agent Identity，但无法表达用户在不重建 Agent Composition 的情况下，把一个已经运行的 Session 从一个 Persona 切换到另一个 Persona。Persona 产品还需要持久化的 per-Session 选择、多个同时运行 Session 之间的隔离，以及一个不会在模型 Turn 中途改变身份的事务边界。

## Decision

动态 Persona 选择由独立的 `@deepseek-ai/dsh-persona-runtime` 包负责。现有 `dsh-persona` Row 保持静态且不修改。

Live Dynamic Persona 是 Agent Scope Override。`PersonaBinding` 通过 `agent.ctx.systemPrompt.section()` 注册现有的 `PERSONA_SECTION` / `PERSONA_ORDER`。第一次激活安装最近作用域的 section；Persona 到 Persona 的切换只替换 binding holder 当前解析出的 Persona；切回 Default 时释放该 section，使父层 Preset 或 Deployment Persona 自然重新可见。

Persona 变更按 Session 串行，并且只允许在 `Agent.runMaintenance()` 内提交。Runtime 先等待整个 Agent idle，再占用 maintenance phase，修改 scoped binding，然后持久化写入或删除该 Session 的 sidecar 记录。Durable Write 失败时，会在 maintenance 释放 Agent 前恢复之前的 binding。Storage 写入已经成功后，后续 cancellation 不再把已提交 Persona 回滚。

当前选择存入 `persona_runtime` Storage Domain，而不是新增 Session Event。每条记录以 `SessionId` 为 key，并携带 Session Header 的 `createdAt`，用于把复用 id 隔离到具体 Session Lifecycle。没有记录即表示 Default。Agent Loop 继续通过现有 `request/header` 记录模型真正收到的完整 rendered system prompt，因此 Persona 改变仍然可以作为 Model-visible Request State 被重建，而不需要扩展 Durable Session Event Vocabulary。

M1 Registry 只包含两个代码内 Reference Persona。Persona Pack 文件系统发现、导入导出、Override、Capability Requirement、Transport 与 Client Appearance Rendering 都属于后续独立层。

## Alternatives considered

**把 Persona Pack 做成另一个 Agent Preset。** 不采用，因为 Preset Composition 对已有 Session 本来就要求稳定；为 Live Session 重建 Tool / Prompt Composition 会违反当前生命周期模型。

**直接把 `@deepseek-ai/dsh-persona` 改成动态。** 不采用，因为该包作为静态可组合 Row 的职责清晰且有价值。Runtime State、Persistence、Request Serialization 和 Client-facing Selection 会把互不相关的生命周期职责耦合进 Preset Row。

**新增 `persona/selected` Session Event。** M1 不采用，因为 Downstream Plugin 当前还没有安全的 Durable Event Registration Surface，旧 Reader 无法认识新增事件类型。Persona Selection 使用 Sidecar；真正 Model-visible 的效果仍然通过标准 `request/header` Snapshot 记录。

**修改全局 System Prompt 或全局 UI Theme。** 不采用，因为多个并行 Session 可以选择不同 Persona。模型 Identity 属于 `agent.ctx`，未来 Appearance Presentation 也必须按 Session 隔离，而不能修改 Browser-global Preference。

**Persona Plugin 自己直接调用 LLM。** 不采用，因为这样会形成一个类似独立 Roleplay Panel 的并行 Conversation Runtime，而不是改变真实 Harness Agent 的 Identity、Tools、Transcript 与 Request Logging Path。

## Consequences

实现不修改 Agent Loop、Session Core、System Prompt Core 或静态 Persona Row。Default 在结构上就是“没有 Agent Scope Override”，因此清除 Dynamic Persona 后，父层 Composition 会自动恢复。

`runMaintenance()` 为 Persona Activation 提供模型请求排他窗口：Waking Input 可以排队，但在 Persona Transaction 结束前不会启动 Turn。Storage Domain Durability 与 Prompt Rollback 让 Live Binding 和 Persisted Selection 在 Commit Boundary 保持一致。

Sidecar 明确不是模型输入的审计来源。Replay 与 Diagnostics 继续依赖 `request/header`；Sidecar 只回答当前 Session Lifecycle 应恢复哪个 Persona。

M1 暂时放弃自动 Fork 继承和第三方 Persona Discovery。Fork 获得新的 Session id，因此默认从 Default 开始，除非后续 Consumer 显式选择或复制 Persona。Built-in Registry 只用于证明 `Default → Persona A → Persona B → Default`，之后再增加 Packaging 和 Client Layer。
