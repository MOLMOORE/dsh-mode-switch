#!/usr/bin/env node
/**
 * Count the tools a session's requests really carried.
 *
 * Reads the session log (multi-frame zstd), finds every `request/header` event and
 * prints, per request, how many tool schemas were sent and how many of them match
 * a mode catalogue's deny prefixes. This is the only honest evidence that a tool
 * trim reached the wire — `tools.schemas(agent)` only says what the registry would
 * answer now.
 *
 *   node scripts/verify-session-tools.mjs <sessionId|path/to/session.v4.jsonl.zstd> [--home <dsh home>]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function readFrames(file) {
  const buf = fs.readFileSync(file)
  const starts = []
  for (let i = 0; i <= buf.length - 4; i += 1) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) starts.push(i)
  }
  const parts = []
  for (let k = 0; k < starts.length; k += 1) {
    const from = starts[k]
    const to = k + 1 < starts.length ? starts[k + 1] : buf.length
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(from, to)).toString('utf8'))
    } catch {
      try {
        parts.push(zlib.zstdDecompressSync(buf.subarray(from)).toString('utf8'))
      } catch {
        /* skip a frame that will not decode */
      }
    }
  }
  return parts.join('')
}

function resolveLog(target, home) {
  if (target.endsWith('.zstd')) return target
  const root = path.join(home, 'sessions')
  for (const workspace of fs.readdirSync(root)) {
    const candidate = path.join(root, workspace, target, 'session.v4.jsonl.zstd')
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

const args = process.argv.slice(2)
const positional = []
let home
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--home') {
    home = args[i + 1]
    i += 1
    continue
  }
  positional.push(args[i])
}
home ??= path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
const target = positional[0]
if (target === undefined) {
  console.error('usage: node scripts/verify-session-tools.mjs <sessionId|*.jsonl.zstd> [--home <dsh home>]')
  process.exit(2)
}
const log = resolveLog(target, home)
if (log === undefined) {
  console.error(`session log not found for ${target}`)
  process.exit(2)
}

const catalogFile = path.join(home, 'state', 'mode-switch', 'catalog.json')
const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : { modes: [] }
const current = fs.existsSync(path.join(home, 'state', 'mode-switch', 'sessions.json'))
  ? JSON.parse(fs.readFileSync(path.join(home, 'state', 'mode-switch', 'sessions.json'), 'utf8'))
  : {}

const hit = (name, patterns) => patterns.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p))

const text = readFrames(log)
const events = text.split('\n').filter(Boolean)
let index = 0
for (const line of events) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  if (event.type !== 'request/header') continue
  const tools = event.data?.header?.tools ?? []
  const names = tools.map((tool) => (typeof tool === 'string' ? tool : tool?.name)).filter(Boolean)
  index += 1
  const reports = catalog.modes.map((mode) => {
    const leaked = names.filter((name) => hit(name, mode.deny ?? []))
    return `${mode.id}: leaks ${leaked.length} -> ${names.length - leaked.length} of ${names.length}`
  })
  console.log(`request #${index} (seq ${event.seq}): ${names.length} tools`)
  for (const report of reports) console.log(`  if ${report}`)
  const chosen = current[target]
  const id = typeof chosen === 'string' ? chosen : chosen?.mode
  if (id !== undefined) console.log(`  recorded mode for this session: ${id}`)
}
if (index === 0) console.log('no request/header event yet — the session has not sent a request')
