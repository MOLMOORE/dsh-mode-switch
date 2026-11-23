# 已知限制与设计边界

## 1. 对话开始后换档：当前版本不开放（宿主本身支持）

**先更正 0.4.x 的旧结论。** 本文档曾写「工具目录在首次组装后固定，`restrict()` 只能收紧、disposer 摘不掉」。核对宿主源码（dsh-tools 0.2.2-rc.1）后，这条不成立：

- `ctx.tools.restrict()` 只是用 `layers.effect()` 往 agent 作用域追加一条限制，返回的 disposer 会 `undo()` 掉它（`dsh-scope` 的 `AnonymousEntries.append` 返回幂等 undo），并同步发 `tools/change`。dsh-tools README 原话：*the restriction lifts when disposed*。
- 可见工具集由 `view(scope)` 每次现算，没有 per-agent 的工具目录缓存。
- 真正被「冻结」的只有**单个请求**：`preStep()` 先 `tools.resolve()` → `systemPrompt.assemble()`，**之后**才派发 `agent/pre-step`。所以任何时刻改动限制，都从**下一个请求**开始生效。

旧结论多半是两次观察被合并了：不含 `dispose` 的重复 `restrict()` 确实越叠越紧（这条仍然成立）；而「工具数不回升」当时量的是不带 scope 的 `tools.schemas()`——它读全局表，本来就不受 agent 限制影响。要量效果必须 `schemas(agent)`。

当前版本仍不开放换档，是**产品决定**，不是宿主限制：

- 档位在本插件的语义里是「一场会话的固定属性」：`sessions.json`、chip 的「已应用」、`verify` 的 request/header 证据都按这个假设建立；
- 中途换工具表会让 prompt 前缀缓存失效，模型也可能继续调用旧工具名；
- 没有变更时间线时，`verify` 无法把每个请求归到「当时生效的档位」。

0.5.0 的实现方案见 `docs/ARCHITECTURE.md` §会话中换档。

「没开始 = 可以选」的判定归宿主：`agents.turnBoundaryOf(session)`（0.2.2-rc.5 起；
`dsh-api-session-controller.isBlank()` 用的同一个谓词）。旧的
`sessionProjections.stateOf(session, 'turnBoundary')` 已弃用，rc.5 上会给新会话返回初始态，
照它判断会让每个活跃会话都显示成「已固定」——这正是 2026-11-23 那次「档位按钮全是灰的」。

## 2. 提示段按 `deny` 家族连带裁剪，技能清单不裁

插件对工具调用 `tools.restrict()`，另挂一层 `system-prompt/assemble` 瀑布
（`{ prepend: true }`，只删不增）：`deny` 里形如 `<family>_*` 的规则会一并去掉
属于该家族的提示段。

两处映射是必须的（`SECTION_GROUPS`）：

- section 名常带前缀，按第一个 `:` 之前的部分匹配家族：`office:guide` → `office`；
- 一个插件可能服务多个工具家族：`academic:guide` 同时对应 `paper_*` 与 `zotero_*`，只有两者
  **都**被禁时才删（只禁一个时保留，另一半工具还要靠它）；`mcp-resource-servers` 是宿主给
  所有 MCP 服务器的名字清单，只有 `mcp__*`（全部禁用）才删，单禁一台服务器
  （`mcp__solidworks__*`）不删，否则其余服务器会失去名字。

`diag.promptTrim` 记录最近一次实际删除（会话、家族、段数、字符数），用来区分
「过滤器装上了」和「装上了但一个段都没匹配到」—— 后者曾是两个缺陷之一。

未覆盖的部分：

- 工具 schema 的 token 会降，**技能清单、preset 自带的提示词段落不受影响**
- 贡献者若用了没登记的新 section 名，仍删不到；需要补 `SECTION_ALIASES`
- 该过滤发生在装配结果的最后一层，只保证本插件不破坏他人贡献——别的插件若在更外层再追加，仍会留在结果里

## 3. 投影值 vs 实测值

未应用时 chip 显示的是投影值：`当前可见工具 − 该档 deny 规则`。它与真正应用后的实测值可能差几个工具，因为：

- 有些工具由 preset 行注册（不受全局 deny 影响）
- 有些工具在 agent 作用域动态注册

UI 上 token 一律带 `≈`。

面板里**非当前档**的行是估算：全局注册表里该档保留的工具，**加上本会话的 preset 工具开销**。
preset 工具每个档都有、deny 动不了，所以估算行与 measured 行现在同口径，可以横向比较；
早期版本漏加 preset，导致「办公档 58 个」看起来比「基础档 78 个」还小（实际办公档 113 个，是超集）。

要看**真实**的工具集，用 `GET /api/mode-switch/verify?sessionId=`（面板的「请求证据」一行也是它）：
它读会话日志里的 `request/header`，给出每个请求真正携带的工具数与各档泄漏数。`status.toolCount`
永远只是注册表现状，两者不一致时以 verify 为准。

## 4. 老会话不改写

插件安装前创建的会话不会被裁剪（避免改变既有对话的工具面与缓存），显示为「全量档」。

## 5. 重载后状态重建

"已应用"记录保存在插件内存里，插件重载会丢。此时会话可能短暂显示为未固定；重启 DSH 后按 `sessions.json` 恢复。

## 6. 档位 id 与 preset id 是两套命名

档位 id 形如 `mode-basic`，与官方 preset id（`standard` / `cordis` …）无关。chip 会同时显示两者：`档位 基础档 · 创造模式`。

## 7. 档位不裁 UI 席位（第三方卡片照旧显示）

工具与提示段都能裁，**席位不能**。其它插件挂在 `conversation.input.dock`、`sidebar.panellist`、`main` 等席位上的 UI 组件不由本插件控制：基础档 deny 了 `lunheng_*` 工具、也去掉了论衡提示段，但论衡的「论衡开工」卡片仍会出现在输入框上方。

原因在官方 slots 契约：`ctx.slots` 只暴露 `inject` / `entries` / `entriesOfSlot` / `spec` / `subscribe` / `getVersion` / `snapshot` / `onEntryError`，**没有移除/屏蔽他人条目的 API**；渲染侧 outlet 读的是渲染器内部的 host face，不对插件开放。要真正隐藏这类卡片，只能在该插件侧加开关，或停用/卸载该插件。面板与文档不声称档位能瘦身 UI。

