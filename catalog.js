/** Shared catalog reader: the user-editable mode rules live in one JSON file. */
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_CATALOG = {
  version: 1,
  modes: [
    {
      id: 'mode-basic',
      name: '基础档',
      order: 10,
      deny: ['mcp__*', 'ego_*', 'ppt_*', 'office_*', 'paper_*', 'zotero_*', 'lunheng_*'],
    },
    {
      id: 'mode-office',
      name: '办公档',
      order: 20,
      deny: ['mcp__solidworks__*', 'ego_*', 'paper_*', 'zotero_*'],
    },
    {
      id: 'mode-modeling',
      name: '建模档',
      order: 30,
      deny: ['ego_*', 'ppt_*', 'office_*', 'paper_*', 'zotero_*', 'lunheng_*'],
    },
    { id: 'mode-full', name: '全量档', order: 40, deny: [] },
  ],
}

export function catalogPath() {
  const home = process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
  return path.join(home, 'state', 'mode-switch', 'catalog.json')
}

/**
 * Last successful parse, keyed by `mtime + size`. The catalog is user-editable,
 * so a change must be picked up without restarting DSH; an unreadable or
 * half-written file keeps serving the last good copy instead of resetting every
 * session to the built-in defaults.
 */
let cached = { key: undefined, value: undefined }

/** Read the catalog, creating it from the built-in defaults on first run. */
export function loadCatalog(log) {
  const file = catalogPath()
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(DEFAULT_CATALOG, null, 2)}\n`, 'utf8')
      cached = { key: undefined, value: undefined }
    }
    const stat = fs.statSync(file)
    const key = `${file}|${stat.mtimeMs}|${stat.size}`
    if (cached.key === key && cached.value !== undefined) return cached.value
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed?.modes) || parsed.modes.length === 0) return cached.value ?? { ...DEFAULT_CATALOG }
    cached = { key, value: parsed }
    return parsed
  } catch (error) {
    log?.(`catalog unreadable, keeping the last good copy: ${error?.message ?? error}`)
    return cached.value ?? { ...DEFAULT_CATALOG }
  }
}

/** `name*` matches a prefix; anything else matches exactly. */
export function matchesAny(toolName, patterns) {
  for (const pattern of patterns ?? []) {
    if (typeof pattern !== 'string' || pattern === '') continue
    if (pattern.endsWith('*')) {
      if (toolName.startsWith(pattern.slice(0, -1))) return true
    } else if (toolName === pattern) return true
  }
  return false
}
