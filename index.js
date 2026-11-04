/**
 * dsh-mode-switch — Host half.
 *
 * The plugin owns ONE axis: which tools a session sees. It declares no presets
 * and never touches the preset registry, so the official modes (standard / ptc /
 * minimal / cordis) keep working exactly as shipped.
 *
 * A "toolset" is a named deny-rule list in a user-editable catalog. The chosen
 * toolset is stored per session and applied with `ctx.tools.restrict()` on the
 * agent scope when the agent is created; switching re-applies it live.
 *
 * Read-only routes:
 *   GET  /api/mode-switch/status?sessionId=<id>
 *   GET  /api/mode-switch/detail?sessionId=<id>
 *   POST /api/mode-switch/select?sessionId=<id>&toolset=<id>
 */

import fs from 'node:fs'
import path from 'node:path'
import { catalogPath, loadCatalog, matchesAny } from './catalog.js'
import { sessionEvidence } from './session-log.js'

export const name = 'mode-switch'

/** `webServer` serves the routes; the rest are optional reads. */
export const inject = ['webServer']

const STATUS_PATH = '/api/mode-switch/status'
const DETAIL_PATH = '/api/mode-switch/detail'
const SELECT_PATH = '/api/mode-switch/select'
const VERIFY_PATH = '/api/mode-switch/verify'

/** Rough token estimate: one token per four characters of the serialized schema. */
const CHARS_PER_TOKEN = 4

/** Toolset used for sessions that never chose one. */
const DEFAULT_TOOLSET = 'mode-basic'

export function apply(ctx) {
  const log = (message) => ctx.logger?.('mode-switch')?.warn?.(message)
  let catalog = loadCatalog(log)
  const live = new Map()
  /** Read-only diagnostics surfaced by the status route (never used by the UI). */
  const diag = { lastError: null, applied: [] }
  catalog.diag = diag

  /**
   * Re-read the user-editable catalog. `loadCatalog` memoises by mtime+size, so
   * this is a stat per call, not a parse; an edit takes effect on the next
   * status/detail/select/step instead of needing a DSH restart.
   */
  const refreshCatalog = () => {
    const next = loadCatalog(log)
    if (next !== catalog) {
      catalog = next
      catalog.diag = diag
      diag.catalogReloads = (diag.catalogReloads ?? 0) + 1
    }
    return catalog
  }

  // Session records outlive the sessions they point at (deleted sessions,
  // workspaces removed by hand). Drop those on load so the file stays a map of
  // real sessions rather than a growing log of every id ever seen.
  diag.prunedSessions = pruneSessions()

  /** Apply one toolset to one agent, replacing whatever it carried before. */
  const applyToolset = (agent, toolsetId) => {
    refreshCatalog()
    const tools = ctx.get('tools')
    if (tools === undefined) return false
    const toolset = catalog.modes.find((entry) => entry.id === toolsetId)
    if (toolset === undefined) return false
    let globals
    try {
      globals = tools.schemas() ?? []
    } catch {
      return false
    }
    const drop = globals
      .map((schema) => (typeof schema.name === 'string' ? schema.name : ''))
      .filter((toolName) => toolName !== '' && matchesAny(toolName, toolset.deny ?? []))

    const previous = live.get(agent.id)
    let disposeNote = 'none'
    if (previous !== undefined) {
      try {
        previous.dispose?.()
        disposeNote = 'ok'
      } catch (error) {
        disposeNote = `fail:${error?.message ?? error}`
      }
    }
    live.delete(agent.id)
    if (drop.length === 0) {
      diag.applied.push({ sessionId: agent.id, toolset: toolset.id, dropped: 0, at: new Date().toISOString() })
      return true
    }
    try {
      const dispose = agent.ctx.tools.restrict({ deny: drop })
      live.set(agent.id, { dispose, toolset: toolset.id })
      diag.applied.push({ sessionId: agent.id, toolset: toolset.id, dropped: drop.length, at: new Date().toISOString() })
      if (diag.applied.length > 20) diag.applied.shift()
      return true
    } catch (error) {
      diag.lastError = String(error?.message ?? error)
      ctx.logger?.('mode-switch')?.warn?.(`restrict failed for ${toolset.id}: ${error?.message ?? error}`)
      return false
    }
  }

  /**
   * Section names owned by a tool family the toolset denies.
   *
   * A plugin whose tools are trimmed usually also narrates itself in the system
   * prompt (lunheng appends a `{ name: 'lunheng', text }` section from its
   * `system-prompt/assemble` hook). Denying `lunheng_*` therefore also drops the
   * `lunheng` section: same family, same decision.
   */
  const sectionFamiliesFor = (toolset) => sectionFamilies(toolset)

  /** Per-agent prompt-section filters, keyed by session id. */
  const promptFilters = new Map()

  /** Install (or refresh) this agent's prompt-section filter for one toolset. */
  const installPromptFilter = (agent, toolsetId) => {
    const toolset = catalog.modes.find((entry) => entry.id === toolsetId)
    if (toolset === undefined) return
    const families = sectionFamiliesFor(toolset)
    const current = promptFilters.get(agent.id)
    if (current !== undefined && current.families.join(',') === families.join(',')) return
    if (current !== undefined) {
      try {
        current.dispose?.()
      } catch {
        // A disposer that already ran is not an error.
      }
      promptFilters.delete(agent.id)
    }
    if (families.length === 0) return
    const on = agent.ctx?.on
    if (typeof on !== 'function') return
    try {
      // `prepend` puts this listener outermost: its `next()` resolves to the
      // assembly every other contributor (including the trimmed plugin) has
      // already produced, so filtering here sees their sections.
      const dispose = on.call(
        agent.ctx,
        'system-prompt/assemble',
        async (_assembly, _context, next) => {
          const assembled = await next()
          try {
            return trimPromptSections(assembled, families)
          } catch (error) {
            ctx.logger?.('mode-switch')?.warn?.(`prompt section filter skipped: ${error?.message ?? error}`)
            return assembled
          }
        },
        { prepend: true },
      )
      promptFilters.set(agent.id, { families, dispose })
      diag.promptFilter = { sessionId: agent.id, families, at: new Date().toISOString() }
    } catch (error) {
      diag.lastError = String(error?.message ?? error)
      ctx.logger?.('mode-switch')?.warn?.(`prompt filter failed for ${toolset.id}: ${error?.message ?? error}`)
    }
  }

  /** Toolset this session should run: its stored choice, else the default. */
  const toolsetFor = (sessionId) => {
    refreshCatalog()
    const store = readSessions()
    const stored = store[sessionId]
    // A stored value is either the plain preference (string) or the applied
    // record written at the first step ({ mode, appliedAt }).
    const id = typeof stored === 'string' ? stored : stored !== null && typeof stored === 'object' ? stored.mode : undefined
    if (typeof id === 'string' && catalog.modes.some((entry) => entry.id === id)) return id
    return DEFAULT_TOOLSET
  }

  /** Apply the stored-or-default toolset once, before the agent's first step. */
  const ensureToolset = (agent, position) => {
    if (live.has(agent.id)) return
    // The harness appends `turn/start` BEFORE it dispatches `agent/pre-step`, so
    // inside a step the turn-boundary projection already carries an open turn:
    // `sessionBlank()` is never true there, and gating on it never applies.
    // Gate on the step position instead — the first step of the first turn is
    // exactly the point before the session's first request is assembled.
    if (position?.turn !== 1 || position?.step !== 1) return
    const chosen = toolsetFor(agent.id)
    if (applyToolset(agent, chosen)) recordApplied(agent.id, chosen)
    installPromptFilter(agent, chosen)
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    try {
      ensureToolset(payload.agent, payload)
    } catch (error) {
      ctx.logger?.('mode-switch')?.warn?.(`toolset apply skipped: ${error?.message ?? error}`)
    }
    return next()
  })

  ctx.on('agent/created', (payload) => {
    // The event payload is `{ agent, source, signal }` — not the agent itself.
    const agent = payload?.agent ?? payload
    if (agent?.id === undefined) return
    // Trim at creation, one macrotask later, because this is the only moment
    // BEFORE the first request is assembled: `agent/pre-step` is too late — the
    // harness calls `systemPrompt.assemble()` (which freezes the tool list)
    // before it dispatches that waterfall, so a trim applied there only reaches
    // the second request.
    // The deferral is required: inside agent/created the agent's scope is still
    // being bound, and restrict() there would re-link the scope key and fail the
    // whole session creation.
    setTimeout(() => {
      try {
        if (live.has(agent.id)) return
        const chosen = toolsetFor(agent.id)
        if (applyToolset(agent, chosen)) recordApplied(agent.id, chosen)
        installPromptFilter(agent, chosen)
      } catch (error) {
        ctx.logger?.('mode-switch')?.warn?.(`toolset apply at creation skipped: ${error?.message ?? error}`)
      }
    }, 0)
  })

  // Tool registration can finish after an agent exists (MCP connects late).
  ctx.on('tools/change', () => {
    try {
      for (const agent of ctx.get('agents')?.list() ?? []) {
        // Only refresh agents this plugin already trimmed; sessions that predate
        // the plugin keep the tool set they were created with.
        if (live.has(agent.id)) applyToolset(agent, toolsetFor(agent.id))
      }
    } catch (error) {
      ctx.logger?.('mode-switch')?.warn?.(`toolset refresh skipped: ${error?.message ?? error}`)
    }
  })

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: route(ctx, statusPayload, refreshCatalog, live) }),
    'mode-switch: status route',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: DETAIL_PATH, handler: route(ctx, detailPayload, refreshCatalog, live) }),
    'mode-switch: detail route',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: VERIFY_PATH, handler: route(ctx, verifyPayload, refreshCatalog, live) }),
    'mode-switch: verify route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SELECT_PATH,
        handler: async (req, res) => {
          let status = 200
          let payload
          try {
            if (req.method !== 'POST') {
              status = 405
              payload = { ok: false, reason: 'method-not-allowed' }
            } else {
              const url = new URL(req.url ?? SELECT_PATH, 'http://localhost')
              const sessionId = url.searchParams.get('sessionId') ?? ''
              const toolset = url.searchParams.get('toolset') ?? ''
              payload = selectPayload(ctx, refreshCatalog(), sessionId, toolset, applyToolset, live)
            }
          } catch (error) {
            status = 500
            payload = { ok: false, reason: error instanceof Error ? error.message : String(error) }
          }
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(payload))
        },
      }),
    'mode-switch: select route',
  )
}

/** Wrap one payload builder into a JSON route handler. */
function route(ctx, build, getCatalog, live) {
  return async (req, res) => {
    let status = 200
    let payload
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      payload = await build(ctx, url.searchParams.get('sessionId') ?? undefined, getCatalog(), live)
    } catch (error) {
      status = 500
      payload = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(payload))
  }
}

/** Request-level evidence: what this session's requests really carried. */
function verifyPayload(ctx, sessionId, catalog, live) {
  if (sessionId === undefined || sessionId === '') return { ok: false, reason: 'no-session' }
  const evidence = sessionEvidence(sessionId, catalog.modes)
  const stored = readSessions()[sessionId]
  const recorded = typeof stored === 'string' ? stored : stored?.mode
  return {
    ok: true,
    sessionId,
    log: evidence.log,
    ...(evidence.error === undefined ? {} : { error: evidence.error }),
    requestCount: evidence.requests.length,
    requests: evidence.requests.slice(0, 20),
    first: evidence.first,
    recorded,
  }
}

/** The compact document behind the chip. */
function statusPayload(ctx, sessionId, catalog, live) {
  const agent = sessionId === undefined ? undefined : liveAgent(ctx, sessionId)
  const toolsetId0 = displayedToolset(ctx, catalog, agent, live)
  const toolset0 = catalog.modes.find((entry) => entry.id === toolsetId0)
  // Until the toolset is actually applied (first step), report what the chosen
  // toolset WOULD leave visible, so switching updates the number immediately.
  const projected = agent !== undefined && !live.has(agent.id)
  let schemas = visibleSchemas(ctx, agent)
  if (projected && toolset0 !== undefined) {
    schemas = schemas.filter((schema) => {
      const toolName = typeof schema.name === 'string' ? schema.name : ''
      return toolName === '' || !matchesAny(toolName, toolset0.deny ?? [])
    })
  }
  const schemaChars = JSON.stringify(schemas).length
  const toolsetId = displayedToolset(ctx, catalog, agent, live)
  const toolset = catalog.modes.find((entry) => entry.id === toolsetId)
  const presetId = officialPreset(ctx, agent)
  const applied = agent !== undefined && live.has(agent.id)
  const blank = agent !== undefined ? sessionBlank(ctx, agent) : false
  // A preference written while the session was blank but never applied before
  // the first request went out (e.g. an older build wrote it mid-conversation).
  const stored = agent === undefined ? undefined : readSessions()[agent.id]
  const pendingToolset = !applied
    && !blank
    && typeof stored === 'string'
    && stored !== 'mode-full'
    && catalog.modes.some((entry) => entry.id === stored)
    ? stored
    : undefined
  return {
    ok: true,
    sessionId: sessionId ?? null,
    live: agent !== undefined,
    nextSessionOnly: pendingToolset !== undefined,
    pendingToolset: pendingToolset === undefined ? undefined : catalog.modes.find((entry) => entry.id === pendingToolset)?.name,
    preset: presetId,
    toolset: toolset?.id,
    toolsetName: toolset?.name,
    blank,
    fixed: agent !== undefined && (!blank || applied),
    applied,
    projected,
    toolsets: [...catalog.modes]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((entry) => ({ id: entry.id, name: entry.name, current: entry.id === toolset?.id })),
    toolCount: schemas.length,
    schemaChars,
    estimatedTokens: Math.round(schemaChars / CHARS_PER_TOKEN),
    diag: catalog.diag,
  }
}

/** The expanded panel: every toolset with its footprint and the visible tools. */
async function detailPayload(ctx, sessionId, catalog, live) {
  const agent = sessionId === undefined ? undefined : liveAgent(ctx, sessionId)
  const schemas = visibleSchemas(ctx, agent)
  const tools = schemas
    .map((schema) => {
      const chars = JSON.stringify(schema).length
      return {
        name: typeof schema.name === 'string' ? schema.name : '?',
        chars,
        tokens: Math.round(chars / CHARS_PER_TOKEN),
      }
    })
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
  const chars = tools.reduce((sum, tool) => sum + tool.chars, 0)
  const currentId = displayedToolset(ctx, catalog, agent, live)
  const globals = globalSchemas(ctx)
  const applied = agent !== undefined && live.has(agent.id)
  const recorded = agent === undefined ? undefined : recordedToolset(agent.id)
  const trimmed = applied || recorded !== undefined
  // Estimate an untrimmed session from its own schema list (it already carries
  // the preset/agent-scoped tools); a trimmed one can only be estimated from the
  // global registry, because its visible list can no longer be widened.
  const estimateBase = agent !== undefined && !trimmed ? schemas : globals
  const toolsets = []
  for (const entry of [...catalog.modes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const current = entry.id === currentId
    // Every row carries the same fields, so the panel never shows a dash. A row
    // is measured when its deny rules are exactly what the session already runs
    // (applied live, recorded as applied, or the full toolset).
    const measured = current && (applied || (entry.deny ?? []).length === 0 || recorded === entry.id)
    const footprint = measured
      ? { tools: tools.length, estimatedTokens: Math.round(chars / CHARS_PER_TOKEN), measured: true }
      : estimateToolset(estimateBase, entry)
    toolsets.push({ id: entry.id, name: entry.name, deny: entry.deny ?? [], current, ...footprint })
  }
  return {
    ok: true,
    sessionId: sessionId ?? null,
    live: agent !== undefined,
    applied,
    preset: officialPreset(ctx, agent),
    toolset: currentId,
    toolsetName: catalog.modes.find((entry) => entry.id === currentId)?.name,
    toolsets,
    tools,
    totals: { tools: tools.length, chars, estimatedTokens: Math.round(chars / CHARS_PER_TOKEN) },
  }
}

/** Estimate a toolset from the global registry alone (preset tools are equal in every toolset). */
function estimateToolset(globals, toolset) {
  let chars = 0
  let count = 0
  for (const schema of globals) {
    const toolName = typeof schema.name === 'string' ? schema.name : ''
    if (toolName === '' || matchesAny(toolName, toolset.deny ?? [])) continue
    chars += JSON.stringify(schema).length
    count += 1
  }
  return { tools: count, estimatedTokens: Math.round(chars / CHARS_PER_TOKEN) }
}

/** Switch one session's toolset: persist the choice, then apply it live. */
function selectPayload(ctx, catalog, sessionId, toolsetId, applyToolset, live) {
  if (sessionId === '') return { ok: false, reason: 'no-session' }
  if (!catalog.modes.some((entry) => entry.id === toolsetId)) return { ok: false, reason: 'unknown-toolset' }
  const agent = liveAgent(ctx, sessionId)
  if (agent === undefined) return { ok: false, reason: 'no-live-agent' }
  // The toolset is a pre-flight decision: once the session has started a turn
  // the tool catalog is assembled and cannot be widened, so the choice is closed.
  if (!sessionBlank(ctx, agent)) {
    return { ok: false, reason: 'session-started', toolset: displayedToolset(ctx, catalog, agent, live) }
  }
  writeSession(sessionId, toolsetId)
  return { ok: true, toolset: toolsetId, stored: true, applied: false }
}

/**
 * The toolset this agent actually runs.
 *
 * An agent only carries a toolset when one was applied to it: an explicit
 * choice, or the default applied while it was still blank. Anything else — a
 * conversation that predates the plugin — is untrimmed and reads as the full
 * toolset, never as the default.
 */
function displayedToolset(ctx, catalog, agent, live) {
  if (agent === undefined) return undefined
  const applied = live.get(agent.id)?.toolset
  if (typeof applied === 'string' && catalog.modes.some((entry) => entry.id === applied)) return applied
  // The in-memory record is lost when the plugin reloads; the applied record on
  // disk is what lets a trimmed session keep reading as its toolset afterwards.
  const recorded = recordedToolset(agent.id)
  if (recorded !== undefined && catalog.modes.some((entry) => entry.id === recorded)) return recorded
  const blank = sessionBlank(ctx, agent)
  // A stored preference only describes the session once it has actually been
  // applied (first step) or while the session is still blank (it will be applied
  // at that first step). A conversation that already ran keeps the tool set it
  // was created with — even if an older build wrote a preference for it — so it
  // must read as the full toolset, never as the stored one.
  const stored = readSessions()[agent.id]
  if (blank && typeof stored === 'string' && catalog.modes.some((entry) => entry.id === stored)) return stored
  return blank ? DEFAULT_TOOLSET : 'mode-full'
}

/** The toolset a session was actually trimmed to, as written at its first step. */
function recordedToolset(sessionId) {
  const value = readSessions()[sessionId]
  if (value !== null && typeof value === 'object' && typeof value.mode === 'string') return value.mode
  return undefined
}

/** Whether this session has not started a turn yet (informational only). */
function sessionBlank(ctx, agent) {
  try {
    const boundary = ctx.get('sessionProjections')?.stateOf(agent.session, 'turnBoundary')
    if (boundary === undefined) return true
    return boundary.openTurnStartSeq === null && boundary.lastTurn === 0
  } catch {
    return false
  }
}

/** @returns {object | undefined} the live Agent registered for this session id. */
function liveAgent(ctx, sessionId) {
  try {
    return ctx.get('agents')?.get(sessionId)
  } catch {
    return undefined
  }
}

/** The model-facing tool schemas this session would send. */
function visibleSchemas(ctx, agent) {
  const tools = ctx.get('tools')
  if (tools === undefined) return []
  if (agent !== undefined) {
    try {
      return tools.schemas(agent) ?? []
    } catch {
      // Fall through to the process-wide view.
    }
  }
  return globalSchemas(ctx)
}

/** The unscoped registry view, used for estimates. */
function globalSchemas(ctx) {
  try {
    return ctx.get('tools')?.schemas() ?? []
  } catch {
    return []
  }
}

/** The official preset this agent runs (display only; never changed here). */
function officialPreset(ctx, agent) {
  if (agent === undefined) return undefined
  try {
    const composed = ctx.get('agentPresets')?.composedPreset(agent.ctx)
    if (typeof composed === 'string' && composed !== '') return composed
  } catch {
    // Fall through to the session projection.
  }
  try {
    const value = ctx.get('sessionProjections')?.stateOf(agent.session, 'agentPreset')
    if (typeof value === 'string' && value !== '') return value
  } catch {
    // No projection registry.
  }
  return undefined
}

/** Per-session toolset choices. */
function sessionsPath() {
  return catalogPath().replace(/catalog\.json$/, 'sessions.json')
}

function readSessions() {
  try {
    const file = sessionsPath()
    if (!fs.existsSync(file)) return {}
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Drop records whose session directory no longer exists.
 *
 * Sessions live at `<home>/sessions/<workspace>/session-<id>/`; an id present in
 * no workspace bucket belongs to a deleted session (or a workspace removed by
 * hand). Nothing is dropped while the sessions tree is missing or empty — that
 * means the home is wrong, not that every session vanished.
 */
export function pruneSessions() {  try {
    const home = path.resolve(catalogPath(), '..', '..', '..')
    const root = path.join(home, 'sessions')
    const buckets = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    const known = new Set()
    for (const bucket of buckets) {
      let entries = []
      try {
        entries = fs.readdirSync(path.join(root, bucket.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session-')) known.add(entry.name)
      }
    }
    if (known.size === 0) return { removed: 0, kept: Object.keys(readSessions()).length }
    const store = readSessions()
    const kept = {}
    const removed = []
    for (const [id, value] of Object.entries(store)) {
      if (!id.startsWith('session-') || known.has(id)) kept[id] = value
      else removed.push(id)
    }
    if (removed.length > 0) {
      const file = sessionsPath()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`, 'utf8')
    }
    return { removed: removed.length, kept: Object.keys(kept).length }
  } catch {
    return { removed: 0 }
  }
}

function writeSession(sessionId, toolsetId) {
  try {
    const file = sessionsPath()
    const store = readSessions()
    store[sessionId] = toolsetId
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  } catch {
    // A failed write only loses the memory of this choice.
  }
}

/** Remember that this session's tools really were trimmed to `toolsetId`. */
function recordApplied(sessionId, toolsetId) {
  try {
    const file = sessionsPath()
    const store = readSessions()
    const previous = store[sessionId]
    // Keep the original timestamp: a refresh (tools/change) re-applies the same
    // toolset and must not restamp the session as newly applied.
    if (previous !== null && typeof previous === 'object' && previous.mode === toolsetId) return
    store[sessionId] = { mode: toolsetId, appliedAt: new Date().toISOString() }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  } catch {
    // Losing this only costs the label after the next plugin reload.
  }
}

/**
 * Tool families a toolset denies, derived from its prefix patterns:
 * `lunheng_*` → `lunheng`. A plugin's prompt section is named after the same
 * family, so one deny rule trims both its tools and its narration.
 */
export function sectionFamilies(toolset) {
  return (toolset?.deny ?? [])
    .filter((pattern) => typeof pattern === 'string' && pattern.endsWith('*'))
    .map((pattern) => pattern.slice(0, -1).replace(/_+$/, '').toLowerCase())
    .filter((family) => family !== '')
}

/**
 * Drop prompt sections owned by denied tool families from one assembly result.
 * Returns the input untouched when nothing matches, so callers can hand the
 * result to the next contributor unchanged.
 */
export function trimPromptSections(assembled, families) {
  if (!Array.isArray(families) || families.length === 0) return assembled
  const sections = assembled?.sections
  if (!Array.isArray(sections)) return assembled
  const kept = sections.filter((section) => {
    const name = String(section?.name ?? '').toLowerCase()
    return name === '' || !families.includes(name)
  })
  if (kept.length === sections.length) return assembled
  return { ...assembled, sections: kept }
}