/**
 * 审计 sessions.json：哪些「已应用」记录是真的，哪些是写脏的。
 *
 * 背景：0.4.3 及之前，`agent/created` 对**恢复的老会话**也套了默认档位并落盘，
 * 于是插件诞生前的对话被记成「基础档」，之后永久显示错误档位。判断一个记录真假的
 * 唯一硬证据是会话日志里的 `request/header`：真被裁剪过的会话，它发出的请求里
 * 不含该档 deny 的工具（leaks === 0）；从没被裁剪过的会话，请求里全是工具（leaks > 0）。
 *
 * 用法：
 *   node scripts/audit-sessions.mjs            # 只报告，不动文件
 *   node scripts/audit-sessions.mjs --fix      # 删除判定为「从未裁剪」的记录
 *
 * 只删有反证的记录；没有日志、没有请求的会话一律保留（无法证明是假的）。
 */
import fs from 'node:fs'
import path from 'node:path'

import { findSessionLog, readLogFrames, requestEvidence } from '../session-log.js'
import { loadCatalog } from '../catalog.js'

const FIX = process.argv.includes('--fix')

function sessionsFile() {
  const home = process.env.DSH_HOME ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
  return path.join(home, 'state', 'mode-switch', 'sessions.json')
}

const file = sessionsFile()
if (!fs.existsSync(file)) {
  console.log(`没有 ${file}，无需审计。`)
  process.exit(0)
}
const store = JSON.parse(fs.readFileSync(file, 'utf8'))
const catalog = loadCatalog(() => {})
const modes = catalog.modes ?? []
const modeOf = (value) => (typeof value === 'string' ? value : value?.mode)

console.log(`记录 ${Object.keys(store).length} 条，档位定义 ${modes.length} 个\n`)
console.log('判定            记录档位     会话                                 请求数  说明')

const bogus = []
for (const [sessionId, value] of Object.entries(store)) {
  const mode = modeOf(value)
  const entry = modes.find((m) => m.id === mode)
  if (entry === undefined) {
    console.log(`unknown-mode    ${String(mode).padEnd(12)} ${sessionId.padEnd(36)} -       档位已不存在，跳过`)
    continue
  }
  const log = findSessionLog(sessionId)
  if (log === undefined) {
    console.log(`no-log          ${mode.padEnd(12)} ${sessionId.padEnd(36)} -       没有日志，保留`)
    continue
  }
  let rows
  try {
    rows = requestEvidence(readLogFrames(log), modes)
  } catch (error) {
    console.log(`log-error       ${mode.padEnd(12)} ${sessionId.padEnd(36)} -       ${error?.message ?? error}`)
    continue
  }
  if (rows.length === 0) {
    console.log(`no-requests     ${mode.padEnd(12)} ${sessionId.padEnd(36)} 0       没有请求证据，保留`)
    continue
  }
  const trimmedRows = rows.filter((row) => row.leaks[mode] === 0).length
  if (trimmedRows > 0) {
    console.log(`trimmed         ${mode.padEnd(12)} ${sessionId.padEnd(36)} ${String(rows.length).padEnd(7)} ${trimmedRows} 个请求确为裁剪后，保留`)
    continue
  }
  const minTools = Math.min(...rows.map((row) => row.tools))
  console.log(`never-trimmed   ${mode.padEnd(12)} ${sessionId.padEnd(36)} ${String(rows.length).padEnd(7)} 全部 ${rows.length} 个请求仍带 deny 工具（最少 ${minTools} 个），记录是假的`)
  bogus.push(sessionId)
}

if (bogus.length === 0) {
  console.log('\n没有需要清理的记录。')
  process.exit(0)
}

console.log(`\n判定为假记录 ${bogus.length} 条：`)
for (const id of bogus) console.log(`  ${id}`)

if (!FIX) {
  console.log('\n（只报告。加 --fix 才会删除这些记录。）')
  process.exit(0)
}

for (const id of bogus) delete store[id]
const temp = `${file}.tmp`
fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
fs.renameSync(temp, file)
console.log(`\n已删除 ${bogus.length} 条假记录，剩 ${Object.keys(store).length} 条。`)
