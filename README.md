# dsh-mode-switch

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的工具档位插件。

它做的事只有一件：**控制每个会话能看到哪些工具**。DSH 会把工具描述全部塞进系统提示，工具一装多，
光 schema 就吃掉几万 token；这个插件让你按会话选择带哪些工具，并且可以自己增删档位、勾选每个档位包含的工具。

它不声明 preset，也不改 preset 注册表。官方的标准模式、PTC、极简、创造模式原样保留，档位是叠在上面的另一层。

## 安装

要求 DSH 0.2.1 或更新的桌面端 / `dsh web`。

从 GitHub 安装：

```sh
dsh plugin --profile web add github:MOLMOORE/dsh-mode-switch
```

本地目录安装（开发时用）：

```sh
dsh plugin --profile desktop add /path/to/dsh-mode-switch
```

装完重启 DSH。输入框上方会出现胶囊：

```
档位 基础档 · 标准模式 · 62 工具 · ≈14.9k tok schema
```

## 用法

- **切档**：点胶囊右边的小胶囊。只在还没发过消息的会话里有效，发出第一条消息后档位固定。
- **看明细**：点主胶囊展开。每档的工具数、token、相对全量档省下多少，以及本会话实际发出的第一个请求带了多少工具。
- **改档位**：面板右上角「编辑档位」。可以新建、改名、删除档位，勾选每个档位要保留的工具，保存后新会话生效。
- **验证**：面板里的「请求证据」读的是会话日志，不是估算值。

## 档位规则怎么算

一切都在本地、按名字匹配，没有模型参与：

```
会话可见工具 = 全局工具 − 当前档位的 deny 规则
```

`deny` 里 `foo_*` 匹配前缀，其它按完整名字匹配。预设和 agent 作用域的工具不在全局名单里，
不受影响，也删不掉。

`~/.dsh/state/mode-switch/catalog.json` 是规则文件，首次运行自动生成。面板的编辑器改的就是它，
也可以直接编辑这个文件，不需要重启。

```json
{
  "version": 1,
  "modes": [
    { "id": "mode-basic", "name": "基础档", "order": 10, "deny": ["mcp__*", "ego_*", "ppt_*", "office_*"] },
    { "id": "mode-full", "name": "全量档", "order": 40, "deny": [] }
  ]
}
```

`deny` 为空表示全部工具都带。删掉档位后，指向它的会话会退回按 `order` 排在最前的档位。

## 什么时候生效

| 时机 | 行为 |
|---|---|
| 新建会话，还没发消息 | 可以随便切，选择只记录，不生效 |
| 发出第一条消息 | 按所选档位应用一次，没选就用默认档 |
| 对话开始后 | 不能切。服务端返回 `session-started`，胶囊置灰 |
| 插件装之前建的会话 | 不改写，显示全量档 |

对话中不能切是因为 DSH 在第一次组装请求时固定工具目录，之后 `ctx.tools.restrict()` 只能收紧不能放宽。
这是 harness 的设计，不是插件省事。需要别的档位就新开会话。

## 默认档位

首次运行生成的四个档位是按常见插件家族写的示例。工具名对不上就没有实际裁剪效果，
在面板里按自己装的插件勾一遍即可。

| 档位 | 说明 |
|---|---|
| 基础档 | 只留核心工具，deny 掉 MCP、浏览器、PPT、Office 等 |
| 办公档 | 保留 Office/PPT/文档类，deny 掉建模与浏览器 |
| 建模档 | 保留 SolidWorks MCP，deny 掉 Office、PPT、浏览器 |
| 全量档 | 不裁 |

## HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/mode-switch/status?sessionId=` | 胶囊用的紧凑数据 |
| GET | `/api/mode-switch/detail?sessionId=` | 面板数据：各档足迹、逐工具开销、全部工具名单 |
| GET | `/api/mode-switch/verify?sessionId=` | 请求级证据：会话日志里每个请求真实携带的工具数 |
| POST | `/api/mode-switch/select?sessionId=&toolset=` | 选择档位（仅未开始的会话） |
| POST | `/api/mode-switch/modes` | 保存整个档位列表（编辑器用） |

## 已知限制

- 只能裁全局工具。preset 自带工具和 agent 作用域注册的工具裁不掉。
- 裁不掉其它插件的界面卡片。官方 slots 没有移除他人条目的接口。
- 对话开始后不能切换。
- `deny` 是名字规则。插件改名或新增工具时，规则要跟着改，否则可能漏裁。

细节和实测记录在 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。

## 开发

```sh
node test/gate.test.mjs        # 纯逻辑测试，不需要 harness
node --check index.js client.js catalog.js session-log.js
```

目录：

```
index.js        Host 半：应用档位、提示段过滤、HTTP 路由
client.js       Client 半：胶囊、面板、档位编辑器
catalog.js      档位规则读取与匹配
session-log.js  会话日志解码与请求级证据
docs/           架构、限制、维护约定
```

改 `client.js` 后页面会热替换；改 `index.js` 需要一次 profile 重组或重启 DSH。

## 许可

MIT
