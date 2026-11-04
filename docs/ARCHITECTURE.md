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
    └──POST /select──────────────┘  → sessions.json（仅未开始的会话）
```

`/verify` 是唯一读**真实请求**的入口：它解压会话日志（多帧 zstd），取每个
`request/header` 的工具名再按各档 `deny` 记泄漏数。其余两个接口看的是注册表现状。

catalog 由 `catalog.js` 按 `mtime + size` 记忆读取，改了文件不用重启；
插件加载时还会清理 `sessions.json` 里指向已不存在会话的条目。

`select` 只记录选择；真正应用发生在 `agent/created` 之后的一个 tick（早于首个请求的 `systemPrompt.assemble()`）：

```
agent/created → setTimeout(0) → applyToolset(agent)       ← 唯一能到达首个请求的时机
                              → installPromptFilter(agent)
agent/pre-step（turn 1 / step 1）→ 兜底（赶不上首个请求，见 LIMITATIONS）
```

工具表定稿之后，插件再挂一层 `system-prompt/assemble` 瀑布（`{ prepend: true }`）：
该档 `deny` 里形如 `<family>_*` 的规则同时去掉名为 `<family>` 的提示段
（论衡就是靠这条从基础档消失的；它的卡片仍会显示，见 LIMITATIONS §7）。

## 为什么用 deny 而不是 allow

`restrict({ allow })` 会连 preset 自带的工具（fs、todo、ask_user…）一起藏掉，因为它们不在"全局工具"名单里。用 `deny` 只影响全局工具，preset 工具原样保留。

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
