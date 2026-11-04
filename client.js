/**
 * dsh-mode-switch — Client half.
 *
 * One entry in `conversation.input.dock` (the shipped seat documented as
 * "Full-width entries above the composer card"): a read-only capsule showing the
 * session mode, the visible tool count and the estimated tool-schema tokens.
 * Clicking expands a read-only panel with every mode's footprint and the cost of
 * each visible tool. Nothing here switches a mode — the mode is a preset, chosen
 * when the session is created.
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

      return h(
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
                ),
                h(SectionLabel, null, t('panel.modes')),
                modes.map((mode) => h(ModeRow, { key: mode.id, mode, t })),
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
        open ? h(Panel, { id: panelId, t, detail, limit: 120 }) : null,
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
