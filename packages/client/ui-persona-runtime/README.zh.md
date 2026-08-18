# @deepseek-ai/dsh-client-ui-persona-runtime

[English](README.md) | 中文

动态、按会话生效的 Persona Runtime Web 表层。

Node 半边只做一件事：把 Host 已经拥有的 `personaRuntime` 服务通过一个很窄的 `/persona-runtime` Connection RPC 桥暴露给浏览器。浏览器半边把实时 Persona 选择器贡献到 `conversation.session.header.utilities`。所有切换都以 Host 为权威：写入进行中时浏览器保留旧 Snapshot，只有 `personaRuntime.activate()` 真正提交成功后才更新当前 Persona。

M1 同时把已提交 Persona 的视觉信息投影到当前 Conversation Root。这个 Overlay 严格局部化：只修改当前 `[data-phase]` 会话根节点的 inline background / brand 值，并在切换人格或卸载时精确恢复之前的值。它不会修改 `document.body`，不会修改全局 Theme 偏好，也不会污染另一个 Session。

M1 的两个内置人格暂时用程序生成的渐变背景验证 Appearance 通道。Persona Pack 图片/视频资产、Transition、Creator、Store、Share/Remix 都等 Runtime 与 Selector 契约稳定后再进入。

## 模型体验

UI 不构造任何模型输入。人格行为仍由 `@deepseek-ai/dsh-persona-runtime` 负责：它在 Agent maintenance 边界内提交 agent-scoped `deployment:persona`。因此 Harness 原生 `request/header` 仍然记录模型真正收到的 System Prompt。

## 当前限制

- 暂无跨标签页实时 Push；重连时会重新读取已经用过的 Session 投影。
- M1 背景是程序生成渐变，不是真实 Persona Pack 资产。
- 当前选择器只有 Default、JARVIS、Sherlock，因为 Runtime Registry 仍是 M1 内置 Registry。
- Appearance 只是 Host committed Snapshot 的浏览器投影，没有独立持久化权威。
