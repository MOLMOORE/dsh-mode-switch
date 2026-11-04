# dsh-mode-switch

Tool profiles for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Every session ships every tool's schema in its system prompt. With a few plugins installed that is tens of
thousands of tokens before the conversation starts. This plugin picks which tools a session carries, and lets
you add, rename or delete profiles and tick the tools each one keeps.

It does not declare a preset or touch the preset registry. The stock Standard / PTC / Minimal / Cordis modes
stay exactly as shipped; profiles are a separate layer on top.

## Install

Needs DSH 0.2.1 or newer.

```sh
dsh plugin --profile web add github:MOLMOORE/dsh-mode-switch
```

Restart DSH. A capsule appears above the composer showing the current profile, tool count and estimated
schema tokens.

## Use

- Click a pill to switch profile. Only before the first message; the choice is locked afterwards.
- Click the capsule for details: per-profile footprint, tokens saved against the full profile, and what the
  session's first request actually carried.
- "Edit modes" in the panel: add, rename or delete profiles, tick the tools each one keeps. Saving applies to
  new sessions.

## How it decides

Local name matching only. No model call.

```
visible tools = global tools − the profile's deny rules
```

`foo_*` matches by prefix, anything else must match exactly. Preset and agent-scoped tools are not in the
global registry, so they are never trimmed. Rules live in `~/.dsh/state/mode-switch/catalog.json`; the panel
editor writes that file, and it is re-read without a restart.

## Limits

- Global tools only; preset and agent-scoped tools cannot be trimmed.
- Other plugins' UI cards cannot be hidden; the slots API has no third-party removal.
- No switching once a session has sent its first message.
- Rules are names. A renamed or newly installed tool needs a matching rule.

## License

MIT
