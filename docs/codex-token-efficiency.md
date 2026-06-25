# Codex Token Efficiency

This note keeps the everyday routing rules short in `AGENTS.md` and puts the
longer local recipes here.

## Current local diagnosis

The current `~/.codex` setup keeps Headroom as a manual opt-in model provider
while leaving `headroom` MCP available. `codebase-memory-mcp` is enabled with
`auto_index=true`.

The recent `headroom perf --hours 72` output shows:

- `1,168,778,513 -> 1,151,175,474 tokens`
- `17,603,039` tokens saved
- `1.5%` net reduction
- `391 / 20,545` retrievals (`1.9%`)
- `576ms` average optimization overhead
- `94.3%` cache hit rate

That points to a clear default policy for this repo:

1. Headroom is not the default path for ordinary code reading.
2. Structure-first exploration is more valuable than aggressive compression.
3. Exactness should come from narrow raw reads, not from broad raw sweeps.
4. Re-fetching the same artifact is a routing problem, not a signal to compress
   harder.

## Installed default behavior

The global Codex base config now favors a single lean default for normal coding
work:

- `model_reasoning_effort="high"` instead of `xhigh`
- keep loaded by default:
  `codebase-memory-mcp`, Headroom MCP, CodeGraph, LSP, Context7, `grep_app`
- remove from default:
  Oracle MCP, Unity MCP, `node_repl`, browser plugin, chrome plugin
- remove Headroom auto-ensure hooks from `~/.codex/hooks.json`

Meaning:

- plain `codex` should be normal path
- user should not need to start Headroom manually for ordinary coding work
- Headroom whole-session proxy is no longer assumed

Small rare-use overlay files were also added under `~/.codex/`:

- `oracle.config.toml`
- `browser-tools.config.toml`
- `unity.config.toml`

Treat them as optional special-case overlays, not daily workflow.

## Default operating profiles

These are operating profiles, not default-switch config profiles.

### `lean-fix`

Use for small fixes, diff review, and targeted test/debug follow-up.

- Prefer `rg`, raw reads, LSP symbols, and existing file context.
- Reach for `codebase-memory-mcp` only when the target location is unclear.
- Do not start Headroom proxy just to read a few files.
- Do not use subagents.

### `normal-code`

Use for ordinary implementation and bug fixing.

- First pass: `codebase-memory-mcp`, CodeGraph, or symbol search.
- Second pass: raw reads for the touched function, types, tests, configs, and
  error sites only.
- Keep Headroom as on-demand support for noisy output, not for the main code
  path.
- Keep work in the main agent unless there are independent low-risk side tasks.

### `wide-explore`

Use for architecture, impact analysis, or unfamiliar subsystems.

- Start with `get_architecture`, `search_graph`, `trace_path`,
  `get_code_snippet`, and existing CodeGraph tools.
- Avoid full-file sweeps until the graph narrows the area.
- Before editing, confirm the final target with raw source reads.

### `logs-json-web`

Use for long logs, JSON dumps, web fetch results, and long history.

- Headroom is appropriate here.
- Prefer retrieve-capable summaries over pasting long raw output into the chat.
- If a summarized result becomes edit-critical, switch that artifact back to a
  narrow raw read.

### `mcp-sprawl`

Use when the task does not need the full enabled MCP/plugin surface.

- Prefer the already-loaded local coding MCPs first:
  `codebase-memory-mcp`, CodeGraph, LSP, Context7, and `grep_app`.
- Avoid browser, Chrome, Oracle, Unity, or document tools unless the task
  genuinely requires them.
- If future global config work happens, profile separation is more promising
  than stronger compression.

### `parallel-light`

Use when there are independent, read-heavy side questions whose results can be
compressed into short cards. The goal is not "always use subagents"; the goal is
to keep noisy exploration out of the main thread while leaving judgment,
design, and integration with the orchestrator.

This local policy authorizes autonomous subagent use when the efficiency
criteria are met. The user should not have to approve each subagent launch.
For detailed routing, use `$agent-orchestration`.

- Good delegated tasks: file listing, symbol/file candidate enumeration,
  duplicate detection, docs/issues triage, log bucketing, existing-setting
  inventory, test-failure summarization, coarse comparison summaries, and
  bounded evidence extraction.
- Keep final judgment, design, edit policy, destructive decisions, security or
  data-risk calls, user-facing explanation, and integration in the main model.
- Let implementation workers edit only when the task is clearly isolated and the
  touched files are not being edited by the orchestrator. Prefer the main agent
  as the single normal code writer.
- Skip delegation for small tasks where startup and reintegration cost more than
  a few direct reads, or when the main thread will need the same raw context
  anyway.

Spawn criteria:

1. Main thread would otherwise accumulate noisy intermediate results.
2. Task has a clear contract and bounded output.
3. A lighter model or lower-effort pass is enough.
4. Main thread can consume a result card directly without rereading the whole
   search.
5. The task is naturally separable by module, layer, feature, document set, or
   log chunk.

Do not spawn when:

1. Main thread needs exact same context anyway.
2. Task is smaller than a few direct reads or one short command.
3. Result will require full main-thread re-verification before it is useful.
4. Task includes final design, edit policy, risk judgment, or cross-cutting
   integration.
5. Parallel editing would create merge conflicts or coordination cost.

## Subagent model routing

Canonical details live in the global `$agent-orchestration` skill. Use the
cheapest model that can produce reliable evidence for the delegated contract.
Do not use Pro/Oracle settings unless explicitly requested by the user.

| Use | Default routing |
|---|---|
| Scout / standard research subagent | `gpt-5.4` + Low |
| Important research or ambiguous code exploration | `gpt-5.4` + Medium |
| Design, integration, or review gate | `gpt-5.5` + High or Extra High |
| Simple listing, classification, or format conversion | `gpt-5.4-mini` |
| Rough bucketing for large logs | `gpt-5.4-mini` or `gpt-5.4` Low |
| Code investigation where correctness matters | Avoid mini |

Role defaults:

- Orchestrator: Medium to High for normal work. Do not keep it on Extra High by
  default; call a gate only for important decisions.
- Scout / research subagent: `gpt-5.4` Low by default, Medium when ambiguity or
  correctness risk is material.
- Implementation worker: Medium to High, only for a narrow isolated change with
  a tight spec.
- Architect Gate: `gpt-5.5` High or Extra High before broad or risky design
  decisions.
- Review Gate: `gpt-5.5` High or Extra High after broad changes or before risky
  changes, focused on regression risk, security/auth/billing/DB/concurrency,
  test gaps, and overreach.

Practical bias: `gpt-5.4-mini` is a fast clerk, not the default cheap
investigator. If mini output forces the main agent to redo raw investigation,
promote that task type to `gpt-5.4` Low or Medium.

Call an Architect or Review Gate when any of these are true:

1. The change spans 5+ files or 2+ modules.
2. DB, migration, auth, billing, security, concurrency, cache, async, or state
   management is involved.
3. Public API, schema, or configuration behavior changes.
4. Subagent evidence conflicts.
5. Two debugging hypotheses have already failed.
6. The agent is about to run a long autonomous implementation.
7. The post-implementation diff is broad.
8. Rework cost would likely exceed the gate cost.

Skip the gate for simple docs updates, narrow low-risk fixes, checks that end
after a few reads, obvious test repairs, or easy-to-revert local changes whose
Scout evidence agrees.

## Subagent contracts

Canonical templates live in `$agent-orchestration`. Subagents return evidence
cards, not raw dumps. Limit output to 5-10 cards and separate confirmed facts
from guesses.

Evidence card:

```text
- Finding:
- Evidence: file/path/url/command
- Confidence: high|medium|low
- Why it matters:
- Suggested next check:
```

For Architect or Review Gate calls, the orchestrator sends a decision packet
instead of raw logs or full files:

```text
- Goal:
- Constraints:
- Relevant files / symbols:
- Raw-confirmed facts:
- Evidence cards:
- Current hypothesis:
- Proposed plan:
- Risks:
- Open questions:
- Tests to run:
- Decision needed:
```

Gate output stays short:

```text
- Decision: approve|revise|block
- Key risks:
- Required raw checks:
- Minimal plan:
- Test requirements:
```

Success looks like this:

- The orchestrator can decide from evidence cards plus targeted raw checks.
- High-end reasoning is spent on judgment, design, integration, and review
  rather than bulk reading.
- Long logs, JSON, web results, and history go through Headroom or indexed
  retrieval, while edit targets, diffs, type definitions, and stack traces stay
  raw.

Failure looks like this:

- The main model rereads everything the subagent read.
- Subagent output is longer than the raw search would have been.
- The subagent makes final design or risk decisions that the orchestrator must
  untangle.
- Tool/profile setup cost exceeds the delegated work.

## Structure-first recipe

For this repo, the default order should be:

1. `codebase-memory-mcp` or CodeGraph for architecture, symbol candidates,
   callers, and path tracing.
2. LSP document/workspace symbols when you need a quick symbol outline.
3. Raw reads for only the exact files and ranges that matter to the change.
4. Tests, diffs, and stack traces in original form.

Practical rule:

- If a graph or symbol query can narrow the target, do that before broad file
  reads.
- If an exact edit or claim is next, verify the final source in raw form.

## Headroom recipe

Keep Headroom focused on compression-friendly artifacts:

- long logs
- JSON payloads
- web fetch results
- long command output
- long conversation history

Do not treat Headroom as the first choice for:

- edit targets
- diff hunks
- type definitions
- test failures
- compiler/runtime stack traces
- exact quotes

If the same artifact needs a second fetch:

1. Assume the route was too lossy or too broad.
2. Keep a short working set of confirmed paths, symbols, and facts.
3. Switch to a direct raw read or a tighter graph/symbol query.

## Verified local commands

These were confirmed in the current local environment.

### Headroom inspection

```bash
headroom --help
headroom perf --hours 72
headroom wrap codex --help
headroom agent-savings --profile balanced --format shell
headroom agent-savings --profile agent-90 --format shell
```

### Codebase Memory inspection

```bash
codebase-memory-mcp --help
codebase-memory-mcp config list
codebase-memory-mcp cli list_projects '{}'
```

### Special-case overlays

Normal coding work should not need profile switching.

For rare special sessions, overlay files exist:

```bash
codex --profile oracle
codex --profile browser-tools
codex --profile unity
```

Notes:

- These overlays are convenience paths for special interactive launches.
- `codex mcp list` did not reflect overlay loading consistently during
  non-interactive verification, so treat them as convenience files, not as a
  foundation for daily workflow.
- The repo's `linux-features/headroom-proxy` feature intentionally uses its own
  conservative defaults; do not assume its env file matches the CLI's current
  `balanced` profile exactly.

## Deliberately not applied here

These are reasonable candidates, but they were left as future proposals rather
than applied changes:

- Serena installation: useful for symbol-level editing, but not currently
  installed and outside the scope of a safe workspace-only change.
- Cloudflare MCP portal or `minimize_tools`: promising for large remote MCP
  catalogs, but not necessary to change this repo today.
- Global plugin or MCP removal: higher risk than the current task allows.
