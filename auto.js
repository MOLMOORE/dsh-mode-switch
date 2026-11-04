/**
 * Model-assisted profile proposal.
 *
 * One auxiliary call asks the configured default model to group the machine's
 * tools into profiles and return JSON. Nothing here writes the catalog: the
 * route hands the proposal back to the panel, the user reviews it, and the
 * existing save route persists it after validation.
 */
import { normalizeModes } from './catalog.js'

/** Keep the prompt small enough for a cheap call: names matter most. */
const MAX_TOOLS = 220
const DESCRIPTION_CHARS = 110

/** One line per tool, trimmed to what a grouping decision needs. */
function describeTools(tools) {
  return tools
    .slice(0, MAX_TOOLS)
    .map((tool) => {
      const text = typeof tool?.description === 'string' ? tool.description.replace(/\s+/g, ' ').trim() : ''
      return text === '' ? `- ${tool.name}` : `- ${tool.name}: ${text.slice(0, DESCRIPTION_CHARS)}`
    })
    .join('\n')
}

export function buildAutoPrompt(tools, modes = []) {
  const existing = modes.length === 0
    ? '(none yet)'
    : modes.map((mode) => `${mode.id} "${mode.name}" deny=${JSON.stringify(mode.deny ?? [])}`).join('\n')
  const system = [
    'You configure tool profiles for a coding agent harness.',
    'A profile is a deny list of tool-name patterns: `foo_*` matches by prefix, anything else must match exactly.',
    'Tools not in the global list (file editing, todo, asking the user) cannot be trimmed and must not appear in any rule.',
    'Group tools by what they are for. A typical set is: a minimal profile with only everyday coding tools, one or two',
    'domain profiles that keep a specific family (office documents, CAD, research) and drop the rest, and a full profile with deny [].',
    'Keep the number of profiles between 3 and 5. Names are short Chinese labels. Ids are lowercase slugs starting with `mode-`.',
    'Return STRICT JSON only, no prose, no code fence:',
    '{"reason":"one short sentence","modes":[{"id":"mode-x","name":"名称","order":10,"deny":["foo_*","bar"]}]}',
  ].join('\n')
  const user = [
    `Existing profiles:\n${existing}`,
    '',
    'Global tools available on this machine:',
    describeTools(tools),
    '',
    'Propose profiles for these exact tools. Every deny pattern must be meaningful for the names above.',
  ].join('\n')
  return { system, user }
}

/** Pull the first JSON object out of a model answer (fenced or prose-wrapped). */
export function parseModesJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return { error: 'empty-model-answer' }
  const withoutFence = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start === -1 || end <= start) return { error: 'model-answer-has-no-json' }
  let parsed
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  } catch (error) {
    return { error: `invalid-json: ${error?.message ?? error}` }
  }
  const normalized = normalizeModes(parsed?.modes)
  if (normalized.error !== undefined) return { error: normalized.error }
  return {
    modes: normalized.modes,
    reason: typeof parsed?.reason === 'string' ? parsed.reason.slice(0, 200) : '',
  }
}

/** Resolve the auxiliary call route the same way the deployment selects models. */
export function resolveRoute(ctx) {
  const selector = ctx.get('agentDefaultModel')
  if (selector !== undefined && typeof selector.currentSelection === 'function') {
    try {
      const selection = selector.currentSelection()
      if (selection !== null && typeof selection === 'object'
        && typeof selection.provider === 'string' && selection.provider !== ''
        && typeof selection.model === 'string' && selection.model !== '') {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      // Fall through to the error below.
    }
  }
  return undefined
}

/**
 * Ask the default model for profiles.
 *
 * @returns `{ modes, reason, route }` or `{ error }` — never writes anything.
 */
export async function suggestModes(ctx, tools, modes, options = {}) {
  const llm = ctx.get('llm')
  if (llm === undefined || typeof llm.stream !== 'function') return { error: 'no-llm-service' }
  const route = resolveRoute(ctx)
  if (route === undefined) return { error: 'no-model-route' }
  const { system, user } = buildAutoPrompt(tools, modes)
  const timeoutMs = options.timeoutMs ?? 90_000
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  let timedOut = false
  const timer = controller === undefined ? undefined : setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  let collected = ''
  let finish
  try {
    const request = {
      provider: route.provider,
      model: route.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: 2000,
      ...(controller === undefined ? {} : { signal: controller.signal }),
    }
    for await (const chunk of llm.stream(request)) {
      if (chunk === null || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') collected += chunk.text
      else if (chunk.type === 'finish') finish = chunk.reason
    }
  } catch (error) {
    return { error: timedOut ? `model-timeout:${timeoutMs}` : `model-failed: ${error?.message ?? error}` }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  const kind = finish !== null && typeof finish === 'object' && typeof finish.kind === 'string' ? finish.kind : 'stop'
  if (kind === 'aborted' || kind === 'error') {
    const failure = finish !== null && typeof finish === 'object' ? finish.failure : undefined
    const message = failure !== null && typeof failure === 'object' && typeof failure.message === 'string'
      ? failure.message
      : timedOut ? `model-timeout:${timeoutMs}` : 'model-aborted'
    return { error: `model-failed: ${message}` }
  }
  const parsed = parseModesJson(collected)
  if (parsed.error !== undefined) return { error: parsed.error }
  return { modes: parsed.modes, reason: parsed.reason, route }
}
