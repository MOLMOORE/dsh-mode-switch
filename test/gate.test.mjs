// Logic-level guard for the first-step gate: no harness, no SolidWorks, no network.
// Runs against a throwaway DSH_HOME so it never touches the real sessions.json.
import path from 'node:path'
import fs from 'node:fs'

const home = path.resolve('.gate-home')
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply, sectionFamilies, trimPromptSections, pruneSessions, resolveModeId, normalizeModes } = await import('../index.js')
const { loadCatalog } = await import('../catalog.js')
const { requestEvidence } = await import('../session-log.js')
const { buildAutoPrompt, parseModesJson } = await import('../auto.js')

const tools = [
  { name: 'mcp__solidworks__solidworks_connect' },
  { name: 'ego_click' },
  { name: 'ppt_create' },
  { name: 'fs_read' },
  { name: 'bash' },
]

function makeCtx() {
  const handlers = new Map()
  return {
    handlers,
    logger: () => ({ warn: () => {}, info: () => {} }),
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, [])
      handlers.get(name).push(fn)
      return () => {}
    },
    effect(fn) {
      return fn()
    },
    get(name) {
      if (name === 'tools') return { schemas: () => tools }
      if (name === 'agents') return { list: () => [] }
      return undefined
    },
    webServer: { register: () => () => {} },
  }
}

function makeAgent(id, calls) {
  return {
    id,
    session: {},
    ctx: {
      tools: {
        restrict({ deny }) {
          calls.push({ id, deny })
          return () => {}
        },
      },
    },
  }
}

const ctx = makeCtx()
apply(ctx)
const preStep = ctx.handlers.get('agent/pre-step')?.[0]
if (typeof preStep !== 'function') {
  console.log('FAIL: no agent/pre-step handler registered')
  process.exit(1)
}

const calls = []
const next = async () => ({ kind: 'enter', messages: [] })

await preStep({ agent: makeAgent('session-a', calls), turn: 2, step: 1, messages: [] }, next)
console.log('turn2.step1 restrictCalls =', calls.length, calls.length === 0 ? 'OK' : 'FAIL (must not trim a running conversation)')

const agentA = makeAgent('session-a', calls)
await preStep({ agent: agentA, turn: 1, step: 1, messages: [] }, next)
const firstDeny = calls[0]?.deny ?? []
console.log('turn1.step1 restrictCalls =', calls.length, calls.length === 1 ? 'OK' : 'FAIL')
console.log('deny covers solidworks =', firstDeny.includes('mcp__solidworks__solidworks_connect') ? 'OK' : 'FAIL')
console.log('deny covers fs_read =', firstDeny.includes('fs_read') ? 'FAIL (core tool denied)' : 'OK')

await preStep({ agent: agentA, turn: 1, step: 2, messages: [] }, next)
console.log('same agent second step restrictCalls =', calls.length, calls.length === 1 ? 'OK (applied once)' : 'FAIL')

await preStep({ agent: makeAgent('session-b', calls), turn: 1, step: 1, messages: [] }, next)
console.log('fresh session first step restrictCalls =', calls.length, calls.length === 2 ? 'OK' : 'FAIL')

const store = JSON.parse(fs.readFileSync(path.join(home, 'state', 'mode-switch', 'sessions.json'), 'utf8'))
console.log('applied records =', JSON.stringify(store), Object.values(store).every((v) => v && typeof v === 'object' && typeof v.mode === 'string') ? 'OK' : 'FAIL')

// The created path must read `payload.agent` (the event payload is an object, not
// the agent). This is the trim that actually reaches the FIRST request.
const created = ctx.handlers.get('agent/created')?.[0]
if (typeof created !== 'function') {
  console.log('created handler = FAIL (not registered)')
  process.exit(1)
}
const before = calls.length
created({ agent: makeAgent('session-c', calls), source: 'fresh' })
await new Promise((resolve) => setTimeout(resolve, 20))
console.log('created payload.agent restrictCalls =', calls.length - before, calls.length - before === 1 ? 'OK' : 'FAIL (payload destructuring)')

// A conversation that predates the plugin carries no record. Resuming it must
// NOT adopt the default toolset: trimming it would also write an applied record,
// which makes the change permanent and makes the session read as 基础档 forever.
// That is exactly how pre-plugin conversations were being rewritten.
const beforeResume = calls.length
created({ agent: makeAgent('session-old', calls), source: 'resume' })
await new Promise((resolve) => setTimeout(resolve, 20))
console.log('resume of an old session restrictCalls =', calls.length - beforeResume, calls.length === beforeResume ? 'OK (left untrimmed)' : 'FAIL (rewrote a pre-plugin session)')
const afterResume = JSON.parse(fs.readFileSync(path.join(home, 'state', 'mode-switch', 'sessions.json'), 'utf8'))
console.log('resume of an old session writes no record =', afterResume['session-old'] === undefined ? 'OK' : 'FAIL (persisted the default)')

// Prompt sections: a toolset that denies `<family>_*` also drops the prompt
// section the same plugin contributes (lunheng appends `{ name: 'lunheng' }`).
const basic = { id: 'mode-basic', deny: ['mcp__solidworks__*', 'lunheng_*'] }
const office = { id: 'mode-office', deny: ['mcp__solidworks__*', 'paper_*'] }
const assembly = {
  variables: { provider: 'x' },
  sections: [
    { name: 'base', text: 'base' },
    { name: 'lunheng', text: '论衡提示段' },
  ],
}
console.log('sectionFamilies(basic) =', JSON.stringify(sectionFamilies(basic)))
const trimmed = trimPromptSections(assembly, sectionFamilies(basic))
console.log('basic drops lunheng section =', trimmed.sections.length === 1 && trimmed.sections[0].name === 'base' ? 'OK' : 'FAIL')
console.log('other sections untouched =', trimmed.variables === assembly.variables ? 'OK' : 'FAIL')
console.log('office keeps lunheng section =', trimPromptSections(assembly, sectionFamilies(office)) === assembly ? 'OK' : 'FAIL')

// The created path must install the filter on the agent scope, prepended so its
// next() sees the sections the trimmed plugin appended.
const hooks = []
const agentD = {
  id: 'session-d',
  session: {},
  ctx: {
    tools: { restrict: () => () => {} },
    on(name, fn, options) {
      hooks.push({ name, fn, options })
      return () => {}
    },
  },
}
created({ agent: agentD, source: 'fresh' })
await new Promise((resolve) => setTimeout(resolve, 20))
const filter = hooks.find((hook) => hook.name === 'system-prompt/assemble')
console.log('prompt filter installed =', filter !== undefined ? 'OK' : 'FAIL')
console.log('prompt filter prepended =', filter?.options?.prepend === true ? 'OK' : 'FAIL')
if (filter !== undefined) {
  const filtered = await filter.fn({}, {}, async () => assembly)
  console.log('filter output sections =', filtered.sections.map((section) => section.name).join(','),
    filtered.sections.length === 1 && filtered.sections[0].name === 'base' ? 'OK' : 'FAIL')
}

// Request evidence: the verify route reads `request/header` events, so the
// parser must count real tool names and score them against each mode's deny.
const evidenceText = [
  JSON.stringify({ type: 'request/header', seq: 16, data: { header: { tools: [{ name: 'a' }, { name: 'lunheng_x' }, { name: 'b' }] } } }),
  JSON.stringify({ type: 'message', seq: 17, data: {} }),
  JSON.stringify({ type: 'request/header', seq: 40, data: { header: { tools: [{ name: 'a' }, { name: 'b' }] } } }),
  JSON.stringify({ type: 'request/header', seq: 41, data: { header: { tools: ['a'] } } }),
].join('\n')
const rows = requestEvidence(evidenceText, [{ id: 'mode-basic', deny: ['lunheng_*'] }])
console.log('evidence rows =', rows.length, rows.length === 3 ? 'OK' : 'FAIL')
console.log('evidence first tools =', rows[0]?.tools, rows[0]?.tools === 3 ? 'OK' : 'FAIL')
console.log('evidence first leaks =', rows[0]?.leaks['mode-basic'], rows[0]?.leaks['mode-basic'] === 1 ? 'OK' : 'FAIL')
console.log('evidence string tools =', rows[2]?.tools, rows[2]?.tools === 1 ? 'OK' : 'FAIL')

// Catalog hot reload: editing the user catalog must take effect without a
// restart, and a half-written file must keep the last good copy.
const catalogFile = path.join(home, 'state', 'mode-switch', 'catalog.json')
fs.mkdirSync(path.dirname(catalogFile), { recursive: true })
fs.writeFileSync(catalogFile, JSON.stringify({ modes: [{ id: 'mode-a', name: 'A', order: 1, deny: [] }] }), 'utf8')
const firstLoad = loadCatalog()
console.log('catalog first read =', firstLoad.modes[0]?.id, firstLoad.modes[0]?.id === 'mode-a' ? 'OK' : 'FAIL')
fs.writeFileSync(catalogFile, JSON.stringify({ modes: [{ id: 'mode-b', name: 'B', order: 1, deny: [] }] }), 'utf8')
const future = new Date(Date.now() + 5000)
fs.utimesSync(catalogFile, future, future)
const secondLoad = loadCatalog()
console.log('catalog reloaded =', secondLoad.modes[0]?.id, secondLoad.modes[0]?.id === 'mode-b' ? 'OK' : 'FAIL')
fs.writeFileSync(catalogFile, '{ broken', 'utf8')
const afterBroken = loadCatalog()
console.log('catalog keeps last good copy =', afterBroken.modes[0]?.id === 'mode-b' ? 'OK' : 'FAIL')

// Session records: entries for sessions whose directory is gone must be pruned,
// and the write must leave the surviving entries intact.
const sessionsFile = path.join(home, 'state', 'mode-switch', 'sessions.json')
fs.mkdirSync(path.join(home, 'sessions', 'workspace-x', 'session-keep'), { recursive: true })
fs.writeFileSync(sessionsFile, JSON.stringify({
  'session-keep': { mode: 'mode-basic', appliedAt: '2026-11-01T00:00:00.000Z' },
  'session-gone': { mode: 'mode-office', appliedAt: '2026-11-01T00:00:00.000Z' },
  'not-a-session': 'mode-full',
}, null, 2), 'utf8')
const pruned = pruneSessions()
const afterPrune = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'))
console.log('prune removed =', pruned.removed, pruned.removed === 1 ? 'OK' : 'FAIL')
console.log('prune kept live session =', afterPrune['session-keep'] !== undefined ? 'OK' : 'FAIL')
console.log('prune kept foreign key =', afterPrune['not-a-session'] !== undefined ? 'OK' : 'FAIL')

// Mode editing: the submitted list is the single writable surface, so ids,
// names and deny patterns must be validated before anything is written.
const accepted = normalizeModes([
  { id: 'mode-work', name: ' 工作 ', order: 10, deny: ['a_*', '', 3] },
  { id: 'mode-play', name: '玩', deny: ['b'] },
])
console.log('modes accepted =', accepted.error === undefined ? 'OK' : `FAIL (${accepted.error})`)
console.log('mode name trimmed =', accepted.modes?.[0]?.name === '工作' ? 'OK' : 'FAIL')
console.log('mode deny cleaned =', JSON.stringify(accepted.modes?.[0]?.deny) === '["a_*"]' ? 'OK' : 'FAIL')
console.log('duplicate id rejected =', normalizeModes([{ id: 'x', name: 'X' }, { id: 'x', name: 'Y' }]).error !== undefined ? 'OK' : 'FAIL')
console.log('empty name rejected =', normalizeModes([{ id: 'x', name: ' ' }]).error !== undefined ? 'OK' : 'FAIL')
console.log('bad id rejected =', normalizeModes([{ id: 'no spaces', name: 'X' }]).error !== undefined ? 'OK' : 'FAIL')
console.log('empty list rejected =', normalizeModes([]).error !== undefined ? 'OK' : 'FAIL')
const fallback = resolveModeId({ modes: [{ id: 'mode-z', name: 'Z', order: 20 }, { id: 'mode-y', name: 'Y', order: 10 }] }, 'mode-deleted')
console.log('deleted mode falls back to first by order =', fallback === 'mode-y' ? 'OK' : `FAIL (${fallback})`)

// AI proposal: the prompt must carry real tool names and demand JSON; the
// parser must survive fences and prose, and reject unusable answers.
const autoPrompt = buildAutoPrompt([{ name: 'ppt_make', description: 'create slides' }, { name: 'fs_read' }], [])
console.log('auto prompt lists tools =', autoPrompt.user.includes('ppt_make') && autoPrompt.user.includes('fs_read') ? 'OK' : 'FAIL')
console.log('auto prompt demands json =', /STRICT JSON/.test(autoPrompt.system) ? 'OK' : 'FAIL')
const fenced = parseModesJson('```json\n{"reason":"按用途分组","modes":[{"id":"mode-a","name":"日常","deny":["ppt_*"]},{"id":"mode-b","name":"全部","deny":[]}]}\n```')
console.log('auto parses fenced json =', fenced.modes?.length === 2 && fenced.modes[0].deny?.[0] === 'ppt_*' ? 'OK' : 'FAIL')
const chattered = parseModesJson('好的，这是方案：{"modes":[{"id":"mode-a","name":"日常","deny":[]}]} 希望有帮助。')
console.log('auto parses prose-wrapped json =', chattered.modes?.length === 1 ? 'OK' : 'FAIL')
console.log('auto rejects non-json =', parseModesJson('没有 JSON').error !== undefined ? 'OK' : 'FAIL')
console.log('auto rejects invalid modes =', parseModesJson('{"modes":[]}').error !== undefined ? 'OK' : 'FAIL')
console.log('existing mode kept =', resolveModeId({ modes: [{ id: 'mode-z', name: 'Z', order: 20 }] }, 'mode-z') === 'mode-z' ? 'OK' : 'FAIL')





// Re-entrancy: the host emits `tools/change` SYNCHRONOUSLY from inside
// `restrict()` and from its disposer (`ScopedLayers.effect` ends with
// `onChange()`; `Context.emit` runs listeners inline). Our own `tools/change`
// handler re-applies the toolset to every agent this plugin trimmed, so without
// a guard each trim re-enters that handler and recurses without bound — the
// host's single thread stalls and the window dies with no crash report. This
// drives that exact loop through a host-shaped fake.
const recAgents = []
const restrictCalls = []
const recCtx = makeCtx()
recCtx.get = (name) => {
  if (name === 'tools') return { schemas: () => tools }
  if (name === 'agents') return { list: () => recAgents }
  return undefined
}
const emit = (name, payload) => {
  for (const fn of recCtx.handlers.get(name) ?? []) fn(payload)
}
const recAgent = {
  id: 'session-reentrant',
  session: {},
  ctx: {
    tools: {
      restrict({ deny }) {
        restrictCalls.push(deny)
        emit('tools/change')
        return () => {
          emit('tools/change')
        }
      },
    },
    on: () => () => {},
  },
}
recAgents.push(recAgent)
// Earlier blocks left a deny-free catalog behind; this test needs a toolset that
// actually trims, otherwise no restrict() ever runs and the loop goes untested.
fs.writeFileSync(
  catalogFile,
  JSON.stringify({ modes: [{ id: 'mode-basic', name: 'Basic', order: 1, deny: ['ppt_*', 'mcp__solidworks__*'] }] }),
  'utf8',
)
const bumped = new Date(Date.now() + 10000)
fs.utimesSync(catalogFile, bumped, bumped)
apply(recCtx)
recCtx.handlers.get('agent/created')[0]({ agent: recAgent, source: 'fresh' })
await new Promise((resolve) => setTimeout(resolve, 30))
console.log('re-entrant trim calls =', restrictCalls.length, restrictCalls.length <= 2 ? 'OK (bounded)' : 'FAIL (unbounded re-entry)')

const beforeChange = restrictCalls.length
emit('tools/change')
console.log('same registry re-applies =', restrictCalls.length - beforeChange, restrictCalls.length === beforeChange ? 'OK (no-op)' : 'FAIL (churned a layer)')

tools.push({ name: 'ppt_extra' })
emit('tools/change')
console.log('changed registry re-applies =', restrictCalls.length - beforeChange, restrictCalls.length > beforeChange ? 'OK' : 'FAIL (missed the new tool)')
tools.pop()
