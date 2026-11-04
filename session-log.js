/**
 * Session-log evidence: what the requests a session really sent looked like.
 *
 * A session log is a multi-frame zstd stream (`session.v4.jsonl.zstd`); the
 * harness appends one frame per flush, so a plain stream decompressor stops at
 * the first frame. Split on the zstd magic number instead, then hand the frames
 * to `zstdDecompressSync` one by one.
 *
 * The only honest way to answer "did the toolset reach the wire?" is to read the
 * `request/header` events: `status.toolCount` reports what the registry answers
 * NOW, which is not the same thing.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { matchesAny } from './catalog.js'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** DSH home that owns the catalog / sessions / state tree. */
export function dshHome() {
  return process.env.DSH_HOME ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
}

/** Walk every workspace bucket for one session's log; undefined when absent. */
export function findSessionLog(sessionId, home = dshHome()) {
  const root = path.join(home, 'sessions')
  let buckets = []
  try {
    buckets = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue
    const candidate = path.join(root, bucket.name, sessionId, 'session.v4.jsonl.zstd')
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Decode a multi-frame session log into its JSONL text.
 *
 * Only the first `maxBytes` are read: request headers sit at the head of a
 * session, and a runaway log must not block the host while the panel is open. A
 * frame cut by the byte cap simply fails to decode and is skipped.
 *
 * The cap is deliberately small. This runs on the host's single thread, so its
 * cost is the user's UI: every byte read here is a byte the host cannot use to
 * answer the window. 4 MiB still covers the largest session on this machine
 * (2.6 MiB) whole, so the panel keeps every request; a log that outgrows the cap
 * loses its tail, which is a reporting gap, not a hang.
 */
const HEAD_BYTES = 4 * 1024 * 1024

export function readLogFrames(file, maxBytes = HEAD_BYTES) {
  const fd = fs.openSync(file, 'r')
  let buf
  try {
    const size = fs.fstatSync(fd).size
    const take = Math.min(size, maxBytes)
    buf = Buffer.alloc(take)
    fs.readSync(fd, buf, 0, take, 0)
  } finally {
    fs.closeSync(fd)
  }
  // `Buffer.indexOf` is the native memchr; a JS byte loop over megabytes burns
  // the very thread this route is supposed to keep free.
  const starts = []
  for (let i = buf.indexOf(MAGIC, 0); i !== -1; i = buf.indexOf(MAGIC, i + 4)) starts.push(i)
  const parts = []
  for (let k = 0; k < starts.length; k += 1) {
    const from = starts[k]
    const to = k + 1 < starts.length ? starts[k + 1] : buf.length
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(from, to)).toString('utf8'))
    } catch {
      // A start marker that is really payload, or a frame cut by the byte cap:
      // skip it rather than failing the whole read.
    }
  }
  return parts.join('')
}

/** Tool names carried by one `request/header` event. */
function toolNamesOf(event) {
  const tools = event?.data?.header?.tools ?? []
  return tools
    .map((tool) => (typeof tool === 'string' ? tool : tool?.name))
    .filter((name) => typeof name === 'string' && name !== '')
}

/**
 * Per-request evidence from decoded log text.
 *
 * @param text - JSONL text of one session log.
 * @param modes - catalog modes (`[{ id, deny }]`) to score the requests against.
 * @returns one row per request: sequence, tool count, and per-mode leak counts.
 */
export function requestEvidence(text, modes = []) {
  const rows = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event?.type !== 'request/header') continue
    const names = toolNamesOf(event)
    const leaks = {}
    for (const mode of modes) {
      leaks[mode.id] = names.filter((name) => matchesAny(name, mode.deny ?? [])).length
    }
    rows.push({ index: rows.length + 1, seq: event.seq, tools: names.length, leaks })
  }
  return rows
}

/**
 * Everything the verify route needs for one session.
 *
 * @returns `{ sessionId, log, requests, first }`; `log` is undefined when no
 * session log exists yet (the session has not persisted anything).
 */
export function sessionEvidence(sessionId, modes = [], home = dshHome()) {
  const log = findSessionLog(sessionId, home)
  if (log === undefined) return { sessionId, log: undefined, requests: [], first: undefined }
  let text
  try {
    text = readLogFrames(log)
  } catch (error) {
    return { sessionId, log, error: String(error?.message ?? error), requests: [], first: undefined }
  }
  const requests = requestEvidence(text, modes)
  return { sessionId, log, requests, first: requests[0] }
}
