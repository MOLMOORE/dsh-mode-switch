# 已知限制与设计边界

## 1. 对话开始后不能切换档位

DSH 在 agent 第一次组装请求时固定工具目录（为稳定请求缓存），之后：

- `ctx.tools.restrict()` 的限制层是**叠加**的：能继续收紧，无法放宽
- 实测 `restrict()` 返回的 disposer 调用不报错，但限制摘不掉（工具数不回升）

所以档位是**开工前的决策**。中途换需求 → 新开会话。

## 2. 提示段按 `deny` 家族连带裁剪，技能清单不裁

插件对工具调用 `tools.restrict()`，另挂一层 `system-prompt/assemble` 瀑布
（`{ prepend: true }`，只删不增）：`deny` 里形如 `<family>_*` 的规则会一并去掉
名为 `<family>` 的提示段（例如 `lunheng_*` → 去掉论衡附加的那段）。

未覆盖的部分：

- 工具 schema 的 token 会降，**技能清单、preset 自带的提示词段落不受影响**
- 只有「名字与工具家族一致」的提示段会被删；贡献者用了别的 section 名就删不到
- 该过滤发生在装配结果的最后一层，只保证本插件不破坏他人贡献——别的插件若在更外层再追加，仍会留在结果里

## 3. 投影值 vs 实测值

未应用时 chip 显示的是投影值：`当前可见工具 − 该档 deny 规则`。它与真正应用后的实测值可能差几个工具，因为：

- 有些工具由 preset 行注册（不受全局 deny 影响）
- 有些工具在 agent 作用域动态注册

UI 上 token 一律带 `≈`。

## 4. 老会话不改写

插件安装前创建的会话不会被裁剪（避免改变既有对话的工具面与缓存），显示为「全量档」。

## 5. 重载后状态重建

"已应用"记录保存在插件内存里，插件重载会丢。此时会话可能短暂显示为未固定；重启 DSH 后按 `sessions.json` 恢复。

## 6. 档位 id 与 preset id 是两套命名

档位 id 形如 `mode-basic`，与官方 preset id（`standard` / `cordis` …）无关。chip 会同时显示两者：`档位 基础档 · 创造模式`。

## 7. 档位不裁 UI 席位（第三方卡片照旧显示）

工具与提示段都能裁，**席位不能**。其它插件挂在 `conversation.input.dock`、`sidebar.panellist`、`main` 等席位上的 UI 组件不由本插件控制：基础档 deny 了 `lunheng_*` 工具、也去掉了论衡提示段，但论衡的「论衡开工」卡片仍会出现在输入框上方。

原因在官方 slots 契约：`ctx.slots` 只暴露 `inject` / `entries` / `entriesOfSlot` / `spec` / `subscribe` / `getVersion` / `snapshot` / `onEntryError`，**没有移除/屏蔽他人条目的 API**；渲染侧 outlet 读的是渲染器内部的 host face，不对插件开放。要真正隐藏这类卡片，只能在该插件侧加开关，或停用/卸载该插件。面板与文档不声称档位能瘦身 UI。

