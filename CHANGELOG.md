# 变更记录

## 0.2.0 — 2026-11-04

把「档位到底有没有到线上」从命令行搬到插件里，并让规则与会话记录自己保持干净。

### 新增
- **`GET /api/mode-switch/verify?sessionId=`**：读该会话的日志（多帧 zstd），逐个 `request/header` 返回真实工具数、各档的 deny 泄漏数、首个请求与记录的档位。这是「档位真的到达请求」的唯一硬证据；`status.toolCount` 只是注册表现状。
- **面板新增「请求证据」一行**：展开明细时显示「首个请求带 N 个工具 · 本档泄漏 M」，不用再开终端跑脚本。
- **`session-log.js`**：会话日志解码 + 证据解析抽成模块，`scripts/verify-session-tools.mjs` 改为复用它（消除两份解码实现）。

### 变更
- **catalog 热重载**：`loadCatalog` 按 `mtime + size` 记忆，改 `catalog.json` 不再需要重启 DSH；半写坏/解析失败时保留上一份好副本，不会把所有会话打回默认规则。
- **sessions.json 自动清理**：插件加载时删除指向已不存在会话目录的记录（`diag.prunedSessions` 记录数量）；非 `session-` 前缀的键一律不动，sessions 目录为空/不存在时也不清理。

### 测试
- `test/gate.test.mjs` 新增：请求证据解析（工具数/泄漏/字符串工具）、catalog 热重载与坏文件回退、会话记录清理（保留活会话与非会话键）。

### 未做
- 面板「请求证据」与热重载都依赖新宿主代码；本机仍在跑 0.1.2，重启 DSH 后才生效。

## 0.1.2 — 2026-11-04

基础档不再给模型读论衡的提示段（方案 C 的可行一半），并如实登记席位那半裁不掉。

### 新增
- **提示段过滤**：在 agent 作用域挂 `system-prompt/assemble` 瀑布（`{ prepend: true }`），`await next()` 后删掉与本档 `deny` 家族同名的 section。规则从 deny 前缀推导：`lunheng_*` → 删 `lunheng` 段；办公档不 deny 论衡，提示段照旧保留。只删不增，其它贡献者与变量原样透传。
- `sectionFamilies()` / `trimPromptSections()` 导出为纯函数，`test/gate.test.mjs` 覆盖「基础档删段 / 办公档保留 / 其它 section 与 variables 不受影响 / created 路径确实挂上且 prepend」四类断言。
- `status.diag.promptFilter` 记录最近一次挂载（sessionId + families）。

### 调查结论（方案 C：能否在插件侧裁掉别家的提示/席位）
- **提示段可行**：host 的事件契约是 `system-prompt/assemble(assembly, context, next)` 三参 waterfall；`{ prepend: true }` 能把本插件放在最外层，`next()` 的返回值已包含被裁插件追加的 section（论衡在 `lib/index.js` 里追加 `{ name: 'lunheng', text }`，识别键现成）。
- **席位不可行**：`ctx.slots` 只暴露 `inject` / `entries` / `entriesOfSlot` / `spec` / `subscribe` / `getVersion` / `snapshot` / `onEntryError`，没有移除或屏蔽他人条目的 API；outlet 读的是渲染器内部 host face，插件侧够不到。「论衡开工」卡片因此继续显示，见 `docs/LIMITATIONS.md §7`。
- 要连卡片一起干净，只能走方案 B（fork/改 lunheng，升级即覆盖）。

### 未做
- 尚未在真机新会话里验证：本轮改动只到单测层（`node test/gate.test.mjs`），首个请求的提示段是否真的少了论衡段，需新开一个基础档会话后看装配结果/截图确认。

## 0.1.1 — 2026-11-04

修复「档位只显示、不生效」：0.1.0 的档位在任何会话里都从未真正裁剪过工具。

### 修复
- **档位从未被套用**：0.1.0 用 `sessionBlank()` 做前置换档判据，但 harness 的 `turn()` 先 `append("turn/start")` 再 `dispatch("agent/pre-step")`，所以 `agent/pre-step` 里 `turnBoundary.openTurnStartSeq` 永远非 null，`sessionBlank()` 恒为 false，`ensureToolset()` 每次都被跳过。改为按步位置门控：只在本会话 `turn === 1 && step === 1`（首次组装前）套用一次。
- **首个请求仍带全量工具**（比上一条更深）：harness 在派发 `agent/pre-step` **之前**就调用 `systemPrompt.assemble()` 把工具表定稿，因此在 pre-step 里 `restrict()` 只对**第二个请求**生效——一轮一步的任务等于完全没裁。改为在 `agent/created` 后延迟一个 tick 套用（唯一早于首次 assemble 的时机，且此时 agent scope 已可安全 restrict），pre-step 路径保留为兜底。
- **新增 `scripts/verify-session-tools.mjs`**：解压会话日志、数出每个 `request/header` 真正发送的工具个数（以及对各档位的 deny 泄漏数）。这是「档位是否真的到了线上」的唯一硬证据；`status` 的 `toolCount` 只代表注册表现状。
- **`agent/created` 载荷解构修复**：该事件的载荷是 `{ agent, source, signal }`，0.1.1 早期版本把它当成了 agent 对象本身，导致「创建时裁剪」静默失败（`diag.lastError` 报 `reading 'tools'`）。在此之前所有会话的首个请求仍是 198 个工具。
- **首个请求实测**（`session-8fc87b03`）：`request/header.tools` = **62 个，deny 泄漏 0**。修复前的对照（`session-f2fb63ce` / `session-b3534105`）首个请求都是 198 个、泄漏 136 个。
- **`status` 增加 `diag`**（最近 20 次套用记录 + 最后一次错误），便于排查 `restrict()` 在哪些会话上失败。
- **未应用的会话被显示成所选档位**：`displayedToolset()` 原先无条件采用 `sessions.json` 里的偏好，导致旧会话（如 0.1.0 期间写入 `mode-basic`）标着基础档、实际带着 201 个工具。现在存储值只在「已应用」或「会话仍空白」时生效，其余一律读作全量档。
- **面板数字自相矛盾**：`detail` 里 current 行拿实测工具数（201）当所选档位的数字，其余档位只返回全局估算字段，渲染成「—」。现在每档统一返回 `tools/estimatedTokens`，实测（已应用）与估算（`≈`）区分显示。
- `displayedToolset()` 补上缺失的 `ctx` 形参（0.1.0 里引用未定义变量，异常被 `catch` 吞掉后恒返回全量档）。

### 新增
- `status` 增加 `applied` / `nextSessionOnly` / `pendingToolset`：胶囊在「选了档但本会话未应用」时显示 **所选「基础档」未生效 · 需新会话**，不再把投影值伪装成实测值。
- 面板标题行改为「实际可见 N 个工具」。
- `sessions.json` 新增「已应用」记录（`{ mode, appliedAt }` 对象，纯字符串仍表示"只选了没套用"）：插件重载后已裁剪的会话不再被读成全量档。
- 未裁剪会话的档位估算改用该会话自己的 schema 列表作基数（含 preset / agent 级工具），面板数字与实测值差距从 3 倍收到个位数。

## 0.1.0 — 2026-11-04

首个可用版本：**档位 = 每会话的工具集裁剪**，与官方 preset 正交。

### 新增
- Host 半：按会话记录档位选择，在 agent 的第一步之前用 `ctx.tools.restrict()` 应用一次
- Client 半：composer 上方 dock 的档位胶囊（主胶囊 + 四个快速选择胶囊）
- 主胶囊展开面板：各档位的工具数与 token、当前会话逐工具开销
- 三条 HTTP 接口：`status` / `detail` / `select`
- `catalog.json`：用户可编辑的档位规则（工具名前缀匹配）
- `sessions.json`：每会话的档位选择

### 决策
- **不声明 preset**：早期版本把档位实现成 4 条 preset，结果顶掉了官方的标准/PTC/极简/创造模式，且和官方模式挤在同一个下拉里。改为"插件只裁工具、preset 保持官方"。
- **档位在开工前确定**：实测工具目录在 agent 首次组装后固定，`restrict()` 的 disposer 调用不报错但摘不掉限制（只能叠加）。因此对话开始后不再允许切档。
- **默认基础档**：未选择时在第一条消息前套基础档，避免用户忘记选而吃满 54.8k。
- **老会话不改写**：插件安装前创建的会话保持原工具集，显示为「全量档」。

### 修复
- `restrict()` 在 `agent/created` 里同步调用会让 scope 二次绑定，直接导致**新建会话失败**（`scope key is already bound to a parent`）。改为延迟到 `agent/pre-step`。
- 诊断代码误访问未注入的 `ctx.scope`，让 select 接口返回 500。
- 未应用的档位被显示成"已应用"（旧会话误标基础档）；改为区分「已应用 / 投影 / 全量」。
- chip 在 preset 未解析完成时闪现「未知档位」；改为显示「读取中」且不显示数字。

### 已知问题
- 投影值（未应用时）按"当前可见工具 − deny 规则"估算，与实测可能差几个工具
- 插件重载后内存中的"已应用"记录会丢，重启后按 `sessions.json` 恢复
