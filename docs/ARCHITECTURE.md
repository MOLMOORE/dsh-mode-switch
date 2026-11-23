# 架构

## 两个正交的维度

```
官方 preset（standard / ptc / minimal / cordis）
   决定：行为、系统提示词、技能、per-agent 工具
        ×
工具档（基础 / 办公 / 建模 / 全量）
   决定：全局工具里哪些对本次会话可见
```

插件只负责第二个维度，**不声明 preset、不改注册表默认值**。

## 数据流

```
client.js  ──GET /status──▶  index.js ──▶ tools.schemas(agent) / sessions.json
    │                            │
    ├──GET /detail───────────────┤
    ├──GET /verify───────────────┤──▶ session-log.js ──▶ sessions/<ws>/<id>/session.v4.jsonl.zstd
    ├──POST /modes───────────────┤──▶ catalog.json（整表校验后写临时文件再 rename）
    ├──POST /auto────────────────┤──▶ auto.js ──▶ llm.stream（默认路由，只提案不写盘）
    └──POST /select──────────────┘  → sessions.json（仅未开始的会话）
```

`/verify` 是唯一读**真实请求**的入口：它解压会话日志（多帧 zstd），取每个
`request/header` 的工具名再按各档 `deny` 记泄漏数。其余两个接口看的是注册表现状。

catalog 由 `catalog.js` 按 `mtime + size` 记忆读取，改了文件不用重启；
插件加载时还会清理 `sessions.json` 里指向已不存在会话的条目。

面板编辑器走 `POST /api/mode-switch/modes`：一次提交整个档位列表，服务端校验后写临时文件再 rename。
前端的勾选状态换算成 `deny`——保留仍然只排除未勾选工具的通配规则（例如 `lunheng_*`），
其余写成精确名字。这样既能用勾选框编辑，又不会把原来的通配规则一次改烂。

`select` 只记录选择；真正应用发生在 `agent/created` 之后的一个 tick（早于首个请求的 `systemPrompt.assemble()`）：

```
agent/created → setTimeout(0) → applyToolset(agent)       ← 首个请求能赶上的唯一时机
                              → installPromptFilter(agent)
agent/pre-step（turn 1 / step 1）→ 兜底（赶不上首个请求，见 LIMITATIONS）
```

注意这里的「只在 created 应用」是**为了赶上第一个请求**，不是宿主不允许之后再改：
`restrict()` 返回的 disposer 能真正撤掉限制，`view(scope)` 每请求现算，所以同一个
`applyToolset()` 在会话中途再跑一次也能换集合。0.5.0 的换档就是复用它，见下节。

`applyToolset()` 有两个必须保留的约束，它们都是 0.4.3 卡死事故的产物：

- **重入闸 `applying`**：宿主在 `restrict()` 内部**同步**发 `tools/change`
  （`ScopedLayers.effect()` 末尾直接 `onChange()`，`Context.emit()` 同步调监听器），
  disposer 也会发。而 `tools/change` 的回调会对已裁剪的 agent 再 `applyToolset()`，
  所以没有闸就是「裁剪 → emit → 回调 → 再裁剪」的无界递归，每层还跑一次 `tools.schemas()`。
  回归测试里单次事件能跑出 1482 层嵌套 `restrict()`，宿主主线程占死、界面全废且不崩溃。
- **集合相同就不重复应用**：同一个 agent 上不先 `dispose()` 就重复 `restrict()`，
  限制层会一层层叠上去（dispose 能撤，但叠着不撤只会让每次 `schemas()` 越来越慢）；
  比较的是 deny 集合，与顺序无关。
- `dispose()` 必须发生在把该会话移出 `live` **之后**，否则 disposer 同步发的
  `tools/change` 会让回调仍然认为这个会话需要重算。

工具表定稿之后，插件再挂一层 `system-prompt/assemble` 瀑布（`{ prepend: true }`）：
该档 `deny` 里形如 `<family>_*` 的规则同时去掉属于该家族的提示段
（论衡就是靠这条从基础档消失的；它的卡片仍会显示，见 LIMITATIONS §7）。

匹配不是简单的字符串相等，贡献者的 section 名与工具家族并不同名：
按 section 名第一个 `:` 之前的部分比对（`office:guide` → `office`），再走
`SECTION_GROUPS`（`academic` 要 `paper`/`zotero` 同时被禁才删；`mcp-resource-servers`
要 `mcp` 被禁才删）。`diag.promptTrim` 记录最近一次真实删除的段数与字符数，
用来证明过滤器命中了，而不只是「装上了」。

## 为什么用 deny 而不是 allow

`restrict({ allow })` 会连 preset 自带的工具（fs、todo、ask_user…）一起藏掉，因为它们不在"全局工具"名单里。用 `deny` 只影响全局工具，preset 工具原样保留。

## 会话中换档（0.5.0 设计）

宿主允许换档：`restrict()` 的限制是可撤销的图层，工具表每个 step 由 `tools.resolve()` + `assemble()`
现算。所以不需要新 API，只需要让 `applyToolset()` 在会话中途再跑一次，并补上「记录」与「证据」。

**流程**

1. `POST /select` 放开已开始的会话：已有 `applied` 记录就走换档分支，没有记录仍按「开工前选择」处理。
2. 换档 = 对同一个 agent 再跑一次 `applyToolset(agent, newId)`。现有实现已经是
   `live.delete` → `previous.dispose()` → `agent.ctx.tools.restrict({ deny: newDrop })`；
   disposer 从该 agent 的 layer 里删掉旧限制并同步发 `tools/change`，新集合随即生效。
   `drop` 为空时直接不挂新限制，等于「升到全量档」。
3. 提示段：`installPromptFilter()` 目前把档位闭包在创建时的选择上，改成每次装配时读
   `sessions.json` / `live` 的当前档位。`system-prompt/assemble` 本来每个请求都跑，无需重装。
4. 生效时机：点换档 → 立即应用 → **下一个请求**生效（`pre-step` 晚于 `assemble()`）。
   UI 明确写「已切换，下一轮生效」，不要暗示本轮就变。
5. 持久化：条目从 `{ mode, appliedAt }` 扩成
   `{ mode, appliedAt, history: [{ mode, at }] }`，只追加、不删旧记录；
   读到没有 `history` 的老条目按「单档、无变更」解释。
6. 证据：`verify` 用 `request/header` 的序号对齐 `history` 时间线，输出
   `segments: [{ fromRequest, mode, toolCount, leaks }]`；面板从「一个数字」变成分段证据。
7. 告知模型（建议）：在 `system-prompt/assemble` 追加一段 `mode-switch` section：
   「本会话自第 N 轮起档位为 X，被移除的工具已不可调用」，避免模型继续用旧工具名。
8. 代价：换档当轮的请求必然 cache miss。换档确认里提示一次，不要静默。

**边界（不做）**

- 不改 preset、不注册工具，仍然只用 `deny`；preset 与 agent 作用域的工具照旧裁不掉。
- 不在 `agent/pre-step` 里偷偷换档：那是「赶第一个请求」的兜底路径，事后改动会让「谁改的」不可追溯。
- 不提供「回滚到某个历史请求」的能力，只记录、不重放。

**实现要点 / 风险**

- `tools/change` 递归：一次换档会 emit 两次（dispose + restrict），必须继续走 `applying` 闸。
- `restrict()` 对未知名字抛错：`deny` 一律先按可见工具过滤（注意是 `schemas(agent)` 口径）。
- 回归测试加到 `test/gate.test.mjs`：turn 2 换档 → 先 dispose 旧集合、再 restrict 新集合；
  同集合不重复应用；从基础档升到全量档时 `drop` 为空且旧限制被撤。

## 关键文件

| 文件 | 职责 |
|---|---|
| `index.js` | 应用档位、四条路由、会话选择持久化与清理 |
| `client.js` | chip、快速选择胶囊、明细面板（含请求证据行） |
| `catalog.js` | 档位规则读取（mtime 热重载）、`前缀*` 匹配 |
| `session-log.js` | 会话日志解码、`request/header` 证据解析（路由与 CLI 共用） |
| `cordis.patch.yml` | 只注册一行插件 |

## 事件

| 事件 | 用途 |
|---|---|
| `agent/created` | 应用档位（`setTimeout(0)`，唯一能到达首个请求的时机）+ 挂提示段过滤 |
| `agent/pre-step` | 兜底应用（`turn 1 / step 1`，实际只影响第二个请求） |
| `system-prompt/assemble` | 按档位过滤提示段（`{ prepend: true }`，只删不增） |
| `tools/change` | 已应用的 agent 在工具注册变化后重算（只对已裁剪的 agent） |
