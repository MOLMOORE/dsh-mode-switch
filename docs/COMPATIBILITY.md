# 宿主兼容性核对清单

DSH 内核升级后按这个清单过一遍。**每一项都写清「插件依赖它做什么」和「它变了会怎么坏」**，
以及现在怎么验证。全部黑盒可验的项放在最前面，不需要读宿主源码。

最近核对：**2026-11-04，宿主 `@deepseek-ai/dsh-desktop-runtime` 0.2.1-rc.5 → 0.2.2-rc.1**，全项通过。

## 一、黑盒验收（5 分钟，先跑这个）

端口取 `~/.dsh/state/mode-switch/heartbeat.json` 里的 `port`（0.4.3 起会写），
或从「设置 → 关于 / 地址栏」拿当前 GUI 端口。

```powershell
$port = (Get-Content "$env:USERPROFILE\.dsh\state\mode-switch\heartbeat.json" -Raw | ConvertFrom-Json).port

# 1) 插件在跑：返回 ok:true，且 heartbeat 的 at 一直在变
Invoke-RestMethod "http://127.0.0.1:$port/api/mode-switch/status?sessionId=probe"

# 2) 档位名不依赖活动 agent：老会话应回 stored + mode-full
Invoke-RestMethod "http://127.0.0.1:$port/api/mode-switch/status?sessionId=<一个旧会话id>"

# 3) 裁剪切到线上：requests 的 leaks['mode-basic'] 应全为 0
Invoke-RestMethod "http://127.0.0.1:$port/api/mode-switch/verify?sessionId=<当前会话id>"

# 4) 面板数据：allTools 有内容、totals.tools 合理
Invoke-RestMethod "http://127.0.0.1:$port/api/mode-switch/detail?sessionId=<当前会话id>"

# 5) 胶囊真的渲染：截图看输入框上方那一行「● 档位 xxx · 预设 · n 工具 · ≈x.xk tok schema」
& tools\capture-screen.ps1 -Out "evidence\<日期>\compat.png" -Pid2 <DeepSeek Harness 的 pid>
```

通过标准（0.2.2-rc.1 实测值）：

| 项 | 期望 |
|---|---|
| `status`（旧会话，无 agent） | `session=stored`、`toolset=mode-full`、`toolsetName=全量档` |
| `status`（当前会话） | `session=live`、`blank=false`、`applied=true`、`toolCount≈61` |
| `status`（不存在的 id） | `session=unknown` |
| `verify` | `requests>0`、最近几条 `leaks['mode-basic']=0`、`tools` 明显小于注册表总数 |
| `detail` | `allTools` 有内容、`toolCount` 与胶囊数字一致 |
| 响应时间 | `status` 10ms 级、`verify` 100ms 级（2.4MB 会话）、`detail` 20ms 级 |
| 截图 | 胶囊有档位名、预设徽章、工具数、四个档位按钮 |

## 二、代码级契约（黑盒不过关时再来查）

用 `node tools/dsh-asar.mjs find|get|list` 读宿主打包产物（`D:\DEEPSEEK_HARNESS\resources\app.asar`）。

| # | 契约 | 插件拿它做什么 | 变了会怎么坏 | 0.2.2-rc.1 状态 |
|---|---|---|---|---|
| 1 | `tools.restrict({ deny })` 返回 disposer，只对 agent 作用域有效 | 裁剪档位 | 档位不生效 / 抛错 | 未变 |
| 2 | `restrict()` 遇未知工具名抛错 | 只能传注册表里真实存在的名字（所以 deny 一律先按 `tools.schemas()` 过滤） | 传错名字会整档失败 | 未变 |
| 3 | `tools.schemas(scope, toolSet)`，**省略 scope = 全局视图** | 算 deny 名单、显示"全量"基线 | 返回值变成别的视图 → 数字全错 | 签名新增可选参数，语义未变 |
| 4 | `restrict()` **同步**发 `tools/change`（`ScopedLayers.effect()` 末尾 `onChange()`，cordis `emit` 同步派发） | 0.4.3 的 `applying` 重入闸就是为了它 | 变成异步反而更安全，但闸别删 | 仍是同步 |
| 5 | `agent/created` 载荷 `{ agent, source, signal }` | 首请求前裁剪 + 按 source 判是否新会话 | 取不到 `agent`/`source` → 档位不应用或误裁老会话 | 未变 |
| 6 | `source` 取值：新建 `startup`、恢复 `resume` | 0.4.4 只有真正新会话才吃默认档 | 恢复的字面量改名 → 老会话又被裁成基础档 | `"startup"`、`"resume"` 都在 |
| 7 | `agent/pre-step` 载荷 `{ messages, agent, ...position }`，`position` 含 `turn`/`step` | 兜底应用（`turn===1 && step===1`） | 取不到 turn/step → 兜底失效（不影响主路径） | 未变 |
| 8 | `system-prompt/assemble` 瀑布 `(assembly, context, next)`，`assembly.sections[].name` | 按档位删同名提示段 | 签名变 → 提示段裁剪失效 | 未变 |
| 9 | cordis 监听器选项支持 `{ prepend: true }` | 提示段过滤要排在最外层 | 失去 outermost → 看不到别的插件追加的段 | 未变 |
| 10 | `sessionProjections.stateOf(session, 'turnBoundary')` → `{ openTurnStartSeq, lastTurn }` | 判空白会话 | 读不到 → 全判成"未开始"，可能误裁老会话 | 未变 |
| 11 | `agents.get(id)` / `agents.list()` | 找活 agent、`tools/change` 时遍历 | 找不到 → 显示/刷新失效 | 未变 |
| 12 | `webServer.register({ kind:'exact', path, handler })`，handler 是 `(req,res)` | 六条 `/api/mode-switch/*` 路由 | 路由 404 → 胶囊一直读取中 | 未变 |
| 13 | 会话日志 `<home>/sessions/<bucket>/<id>/session.v4.jsonl.zstd`，**多帧** zstd | `verify` 的请求级证据 | 改文件名/单帧 → 证据为空 | 未变（2.4MB 会话解出 10 个请求） |
| 14 | 客户端 `__ModuleLoader__.load({...})` + 席位 `conversation.input.dock`（`props.sessionId`） | 胶囊本体 | 加载器或席位改名 → 胶囊消失 | 都还在 |

## 三、目录内容的时效性（宿主升级后必查）

`catalog.json` 的 deny 是**工具名通配**，宿主升级改名就会静默失效。查法：

```powershell
$d = Invoke-RestMethod "http://127.0.0.1:$port/api/mode-switch/detail?sessionId=<当前会话>"
$names = $d.allTools.name
foreach ($m in (Get-Content "$env:USERPROFILE\.dsh\state\mode-switch\catalog.json" -Raw | ConvertFrom-Json).modes) {
  foreach ($p in $m.deny) {
    $rx = '^' + [regex]::Escape($p).Replace('\*','.*') + '$'
    if (($names | Where-Object { $_ -match $rx }).Count -eq 0) { "失效规则: $($m.id) -> $p" }
  }
}
```

0.2.2-rc.1 实测：注册表 159 个工具，四个档位的 15 条 deny 规则全部命中（基础档 136、
办公档 101、建模档 70、全量档 0），**没有失效规则**。

## 四、已知的"看起来像兼容问题、其实不是"

- **`crash-*-host.log` 里的 `desktop welcome: Web authentication failed`**：应用启动阶段
  认证失败（`phase: startup`），跟着反复重启出现；与插件无关，重启到位就消失。
- **`slow.log` 里的 `event-loop-lag`**：插件自己量的 5 秒定时器滞后。它在**启动/关闭**阶段
  也会响（宿主正在装配插件、跑安装器）。判据是**成对**看：`lag` 与 `crash-*-host.log` 的
  时间戳重合 = 启动开销；`lag` 之后宿主长时间没事件 + 界面全废 = 真卡死（见转接 03）。
- **工具总数变了几个**：宿主增删工具是正常的，胶囊的工具数跟着变，不是 bug。
