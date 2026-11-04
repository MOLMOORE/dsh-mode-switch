// Logic-level guard for the first-step gate: no harness, no SolidWorks, no network.
// Runs against a throwaway DSH_HOME so it never touches the real sessions.json.
import path from 'node:path'
import fs from 'node:fs'

const home = path.resolve('.gate-home')
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply, sectionFamilies, trimPromptSections } = await import('../index.js')

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


