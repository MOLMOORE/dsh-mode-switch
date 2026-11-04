# 变更记录

## 0.4.4 — 2026-11-04

修「插件装好之前的老对话显示成基础档」。这些对话本来是全量档，而且不该被改写。

### 修复
- **恢复老会话时不再套默认档位**。`agent/created` 会对每个新建的 agent 应用默认档，但恢复历史会话（`source: 'resume'`）也走这条路，于是插件诞生前的对话被裁成基础档、还写进了 `sessions.json`——一旦落盘就永久错，重启也不会自己恢复。现在只有**真正的空白新对话**才吃默认档；已经聊过的会话除非用户明确选过档位（偏好字符串或已应用记录），一律不动。判断用两条：宿主给的 `source`（`resume` / `clear` / `compaction` 一律不套默认）与 `sessionBlank()`。

### 新增
- `scripts/audit-sessions.mjs`：审计 `sessions.json` 里每条「已应用」记录是真是假。判据是会话日志里的 `request/header`——真被裁剪过的会话，请求里不含该档 deny 的工具；从没裁剪过的，请求里工具齐全。`--fix` 只删有反证的记录。本机实测 19 条里 13 条是假的（都是老会话被误写），删掉后那些对话恢复显示全量档。

## 0.4.3 — 2026-11-04

修宿主整体卡死：界面变成「聊天不可用、历史列表空白、开不了新对话，只能手动退出重进」。

### 修复
- **`tools/change` 同步重入（根因）**。宿主在 `restrict()` 里是**同步**发 `tools/change` 的（`ScopedLayers.effect()` 末尾直接 `onChange()`，`Context.emit()` 也同步调监听器），而 disposer 也会发。我们的 `tools/change` 回调会对已经裁剪过的会话再 `applyToolset()`，于是：裁剪 → 同步 emit → 回调 → 再裁剪 → 再 emit …… 无界递归，每层还跑一次完整的 `tools.schemas()`。单次事件在回归测试里能跑出 **1482 层**嵌套 `restrict()`，宿主唯一的主线程因此被占死，进程不崩溃（所以没有 crash 日志），界面的所有请求一起超时。加两道防线：一个 `applying` 重入闸，以及「裁剪集与现状相同就不重复应用」。
- **裁剪记录先删后放**。原先在 `dispose()` 之后才把会话移出 `live`，而 disposer 会同步 emit，回调里看到的仍是「这个会话已裁剪」，是重入的第二条路。现在先移出 `live` 再 dispose。
- 每次重复 `restrict()` 都会往作用域里叠一层摘不掉的限制，所以就算不递归，反复应用也会让后续每次 `schemas()` 越来越慢；「集合没变就不动」同时解决了这个慢性退化。

### 变更
- **`verify` 的同步读上限 32MB → 4MB**。这条路由在宿主主线程上同步读+解压会话日志，打开大历史会话时整机都会卡；4MB 仍能覆盖本机最大的会话日志（2.6MB）全量，超出的只是丢掉尾部请求记录。
- 多帧日志的帧头扫描改用 `Buffer.indexOf`（原生 memchr），不再用 JS 逐字节循环。

### 新增
- **心跳自带滞后与端口**。`heartbeat.json` 现在写 `{at, pid, every, lag, port}`：`lag` 是定时器比预期晚了多久，宿主被阻塞时它会在恢复后的第一时间把卡了多久写下来；`lag >= 1000ms` 同时以 `event-loop-lag` 记进 `slow.log`。`port` 取自请求的 `req.socket.localPort`，方便外部守夜脚本在宿主换端口重启后自己找到它。

### 背景
用户症状是「界面废掉，只能手动退出重进」——不是崩溃弹窗。卡死都紧跟子代理会话创建或回看历史对话，而这两件事都会新建 agent，也就都会触发 `restrict()` → `tools/change`。回归测试 `test/gate.test.mjs` 里的 `re-entrant trim calls` 一条就是盯这个的。

## 0.4.2 — 2026-11-04

修「档位一直显示读取中，换到别的对话再换回来才正常」。

### 修复
- 客户端的三个请求（status / detail / verify）加上 8 秒硬超时。宿主忙时请求会一直挂着，原先没有超时，胶囊就停在「读取中」；现在超时会失败，界面显示「状态不可用」，随后自动重试。
- 状态轮询从 15 秒改成 8 秒，卡住后最多十几秒能自己恢复，不用手动切换对话。

## 0.4.1 — 2026-11-04

让「宿主卡死」留下能跨重启的证据。

### 新增
- **心跳**：每 5 秒重写 `~/.dsh/state/mode-switch/heartbeat.json`（内容只有时间和 pid）。界面卡死时这个文件不再更新，它的时间戳就是最后一次正常运转的时刻，重启后仍然在，可以直接量出卡了多久。
- **慢调用落盘**：`diag.slow` 之外，≥200ms 的 `created` / `pre-step` / `assemble-filter` 同步调用追加写进 `~/.dsh/state/mode-switch/slow.log`，重启后还能查。

### 背景
两次卡死都发生在 `turn/end` 之后：会话日志在 turn/end 处停住，下一次记录是重启后的 `session/end-seed`（间隔 118–386 秒）。宿主在优雅退出时不写 crash 日志（`stopping` 分支），所以「没有崩溃记录」不等于没有卡死。内存里的诊断会随进程消失，这次改成落盘。

## 0.4.0 — 2026-11-04

新用户不用先读懂 JSON 才能用：档位可以由模型按本机工具提一版，也可以继续手勾。

### 新增
- **「AI 分配」**：编辑器里点一下，把本机全部工具的名字与一句话说明交给默认模型，要求它按用途分 3–5 档并返回 JSON；结果填进编辑器，用户确认后保存。写盘仍走 `POST /modes`，模型不直接改文件。
- `POST /api/mode-switch/auto`：返回 `{modes, reason, route}`，不写入；失败返回 502 与原因（没有 llm 服务、没有默认路由、模型超时、返回不是 JSON）。
- `auto.js`：提示词构造、JSON 提取（容忍代码围栏和前后废话）、路由解析；`diag.auto` 记录耗时与结果。
- 测试覆盖提示词含真实工具名、必须要求 JSON、围栏/散文包装的解析、非法答案拒绝。

### 变更
- README 重写：补「AI 分配」、「建模档按作者机器写的、没装 CAD 的用户分不出区别」、少带工具对模型选工具的影响，以及每档省多少 token。
- 新增 `README.en.md`。

### 说明
- AI 只提方案，不自动落盘；确认后保存，避免模型把可用配置写坏。
- 默认模型路由来自 `agentDefaultModel`，与其它旁路调用一致；调用费用算在用户自己的 provider 账上。

## 0.3.1 — 2026-11-04

加一个事后可查的证据：本插件的同步钩子如果卡住宿主，`diag.slow` 里会留下记录。

### 新增
- `created`、`pre-step`、`assemble-filter` 三处包上计时，耗时 ≥200ms 写入 `diag.slow`（最近 20 条，含时间戳），同时打一条 warn 日志。

### 背景
14:52 与 15:24 两次「界面卡死、随后重启」都发生在子代理会话创建后几秒，宿主没有留下 crash 记录。插件侧的同步工作（`tools.schemas()` 快照、`restrict()`、一次 stat）量级很小，但没有证据就无法排除，所以先加计时。

## 0.3.0 — 2026-11-04

档位从「只能改 JSON」变成「在面板里改」，并补上面板的省量显示与公开发布所需的材料。

### 新增
- **档位编辑器**：面板右上角「编辑档位」。可新建、改名、删除档位，按工具勾选每个档位保留什么；保存写入 `catalog.json`，下一个新会话按新规则裁剪。
- **`POST /api/mode-switch/modes`**：一次提交整个档位列表，服务端校验 id 唯一、名称非空、规则是字符串数组，写临时文件后 rename，避免半写。
- **每档省下的 token**：面板每行显示 `−N`（相对全量档的 schema token 差）；`detail` 新增 `baseline` 与每档 `savedTokens`。
- **档位被删后的回退**：会话指向的档位不存在时按 `order` 取第一个，不再静默变成「不裁剪」。

### 变更
- 基础档的默认 deny 从 `mcp__solidworks__*` 改为 `mcp__*`：新装机器上任何 MCP 都默认不进基础档，办公/建模档不受影响；已有 `catalog.json` 不会被改写。
- `detail` 返回 `allTools`（全部全局工具名与 token），供编辑器使用。
- README 重写为对外文档，补 `README.en.md` 与 npm/GitHub 元数据。

### 测试
- 新增：档位列表校验（重名、空名、非法 id、空列表）、被删档位回退到 order 最小的档位。

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
