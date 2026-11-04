# dsh-mode-switch

Tool profiles for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

A session sends every installed tool's schema with every request. Install a few plugins and that is tens of
thousands of tokens before the conversation starts, plus a longer list for the model to pick from. This plugin
gives each session only the tools it needs, and a capsule above the composer to switch profiles, see the
savings, and edit the rules.

It does not declare a preset or touch the preset registry. The stock modes stay as shipped; profiles are a
separate layer.

## Install

Needs DSH 0.2.1 or newer.

```sh
dsh plugin --profile desktop add github:MOLMOORE/dsh-mode-switch
```

Restart DSH; a capsule appears above the composer.

## Use

- Click a pill to switch profile. Only before the first message.
- Click the capsule for details: per-profile footprint, tokens saved against the full profile, and what the
  session's first request actually carried.
- "Edit modes": add, rename or delete profiles and tick the tools each one keeps.
- "AI assign": sends this machine's tool list to the default model and fills the editor with a proposal. You
  review it and save.

## How it decides

```
visible tools = global tools − the profile's deny rules
```

`foo_*` matches by prefix, anything else must match exactly. Preset and agent-scoped tools are not in the
global registry and are never trimmed. Rules live in `~/.dsh/state/mode-switch/catalog.json`; the panel writes
it and it is re-read without a restart.

## Default profiles

Basic, Office, Modeling, Full.

Modeling is written for the author's machine, which has a SolidWorks MCP. Without CAD tools installed it is
indistinguishable from Office. Check your own tool list, or run "AI assign", instead of copying the defaults.

## Why fewer tools help

- Token cost: 198 tools / ~54.8k tokens on the author's machine versus 62 / ~14.9k in the basic profile. The
  tool list is fixed at first assembly and sent with every request, so the saving repeats for the whole session.
- Less distraction: a long tool list means more irrelevant descriptions and more chances to pick the wrong tool
  or reach for something the current task does not need. This is a working observation, not a measured result.
- Fewer detours: with browser and CAD tools gone, the model does not keep weighing whether to use them.

## Limits

- Global tools only. Preset and agent-scoped tools cannot be trimmed.
- Other plugins' UI cards cannot be hidden; the slots API has no third-party removal.
- No switching once a session has sent its first message.
- Rules are names. A renamed or newly installed tool needs a matching rule.
- "AI assign" makes one model call through the default route; it costs what your provider charges.

## License

MIT
