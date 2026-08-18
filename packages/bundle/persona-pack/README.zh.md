# @deepseek-ai/dsh-persona-pack

[English](README.md) | 中文

DeepSeek Harness Persona Runtime M1 的独立 Bundle。

这个包不替换 DeepSeek Harness Core，也不修改官方 Web Bundle。它的 `cordis.patch.yml` 只向安装它的兼容 Profile 增加两行能力：

- `@deepseek-ai/dsh-persona-runtime`：Host 权威的按 Session 人格状态、maintenance 边界内 Prompt 切换、sidecar 持久化。
- `@deepseek-ai/dsh-client-ui-persona-runtime`：Web RPC 适配、会话 Header 选择器、Conversation Scope 的视觉投影。

这种打包方式是刻意的：Persona 应该是一个可以一键安装/卸载的 Harness 社区能力，而不是长期维护在 `dsh-web-app` 里的 Fork 魔改。

## Monorepo 本地联调

从 DeepSeek Harness 仓库根目录完成 `pnpm install` 和 `pnpm run build` 后，不要直接使用 `dsh web --patch packages/bundle/persona-pack/cordis.patch.yml`。Web Profile 的模块解析锚点位于 `$DSH_HOME/profiles/web`，直接叠加 patch 时其中的 workspace 包名不会自动从当前 monorepo 解析。

开发时把三个 workspace 包以本地 link 方式加入 Web Profile：

```bash
pnpm dsh plugin --profile web add link:./packages/preset/persona-runtime link:./packages/client/ui-persona-runtime link:./packages/bundle/persona-pack
pnpm dsh web
```

`dsh plugin` 会把相对路径锚定到命令调用目录；Persona Bundle 会自动加入该 Profile 的 bundle layer stack。前两个包不是 Bundle，pnpm/DSH 对它们显示 plain dependency 提示是预期行为。

完成本地联调后可以移除：

```bash
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-persona-pack @deepseek-ai/dsh-client-ui-persona-runtime @deepseek-ai/dsh-persona-runtime
```

M1 暂时内置 JARVIS 和 Sherlock 两个 Reference Persona。动态切换与 UI 通路稳定之后，下一个 Runtime 里程碑才是 Persona Pack 的文件发现、导入和导出。
