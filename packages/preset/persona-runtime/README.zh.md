# `@deepseek-ai/dsh-persona-runtime`

DeepSeek Harness 的按 Session 动态 Persona 选择运行时。运行时把现有 Preset / Deployment Persona 保留为继承的默认值，仅在动态 Persona 激活时注册更近一层的 `deployment:persona`。

M1 先内置两个参考 Persona（`persona-pack/jarvis` 与 `persona-pack/sherlock`），用于在加入文件系统 Persona Pack 发现机制之前验证完整运行时路径。

## 运行时模型

每个 live Agent 拥有一个 `PersonaBinding`。默认状态下没有 Agent Scope 的 Persona section。首次激活通过 `agent.ctx.systemPrompt.section()` 注册 `deployment:persona`；后续 Persona 到 Persona 的切换只替换 binding 当前解析后的 Persona。退出 Persona 时释放 Agent Scope section，使 Preset 或 Deployment Persona 自然重新生效。

Persona 变更只允许在 `Agent.runMaintenance()` 内提交。Service 先等待整个 Agent 进入 idle，再占用 maintenance phase，修改 scoped prompt，持久化更新 `persona_runtime` Storage Domain sidecar，并且只在事务成功后暴露新 Snapshot。Storage 写入失败时，会在 maintenance phase 结束前恢复之前的 binding。

选择记录按 `SessionId` 保存，并通过 Session Header 的 `createdAt` 做生命周期隔离，因此复用相同 id 的新 Session 不会误继承旧 Session 的 Persona。没有存储记录即代表继承默认 Persona。

同一个 Session 的激活请求按顺序提交。一个 commit 正在执行时，后续 pending target 会合并为最新目标；在下一次 commit 前被覆盖的调用者，会收到最终保留下来的那次 commit Snapshot。

## API

`ctx.personaRuntime.list()` 返回可选 Persona 的元数据，不暴露模型可见 Prompt 文本。

`ctx.personaRuntime.snapshot(sessionId)` 返回某个 live Agent 当前已提交的 Persona、Appearance 元数据、revision 与非致命 warning。

`ctx.personaRuntime.activate(sessionId, target)` 激活 `{ kind: 'persona', id }`，或通过 `{ kind: 'default' }` 恢复继承默认值。

## 持久化与重放

当前 Persona 选择属于 sidecar 状态，不新增自定义 Session Event。Agent Loop 仍会通过标准 `request/header` 记录模型实际收到的完整 rendered system prompt。因此 Persona 改变后，下一次请求会自然记录 `reason: 'change'`，在不扩展 durable Session event vocabulary 的前提下保留完整模型输入审计能力。

如果保存的 Persona 与当前安装版本或内容 hash 不一致，运行时会恢复当前安装定义并报告 `source-drift`。如果保存的 Persona 已不可用，sidecar 会被保留，Agent 使用继承默认 Persona，并报告 `persona-unavailable`。

## Model Experience

### Dynamic Persona prompt

#### Request context and condition

仅当请求所属 Agent 激活了动态 Persona 时存在该贡献。Default 状态不会由本包增加任何 Persona section。

#### What the model sees

所选 Persona 的已解析 `prompt` 会在该 Agent 上覆盖更近一层的 `deployment:persona`。M1 内置 Persona 分别将模型定义为 JARVIS 或 Sherlock，并加入对应沟通规则。Agent Loop 会在发送请求前把最终完整 System Prompt 写入 `request/header`。

#### Token effect

Persona 激活期间，每次请求都会以所选 Persona Prompt 替换继承的 Persona section。其他 System Prompt section 与 Tool Schema 不变。

#### KV Cache effect

激活或切换 Persona 会替换之前的 System Prompt 片段，因此可能使该位置之后的缓存前缀失效。同一 Persona 不变时，其 Persona 文本保持稳定；动态 Runtime Context 与其他 provider 继续遵循各自的缓存行为。

## Known Limitations and Deferred Work

- **仅有内置 Catalog** — M1 只解析两个代码内参考 Persona；`persona.yaml`、`.dshpersona`、文件系统发现、导入导出、用户 Override 与第三方 Persona 注册后续实现。
- **尚无 Client UI** — M1 Host Runtime 没有 Selector、Background Presenter 或 Transport API；测试直接调用 `ctx.personaRuntime`。
- **Appearance 仅为元数据** — Snapshot 已暴露 Avatar、Background、Accent 引用，但 Web Client 尚未消费。
- **Fork 不继承** — 新 Fork Session 默认没有 Persona sidecar 记录，除非后续 Consumer 显式选择。
- **Capability 元数据延后** — M1 激活 Persona 时不会动态修改或安装 Preset、Skill、Tool 或 MCP Provider。
