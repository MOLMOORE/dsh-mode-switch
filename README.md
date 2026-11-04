# dsh-mode-switch

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的**工具档位**插件：让每个会话只携带它真正需要的工具，从而砍掉工具 schema 占用的上下文。

它**不声明 preset、不改 preset 注册表**，官方的「标准模式 / PTC / 极简 / 创造模式」原样保留。档位是与之正交的另一个维度：

```
官方 preset（行为、提示词、技能）  ×  工具档（这一轮带哪些工具）
```

## 为什么需要它

DSH 会把所有可用工具的描述塞进系统提示。工具一多，光 schema 就能吃掉几万 token：

| 场景 | 工具数 | schema ≈tokens |
|---|---:|---:|
| 全量（含 SolidWorks MCP + ego 浏览器） | 198 | ≈54.8k |
| 建模档（含 SolidWorks） | 128 | ≈36.6k |
| 办公档 | 72 | ≈20.5k |
| 基础档 | 62 | ≈14.9k |

日常写代码、问答根本用不到 CAD 或浏览器自动化，那 40k 是纯浪费。

## 档位怎么工作

| 时机 | 行为 |
|---|---|
| 新建会话、还没发消息 | 胶囊可点，随便切；只记录，不生效 |
| 发出第一条消息 | 按所选档位应用一次（没选就用默认的基础档） |
| 对话开始后 | **不可切换**，胶囊置灰，服务端返回 `session-started` |
| 插件装好之前建的会话 | 不会被改写，显示「全量档」 |

**为什么对话中不能切**：DSH 在 agent 第一次组装请求时把工具目录固定下来（为了稳定请求缓存），之后 `ctx.tools.restrict()` 只能继续收紧、无法放宽。所以档位是"开工前"的决策；中途换需求请新开会话。详见 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。

## 安装

```bash
# 在 DSH 里
plugin_manager install_bundle {"target": "<绝对路径>/dsh-mode-switch"}
```

或把目录放进 profile 后重启 DSH。安装后：

1. 输入框上方出现胶囊：`档位 基础档 · 标准模式 · 62 工具 · ≈14.9k tok schema`
2. 右边四个小胶囊是档位，点一下切换（仅限未开始的会话）
3. 点主胶囊展开明细：每档的工具数与 token、当前会话的逐工具开销

## 配置

### 档位规则

`~/.dsh/state/mode-switch/catalog.json`（首次运行自动生成）：

```json
{
  "version": 1,
  "modes": [
    {
      "id": "mode-basic",
      "name": "基础档",
      "order": 10,
      "deny": ["mcp__solidworks__*", "ego_*", "ppt_*", "office_*", "paper_*", "zotero_*", "lunheng_*"]
    }
  ]
}
```

- `deny` 是**工具名规则**，不是包名：`前缀*` 匹配前缀，其它精确匹配
- 改完**不用重启**：插件按文件 mtime 重读（半写坏的文件会继续用上一份好副本），下一次 status/detail/select 或下一个会话生效
- 加档位：加一条 `modes` 条目即可；`id` 建议保持 `mode-` 前缀
- 改名：改 `name`（chip 和胶囊会跟着变）

### 每会话的选择

`~/.dsh/state/mode-switch/sessions.json`，形如 `{"session-xxx": "mode-office"}`。删掉某个键就回到默认档。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/mode-switch/status?sessionId=` | chip 用的紧凑数据：档位、工具数、是否已固定 |
| GET | `/api/mode-switch/detail?sessionId=` | 面板数据：各档位估算 + 逐工具开销 |
| GET | `/api/mode-switch/verify?sessionId=` | 请求级证据：会话日志里每个 `request/header` 真实携带的工具数与各档泄漏数 |
| POST | `/api/mode-switch/select?sessionId=&toolset=` | 选择档位（仅未开始的会话） |

## 开发

```
dsh-mode-switch/
├── index.js        Host 半：档位应用、提示段过滤、四条路由
├── client.js       Client 半：composer 上方的 chip、胶囊与明细面板
├── catalog.js      档位规则的读取与匹配（按 mtime 热重载）
├── session-log.js  会话日志解码与请求级证据（verify 路由与 CLI 共用）
├── cordis.patch.yml 只注册一行插件，不声明任何 preset
├── locale/{en,zh}.json
└── docs/
```

改 `client.js` 会热替换进已打开的页面；改 `index.js` 需要一次 profile 重组（或重启 DSH）。

## 已知限制

见 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。要点：对话中不能切档、投影值与实测值可能差几个工具、`deny` 的 `<family>_*` 会连带裁掉同名提示段，但**不裁第三方 UI 席位**（论衡的「论衡开工」卡片仍显示）。

## 许可

MIT
