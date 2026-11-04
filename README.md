# dsh-mode-switch

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的工具档位插件。

DSH 每个会话都会把所有工具的说明发一遍。工具装得多，光是这些说明就占掉几万 token；模型每轮还要在这堆工具里挑，挑错的概率跟着涨。这个插件让一个会话只带用得上的工具，界面上多一个胶囊，能换档、看省了多少、改规则。

它不声明 preset，也不动 preset 注册表。官方那几种模式照旧，档位是叠在上面的另一层。

## 安装

要 DSH 0.2.1 或更新。

```sh
dsh plugin --profile desktop add github:MOLMOORE/dsh-mode-switch
```

装完重启。输入框上方出现一行：

```
档位 基础档 · 标准模式 · 62 工具 · ≈14.9k tok schema
```

62 和 14.9k 是作者机器上的数，装了什么插件，数就不一样。

## 用

- 点右边的小胶囊换档。只有还没发过消息的会话能换。
- 点主胶囊展开明细：各档的工具数、token、比全量档省多少，以及这个会话第一个请求实际带了多少工具。
- 右上角「编辑档位」：加档、改名、删档、勾选每档保留的工具。改完保存，新会话生效。
- 编辑器里的「AI 分配」：把当前机器的工具名和说明交给默认模型，让它按用途分档。结果先填进编辑器，你看过再保存。

## 规则怎么算

可见工具 = 全局工具 − 当前档的 deny 规则。deny 里 `foo_*` 按前缀匹配，其它按完整名字。preset 自带的工具（读写文件、todo、问用户）和 agent 作用域注册的工具不在全局名单里，任何档都裁不掉它们。

规则在 `~/.dsh/state/mode-switch/catalog.json`，首次运行自动生成。面板改的就是这个文件；直接编辑文件也行，不用重启。

```json
{
  "version": 1,
  "modes": [
    { "id": "mode-basic", "name": "基础档", "order": 10, "deny": ["mcp__*", "ego_*", "ppt_*", "office_*"] },
    { "id": "mode-full",  "name": "全量档", "order": 40, "deny": [] }
  ]
}
```

deny 为空就是全带。档位被删掉后，指向它的会话按 `order` 退到最前面那个，不会变成不裁剪。

## 什么时候生效

| 时机 | 行为 |
|---|---|
| 新建会话，还没发消息 | 可以切，选择只记下来，还没生效 |
| 发出第一条消息 | 按所选档位裁一次，没选就用默认档 |
| 对话开始后 | 不能切，服务端返回 `session-started` |
| 插件装之前建的会话 | 不改写，显示全量档 |

对话中不能切，是因为 DSH 在第一次组装请求时把工具目录固定了，之后 `ctx.tools.restrict()` 只能收紧不能放宽。想换档就新开会话。

## 默认的四个档

| 档位 | 留下的东西 |
|---|---|
| 基础档 | 核心工具。MCP、浏览器、PPT、Office、论文、论衡都摘掉 |
| 办公档 | 办公文档、PPT 相关留下，建模和浏览器摘掉 |
| 建模档 | SolidWorks 的 MCP 留下，办公、PPT、浏览器摘掉 |
| 全量档 | 不裁 |

**建模档是按作者自己的机器写的**。作者装了 SolidWorks 的 MCP，所以专门留一个档给它。没装 CAD 的机器上，这个档和办公档基本一样，分不出区别。装完先看一眼自己的工具列表，或者直接点「AI 分配」重来一遍，比照搬默认值靠谱。

## 少带工具的好处

1. **省 token**。作者机器上全量 198 个工具、约 54.8k token；基础档 62 个、约 14.9k。工具表在首次组装时固定，之后每次请求都带着同一套，省的是整段会话的每一次请求。
2. **模型少分心**。工具表越长，读到的无关描述越多，挑工具时也更容易挑错，或者围着一轮用不上的能力打转。把用不上的先摘掉，选择面小一些，回答也短一些。这是使用下来的判断，没做过量化实验。
3. **界面上的动作也少**。工具少了，模型不会在「要不要用浏览器查一下」这类选择上反复试探。

## 限制

- 只能裁全局工具，preset 和 agent 作用域的工具裁不掉。
- 裁不掉其它插件的界面卡片。官方 slots 没有移除别人条目的接口。
- 对话开始后不能换档。
- deny 是名字规则。插件改名、新加工具时，规则要跟着改，否则会漏裁。
- 「AI 分配」要调一次模型（走默认路由），几十秒到一两分钟，费用算在你自己账上。没有可用模型时按钮会报错，手动勾选照样能用。

细节和实测记录在 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/mode-switch/status?sessionId=` | 胶囊用的数据 |
| GET | `/api/mode-switch/detail?sessionId=` | 面板数据：各档足迹、逐工具开销、全部工具 |
| GET | `/api/mode-switch/verify?sessionId=` | 请求级证据：会话日志里每个请求真实带了多少工具 |
| POST | `/api/mode-switch/select?sessionId=&toolset=` | 选档，仅限没开始的会话 |
| POST | `/api/mode-switch/modes` | 保存整个档位列表 |
| POST | `/api/mode-switch/auto` | 调模型提一版档位方案（不写入） |

## 开发

```sh
node test/gate.test.mjs
node --check index.js client.js catalog.js session-log.js auto.js
```

```
index.js        Host 半：应用档位、提示段过滤、HTTP 路由
client.js       Client 半：胶囊、面板、档位编辑器
catalog.js      档位规则的读取、校验与匹配
session-log.js  会话日志解码、请求级证据
auto.js         让模型提一版档位方案
```

改 `client.js` 页面会热替换；改 `index.js` 要重启 DSH 或重载 profile。

## 许可

MIT
