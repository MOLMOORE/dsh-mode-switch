#!/usr/bin/env node
/**
 * Count the tools a session's requests really carried.
 *
 * Reads the session log (multi-frame zstd) through `session-log.js` — the same
 * reader behind `GET /api/mode-switch/verify` — finds every `request/header`
 * event and prints, per request, how many tool schemas were sent and how many
 * of them match a mode catalogue's deny prefixes. This is the only honest
 * evidence that a tool trim reached the wire: `status.toolCount` only reports
 * what the registry answers now.
 *
 *   node scripts/verify-session-tools.mjs <sessionId|path/to/session.v4.jsonl.zstd> [--home <dsh home>]
 */
import fs from 'node:fs'
import path from 'node:path'

import { dshHome, findSessionLog, readLogFrames, requestEvidence } from '../session-log.js'

/** Read catalog + per-session records from one DSH home. */
function readState(home) {
  const stateDir = path.join(home, 'state', 'mode-switch')
  const readJson = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return fallback
    }
  }
  return {
    modes: readJson(path.join(stateDir, 'catalog.json'), { modes: [] }).modes ?? [],
    current: readJson(path.join(stateDir, 'sessions.json'), {}),
  }
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
home ??= dshHome()
const target = positional[0]
if (target === undefined) {
  console.error('usage: node scripts/verify-session-tools.mjs <sessionId|*.jsonl.zstd> [--home <dsh home>]')
  process.exit(2)
}

const log = target.endsWith('.zstd') ? target : findSessionLog(target, home)
if (log === undefined || !fs.existsSync(log)) {
  console.error(`session log not found for ${target}`)
  process.exit(2)
}

const { modes, current } = readState(home)
const rows = requestEvidence(readLogFrames(log), modes)
if (rows.length === 0) {
  console.log('no request/header event yet — the session has not sent a request')
  process.exit(0)
}
const chosen = current[target]
const recorded = typeof chosen === 'string' ? chosen : chosen?.mode
for (const row of rows) {
  console.log(`request #${row.index} (seq ${row.seq}): ${row.tools} tools`)
  for (const mode of modes) {
    const leaked = row.leaks[mode.id] ?? 0
    console.log(`  if ${mode.id}: leaks ${leaked} -> ${row.tools - leaked} of ${row.tools}`)
  }
  if (recorded !== undefined) console.log(`  recorded mode for this session: ${recorded}`)
}
