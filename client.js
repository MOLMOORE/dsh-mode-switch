/**
 * dsh-mode-switch — Client half.
 *
 * One entry in `conversation.input.dock` (the shipped seat documented as
 * "Full-width entries above the composer card"): a capsule showing the session
 * mode, the visible tool count and the estimated tool-schema tokens. Clicking
 * expands a panel with every mode's footprint, the cost of each visible tool,
 * and the request-level evidence (what the first request really carried).
 * The quick pills switch a still-blank session's mode; a started session is
 * locked by design (the harness fixes the tool catalog on first assembly).
 */

window.__ModuleLoader__.load({
  id: 'dsh-mode-switch',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'modeSwitch'
    const zh = {
      'chip.label': '档位',
      'chip.tools': '工具',
      'chip.schema': 'schema',
      'chip.loading': '读取中',
      'chip.error': '状态不可用',
      'chip.noSession': '无会话',
      'chip.unknownMode': '未知档',
      'chip.title': '只读：当前会话的档位、可见工具数与工具 schema 的 token 估算。点击查看明细',
      'chip.pending': '所选「{name}」未生效 · 需新会话',
      'chip.applied': '已应用',
      'panel.modes': '档位',
      'panel.tools': '工具 schema 明细',
      'panel.verify': '请求证据',
      'panel.verify.first': '首个请求带 {n} 个工具 · 本档泄漏 {leaks}',
      'panel.verify.none': '还没有请求记录（发一条消息后再看）',
      'panel.verify.failed': '证据读取失败',
      'panel.saved': '比全量档省下的 schema token',
      'panel.edit': '编辑档位',
      'panel.edit.done': '完成',
      'panel.edit.add': '新建档位',
      'panel.edit.auto': 'AI 分配',
      'panel.edit.auto.busy': '分析中…',
      'panel.edit.auto.done': 'AI 已按当前工具给出方案，确认后点保存',
      'panel.edit.auto.failed': 'AI 分配失败：',
      'panel.edit.delete': '删除该档',
      'panel.edit.name': '名称',
      'panel.edit.search': '搜索工具',
      'panel.edit.save': '保存',
      'panel.edit.cancel': '取消',
      'panel.edit.saving': '保存中…',
      'panel.edit.saved': '已保存，新会话生效',
      'panel.edit.failed': '保存失败：',
      'panel.edit.all': '全选',
      'panel.edit.none': '全不选',
      'panel.edit.count': '已选 {n}/{total} 个工具',
      'panel.edit.last': '至少保留一个档位',
      'panel.edit.title': '增删档位、改名、勾选该档包含的工具；改完保存，新会话按新规则裁剪',
      'panel.loading': '读取明细中…',
      'panel.error': '明细读取失败',
      'panel.empty': '无可见工具',
      'panel.more': '还有 {n} 个未展开',
      'panel.total': '实际可见 {n} 个工具 · ≈{tok} tok',
      'panel.current': '当前',
      'panel.readonly': '只读：档位在新建会话时选择',
      'chip.legacy': '旧会话',
      'pill.switch': '切换到这一档',
      'pill.current': '当前档位',
      'pill.locked': '会话已开始，不能切档',
      'pill.fixed': '本会话档位已固定，新开会话可选',
      'reason.toolset-fixed': '本会话档位已固定（工具目录一经组装就不再变），请新开会话选择',
      'pill.busy': '切换中…',
      'pill.failed': '切换失败：',
      'panel.legacy': '这是档位功能上线前的会话：preset 记在会话日志里，工具集不受档位限制。新建会话即可选档。',
      'preset.standard': '标准模式',
      'preset.ptc': 'PTC 模式',
      'preset.minimal': '极简模式',
      'preset.cordis': '创造模式',
    }
    const en = {
      'chip.label': 'Mode',
      'chip.tools': 'tools',
      'chip.schema': 'schema',
      'chip.loading': 'reading',
      'chip.error': 'unavailable',
      'chip.noSession': 'no session',
      'chip.unknownMode': 'unknown',
      'chip.title': 'Read-only: session mode, visible tool count and estimated tool-schema tokens. Click for details',
      'chip.pending': 'Chosen "{name}" not applied — needs a new session',
      'chip.applied': 'applied',
      'panel.modes': 'Modes',
      'panel.tools': 'Tool schema cost',
      'panel.verify': 'Request evidence',
      'panel.verify.first': 'first request carried {n} tools · leaks {leaks}',
      'panel.verify.none': 'No request yet — send a message, then look again',
      'panel.verify.failed': 'Could not read evidence',
      'panel.saved': 'schema tokens saved vs. the full mode',
      'panel.edit': 'Edit modes',
      'panel.edit.done': 'Done',
      'panel.edit.add': 'New mode',
      'panel.edit.auto': 'AI assign',
      'panel.edit.auto.busy': 'Analysing…',
      'panel.edit.auto.done': 'The model proposed a set for these tools; review and save',
      'panel.edit.auto.failed': 'AI assign failed: ',
      'panel.edit.delete': 'Delete this mode',
      'panel.edit.name': 'Name',
      'panel.edit.search': 'Search tools',
      'panel.edit.save': 'Save',
      'panel.edit.cancel': 'Cancel',
      'panel.edit.saving': 'Saving…',
      'panel.edit.saved': 'Saved — applies to new sessions',
      'panel.edit.failed': 'Save failed: ',
      'panel.edit.all': 'All',
      'panel.edit.none': 'None',
      'panel.edit.count': '{n}/{total} tools selected',
      'panel.edit.last': 'Keep at least one mode',
      'panel.edit.title': 'Add or remove modes, rename them, and tick the tools each mode keeps; saving applies to new sessions',
      'panel.loading': 'Reading details…',
      'panel.error': 'Could not read details',
      'panel.empty': 'No visible tools',
      'panel.more': '{n} more not shown',
      'panel.total': 'visible now {n} tools · ≈{tok} tok',
      'panel.current': 'Current',
      'panel.readonly': 'Read-only: the mode is chosen when a session is created',
      'chip.legacy': 'legacy',
      'pill.switch': 'Switch to this mode',
      'pill.current': 'Current mode',
      'pill.locked': 'Session started; the mode is locked',
      'pill.fixed': 'This session is fixed; open a new one to change it',
      'reason.toolset-fixed': 'This session is fixed (the tool catalog is assembled once); open a new session to change it',
      'pill.busy': 'Switching…',
      'pill.failed': 'Switch failed: ',
      'panel.legacy': 'This session predates modes: its preset is recorded in the log and its tools are not trimmed. Create a new session to pick a mode.',
      'preset.standard': 'Standard mode',
      'preset.ptc': 'PTC mode',
      'preset.minimal': 'Minimal mode',
      'preset.cordis': 'Creator mode',
    }

    /** 15234 → "15.2k"; keeps sub-thousand counts exact. */
    function compact(value) {
      const count = Math.max(0, Math.round(value))
      if (count < 1000) return String(count)
      const scaled = count / 1000
      return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}k`
    }

    /** Shipped presets that are not one of our modes still deserve a readable name. */
    const SHIPPED_LABELS = {
      standard: 'preset.standard',
      ptc: 'preset.ptc',
      minimal: 'preset.minimal',
      cordis: 'preset.cordis',
    }

    function presetLabel(t, id) {
      if (typeof id !== 'string' || id === '') return undefined
      const key = SHIPPED_LABELS[id]
      if (key === undefined) return id
      const value = t(key)
      return value === key ? id : value
    }

    function endpoint(path, sessionId) {
      return `${path}?sessionId=${encodeURIComponent(sessionId)}`
    }

    function useStatus(sessionId, nonce) {
      const [state, setState] = React.useState({ phase: 'loading', data: undefined })
      React.useEffect(() => {
        if (!sessionId) {
          setState({ phase: 'no-session', data: undefined })
          return undefined
        }
        let cancelled = false
        const load = () => {
          fetch(endpoint('/api/mode-switch/status', sessionId), { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((data) => {
              if (!cancelled) setState({ phase: 'ready', data })
            })
            .catch(() => {
              if (!cancelled) setState((previous) => (previous.phase === 'ready' ? previous : { phase: 'error', data: undefined }))
            })
        }
        load()
        const timer = setInterval(load, 15000)
        const onFocus = () => load()
        window.addEventListener('focus', onFocus)
        return () => {
          cancelled = true
          clearInterval(timer)
          window.removeEventListener('focus', onFocus)
        }
      }, [sessionId, nonce])
      return state
    }

    function useDetail(sessionId, open, nonce) {
      const [state, setState] = React.useState({ phase: 'idle', data: undefined })
      React.useEffect(() => {
        if (!open || !sessionId) return undefined
        let cancelled = false
        setState((previous) => (previous.phase === 'ready' ? previous : { phase: 'loading', data: undefined }))
        fetch(endpoint('/api/mode-switch/detail', sessionId), { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((data) => {
            if (!cancelled) setState({ phase: 'ready', data })
          })
          .catch(() => {
            if (!cancelled) setState({ phase: 'error', data: undefined })
          })
        return () => {
          cancelled = true
        }
      }, [open, sessionId, nonce])
      return state
    }

    /** Request-level evidence, read from the session log on the host. */
    function useVerify(sessionId, open, nonce) {
      const [state, setState] = React.useState({ phase: 'idle', data: undefined })
      React.useEffect(() => {
        if (!open || !sessionId) return undefined
        let cancelled = false
        setState({ phase: 'loading', data: undefined })
        fetch(endpoint('/api/mode-switch/verify', sessionId), { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((data) => {
            if (!cancelled) setState({ phase: 'ready', data })
          })
          .catch(() => {
            if (!cancelled) setState({ phase: 'error', data: undefined })
          })
        return () => {
          cancelled = true
        }
      }, [open, sessionId, nonce])
      return state
    }

    /** One line describing the session's first request against the current mode. */
    function verifyLine(t, verify, toolsetId) {
      if (verify === undefined || verify.phase === 'idle' || verify.phase === 'loading') return t('panel.loading')
      if (verify.phase === 'error') return t('panel.verify.failed')
      const first = verify.data?.first
      if (first === undefined) return t('panel.verify.none')
      const leaks = first.leaks?.[toolsetId] ?? '?'
      return t('panel.verify.first').replace('{n}', String(first.tools)).replace('{leaks}', String(leaks))
    }

    function Sep() {
      return h('span', { style: { color: 'var(--dsw-alias-border-l2)' } }, '·')
    }

    function SectionLabel(props) {
      return h(
        'div',
        {
          style: {
            fontSize: 10.5,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--dsw-alias-label-secondary)',
            margin: '8px 0 4px',
          },
        },
        props.children,
      )
    }

    function ModeRow(props) {
      const t = props.t
      const mode = props.mode
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            padding: '1.5px 0',
            fontSize: 11,
            lineHeight: '15px',
          },
        },
        h(
          'span',
          {
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: mode.current ? 600 : 400,
              color: 'var(--dsw-alias-label-primary)',
            },
          },
          mode.name ?? mode.id,
        ),
        h(
          'span',
          {
            style: {
              flex: '0 0 auto',
              color: 'var(--dsw-alias-label-secondary)',
              fontSize: 10.5,
              fontVariantNumeric: 'tabular-nums',
            },
          },
          typeof mode.tools === 'number' ? `${mode.tools} ${t('chip.tools')}` : '—',
        ),
        h(
          'span',
          {
            style: {
              flex: '0 0 60px',
              textAlign: 'right',
              color: 'var(--dsw-alias-label-secondary)',
              fontSize: 10.5,
              fontVariantNumeric: 'tabular-nums',
            },
          },
          typeof mode.estimatedTokens === 'number'
            ? `${mode.measured ? '' : '≈'}${compact(mode.estimatedTokens)}`
            : '—',
        ),
        h(
          'span',
          {
            title: t('panel.saved'),
            style: {
              flex: '0 0 62px',
              textAlign: 'right',
              fontSize: 10.5,
              color: 'var(--dsw-alias-state-success-primary)',
              fontVariantNumeric: 'tabular-nums',
            },
          },
          typeof mode.savedTokens === 'number' && mode.savedTokens > 0 ? `−${compact(mode.savedTokens)}` : '',
        ),
        h(
          'span',
          {
            style: {
              flex: '0 0 28px',
              textAlign: 'right',
              fontSize: 10.5,
              color: mode.current ? 'var(--dsw-alias-brand-primary)' : 'transparent',
            },
          },
          mode.current ? t('panel.current') : '',
        ),
      )
    }

    const matchAny = (name, patterns) =>
      (patterns ?? []).some((pattern) =>
        typeof pattern === 'string' && pattern !== ''
          ? pattern.endsWith('*')
            ? name.startsWith(pattern.slice(0, -1))
            : name === pattern
          : false,
      )

    /**
     * Rebuild one mode's deny list from the tools the user ticked.
     *
     * Wildcard rules are kept while they still exclude only unticked tools, so
     * a hand-written rule such as `lunheng_*` survives editing; everything else
     * becomes an exact name.
     */
    function buildDeny(mode, allNames, checked) {
      const kept = (mode?.deny ?? []).filter(
        (pattern) => !allNames.some((name) => checked.has(name) && matchAny(name, [pattern])),
      )
      const covered = (name) => matchAny(name, kept)
      const extra = allNames.filter((name) => !checked.has(name) && !covered(name))
      return [...kept, ...extra]
    }

    function Editor(props) {
      const t = props.t
      const draft = props.draft
      const active = draft.find((mode) => mode.id === props.activeId) ?? draft[0]
      const allTools = props.allTools
      const checked = new Set(allTools.map((tool) => tool.name).filter((name) => !matchAny(name, active?.deny)))
      const query = props.search.trim().toLowerCase()
      const shown = (query === '' ? allTools : allTools.filter((tool) => tool.name.toLowerCase().includes(query))).slice(0, 400)

      const field = {
        boxSizing: 'border-box',
        padding: '3px 7px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 11,
      }
      const button = {
        ...field,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 12, fontWeight: 650 } }, t('panel.edit')),
          h('span', { style: { flex: '1 1 auto' } }),
          h('button', { type: 'button', style: button, onClick: props.onDone }, t('panel.edit.done')),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 4 } },
          draft.map((mode) =>
            h(
              'button',
              {
                key: mode.id,
                type: 'button',
                title: active?.id === mode.id ? t('pill.current') : mode.id,
                onClick: () => props.onSelect(mode.id),
                style: {
                  ...button,
                  borderColor: active?.id === mode.id ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)',
                  color: active?.id === mode.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                },
              },
              mode.name,
            ),
          ),
          h('button', { type: 'button', style: button, onClick: props.onAdd }, `+ ${t('panel.edit.add')}`),
          h(
            'button',
            {
              type: 'button',
              disabled: props.autoBusy,
              onClick: props.onAuto,
              style: { ...button, opacity: props.autoBusy ? 0.5 : 1 },
            },
            props.autoBusy ? t('panel.edit.auto.busy') : t('panel.edit.auto'),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.edit.name')),
          h('input', {
            value: active?.name ?? '',
            onChange: (event) => props.onRename(event.target.value),
            style: { ...field, flex: '1 1 120px' },
          }),
          h(
            'button',
            {
              type: 'button',
              title: t('panel.edit.delete'),
              disabled: draft.length <= 1,
              onClick: props.onDelete,
              style: { ...button, opacity: draft.length <= 1 ? 0.4 : 1 },
            },
            '×',
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, flexWrap: 'wrap' } },
          h('input', {
            value: props.search,
            placeholder: t('panel.edit.search'),
            onChange: (event) => props.onSearch(event.target.value),
            style: { ...field, flex: '1 1 140px' },
          }),
          h('button', { type: 'button', style: button, onClick: () => props.onAll(true) }, t('panel.edit.all')),
          h('button', { type: 'button', style: button, onClick: () => props.onAll(false) }, t('panel.edit.none')),
          h(
            'span',
            { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)' } },
            t('panel.edit.count').replace('{n}', String(checked.size)).replace('{total}', String(allTools.length)),
          ),
        ),
        h(
          'div',
          { style: { maxHeight: 200, overflow: 'auto', paddingTop: 4 } },
          shown.map((tool) =>
            h(
              'label',
              {
                key: tool.name,
                style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, lineHeight: '17px', cursor: 'pointer' },
              },
              h('input', {
                type: 'checkbox',
                checked: checked.has(tool.name),
                onChange: () => props.onToggle(tool.name, checked),
              }),
              h('span', { style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, tool.name),
              h(
                'span',
                { style: { flex: '0 0 auto', fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } },
                compact(tool.tokens),
              ),
            ),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, flexWrap: 'wrap' } },
          h(
            'button',
            {
              type: 'button',
              disabled: props.saving,
              onClick: props.onSave,
              style: {
                ...button,
                padding: '3px 12px',
                borderColor: 'var(--dsw-alias-brand-primary)',
                color: 'var(--dsw-alias-label-primary)',
                opacity: props.saving ? 0.5 : 1,
              },
            },
            props.saving ? t('panel.edit.saving') : t('panel.edit.save'),
          ),
          h('button', { type: 'button', style: button, onClick: props.onCancel }, t('panel.edit.cancel')),
          h(
            'span',
            {
              style: {
                fontSize: 10.5,
                color: props.note?.kind === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)',
              },
            },
            props.note?.text ?? '',
          ),
        ),
      )
    }

    function ToolRow(props) {
      const share = props.maxTokens > 0 ? Math.max(2, Math.round((props.tool.tokens / props.maxTokens) * 100)) : 0
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '1.5px 0',
            fontSize: 11,
            lineHeight: '15px',
          },
        },
        h(
          'span',
          {
            title: props.tool.name,
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--dsw-alias-label-primary)',
            },
          },
          props.tool.name,
        ),
        h(
          'span',
          {
            'aria-hidden': true,
            style: {
              flex: '0 0 88px',
              height: 4,
              borderRadius: 2,
              background: 'var(--dsw-alias-bg-layer-2)',
              overflow: 'hidden',
            },
          },
          h('span', {
            style: {
              display: 'block',
              width: `${share}%`,
              height: '100%',
              borderRadius: 2,
              background: 'var(--dsw-alias-brand-primary)',
              opacity: 0.55,
            },
          }),
        ),
        h(
          'span',
          {
            style: {
              flex: '0 0 46px',
              textAlign: 'right',
              color: 'var(--dsw-alias-label-secondary)',
              fontVariantNumeric: 'tabular-nums',
            },
          },
          compact(props.tool.tokens),
        ),
      )
    }

    function Panel(props) {
      const t = props.t
      const { phase, data } = props.detail
      const tools = phase === 'ready' && Array.isArray(data?.tools) ? data.tools : []
      const modes = phase === 'ready' && Array.isArray(data?.toolsets) ? data.toolsets : []
      const maxTokens = tools.length > 0 ? tools[0].tokens : 0
      const shown = tools.slice(0, props.limit)
      const rest = tools.length - shown.length
      const allTools = phase === 'ready' && Array.isArray(data?.allTools) ? data.allTools : []
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState([])
      const [activeId, setActiveId] = React.useState(undefined)
      const [search, setSearch] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [autoBusy, setAutoBusy] = React.useState(false)
      const [note, setNote] = React.useState(undefined)

      const activeDraft = draft.find((mode) => mode.id === activeId) ?? draft[0]

      const beginEdit = () => {
        const next = modes.map((mode) => ({
          id: mode.id,
          name: mode.name ?? mode.id,
          order: mode.order ?? 0,
          deny: [...(mode.deny ?? [])],
        }))
        setDraft(next)
        setActiveId(next.find((mode) => modes.find((m) => m.id === mode.id)?.current)?.id ?? next[0]?.id)
        setEditing(true)
        setNote(undefined)
      }

      const patchActive = (patch) => {
        setDraft((previous) => previous.map((mode) => (mode.id === activeDraft?.id ? { ...mode, ...patch } : mode)))
      }

      const names = allTools.map((tool) => tool.name)

      return editing
        ? h(
            'div',
            {
              id: props.id,
              style: {
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: 760,
                maxHeight: 460,
                overflow: 'auto',
                overscrollBehavior: 'contain',
                padding: '8px 12px 10px',
                border: '0.5px solid var(--dsw-alias-border-l1)',
                borderRadius: 10,
                background: 'var(--dsw-alias-bg-overlay)',
                color: 'var(--dsw-alias-label-primary)',
              },
            },
            h(Editor, {
              t,
              draft,
              activeId,
              search,
              saving,
              note,
              allTools,
              onSelect: setActiveId,
              onAdd: () => {
                const id = `mode-custom-${Date.now().toString(36)}`
                const order = Math.max(0, ...draft.map((mode) => mode.order ?? 0)) + 10
                setDraft((previous) => [...previous, { id, name: t('panel.edit.add'), order, deny: [] }])
                setActiveId(id)
              },
              onDelete: () => {
                if (draft.length <= 1) {
                  setNote({ kind: 'error', text: t('panel.edit.last') })
                  return
                }
                const remaining = draft.filter((mode) => mode.id !== activeDraft?.id)
                setDraft(remaining)
                setActiveId(remaining[0]?.id)
              },
              onRename: (value) => patchActive({ name: value }),
              onToggle: (name, checked) => {
                const next = new Set(checked)
                if (next.has(name)) next.delete(name)
                else next.add(name)
                patchActive({ deny: buildDeny(activeDraft, names, next) })
              },
              onAll: (on) => patchActive({ deny: buildDeny(activeDraft, names, on ? new Set(names) : new Set()) }),
              onSearch: setSearch,
              autoBusy,
              onAuto: async () => {
                setAutoBusy(true)
                setNote(undefined)
                try {
                  const response = await fetch('/api/mode-switch/auto', { method: 'POST' })
                  const payload = await response.json().catch(() => undefined)
                  if (!response.ok || payload?.ok !== true) throw new Error(payload?.reason ?? String(response.status))
                  const next = (payload.modes ?? []).map((mode) => ({
                    id: mode.id,
                    name: mode.name,
                    order: mode.order ?? 0,
                    deny: [...(mode.deny ?? [])],
                  }))
                  setDraft(next)
                  setActiveId(next[0]?.id)
                  setNote({
                    kind: 'ok',
                    text: `${t('panel.edit.auto.done')}${payload.reason ? ` · ${payload.reason}` : ''}`,
                  })
                } catch (error) {
                  setNote({ kind: 'error', text: `${t('panel.edit.auto.failed')}${error?.message ?? error}` })
                } finally {
                  setAutoBusy(false)
                }
              },
              onCancel: () => {
                setEditing(false)
                setNote(undefined)
              },
              onDone: () => {
                setEditing(false)
              },
              onSave: async () => {
                setSaving(true)
                setNote(undefined)
                try {
                  const response = await fetch('/api/mode-switch/modes', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ modes: draft }),
                  })
                  const payload = await response.json().catch(() => undefined)
                  if (!response.ok || payload?.ok !== true) throw new Error(payload?.reason ?? String(response.status))
                  setNote({ kind: 'ok', text: t('panel.edit.saved') })
                  props.onChanged?.()
                } catch (error) {
                  setNote({ kind: 'error', text: `${t('panel.edit.failed')}${error?.message ?? error}` })
                } finally {
                  setSaving(false)
                }
              },
            }),
          )
        : h(
        'div',
        {
          id: props.id,
          style: {
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: 760,
            maxHeight: 320,
            overflow: 'auto',
            overscrollBehavior: 'contain',
            padding: '8px 12px 10px',
            border: '0.5px solid var(--dsw-alias-border-l1)',
            borderRadius: 10,
            background: 'var(--dsw-alias-bg-overlay)',
            color: 'var(--dsw-alias-label-primary)',
          },
        },
        phase === 'loading' || phase === 'idle'
          ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.loading'))
          : phase === 'error'
            ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)' } }, t('panel.error'))
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    },
                  },
                  h(
                    'span',
                    { style: { fontSize: 12, fontWeight: 650 } },
                    data?.presetName ?? presetLabel(t, data?.preset) ?? t('chip.unknownMode'),
                    data?.preset ? h('span', { style: { fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' } }, `  ${data.preset}`) : null,
                  ),
                  h(
                    'span',
                    { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                    t('panel.total')
                      .replace('{n}', String(data?.totals?.tools ?? 0))
                      .replace('{tok}', compact(data?.totals?.estimatedTokens ?? 0)),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      title: t('panel.edit.title'),
                      onClick: beginEdit,
                      style: {
                        boxSizing: 'border-box',
                        margin: 0,
                        padding: '2px 9px',
                        borderRadius: 999,
                        border: '0.5px solid var(--dsw-alias-border-l1)',
                        background: 'transparent',
                        color: 'var(--dsw-alias-label-secondary)',
                        font: 'inherit',
                        fontSize: 10.5,
                        lineHeight: '15px',
                        cursor: 'pointer',
                      },
                    },
                    t('panel.edit'),
                  ),
                ),
                h(SectionLabel, null, t('panel.modes')),
                modes.map((mode) => h(ModeRow, { key: mode.id, mode, t })),
                h(SectionLabel, null, t('panel.verify')),
                h(
                  'div',
                  { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                  verifyLine(t, props.verify, data?.toolset),
                ),
                h(
                  'div',
                  { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)', paddingTop: 2 } },
                  data?.legacy ? t('panel.legacy') : t('panel.readonly'),
                ),
                h(SectionLabel, null, t('panel.tools')),
                tools.length === 0
                  ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.empty'))
                  : h(
                      React.Fragment,
                      null,
                      shown.map((tool) => h(ToolRow, { key: tool.name, tool, maxTokens })),
                      rest > 0
                        ? h(
                            'div',
                            { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary)', paddingTop: 4 } },
                            t('panel.more').replace('{n}', String(rest)),
                          )
                        : null,
                    ),
              ),
      )
    }

    /** Translate a server reason key, falling back to the raw text. */
    function reasonText(t, reason) {
      if (typeof reason !== 'string' || reason === '') return 'unknown'
      const key = `reason.${reason}`
      const value = t(key)
      return value === key ? reason : value
    }

    function ModePill(props) {
      const { t, mode, canSelect, busy, onSelect } = props
      const active = mode.current === true
      const disabled = active || !canSelect || busy
      return h(
        'button',
        {
          type: 'button',
          disabled,
          title: active ? t('pill.current') : canSelect ? t('pill.switch') : props.fixed ? t('pill.fixed') : t('pill.locked'),
          onClick: () => {
            if (!disabled) onSelect(mode.id)
          },
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            margin: 0,
            padding: '3px 8px',
            borderRadius: 999,
            border: active ? '0.5px solid var(--dsw-alias-brand-primary)' : '0.5px solid var(--dsw-alias-border-l1)',
            background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
            color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
            font: 'inherit',
            fontSize: 10.5,
            lineHeight: '15px',
            whiteSpace: 'nowrap',
            cursor: disabled ? 'default' : 'pointer',
            opacity: active || canSelect ? 1 : 0.45,
            userSelect: 'none',
          },
        },
        mode.name,
      )
    }

    function Chip(props) {
      const t = props.t
      const [open, setOpen] = React.useState(false)
      const [nonce, setNonce] = React.useState(0)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(undefined)
      const { phase, data } = useStatus(props.sessionId, nonce)
      const detail = useDetail(props.sessionId, open, nonce)
      const verify = useVerify(props.sessionId, open, nonce)
      const title = t('chip.title')
      const panelId = `mode-switch-panel-${props.sessionId ?? 'none'}`

      const settled = phase === 'ready' && typeof data?.preset === 'string' && data.preset !== ''
      const label = (() => {
        if (phase === 'no-session') return t('chip.noSession')
        if (phase === 'error') return t('chip.error')
        if (phase === 'loading') return t('chip.loading')
        // A live session whose preset has not resolved yet is still mounting.
        if (!settled) return data?.live === false ? t('chip.unknownMode') : t('chip.loading')
        return data?.toolsetName ?? data?.presetName ?? presetLabel(t, data.preset) ?? t('chip.unknownMode')
      })()

      const modes = phase === 'ready' && Array.isArray(data?.toolsets) ? data.toolsets : []
      // Switching is only possible before the first turn; a started session is closed.
      const canSelect = phase === 'ready' && data?.live !== false && data?.blank === true && data?.fixed !== true
      const switchTo = (toolsetId) => {
        if (!props.sessionId || busy) return
        setBusy(true)
        setNotice(undefined)
        fetch(
          `/api/mode-switch/select?sessionId=${encodeURIComponent(props.sessionId)}&toolset=${encodeURIComponent(toolsetId)}`,
          { method: 'POST', cache: 'no-store' },
        )
          .then(async (response) => {
            const result = await response.json().catch(() => undefined)
            if (!response.ok) throw new Error(result?.reason ?? result?.error ?? String(response.status))
            return result
          })
          .then((result) => {
            if (!result?.ok) setNotice(`${t('pill.failed')}${reasonText(t, result?.reason)}`)
          })
          .catch((error) => setNotice(`${t('pill.failed')}${reasonText(t, error?.message ?? String(error))}`))
          .finally(() => {
            setBusy(false)
            setNonce((value) => value + 1)
          })
      }

      return h(
        'div',
        {
          // The dock entry owns its own width: without these the row spans the
          // whole conversation pane and starts left of the composer card.
          style: {
            boxSizing: 'border-box',
            flex: 'none',
            margin: '0 auto 6px',
            width: '100%',
            maxWidth: 'var(--dsh-composer-card-max-width, 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 6,
            padding: '0 2px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: '100%' } },
          h(
          'button',
          {
            type: 'button',
            title,
            'aria-expanded': open,
            'aria-controls': open ? panelId : undefined,
            onClick: () => setOpen((value) => !value),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxSizing: 'border-box',
              maxWidth: '100%',
              margin: 0,
              padding: '3px 10px',
              borderRadius: 999,
              border: '0.5px solid var(--dsw-alias-border-l1)',
              background: open ? 'var(--dsw-alias-bg-layer-1)' : 'var(--dsw-alias-bg-layer-2)',
              font: 'inherit',
              fontSize: 11,
              lineHeight: '16px',
              color: 'var(--dsw-alias-label-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
              userSelect: 'none',
            },
          },
          h('span', {
            'aria-hidden': true,
            style: {
              width: 6,
              height: 6,
              borderRadius: 3,
              flex: '0 0 auto',
              background: phase === 'ready' ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-idle-primary)',
            },
          }),
          h('span', null, t('chip.label')),
          h('strong', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, label),
          settled && data?.preset
            ? h(
                'span',
                { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 10.5 } },
                presetLabel(t, data.preset) ?? data.preset,
              )
            : null,
          settled && data
            ? h(
                React.Fragment,
                null,
                data.nextSessionOnly
                  ? h(
                      React.Fragment,
                      null,
                      h(Sep),
                      h(
                        'span',
                        { style: { color: 'var(--dsw-alias-state-error-primary)' } },
                        t('chip.pending').replace('{name}', data.pendingToolset ?? ''),
                      ),
                    )
                  : null,
                h(Sep),
                h('span', null, `${data.toolCount} ${t('chip.tools')}`),
                h(Sep),
                h('span', null, `≈${compact(data.estimatedTokens)} tok ${t('chip.schema')}`),
              )
            : null,
          ),
          modes.length > 0
            ? h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' } },
                modes.map((mode) => h(ModePill, { key: mode.id, t, mode, canSelect, busy, fixed: data?.fixed === true, onSelect: switchTo })),
              )
            : null,
        ),
        notice
          ? h('div', { style: { fontSize: 10.5, color: 'var(--dsw-alias-state-error-primary)' } }, notice)
          : null,
        open ? h(Panel, { id: panelId, t, detail, verify, onChanged: () => setNonce((value) => value + 1), limit: 120 }) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mode-switch: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'conversation.input.dock', id: 'mode-switch', order: 30 },
            (props) => h(Chip, { sessionId: props.sessionId, t }),
          ),
        )
      },
    }
  },
})
